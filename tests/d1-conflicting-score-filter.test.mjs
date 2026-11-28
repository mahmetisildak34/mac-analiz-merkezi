import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const activeLeagueIds = require("../active-league-scope.js").activeIds;
const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = source.indexOf("function mamHistoricalScorePair");
const end = source.indexOf("function mamEnrichHistoricalStats", start);
assert.ok(start >= 0 && end > start);

function loadFilter(verifiedScore, leagueIds = ["39"], verifyCalls = { count: 0 }) {
  const context = {
    mamIstanbulDay(value) { return String(value || "").slice(0, 10); },
    mamCanonicalHistoryTeamKey(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); },
    mamFixtureCompetitionKey(match) { return { canonical: true, id: match.league?.id || "39" }; },
    mamHasCompletedScore(match) {
      const finished = ["FT", "AET", "PEN", "AWD", "WO"].includes(String(match?.fixture?.status?.short || "").toUpperCase());
      const goals = [match?.goals?.home, match?.goals?.away];
      return finished && goals.every(value => (typeof value === "number" || typeof value === "string" && /^\d+$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= 0);
    },
    async mamFindEspnHistoricalEvent() { verifyCalls.count++; return verifiedScore ? "espn-event-1" : ""; },
    ESPN_LEAGUES: Object.fromEntries(leagueIds.map(id => [String(id), { slug: "league-" + id }])),
    qs(value) { return new URLSearchParams(value).toString(); },
    async api() {
      return verifiedScore ? {
        header: {
          competitions: [{
            status: { type: { completed: true, state: "post" } },
            competitors: [
              { homeAway: "home", score: String(verifiedScore[0]) },
              { homeAway: "away", score: String(verifiedScore[1]) }
            ]
          }]
        }
      } : {};
    },
    console: { warn() {} }
  };
  vm.runInNewContext(`${source.slice(start, end)};globalThis.filter=mamFilterConflictingHistoricalScores`, context);
  return { filter: context.filter, verifyCalls };
}

function row(score, { status = "FT", identity = "same-match", leagueId = "39", date = "2026-11-22T16:30:00Z" } = {}) {
  return {
    mamArchiveOnly: true,
    fixture: { id: identity + "-" + score.join("-"), date, status: { short: status } },
    league: { id: leagueId },
    teams: { home: { name: "Liverpool" }, away: { name: "Manchester United" } },
    goals: { home: score[0], away: score[1] }
  };
}

test("verified ESPN score keeps only the matching finished D1 row and flags genuine finished-score disagreement", async () => {
  const { filter } = loadFilter([4, 0]);
  const result = await filter([row([4, 0]), row([0, 0])], "39");
  assert.equal(result.length, 1);
  assert.equal(result.mamExcludedConflictCount, 1);
  assert.equal(result.mamExcludedConflictKeys.length, 1);
  assert.equal(JSON.stringify(result[0].goals), JSON.stringify({ home: 4, away: 0 }));
});

test("unresolved conflicting completed scores are excluded rather than guessed", async () => {
  const { filter } = loadFilter(null);
  const result = await filter([row([4, 0]), row([0, 0])], "39");
  assert.equal(result.length, 0);
  assert.equal(result.mamExcludedConflictCount, 2);
  assert.equal(result.mamExcludedConflictKeys.length, 1);
});

test("a completed result outranks stale LIVE and NS snapshots without a conflict warning", async () => {
  const { filter, verifyCalls } = loadFilter(null);
  const result = await filter([
    row([2, 1]),
    row([1, 1], { status: "LIVE" }),
    row([0, 0], { status: "NS" })
  ], "39");
  assert.equal(result.length, 1);
  assert.equal(JSON.stringify(result[0].goals), JSON.stringify({ home: 2, away: 1 }));
  assert.equal(verifyCalls.count, 0, "non-final snapshots must not trigger completed-score conflict adjudication");
  assert.equal(JSON.stringify(result.mamExcludedConflictKeys), "[]");
  assert.equal(result.mamExcludedConflictCount, 0);
});

test("different LIVE and NS snapshots use only an ESPN-verified final result and are not reported as a conflict", async () => {
  const { filter } = loadFilter([1, 4]);
  const result = await filter([
    row([1, 1], { status: "LIVE" }),
    row([0, 0], { status: "NS" })
  ], "39");
  assert.equal(result.length, 1);
  assert.equal(JSON.stringify(result[0].goals), JSON.stringify({ home: 1, away: 4 }));
  assert.equal(result[0].fixture.status.short, "FT");
  assert.equal(result[0].mamVerifiedHistoricalFinal, true);
  assert.equal(JSON.stringify(result.mamExcludedConflictKeys), "[]");
  assert.equal(result.mamExcludedConflictCount, 0);
});

test("conflicting finished scores recover an ESPN final absent from the archive while retaining the safety warning", async () => {
  const { filter } = loadFilter([3, 2]);
  const result = await filter([row([2, 2]), row([0, 0])], "39");
  assert.equal(result.length, 1);
  assert.equal(JSON.stringify(result[0].goals), JSON.stringify({ home: 3, away: 2 }));
  assert.equal(result[0].fixture.status.short, "FT");
  assert.equal(result[0].mamVerifiedHistoricalFinal, true);
  assert.equal(result.mamExcludedConflictCount, 2);
  assert.equal(result.mamExcludedConflictKeys.length, 1);
});

test("unverified non-final snapshots are ignored without a false conflict warning", async () => {
  const { filter } = loadFilter(null);
  const result = await filter([row([2, 1], { status: "LIVE" }), row([0, 0], { status: "NS" })], "39");
  assert.equal(result.length, 0);
  assert.equal(JSON.stringify(result.mamExcludedConflictKeys), "[]");
  assert.equal(result.mamExcludedConflictCount, 0);
});

test("different kickoff minutes still share one identity for genuinely conflicting finished scores", async () => {
  const { filter } = loadFilter([4, 0]);
  const late = row([0, 0]);
  late.fixture.date = "2026-11-22T19:00:00Z";
  const result = await filter([row([4, 0]), late], "39");
  assert.equal(JSON.stringify(result.map(match => match.goals)), JSON.stringify([{ home: 4, away: 0 }]));
  assert.equal(result.mamExcludedConflictKeys.length, 1);
});

test("time-unknown rows cannot bypass the finished-score conflict filter", async () => {
  const { filter } = loadFilter([4, 0]);
  const unknown = row([0, 0]);
  unknown.fixture.date = "2026-11-22";
  unknown.fixture.timeUnknown = true;
  const result = await filter([row([4, 0]), unknown], "39");
  assert.equal(JSON.stringify(result.map(match => match.goals)), JSON.stringify([{ home: 4, away: 0 }]));
});

test("the same status and verification rule applies to every active organization", async () => {
  assert.equal(activeLeagueIds.length, 16);
  for (const leagueId of activeLeagueIds) {
    const { filter } = loadFilter([2, 1], activeLeagueIds);
    const result = await filter([
      row([1, 1], { status: "LIVE", leagueId }),
      row([0, 0], { status: "NS", leagueId })
    ], leagueId);
    assert.equal(result.length, 1, "verified final was not recovered for league " + leagueId);
    assert.equal(JSON.stringify(result[0].goals), JSON.stringify({ home: 2, away: 1 }));
    assert.equal(JSON.stringify(result.mamExcludedConflictKeys), "[]", "non-final rows caused a warning for league " + leagueId);
  }
});

test("cached histories are re-filtered before deduplication", () => {
  const cacheStart = source.indexOf("const archiveMatches=saved.matches.slice();");
  const dedupe = source.indexOf("mamDeduplicateHistoricalMatches", cacheStart);
  const filter = source.indexOf("mamFilterConflictingHistoricalScores(archiveMatches,leagueId)", cacheStart);
  assert.ok(cacheStart >= 0 && filter > cacheStart && dedupe > filter);
});

test("history cache uses v81 and stores only completed-score conflict counts", () => {
  assert.match(source, /const key="mam_history_v81_/);
  assert.doesNotMatch(source, /const key="mam_history_v80_/);
  assert.match(source, /excludedConflictCount/);
  assert.match(source, /çelişen bitmiş skor kayıtları görüldü/);
});
