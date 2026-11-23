// Isolated create-only records. External retention is required for a trusted audit trail.
const { createHash, randomUUID } = require("node:crypto");
const { mkdir, link, open, readFile, readdir, unlink } = require("node:fs/promises");
const { join } = require("node:path");

const models = Object.freeze(["Frontend legacy", "Frontend normalized", "Worker v1.2", "Worker v1.3", "Worker v1.4"]);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const digest = value => sha(JSON.stringify(value));
const hashPattern = /^[0-9a-f]{64}$/;
const revisionPattern = /^[0-9a-f]{40}$/;
const validScore = n => Number.isSafeInteger(n) && n >= 0 && n <= 30;
const validProbability = value => Number.isFinite(value) && value >= 0 && value <= 1;

function timestamp(input) {
  if (typeof input !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{3})?)?Z$/.test(input)) return NaN;
  const ms = Date.parse(input);
  const iso = input.length === 17 ? input.replace(/Z$/, ":00.000Z")
    : input.length === 20 ? input.replace(/Z$/, ".000Z") : input;
  return Number.isFinite(ms) && new Date(ms).toISOString() === iso ? ms : NaN;
}

function validateMarket(market, allowLegacyMass) {
  const { probabilities, scores, over25, btts, rates, venueMatches } = market ?? {};
  const mass = probabilities?.reduce((sum, p) => sum + p, 0);
  // The current frontend truncates at 10 goals and caps each lambda at 4.
  const minMass = allowLegacyMass ? 0.99 : 1 - 1e-10;
  if (probabilities?.length !== 3 || !probabilities.every(validProbability) ||
      mass < minMass || mass > 1 + 1e-10 || ![over25, btts].every(validProbability) ||
      !Array.isArray(scores) || scores.length < 1 || scores.length > 5 ||
      new Set(scores.map(score => JSON.stringify(score?.slice(0, 2)))).size !== scores.length ||
      scores.some(row => !Array.isArray(row) || row.length !== 3 ||
        !row.slice(0, 2).every(n => Number.isSafeInteger(n) && n >= 0) || !validProbability(row[2])) ||
      rates?.length !== 2 || !rates.every(x => Number.isFinite(x) && x >= 0 && x <= 100) ||
      venueMatches?.length !== 2 || !venueMatches.every(x => Number.isSafeInteger(x) && x >= 0)) {
    throw new Error("Invalid archived market");
  }
}

function validatePrediction(record) {
  const f = record.fixture;
  if (record.schemaVersion !== 1 || !f || !/^espn:[a-z]+\.[a-z0-9]+:\d+$/.test(f.key) ||
      f.key !== `espn:${f.league}:${f.id}` || ![f.home, f.away].every(t =>
        /^\d+$/.test(t?.id) && typeof t?.name === "string" && t.name.trim()) || f.home.id === f.away.id ||
      !hashPattern.test(record.snapshotSha256) || !hashPattern.test(f.eventSha256) ||
      !(timestamp(record.sourceAt) <= timestamp(record.recordedAt)) ||
      !(timestamp(record.recordedAt) < timestamp(f.kickoff)) ||
      !record.models || Object.keys(record.models).length !== models.length) {
    throw new Error("Invalid pre-kickoff fixture evidence");
  }
  for (const name of models) {
    const model = record.models[name];
    if (!model || model.name !== name || typeof model.version !== "string" ||
        !revisionPattern.test(model.revision) || model.predictedAt !== record.recordedAt) {
      throw new Error("Missing model provenance");
    }
    validateMarket(model.full, name === models[0]);
    if (model.half !== null) validateMarket(model.half, name === models[0]);
  }
}

async function createOnly(directory, filename, payload, beforeLink) {
  await mkdir(directory, { recursive: true });
  const path = join(directory, filename);
  const value = { ...payload, sha256: digest(payload) };
  const temp = join(directory, `.${randomUUID()}.tmp`);
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify(value) + "\n");
    await handle.sync();
    await handle.close();
    beforeLink?.();
    await link(temp, path);
    const dir = await open(directory, "r");
    try { await dir.sync(); } finally { await dir.close(); }
    return { created: true, value };
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return { created: false, value: await checkedRead(path) };
  } finally {
    await handle.close();
    await unlink(temp);
  }
}

async function checkedRead(path) {
  const { sha256, ...payload } = JSON.parse(await readFile(path, "utf8"));
  if (!hashPattern.test(sha256) || sha256 !== digest(payload)) throw new Error("Archive integrity mismatch");
  return { ...payload, sha256 };
}

function validateOutcome(record, evidence) {
  if (Object.hasOwn(evidence, "predictionSha256") || evidence.status !== "completed" || !(timestamp(evidence.observedAt) > timestamp(record.fixture.kickoff)) ||
        !hashPattern.test(evidence.boardSha256) || evidence.fixtureKey !== record.fixture.key ||
        !Array.isArray(evidence.full) || evidence.full.length !== 2 || !evidence.full.every(validScore) ||
        (evidence.half !== null && (!hashPattern.test(evidence.summarySha256) || !Array.isArray(evidence.half) ||
        evidence.half.length !== 2 || evidence.half.some((n, i) => !validScore(n) || n > evidence.full[i])))) {
    throw new Error("Invalid final score evidence");
  }
}

function pairedResults(finals, records) {
  const byFixture = new Map();
  for (const { sha256, predictionSha256, ...evidence } of finals) {
    const record = records.get(evidence.fixtureKey);
    if (!record || record.sha256 !== predictionSha256 || !hashPattern.test(sha256)) {
      throw new Error("Missing result provenance in bundle");
    }
    validateOutcome(record, evidence);
    const pair = byFixture.get(evidence.fixtureKey) ?? {};
    const period = evidence.half ? "half" : "full";
    if (pair[period]) throw new Error("Duplicate archive result");
    pair[period] = evidence;
    byFixture.set(evidence.fixtureKey, pair);
  }
  for (const { full, half } of byFixture.values()) {
    if (!full || (half && digest(full.full) !== digest(half.full))) {
      throw new Error("Inconsistent full-time and half-time archive results");
    }
  }
}

function openLedger(root, now = () => new Date().toISOString()) {
  const predictions = join(root, "predictions");
  const snapshots = join(root, "snapshots");
  const outcomes = join(root, "outcomes");
  function checkSnapshot(value) {
    if (value.eventSha256 !== digest(value.originalEvent) || !Array.isArray(value.sources) ||
        value.sources.length !== 3 || value.sources.some(s => !hashPattern.test(s.sha256) ||
          !(timestamp(s.capturedAt) <= timestamp(value.sourceAt))) ||
        !Array.isArray(value.inputs) || value.inputs.some(r => !(r.day < value.historyBeforeIstanbulDay))) {
      throw new Error("Invalid snapshot evidence");
    }
  }
  async function snapshot(value) {
    checkSnapshot(value);
    return (await createOnly(snapshots, digest(value) + ".json", value)).value;
  }
  async function linkedSnapshot(ref, snapshotSha256) {
    const value = await checkedRead(join(snapshots, snapshotSha256 + ".json"));
    checkSnapshot(value);
    const { fixtureKey, eventSha256, sourceAt } = value;
    if (value.sha256 !== snapshotSha256 || fixtureKey !== ref.fixture.key ||
        eventSha256 !== ref.fixture.eventSha256 || sourceAt !== ref.sourceAt) {
      throw new Error("Snapshot identity mismatch");
    }
  }
  async function append(input) {
    const recordedAt = now();
    const { fixture, snapshotSha256, sourceAt } = input;
    const modelRows = Object.fromEntries(Object.entries(input.models).map(([name, value]) =>
      [name, { ...value, name, predictedAt: recordedAt }]));
    const record = { schemaVersion: 1, fixture, sourceAt, recordedAt, snapshotSha256, models: modelRows };
    validatePrediction(record);
    await linkedSnapshot(record, snapshotSha256);
    const result = await createOnly(predictions, sha(fixture.key) + ".json", record, () => {
      if (!(timestamp(now()) < timestamp(fixture.kickoff))) throw new Error("Late prediction write");
    });
    validatePrediction(result.value);
    await linkedSnapshot(result.value, result.value.snapshotSha256);
    if (result.value.fixture.key !== fixture.key) throw new Error("Prediction filename mismatch");
    if (!result.created && (result.value.snapshotSha256 !== snapshotSha256 ||
        digest(result.value.fixture) !== digest(fixture) ||
        models.some(name => {
          const { predictedAt: _, ...old } = result.value.models[name];
          const { predictedAt: __, ...next } = modelRows[name];
          return digest(old) !== digest(next);
        }))) throw new Error("Conflicting immutable prediction");
    return result;
  }
  async function list() {
    let names;
    try { names = await readdir(predictions); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
    const result = [];
    for (const file of names.filter(n => /^[a-f0-9]{64}\.json$/.test(n)).sort()) {
      const value = await checkedRead(join(predictions, file));
      validatePrediction(value);
      if (sha(value.fixture.key) + ".json" !== file) throw new Error("Prediction filename mismatch");
      await linkedSnapshot(value, value.snapshotSha256);
      result.push(value);
    }
    return result;
  }
  async function outcome(record, evidence) {
    validateOutcome(record, evidence);
    const payload = { predictionSha256: record.sha256, ...evidence };
    const key = sha(record.fixture.key);
    async function seal(suffix, data) {
      const { value: saved } = await createOnly(outcomes, `${key}-${suffix}.json`, data);
      if (saved.predictionSha256 !== record.sha256 || saved.fixtureKey !== record.fixture.key ||
          digest(saved.full) !== digest(evidence.full) || digest(saved.half) !== digest(data.half)) {
        throw new Error("Conflicting immutable result");
      }
      return saved;
    }
    const full = await seal("full", { ...payload, half: null });
    return evidence.half ? seal("half", payload) : full;
  }
  async function results() {
    let names;
    try { names = await readdir(outcomes); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
    return Promise.all(names.filter(n => /^[a-f0-9]{64}-(full|half)\.json$/.test(n)).sort()
      .map(async name => {
        const row = await checkedRead(join(outcomes, name));
        const expected = `${sha(row.fixtureKey)}-${row.half ? "half" : "full"}.json`;
        if (name !== expected) throw new Error("Result filename mismatch");
        return row;
      }));
  }
  async function bundle() {
    const records = await list();
    const linked = [...new Set(records.map(r => r.snapshotSha256))];
    const finals = await results();
    pairedResults(finals, new Map(records.map(record => [record.fixture.key, record])));
    return { predictions: records, snapshots: await Promise.all(linked.map(hash =>
      checkedRead(join(snapshots, hash + ".json")))), results: finals };
  }

  async function restore(archive) {
    const { predictions: records, snapshots: inputs, results: finals } = archive;
    if (![records, inputs, finals].every(Array.isArray)) throw new Error("Invalid archive bundle");
    function data(record) {
      const { sha256, ...payload } = record;
      if (sha256 !== digest(payload)) throw new Error("Archive bundle integrity mismatch");
      return payload;
    }
    async function restoreExact(directory, name, record) {
      const result = await createOnly(directory, name, data(record));
      if (result.value.sha256 !== record.sha256) throw new Error("Conflicting immutable archive import");
    }
    const inputsByHash = new Map();
    const fixtureRecords = new Map();
    for (const input of inputs) {
      data(input);
      checkSnapshot(input);
      if (inputsByHash.has(input.sha256)) throw new Error("Duplicate archive snapshot");
      inputsByHash.set(input.sha256, input);
    }
    for (const record of records) {
      data(record);
      validatePrediction(record);
      const snapshot = inputsByHash.get(record.snapshotSha256);
      if (!snapshot || snapshot.fixtureKey !== record.fixture.key ||
          snapshot.eventSha256 !== record.fixture.eventSha256 || snapshot.sourceAt !== record.sourceAt) {
        throw new Error("Snapshot identity mismatch");
      }
      if (fixtureRecords.has(record.fixture.key)) throw new Error("Duplicate archive prediction");
      fixtureRecords.set(record.fixture.key, record);
    }
    for (const result of finals) data(result);
    pairedResults(finals, fixtureRecords);

    for (const input of inputs) await restoreExact(snapshots, input.sha256 + ".json", input);
    for (const record of records) await restoreExact(predictions, sha(record.fixture.key) + ".json", record);
    // Half-time is only published after its exact full-time seal, even if the
    // input bundle was shuffled or a previous restore was interrupted.
    for (const period of ["full", "half"]) {
      for (const result of finals.filter(row => (row.half ? "half" : "full") === period)) {
        await restoreExact(outcomes, `${sha(result.fixtureKey)}-${period}.json`, result);
      }
    }
  }
  return { snapshot, append, list, outcome, results, bundle, restore };
}

module.exports = { digest, models, openLedger, sha, timestamp, validScore };
