const assert = require("node:assert/strict");
const { mkdtemp, readFile, readdir, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { test } = require("node:test");
const { digest, models, openLedger, timestamp } = require("../scripts/poisson-shadow-ledger.cjs");
const { finishStatus, fixture, istanbulDay, scheduled, verifiedHalf } = require("../scripts/poisson-shadow-espn.cjs");
const { compare, findResult } = require("../scripts/poisson-shadow.cjs");
const { archiveName, predictGroup } = require("../scripts/poisson-shadow-models.cjs");

const sourceAt = "2026-11-22T11:00:00.000Z";
const observedAt = "2026-11-23T10:00:00.000Z";
const hash = "a".repeat(64);
const full = { state: "post", completed: true, name: "STATUS_FULL_TIME" };
const pre = { state: "pre", completed: false, name: "STATUS_SCHEDULED" };
function event(status = pre) {
  const date = "2026-11-22T21:30Z";
  const competitors = ["home", "away"].map((homeAway, i) => ({
    homeAway, id: String(i + 10), team: { id: String(i + 10), displayName: i === 0 ? "Goztepe" : "Alanyaspor" },
    score: status === full ? ["2", "1"][i] : "0",
    linescores: [{ displayValue: "1" }, { displayValue: i === 0 ? "1" : "0" }]
  }));
  return { id: "150", date, status: { type: status },
    competitions: [{ id: "150", date, status: { type: status }, competitors }] };
}
const market = () => ({ probabilities: [0.6, 0.2, 0.2], rates: [1.5, 0.7], venueMatches: [10, 6],
  scores: [[2, 1, 0.3], [1, 0, 0.2]], over25: 0.6, btts: 0.55 });

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "mam-poisson-shadow-"));
  let clock = sourceAt;
  const ledger = openLedger(root, () => clock);
  const f = fixture(event(), "tur.1");
  const snap = await ledger.snapshot({
    fixtureKey: f.key, eventSha256: f.eventSha256, originalEvent: event(),
    sourceAt, sources: Array(3).fill({ sha256: hash, capturedAt: sourceAt }),
    historyBeforeIstanbulDay: "2026-11-22", inputs: []
  });
  const input = { fixture: f, sourceAt, snapshotSha256: snap.sha256, models: Object.fromEntries(models.map(name => [
    name, { version: "demo", revision: "b".repeat(40), full: market(), half: market() }
  ])) };
  return { root, input, ledger, setClock: time => { clock = time; } };
}

test("UTC and Istanbul dates retain midnight crossings and reject impossible UTC dates", () => {
  const e = event();
  const f = fixture(e, "tur.1");
  assert.equal(f.istanbulDay, "2026-11-23");
  assert.equal(istanbulDay(timestamp(e.date)), "2026-11-23");
  assert.ok(Number.isNaN(timestamp("2026-02-30T01:00Z")));
  assert.equal(scheduled(e, sourceAt), true);
  assert.equal(scheduled(e, f.kickoff), false);
});

test("create-only ledger is idempotent under concurrent writes and rejects conflicts", async () => {
  const { ledger, input } = await setup();
  const writes = await Promise.all(Array.from({ length: 12 }, () => ledger.append(input)));
  assert.equal(writes.filter(w => w.created).length, 1);
  assert.equal(new Set(writes.map(w => w.value.sha256)).size, 1);
  const changed = structuredClone(input);
  changed.models[models[0]].full.over25 = 0.51;
  await assert.rejects(ledger.append(changed), /Conflicting immutable/);
  assert.equal((await ledger.list()).length, 1);
});

test("tampering with a linked snapshot and claiming today's history fail closed", async () => {
  const { ledger, input, root } = await setup();
  await ledger.append(input);
  const sub = join(root, "snapshots");
  const path = join(sub, (await readdir(sub))[0]);
  const parsed = JSON.parse(await readFile(path));
  parsed.sourceAt = observedAt;
  await writeFile(path, JSON.stringify(parsed));
  await assert.rejects(ledger.list(), /integrity/);
  const { sha256, ...value } = parsed;
  await assert.rejects(ledger.snapshot({ ...value, inputs: [{ day: value.historyBeforeIstanbulDay }] }), /snapshot evidence/);
});

test("late, missing and nonfinite forecasts are rejected before storage", async () => {
  const { ledger, input, setClock } = await setup();
  const changed = structuredClone(input);
  changed.models[models[1]].full.probabilities[0] = NaN;
  await assert.rejects(ledger.append(changed), /Invalid archived market/);
  changed.models[models[1]].full.probabilities[0] = Infinity;
  await assert.rejects(ledger.append(changed), /Invalid archived market/);
  changed.models[models[1]].full.probabilities = [0.6, 0.2, 0.1];
  await assert.rejects(ledger.append(changed), /Invalid archived market/);
  delete changed.models[models[1]];
  await assert.rejects(ledger.append(changed), /fixture evidence/);
  setClock(input.fixture.kickoff);
  await assert.rejects(ledger.append(input), /fixture evidence/);
  assert.equal((await ledger.list()).length, 0);
});

test("ESPN final admission rejects schedule changes and distinguishes nonplayed statuses", () => {
  const f = fixture(event(), "tur.1");
  assert.deepEqual(finishStatus(f, event(full), f.league, observedAt), { status: "completed", full: [2, 1] });
  assert.equal(finishStatus(f, event(), f.league, sourceAt).status, "pending");
  for (const [name, state] of [["STATUS_AWARDED", "awarded"], ["STATUS_POSTPONED", "postponed"],
    ["STATUS_CANCELED", "cancelled"]]) {
    assert.equal(finishStatus(f, event({ ...full, name }), f.league, observedAt).status, state);
  }
  const moved = event();
  moved.date = moved.competitions[0].date = "2026-11-29T20:00Z";
  assert.equal(finishStatus(f, moved, f.league, sourceAt).status, "rescheduled");
  const mismatch = event(full);
  mismatch.competitions[0].competitors[0].team.id = "99";
  assert.equal(finishStatus(f, mismatch, f.league, observedAt).status, "identity_mismatch");
});

test("half-time requires a matching independent summary with two consistent periods", () => {
  const f = fixture(event(), "tur.1");
  const e = event(full);
  const summary = { header: { id: f.id, league: { slug: f.league }, competitions: e.competitions } };
  assert.deepEqual(verifiedHalf(f, [2, 1], summary), [1, 1]);
  assert.equal(verifiedHalf(f, [2, 0], summary), null);
  e.competitions[0].competitors[0].linescores[0].displayValue = "-1";
  assert.equal(verifiedHalf(f, [2, 1], summary), null);
});

test("summary and scoreboard disagreement prevents acceptance", async () => {
  const f = fixture(event(), "tur.1");
  const summary = event(full);
  summary.competitions[0].competitors[0].score = "3";
  const provider = { failures: [], board: async () => ({
    events: [event(full)], source: { capturedAt: observedAt, sha256: hash }
  }), get: async () => ({ bytes: JSON.stringify({ header: { id: f.id, league: { slug: f.league },
    competitions: summary.competitions } }), capturedAt: observedAt, sha256: hash }) };
  const result = await findResult(f, provider);
  assert.equal(result.status, "result_conflict");
});

test("settlement writes complementary full and half evidence and keeps tiny cohorts descriptive", async () => {
  const { ledger, input } = await setup();
  const { value } = await ledger.append(input);
  const result = { fixtureKey: input.fixture.key, observedAt, full: [2, 1], half: null,
    status: "completed", boardSha256: hash };
  const first = await ledger.outcome(value, result);
  assert.equal(first.half, null);
  await assert.rejects(ledger.outcome(value, { ...result, full: [-1, 1] }), /Invalid final/);
  await assert.rejects(ledger.outcome(value, { ...result, full: [3, 1] }), /Conflicting immutable/);
  const last = await ledger.outcome(value, { ...result, half: [1, 1], summarySha256: hash });
  assert.notEqual(last.sha256, first.sha256);
  assert.equal((await ledger.results()).length, 2);
  const outcome = compare([value], [result], "full").overall;
  assert.equal(outcome.matches, 1);
  assert.equal(outcome.inferenceReady, false);
  assert.deepEqual(outcome.pairs, []);
  assert.equal(compare([value], [result], "half").overall.matches, 0);
});

test("five forecasts consume the same as-of timestamp and exact known club aliases", () => {
  const names = new Set(["Goztep", "Alanyaspor"]);
  assert.equal(archiveName(names, "tur.1", "Göztepe"), "Goztep");
  assert.equal(archiveName(names, "tur.1", "Unknown FC"), null);
  const calls = [];
  const period = { names, forecast: (...args) => {
    calls.push(args);
    return Object.fromEntries(models.map(name => [name, market()]));
  } };
  const result = predictGroup(fixture(event(), "tur.1"), sourceAt, { full: period, half: period },
    { front: "a".repeat(40), worker: "b".repeat(40) });
  assert.deepEqual(calls, [[sourceAt, "Goztep", "Alanyaspor"], [sourceAt, "Goztep", "Alanyaspor"]]);
  assert.deepEqual(Object.keys(result.models), models);
  assert.equal(result.models[models[0]].full.reliability.max1x2, 0.6);
  assert.equal(digest(result.models).length, 64);
});

test("portable bundle restores exact sealed snapshots, predictions and results", async () => {
  const { ledger, input } = await setup();
  const { value } = await ledger.append(input);
  const evidence = { fixtureKey: value.fixture.key, observedAt, full: [2, 1], half: [1, 0],
    status: "completed", boardSha256: hash, summarySha256: hash };
  await ledger.outcome(value, evidence);
  await assert.rejects(ledger.outcome(value, { ...evidence, full: [3, 1] }), /Conflicting immutable/);
  const bundle = await ledger.bundle();
  const restored = openLedger(await mkdtemp(join(tmpdir(), "mam-poisson-restore-")));
  await restored.restore(bundle);
  await restored.restore(bundle);
  assert.deepEqual(await restored.bundle(), bundle);
});

test("different implementation revisions never share an inference cohort", async () => {
  const { ledger, input } = await setup();
  const { value } = await ledger.append(input);
  const other = structuredClone(value);
  other.fixture.key = "espn:tur.1:151";
  other.models[models[0]].revision = "c".repeat(40);
  const result = compare([value, other], [value, other].map(record =>
    ({ fixtureKey: record.fixture.key, status: "completed", full: [2, 1] })), "full");
  assert.equal(result.totalMatched, 2);
  assert.equal(result.overall.matches, 0);
  assert.deepEqual(Object.values(result.cohorts).map(x => x.overall.matches), [1, 1]);
});

test("settlement reuses verified half-time on outage only while a fresh full-time score agrees", async () => {
  const { settle } = require("../scripts/poisson-shadow.cjs");
  const { ledger, input } = await setup();
  const { value } = await ledger.append(input);
  const old = await ledger.outcome(value, {
    fixtureKey: input.fixture.key, observedAt, full: [2, 1], half: [1, 1],
    status: "completed", boardSha256: hash, summarySha256: hash
  });
  let current = event(full);
  const provider = { failures: [], board: async () => ({
    events: [current], source: { capturedAt: observedAt, sha256: hash }
  }), get: async () => null };
  const [reused] = await settle([value], provider, ledger);
  assert.deepEqual(reused.half, [1, 1]);
  assert.equal(reused.halfStatus, "verified_archive");
  assert.equal(reused.outcomeSha256, old.sha256);
  assert.equal((await ledger.results()).length, 2);
  current = event(full);
  current.competitions[0].competitors[0].score = "5";
  const [conflict] = await settle([value], provider, ledger);
  assert.equal(conflict.status, "result_conflict");
  assert.equal(compare([value], [conflict], "half").totalMatched, 0);
  assert.equal((await ledger.results()).length, 2);
});

test("isolated baseline and extension groups report descriptive v1.2 differences without bootstrapping", async () => {
  const { pilotGroups } = require("../scripts/poisson-shadow.cjs");
  const { ledger, input } = await setup();
  const { value } = await ledger.append(input);
  const next = structuredClone(value);
  next.fixture.key = "espn:tur.1:151";
  next.models[models[1]].full.probabilities = [0.7, 0.2, 0.1];
  const outcomes = [{ fixtureKey: value.fixture.key, status: "pending" },
    { fixtureKey: next.fixture.key, status: "completed", full: [2, 1] }];
  const groups = pilotGroups([value, next], outcomes, [value]);
  assert.deepEqual(groups.original.statuses, { pending: 1 });
  assert.deepEqual(groups.extension.statuses, { completed: 1 });
  assert.deepEqual(groups.original.full.overall.deltasVsV12, {});
  assert.ok(groups.extension.full.overall.deltasVsV12[models[1]].logLoss < 0);
  assert.deepEqual(groups.extension.full.overall.pairs, []);
  assert.throws(() => pilotGroups([value], [], [{ ...value, sha256: "wrong" }]), /Baseline pilot/);
});

test("archive transport retries incomplete CSVs, never joins partial bytes and leaves 404 alone", async () => {
  const { readArchiveCsv } = require("../scripts/poisson-shadow.cjs");
  const url = "https://www.football-data.co.uk/mmz4281/2526/I1.csv";
  const complete = Buffer.from("Div,Date\nI1,22/11/25");
  let attempts = 0;
  const result = await readArchiveCsv(url, async () => {
    if (++attempts === 1) throw Object.assign(new Error("partial"), { code: 28, stdout: Buffer.from("Div,D") });
    return { stdout: complete };
  });
  assert.equal(attempts, 2);
  assert.deepEqual(result.bytes, complete);
  attempts = 0;
  await assert.rejects(readArchiveCsv(url, async () => {
    attempts++;
    throw Object.assign(new Error("not found"), { code: 22, stderr: Buffer.from("HTTP 404") });
  }), /not found/);
  assert.equal(attempts, 1);
});

test("ESPN retries 503 once and respects permanent errors and longer retry-after", async () => {
  const { readSource } = require("../scripts/poisson-shadow-espn.cjs");
  const url = "https://site.api.espn.com/example";
  let calls = 0;
  const recovered = await readSource(url, async () => ++calls === 1
    ? new Response("", { status: 503, headers: { "retry-after": "0" } })
    : new Response('{"events":[]}'));
  assert.equal(calls, 2);
  assert.equal(recovered.bytes.toString(), '{"events":[]}');
  for (const status of [404, 429]) {
    calls = 0;
    await assert.rejects(readSource(url, async () => {
      calls++;
      return new Response("", { status, headers: { "retry-after": "30" } });
    }), new RegExp(String(status)));
    assert.equal(calls, 1);
  }
});

test("ESPN retries partial response bodies without retaining partial bytes", async () => {
  const { readSource } = require("../scripts/poisson-shadow-espn.cjs");
  let calls = 0;
  const recovered = await readSource("https://site.api.espn.com/example", async () => {
    if (++calls === 1) return { ok: true, arrayBuffer: async () => {
      throw Object.assign(new Error("socket"), { cause: { code: "UND_ERR_SOCKET" } });
    } };
    return new Response("fresh");
  });
  assert.equal(calls, 2);
  assert.equal(recovered.bytes.toString(), "fresh");
});

test("shuffled restore preserves exact period seals and invalid bundles are rejected before writing", async () => {
  const { ledger, input } = await setup();
  const { value } = await ledger.append(input);
  const evidence = { fixtureKey: value.fixture.key, observedAt, full: [2, 1], half: null,
    status: "completed", boardSha256: hash };
  await ledger.outcome(value, evidence);
  await ledger.outcome(value, { ...evidence, half: [1, 0], boardSha256: "b".repeat(64), summarySha256: hash });
  const bundle = await ledger.bundle();
  const invalid = { ...bundle, results: bundle.results.filter(row => row.half) };
  const directory = await mkdtemp(join(tmpdir(), "mam-poisson-preflight-"));
  const restored = openLedger(directory);
  await assert.rejects(restored.restore(invalid), /Inconsistent full-time/);
  assert.deepEqual(await readdir(directory), []);
  await restored.restore({ ...bundle, results: [...bundle.results].reverse() });
  await restored.restore(bundle);
  assert.deepEqual(await restored.bundle(), bundle);
});

test("concurrent duplicate outcomes seal one result per period and half conflict preserves verified full-time", async () => {
  const { settle } = require("../scripts/poisson-shadow.cjs");
  const { ledger, input } = await setup();
  const { value } = await ledger.append(input);
  const evidence = { fixtureKey: value.fixture.key, observedAt, full: [2, 1], half: [1, 0],
    status: "completed", boardSha256: hash, summarySha256: hash };
  const settled = await Promise.all(Array.from({ length: 6 }, () => ledger.outcome(value, evidence)));
  assert.equal(new Set(settled.map(row => row.sha256)).size, 1);
  assert.equal((await ledger.results()).length, 2);
  const e = event(full);
  const summary = { header: { id: value.fixture.id, league: { slug: value.fixture.league }, competitions: e.competitions } };
  const provider = { failures: [],
    board: async () => ({ events: [e], source: { capturedAt: observedAt, sha256: hash } }),
    get: async () => ({ bytes: JSON.stringify(summary), capturedAt: observedAt, sha256: hash }) };
  const [result] = await settle([value], provider, ledger);
  assert.equal(result.status, "completed");
  assert.equal(result.halfStatus, "result_conflict");
  assert.equal(result.conflictReason, "sealed_half_time_score");
  assert.equal(compare([value], [result], "full").totalMatched, 1);
  assert.equal(compare([value], [result], "half").totalMatched, 0);
  assert.equal((await ledger.results()).length, 2);
});
