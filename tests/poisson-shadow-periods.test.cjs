const assert = require("node:assert/strict");
const { test } = require("node:test");
const { gzipSync } = require("node:zlib");
const { compare } = require("../scripts/poisson-shadow.cjs");
const { digest, models } = require("../scripts/poisson-shadow-ledger.cjs");
const { archivePeriods, decodeCheckpoint, encodeCheckpoint, longTermReport, periodStart } =
  require("../scripts/poisson-shadow-periods.cjs");

function row(id, day) {
  return { fixture: { key: `espn:tur.1:${id}`, league: "tur.1", istanbulDay: day },
    sha256: digest(id), snapshotSha256: digest([id]),
    models: Object.fromEntries(models.map(name => {
      const market = { probabilities: [0.5, 0.3, 0.2], over25: 0.5, btts: 0.5, scores: [[2, 1, 0.12]] };
      return [name, { version: name, revision: "test", full: market, half: market }];
    })) };
}
const original = row(1, "2026-11-23");
const extension = row(2, "2026-12-06");
const followup = row(3, "2026-12-17");
const final = { fixtureKey: original.fixture.key, status: "completed", full: [2, 1], half: [1, 1] };

test("period archive keeps exact prediction, input and result seals across gzip restore", () => {
  assert.equal(periodStart(original.fixture.istanbulDay), periodStart(extension.fixture.istanbulDay));
  assert.notEqual(periodStart(original.fixture.istanbulDay), periodStart(followup.fixture.istanbulDay));
  const history = { predictions: [original, extension, followup], snapshots:
    [original, extension, followup].map(r => ({ sha256: r.snapshotSha256 })), results: [final] };
  const periods = Object.values(archivePeriods(history));
  assert.equal(periods.length, 2);
  assert.deepEqual(decodeCheckpoint(encodeCheckpoint(history)), periods);
  assert.deepEqual(decodeCheckpoint(Buffer.from(JSON.stringify({ archive: history }))), [history]);
  const payload = { version: 1, periods: { "2026-11-23": history } };
  const malformed = gzipSync(JSON.stringify({ ...payload, sha256: digest(payload) }));
  assert.throws(() => decodeCheckpoint(malformed), /assignment/);
  assert.throws(() => decodeCheckpoint(gzipSync(JSON.stringify({ ...payload, sha256: "invalid" }))), /checksum/);
});

test("pilot, extension and future fixtures are disjoint, with separate period status and metrics", () => {
  const records = [original, extension, followup];
  const results = [final, { fixtureKey: extension.fixture.key, status: "pending" }];
  const report = longTermReport(records, results, [original], [original, extension], compare, "2026-12-08");
  assert.deepEqual(Object.values(report.groups).map(g => g.fixtures), [1, 1, 1]);
  assert.deepEqual(report.groups.extension.statuses, { pending: 1 });
  assert.deepEqual(report.groups.followup.statuses, { unchecked: 1 });
  assert.equal(report.groups.original.full.overall.models["Worker v1.2"].accuracy, 1);
  assert.equal(report.groups.original.half.overall.models["Worker v1.2"].accuracy, 0);
  assert.equal(report.nextMode, "cycle");
  assert.equal(Object.values(report.readiness)[0].full.missingResults, 99);
  assert.equal(Object.values(report.readiness)[0].half.missingPeriods, 7);
  assert.throws(() => longTermReport(records, results, [{ ...original, sha256: "bad" }],
    [original, extension], compare, "2026-12-08"), /boundaries/);
});

test("the same cohort needs both score periods and eight distinct blocks to stop capture", () => {
  const records = Array.from({ length: 104 }, (_, i) => row(i + 100,
    new Date(Date.UTC(2026, 10, 23) + Math.floor(i / 13) * 28 * 86400000).toISOString().slice(0, 10)));
  const results = records.map(r => ({ fixtureKey: r.fixture.key, status: "completed", full: [2, 1], half: [1, 0] }));
  const withHalf = longTermReport(records, results, [], [], compare, "2027-07-01");
  assert.equal(withHalf.ready, true);
  assert.equal(withHalf.nextMode, "settle");
  assert.equal(withHalf.all.full.overall.blocks, 8);
  assert.equal(withHalf.all.half.overall.pairs[0].metrics.accuracy.interval.length, 2);
  const withoutHalf = longTermReport(records, results.map(r => ({ ...r, half: null })), [], [], compare, "2027-07-01");
  assert.equal(withoutHalf.ready, false);
  assert.equal(withoutHalf.all.half.totalMatched, 0);
});
