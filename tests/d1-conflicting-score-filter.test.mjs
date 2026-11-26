import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = source.indexOf("function mamCompletedHistoricalScore");
const end = source.indexOf("function mamEnrichHistoricalStats", start);
assert.ok(start >= 0 && end > start);

function loadFilter(verifiedScore) {
  const context = {
    mamHistoricalIdentity(match) { return match.identity || ""; },
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
    identity,
    fixture: { id: identity + "-" + score.join("-"), status: { short: "FT" } },
    goals: { home: score[0], away: score[1] }
  };
}

test("verified ESPN score keeps only the matching D1 row", async () => {
  const filter = loadFilter([4, 0]);
  const result = await filter([row([4, 0]), row([0, 0])], "39");
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].goals, { home: 4, away: 0 });
});

test("unresolved conflicting D1 scores are excluded, not guessed", async () => {
  const filter = loadFilter(null);
  const result = await filter([row([4, 0]), row([0, 0])], "39");
  assert.equal(result.length, 0);
});

test("non-conflicting completed D1 rows remain available", async () => {
  const filter = loadFilter(null);
  const result = await filter([row([2, 1]), row([2, 1], "other-match")], "39");
  assert.equal(result.length, 2);
});
