const { createHash } = require("node:crypto");
const assert = require("node:assert/strict");
const test = require("node:test");
const { evaluateProspective } = require("../scripts/poisson-prospective.cjs");

function evidence() {
  const generatedAt = "2026-11-22T11:25:17Z";
  const kickoff = "2026-11-22T13:00Z";
  const raw = ["101", kickoff, "Kasımpaşa", "Away", "espn:tur.1:101", "a".repeat(64),
    0.5, 0.3, 0.2, 0.6, 0.5, [[2, 1, 0.1], [1, 1, 0.1], [1, 0, 0.1]]];
  const digest = createHash("sha256").update(JSON.stringify([...raw, generatedAt])).digest("hex");
  return { generatedAt, modelVersion: "1.2", predictions: [[...raw, digest]],
    predictionFields: ["fixtureId", "kickoff", "homeTeam", "awayTeam", "providerEvidenceId",
      "providerPayloadSha256", "homeWinProbability", "drawProbability", "awayWinProbability",
      "over25Probability", "bttsYesProbability", "topScorelines[home,away,probability]", "predictionEvidenceSha256"] };
}

function scoreboard() {
  const date = "2026-11-22T13:00:00Z";
  const status = { type: { name: "STATUS_FULL_TIME", state: "post", completed: true } };
  const competition = { id: "101", date, status, competitors: [
    { homeAway: "away", team: { displayName: "Away" }, score: "1" },
    { homeAway: "home", team: { displayName: "Kasimpasa" }, score: "2" }
  ] };
  return { leagues: [{ slug: "tur.1" }], events: [{ id: "101", date, status, competitions: [competition] }] };
}

test("archived probability scores only an exact completed ESPN match and reports the archived top three", () => {
  const r = evaluateProspective(evidence(), new Map([["tur.1", scoreboard()]]), "2026-11-23T00:00Z");
  assert.equal(r.scored, 1);
  assert.equal(r.overall.accuracy, 1);
  assert.equal(r.overall.top3ScoreAccuracy, 1);
  assert.equal(r.overall.top5ScoreAccuracy, undefined);
});

test("prospective replay rejects altered hashes and skips future or unverified outcomes", () => {
  const e = evidence();
  const board = scoreboard();
  const boards = new Map([["tur.1", board]]);
  assert.equal(evaluateProspective(e, boards, "2026-11-22T12:00Z").exclusions[0].reason, "kickoff_after_cutoff");
  board.events[0].competitions[0].competitors[0].team.displayName = "Wrong";
  assert.equal(evaluateProspective(e, boards, "2026-11-23T00:00Z").scored, 0);
  e.predictions[0][6] = 0.4;
  assert.throws(() => evaluateProspective(e, boards, "2026-11-23T00:00Z"), /Invalid prospective prediction/);
});
