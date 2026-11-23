const { gzipSync, gunzipSync } = require("node:zlib");
const { digest } = require("./poisson-shadow-ledger.cjs");

const dayMs = 86400000;
const span = 28 * dayMs;
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const blockIndex = day => Math.floor(Date.parse(day) / span);
const periodStart = day => isoDay(blockIndex(day) * span);

function archivePeriods(archive) {
  const snapshots = new Map(archive.snapshots.map(row => [row.sha256, row]));
  const days = new Map();
  const periods = new Map();
  for (const record of archive.predictions) {
    const start = periodStart(record.fixture.istanbulDay);
    const snapshot = snapshots.get(record.snapshotSha256);
    if (!snapshot || days.has(record.fixture.key)) throw new Error("Invalid period archive link");
    days.set(record.fixture.key, start);
    if (!periods.has(start)) periods.set(start, { predictions: [], snapshots: new Map(), results: [] });
    const period = periods.get(start);
    period.predictions.push(record);
    period.snapshots.set(snapshot.sha256, snapshot);
  }
  for (const result of archive.results) {
    const period = periods.get(days.get(result.fixtureKey));
    if (!period) throw new Error("Result has no period");
    period.results.push(result);
  }
  return Object.fromEntries([...periods].sort(([a], [b]) => a.localeCompare(b)).map(([start, period]) =>
    [start, { ...period, snapshots: [...period.snapshots.values()] }]));
}

function encodeCheckpoint(archive) {
  const payload = { version: 1, periods: archivePeriods(archive) };
  return gzipSync(JSON.stringify({ ...payload, sha256: digest(payload) }));
}

function decodeCheckpoint(bytes) {
  const plain = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 }) : bytes;
  const parsed = JSON.parse(plain);
  if (parsed.archive) return [parsed.archive];
  const { sha256, ...payload } = parsed;
  if (payload.version !== 1 || !payload.periods || sha256 !== digest(payload)) {
    throw new Error("Invalid period checkpoint checksum");
  }
  const periods = Object.entries(payload.periods);
  const keys = new Set();
  for (const [key, archive] of periods) {
    for (const record of archive.predictions) {
      if (key !== periodStart(record.fixture.istanbulDay) || keys.has(record.fixture.key)) {
        throw new Error("Invalid period checkpoint assignment");
      }
      keys.add(record.fixture.key);
    }
  }
  return periods.map(([, archive]) => archive);
}

function longTermReport(records, outcomes, initial, pilot, compare, asOfDay) {
  const actual = new Map(records.map(row => [row.fixture.key, row.sha256]));
  const pilotKeys = new Map(pilot.map(row => [row.fixture.key, row.sha256]));
  if (actual.size !== records.length || pilotKeys.size !== pilot.length ||
      pilot.some(row => actual.get(row.fixture.key) !== row.sha256) ||
      initial.some(row => pilotKeys.get(row.fixture.key) !== row.sha256)) {
    throw new Error("Original pilot boundaries do not match the sealed archive");
  }
  const initialKeys = new Set(initial.map(row => row.fixture.key));
  const classify = key => initialKeys.has(key) ? "original" : pilotKeys.has(key) ? "extension" : "followup";
  const outcomesByKey = new Map(outcomes.map(row => [row.fixtureKey, row]));
  function subset(rows, includeMetrics = true) {
    const results = rows.map(row => outcomesByKey.get(row.fixture.key)).filter(Boolean);
    const statuses = {};
    for (const row of rows) {
      const status = outcomesByKey.get(row.fixture.key)?.status ?? "unchecked";
      statuses[status] = (statuses[status] ?? 0) + 1;
    }
    return { fixtures: rows.length, statuses,
      verifiedFull: results.filter(row => row.status === "completed" && row.full).length,
      verifiedHalf: results.filter(row => row.status === "completed" && row.half).length,
      ...(includeMetrics && { full: compare(rows, results, "full"), half: compare(rows, results, "half") }) };
  }
  const rowsByPeriod = new Map();
  for (const record of records) {
    const start = periodStart(record.fixture.istanbulDay);
    if (!rowsByPeriod.has(start)) rowsByPeriod.set(start, []);
    rowsByPeriod.get(start).push(record);
  }
  const groups = ["original", "extension", "followup"];
  const periods = [...rowsByPeriod].sort(([a], [b]) => a.localeCompare(b)).map(([start, rows]) => {
    const endExclusive = isoDay(Date.parse(start) + span);
    return { start, endExclusive, elapsed: endExclusive <= asOfDay,
      ...subset(rows), groups: Object.fromEntries(groups.map(name =>
        [name, subset(rows.filter(row => classify(row.fixture.key) === name), false)])) };
  });
  const all = subset(records);
  const readiness = {};
  for (const period of ["full", "half"]) {
    for (const [key, cohort] of Object.entries(all[period].cohorts)) {
      const progress = readiness[key] ?? { revisions: cohort.revisions };
      progress[period] = {
        commonResults: cohort.overall.matches, periodsWithResults: cohort.overall.blocks,
        missingResults: Math.max(0, 100 - cohort.overall.matches),
        missingPeriods: Math.max(0, 8 - cohort.overall.blocks), ready: cohort.overall.inferenceReady
      };
      readiness[key] = progress;
    }
  }
  const ready = Object.values(readiness).some(row => row.full?.ready && row.half?.ready);
  return { periodDays: 28, minCommonResults: 100, minPeriods: 8, ready,
    nextMode: ready ? "settle" : "cycle", readiness, periods, all,
    groups: Object.fromEntries(groups.map(name => [name, subset(records.filter(row => classify(row.fixture.key) === name))])) };
}

module.exports = { archivePeriods, blockIndex, decodeCheckpoint, encodeCheckpoint, longTermReport, periodStart };
