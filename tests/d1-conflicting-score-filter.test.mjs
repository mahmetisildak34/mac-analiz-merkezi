import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = source.indexOf("function mamHistoricalScorePair");
const end = source.indexOf("function mamEnrichHistoricalStats", start);
assert.ok(start >= 0 && end > start);

function loadFilter(verifiedScore) {
  const context = {
    mamIstanbulDay(value) { return String(value || "").slice(0, 10); },
    mamCanonicalHistoryTeamKey(value) { return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, ""); },
    mamFixtureCompetitionKey(match) { return { canonical: true, id: match.league?.id || "39" }; },
    async mamFindEspnHistoricalEvent() { return verifiedScore ? "espn-event-1" : ""; },
    ESPN_LEAGUES: { "39": { slug: "eng.1" } },
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
  return context.filter;
}

function row(score, identity = "same-match") {
  return {
    fixture: { id: identity + "-" + score.join("-"), date: "2026-11-22T16:30:00Z", status: { short: "FT" } },
    league: { id: "39" },
    teams: { home: { name: "Liverpool" }, away: { name: "Manchester United" } },
    goals: { home: score[0], away: score[1] }
  };
}

test("verified ESPN score keeps only the matching D1 row", async () => {
  const filter = loadFilter([4, 0]);
  const result = await filter([row([4, 0]), row([0, 0])], "39");
  assert.equal(result.length, 1);
  assert.equal(result.mamExcludedConflictCount, 1);
  assert.equal(result.mamExcludedConflictKeys.length, 1);
  assert.deepEqual(result[0].goals, { home: 4, away: 0 });
});

test("unresolved conflicting D1 scores are excluded, not guessed", async () => {
  const filter = loadFilter(null);
  const result = await filter([row([4, 0]), row([0, 0])], "39");
  assert.equal(result.length, 0);
  assert.equal(result.mamExcludedConflictCount, 2);
  assert.equal(result.mamExcludedConflictKeys.length, 1);
});

test("non-conflicting completed D1 rows remain available", async () => {
  const filter = loadFilter(null);
  const other = row([2, 1]);
  other.fixture.date = "2026-11-21T16:30:00Z";
  const result = await filter([row([2, 1]), other], "39");
  assert.equal(result.length, 2);
});

test("different kickoff minutes are still one conflict group", async () => {
  const filter = loadFilter([4, 0]);
  const late = row([0, 0]);
  late.fixture.date = "2026-11-22T19:00:00Z";
  const result = await filter([row([4, 0]), late], "39");
  assert.equal(JSON.stringify(result.map(match => match.goals)), JSON.stringify([{ home: 4, away: 0 }]));
});

test("time-unknown rows cannot bypass conflict filtering", async () => {
  const filter = loadFilter([4, 0]);
  const unknown = row([0, 0]);
  unknown.fixture.date = "2026-11-22";
  unknown.fixture.timeUnknown = true;
  const result = await filter([row([4, 0]), unknown], "39");
  assert.equal(JSON.stringify(result.map(match => match.goals)), JSON.stringify([{ home: 4, away: 0 }]));
});

test("cache conflict filtering precedes historical deduplication", () => {
  const cacheStart = source.indexOf("const archiveMatches=saved.matches.slice();");
  const dedupe = source.indexOf("mamDeduplicateHistoricalMatches", cacheStart);
  const filter = source.indexOf("mamFilterConflictingHistoricalScores(archiveMatches,leagueId)", cacheStart);
  assert.ok(cacheStart >= 0 && filter > cacheStart && dedupe > filter);
});

test("history cache uses v79 and persists the filter count", () => {
  assert.match(source, /const key="mam_history_v79_/);
  assert.doesNotMatch(source, /const key="mam_history_v78_/);
  assert.match(source, /excludedConflictCount/);
  assert.match(source, /çelişkili maç analiz dışı bırakıldı/);
});
