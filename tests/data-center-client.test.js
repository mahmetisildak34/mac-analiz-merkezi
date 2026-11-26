const assert = require("node:assert/strict");
const test = require("node:test");
const { loadPreparedAnalysis } = require("../data-center-client.js");

function bundle() {
  const fixture = { provider: "ESPN", providerFixtureId: "future-1", competitionId: "39",
    kickoff: "2026-11-27T15:00:00Z", status: "scheduled",
    teamAnalysisKeys: { home: "team-analysis:stable-home:2026-11-27", away: "team-analysis:stable-away:2026-11-27" } };
  const analysis = (key, venue) => ({ key, payload: { historyCount: 10, history: Array.from({ length: 10 }, (_, i) => ({
    archiveRef: `archive-${key}-${i}`, kickoff: `2026-11-${String(16-i).padStart(2,"0")}T12:00:00Z`,
    competitionId: i % 2 ? "39" : "45", venue, goalsFor: i % 3, goalsAgainst: i % 2,
    halftime: i === 0 ? { homeScore: 1, awayScore: 0, provider: "ESPN" } : null,
    statistics: i === 0 ? [{ name: "corners", value: 4, provider: "ESPN", verified: true }] : []
  })) } });
  return { fixture, analyses: {
    home: analysis(fixture.teamAnalysisKeys.home, "home"),
    away: analysis(fixture.teamAnalysisKeys.away, "away")
  } };
}

test("prepared analysis maps verified ten-match bundles into the current Poisson input shape", async () => {
  const result = await loadPreparedAnalysis(async () => bundle(), { provider: "espn", fixtureId: "future-1",
    kickoff: "2026-11-27T15:00:00Z", homeTeamId: "101", awayTeamId: "202" });
  assert.equal(result.source, "prepared");
  assert.equal(result.homeHistory.length, 10);
  assert.equal(result.awayHistory.length, 10);
  assert.equal(result.homeHistory[0].teams.home.id, 101);
  assert.equal(result.awayHistory[0].teams.away.id, 202);
  assert.equal(result.homeHistory[0].goals.home, 0);
  assert.equal(result.awayHistory[0].goals.away, 0);
  assert.equal(result.homeHistory[0].score.halftime.home, 1);
  assert.deepEqual(result.homeHistory[0].statistics[0].statistics, [{ type: "corners", value: 4 }]);
  assert.deepEqual(result.homeHistory[1].mamPreparedStats, []);
});

test("incomplete, ambiguous, stale, or mismatched B bundle returns null for legacy fallback", async () => {
  const request = { provider: "espn", fixtureId: "future-1", kickoff: "2026-11-27T15:00:00Z", homeTeamId: "101", awayTeamId: "202" };
  const good = bundle();
  const cases = [
    { ...good, fixture: { ...good.fixture, status: "live" } },
    { ...good, fixture: { ...good.fixture, providerFixtureId: "another-id" } },
    { ...good, analyses: { ...good.analyses, home: { ...good.analyses.home, key: "wrong-key" } } },
    { ...good, analyses: { ...good.analyses, away: { key: good.fixture.teamAnalysisKeys.away,
      payload: { ...good.analyses.away.payload, history: good.analyses.away.payload.history.slice(1), historyCount: 9 } } } },
    { ...good, analyses: { ...good.analyses, home: { key: good.fixture.teamAnalysisKeys.home,
      payload: { ...good.analyses.home.payload, history: good.analyses.home.payload.history.map((row, i) => i ? row : { ...row, kickoff: "2026-11-28T00:00:00Z" }) } } } }
  ];
  for (const value of cases) assert.equal(await loadPreparedAnalysis(async () => value, request), null);
  assert.equal(await loadPreparedAnalysis(async () => { throw Error("B unavailable"); }, request), null);
});
