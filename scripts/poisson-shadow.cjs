// Isolated five-model capture and settlement. All provider traffic goes to public read endpoints.
const { execFile, execFileSync } = require("node:child_process");
const { readFile } = require("node:fs/promises");
const { resolve } = require("node:path");
const { parseArgs, promisify } = require("node:util");
const { cleanArchive, parseDate } = require("./poisson-football-data.cjs");
const { loadWorkerModels } = require("./poisson-worker-models.cjs");
const { summarize } = require("./backtest-poisson.cjs");
const { pairedComparison } = require("./poisson-evaluation.cjs");
const { evaluateProspective } = require("./poisson-prospective.cjs");
const { normalizeName, predictGroup, preparePeriod } = require("./poisson-shadow-models.cjs");
const { digest, models, openLedger, sha, timestamp } = require("./poisson-shadow-ledger.cjs");
const {
  boardEvents, boardUrl, finishStatus, fixture, istanbulDay, readSource, scheduled, summaryUrl, verifiedHalf
} = require("./poisson-shadow-espn.cjs");

const leagues = { "tur.1": "T1", "eng.1": "E0", "ger.1": "D1", "esp.1": "SP1", "ita.1": "I1", "fra.1": "F1" };
const now = () => new Date().toISOString();
const sourceProof = ({ url, sha256, capturedAt }) => ({ url, sha256, capturedAt });
const daysBetween = (ms, days) => Array.from({ length: days }, (_, i) => istanbulDay(ms + i * 86400000));
const seasonOf = date => Number(date.slice(0, 4)) - Number(date.slice(5, 7) < "07");

async function runBatched(items, work) {
  const completed = [];
  for (let start = 0; start < items.length; start += 8) {
    completed.push(...await Promise.all(items.slice(start, start + 8).map(work)));
  }
  return completed;
}

const curl = promisify(execFile);
async function readArchiveCsv(url, read = curl) {
  // Football-Data requires the runtime's HTTPS proxy in Work. curl honors
  // that proxy while retaining the exact public provider URL in the evidence.
  const args = ["--fail", "--silent", "--show-error",
    "--proto", "=https", "--proto-redir", "=https", "--location", "--max-redirs", "3",
    "--max-time", "25", "--max-filesize", "8000000", url];
  const attempt = () => read("curl", args, { encoding: "buffer", maxBuffer: 8_100_000 });
  let response;
  try { response = await attempt(); }
  catch (error) {
    const retryable = [5, 6, 7, 18, 28, 52, 55, 56].includes(error.code) ||
      (error.code === 22 && /\b(?:429|50[0234])\b/.test(String(error.stderr)));
    if (!retryable) throw error;
    // A new process replaces the previous response instead of reusing bytes from a partial transfer.
    response = await attempt();
  }
  const bytes = response.stdout;
  return { bytes, capturedAt: now(), url, sha256: sha(bytes) };
}

function providers() {
  const requests = new Map();
  const failures = [];
  async function get(url) {
    if (!requests.has(url)) {
      const read = new URL(url).hostname === "www.football-data.co.uk" ? readArchiveCsv : readSource;
      requests.set(url, read(url).catch(error => {
        failures.push({ url, error: error.message });
        return null;
      }));
    }
    return requests.get(url);
  }
  async function board(league, day) {
    const url = boardUrl(league, day);
    const source = await get(url);
    if (!source) return null;
    try { return { source, events: boardEvents(source, league) }; }
    catch (error) { failures.push({ url, error: error.message }); return null; }
  }
  return { get, board, failures };
}

async function leagueInputs(league, day, worker, provider) {
  const season = seasonOf(day);
  const start = `${season}-07-01`;
  const code = leagues[league];
  const sources = await Promise.all([season - 1, season].map(async year => {
    const label = `${String(year).slice(-2)}${String(year + 1).slice(-2)}`;
    const url = `https://www.football-data.co.uk/mmz4281/${label}/${code}.csv`;
    const source = await provider.get(url);
    return source && { ...source, name: `${label}-${code}.csv`, league: code, season: year };
  }));
  if (sources.some(source => !source)) return null;
  const { fixtures } = cleanArchive(sources);
  const rows = fixtures.filter(row => row.day < day);
  const periods = Object.fromEntries(["full", "half"].map(period => [period, preparePeriod(rows, worker, start, period)]));
  return { sources, rows, periods, trainingCutoff: start };
}

async function capture(ledger, worker, revisions, provider, days, captureFrom) {
  const beganAt = now();
  const day = istanbulDay(timestamp(beganAt));
  const dates = daysBetween(captureFrom ? Date.parse(captureFrom) : timestamp(beganAt), days);
  const booked = new Set((await ledger.list()).map(r => r.fixture.key));
  const decisions = [];
  const inputs = new Map();
  const boardRequests = Object.keys(leagues).flatMap(league => dates.map(date => [league, date]));
  const boards = await runBatched(boardRequests, async ([league, date]) =>
    ({ league, date, board: await provider.board(league, date) }));
  for (const { league, date, board } of boards) {
    if (!board) continue;
    for (const event of board.events) {
      const game = fixture(event, league);
      if (!game || game.istanbulDay !== date || !scheduled(event, board.source.capturedAt)) continue;
      if (board.events.filter(item => item?.id === game.id).length !== 1) {
        decisions.push({ fixtureKey: game.key, status: "duplicate_provider_identity" });
        continue;
      }
      if (booked.has(game.key)) {
        decisions.push({ fixtureKey: game.key, status: "already_recorded" });
        continue;
      }
      if (!inputs.has(league)) {
        try { inputs.set(league, await leagueInputs(league, day, worker, provider)); }
        catch (error) { inputs.set(league, null); provider.failures.push({ league, error: error.message }); }
      }
      const history = inputs.get(league);
      if (!history) {
        decisions.push({ fixtureKey: game.key, status: "missing_history_source" });
        continue;
      }
      const sourceAt = [board.source, ...history.sources].map(s => s.capturedAt).sort().at(-1);
      if (timestamp(now()) >= timestamp(game.kickoff)) {
        decisions.push({ fixtureKey: game.key, status: "late_capture" });
        continue;
      }
      const p = predictGroup(game, sourceAt, history.periods, revisions);
      if (!p.models) {
        decisions.push({ fixtureKey: game.key, status: p.reason, available: p.available ?? [] });
        continue;
      }
      const snapshot = await ledger.snapshot({
        fixtureKey: game.key, eventSha256: game.eventSha256, sourceAt, originalEvent: event,
        sources: [board.source, ...history.sources].map(sourceProof), historyBeforeIstanbulDay: day,
        trainingCutoff: history.trainingCutoff, archiveTeams: [p.home, p.away],
        inputs: history.rows.map(({ id, league, season, day, home, away, hg, ag, half }) =>
          ({ id, league, season, day, home, away, hg, ag, half }))
      });
      let saved;
      try { saved = await ledger.append({ fixture: game, sourceAt, snapshotSha256: snapshot.sha256, models: p.models }); }
      catch (error) {
        if (error.message === "Conflicting immutable prediction") {
          booked.add(game.key);
          decisions.push({ fixtureKey: game.key, status: "concurrent_prediction_preserved" });
          continue;
        }
        if (timestamp(now()) >= timestamp(game.kickoff)) {
          decisions.push({ fixtureKey: game.key, status: "late_capture" });
          continue;
        }
        throw error;
      }
      booked.add(game.key);
      decisions.push({ fixtureKey: game.key, status: saved.created ? "recorded" : "already_recorded" });
    }
  }
  return decisions;
}

async function findResult(original, provider) {
  const board = await provider.board(original.league, original.istanbulDay);
  if (!board) return { status: "source_unavailable" };
  const events = board.events.filter(event => event?.id === original.id);
  if (events.length !== 1) {
    const summary = await provider.get(summaryUrl(original.league, original.id));
    if (summary && events.length === 0) {
      let header;
      try { header = JSON.parse(summary.bytes).header; }
      catch (error) { provider.failures.push({ url: summary.url, error: error.message }); }
      const c = header?.competitions?.length === 1 ? header.competitions[0] : null;
      if (c && header.league?.slug === original.league) {
        const result = finishStatus(original, { id: header.id, date: c.date, status: c.status, competitions: [c] },
          original.league, summary.capturedAt);
        if (["cancelled", "postponed", "awarded", "rescheduled", "pending"].includes(result.status)) {
          return { status: result.status, summary: sourceProof(summary) };
        }
      }
    }
    return { status: "event_not_verified" };
  }
  const event = events[0];
  const checked = finishStatus(original, event, original.league, board.source.capturedAt);
  const evidence = { ...checked, fixtureKey: original.key, observedAt: board.source.capturedAt,
    boardSha256: board.source.sha256, scoreboard: sourceProof(board.source), resultEventSha256: digest(event) };
  if (checked.status !== "completed") return evidence;
  const summary = await provider.get(summaryUrl(original.league, original.id));
  if (!summary) return { ...evidence, half: null, halfStatus: "source_unavailable" };
  try {
    const payload = JSON.parse(summary.bytes);
    const c = payload.header?.competitions?.[0];
    const summaryEvidence = c && payload.header?.league?.slug === original.league && finishStatus(original, {
      id: payload.header.id, date: c.date, status: c.status, competitions: payload.header.competitions
    }, original.league, summary.capturedAt);
    const proof = { ...evidence, summarySha256: summary.sha256, summary: sourceProof(summary) };
    if (summaryEvidence) {
      const summaryStatus = summaryEvidence.status;
      const disputedStatus = ["awarded", "cancelled", "postponed", "rescheduled", "identity_mismatch"].includes(summaryStatus);
      const disputedScore = summaryStatus === "completed" &&
        summaryEvidence.full.some((score, i) => score !== checked.full[i]);
      if (disputedStatus || disputedScore) {
        return { ...proof, status: "result_conflict", full: null, half: null,
          conflictReason: disputedScore ? "scoreboard_summary_score" : `summary_${summaryStatus}` };
      }
    }
    const half = verifiedHalf(original, checked.full, payload);
    return { ...proof, half, halfStatus: half ? "verified" : "unverified" };
  } catch (error) {
    provider.failures.push({ url: summary.url, error: error.message });
    return { ...evidence, half: null, halfStatus: "unverified" };
  }
}

async function settle(records, provider, ledger) {
  const sealedHalves = new Map((await ledger.results()).filter(row => row.half !== null)
    .map(row => [row.fixtureKey, row]));
  return runBatched(records, async record => {
    const fixtureKey = record.fixture.key;
    const evidence = await findResult(record.fixture, provider);
    if (evidence.status !== "completed") return { ...evidence, fixtureKey };

    // A transient summary outage does not erase a sealed half-time result when
    // the current ESPN scoreboard confirms the same full-time score and identity.
    const prior = sealedHalves.get(fixtureKey);
    if (evidence.halfStatus === "source_unavailable" && prior?.predictionSha256 === record.sha256 &&
        digest(evidence.full) === digest(prior.full)) {
      evidence.half = prior.half;
      evidence.halfStatus = "verified_archive";
      evidence.summarySha256 = prior.summarySha256;
      evidence.summary = prior.summary;
    }
    try {
      const sealed = await ledger.outcome(record, evidence);
      return { ...evidence, fixtureKey, outcomeSha256: sealed.sha256 };
    } catch (error) {
      if (error.message === "Conflicting immutable result") {
        const sealed = (await ledger.results()).filter(row =>
          row.fixtureKey === fixtureKey && row.predictionSha256 === record.sha256);
        const agreedFull = sealed.find(row => row.half === null && digest(row.full) === digest(evidence.full));
        if (agreedFull && evidence.half) {
          return { ...evidence, half: null, halfStatus: "result_conflict",
            conflictReason: "sealed_half_time_score", outcomeSha256: agreedFull.sha256 };
        }
        return { fixtureKey, status: "result_conflict", observedAt: evidence.observedAt,
          boardSha256: evidence.boardSha256, summarySha256: evidence.summarySha256,
          conflictReason: "sealed_full_time_score" };
      }
      throw error;
    }
  });
}

function compare(records, outcomes, period) {
  const verified = new Map(outcomes.filter(o => o.status === "completed" && o[period]).map(o => [o.fixtureKey, o]));
  const rows = records.flatMap(record => {
    const f = record.fixture;
    const score = verified.get(f.key)?.[period];
    if (!score || !models.every(model => record.models[model][period])) return [];
    return [{ league: f.league, season: seasonOf(f.istanbulDay), day: f.istanbulDay,
      match: { hg: score[0], ag: score[1] },
      revisions: models.map(model => [record.models[model].version, record.models[model].revision]),
      models: Object.fromEntries(models.map(name => [name, record.models[name][period]])) }];
  });
  function summary(group) {
    const blocks = new Set(group.map(row => `${row.season}:${Math.floor(Date.parse(row.day) / (28 * 86400000))}`)).size;
    // Pilot reporting is descriptive until the archive has several independent periods.
    const inferenceReady = group.length >= 100 && blocks >= 8;
    const summaries = Object.fromEntries(models.map(name => [name, summarize(group, name)]));
    const baseline = summaries["Worker v1.2"];
    const metrics = ["accuracy", "logLoss", "multiclassBrier", "ece"];
    return { matches: group.length, blocks, inferenceReady, models: summaries,
      deltasVsV12: group.length ? Object.fromEntries(Object.entries(summaries).map(([name, model]) =>
        [name, Object.fromEntries(metrics.map(metric => [metric, model[metric] - baseline[metric]]))])) : {},
      pairs: inferenceReady ? models.flatMap((name, i) =>
        models.slice(0, i).map(baseline => pairedComparison(group, name, baseline))) : [] };
  }
  function grouped(group) {
    return { overall: summary(group), leagues: Object.fromEntries(Object.keys(leagues).map(league =>
      [league, summary(group.filter(row => row.league === league))])) };
  }
  const byRevision = new Map();
  for (const row of rows) {
    const { revisions } = row;
    const key = digest(revisions);
    if (!byRevision.has(key)) byRevision.set(key, { revisions, rows: [] });
    byRevision.get(key).rows.push(row);
  }
  return {
    ...grouped(byRevision.size > 1 ? [] : rows), totalMatched: rows.length,
    cohorts: Object.fromEntries([...byRevision].map(([key, cohort]) => [key, {
      revisions: Object.fromEntries(models.map((name, i) => [name, cohort.revisions[i]])), ...grouped(cohort.rows)
    }]))
  };
}

function pilotGroups(records, outcomes, baselineRecords) {
  const current = new Map(records.map(record => [record.fixture.key, record.sha256]));
  const baseline = new Map(baselineRecords.map(record => [record.fixture.key, record.sha256]));
  if (baseline.size !== baselineRecords.length ||
      [...baseline].some(([key, sha256]) => current.get(key) !== sha256)) {
    throw new Error("Baseline pilot predictions do not match the sealed archive");
  }
  return Object.fromEntries([["original", true], ["extension", false]].map(([label, original]) => {
    const group = records.filter(record => baseline.has(record.fixture.key) === original);
    const keys = new Set(group.map(record => record.fixture.key));
    const groupOutcomes = outcomes.filter(result => keys.has(result.fixtureKey));
    return [label, {
      fixtures: group.length,
      statuses: groupOutcomes.reduce((counts, row) => {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
        return counts;
      }, {}),
      full: compare(group, groupOutcomes, "full"), half: compare(group, groupOutcomes, "half")
    }];
  }));
}

async function legacyAudit(path, provider) {
  const archive = JSON.parse(await readFile(path));
  const forecasts = archive.predictions;
  const pairs = await runBatched(forecasts, async row => {
    const [id, , kickoff, home, away, providerId] = row;
    const league = providerId.split(":")[1];
    const day = istanbulDay(timestamp(kickoff));
    const board = await provider.board(league, day);
    const events = board?.events.filter(e => e?.id === id) ?? [];
    const real = events.length === 1 ? fixture(events[0], league) : null;
    const namesMatch = real && normalizeName(real.home.name) === normalizeName(home) &&
      normalizeName(real.away.name) === normalizeName(away) && timestamp(real.kickoff) === timestamp(kickoff);
    return { league, id, board, event: namesMatch ? events[0] : null,
      evidence: namesMatch ? await findResult(real, provider) : { status: "event_not_verified" } };
  });
  const boards = new Map();
  for (const { league, event, evidence } of pairs) {
    if (evidence.status !== "completed") continue;
    if (!boards.has(league)) boards.set(league, { leagues: [{ slug: league }], events: [] });
    boards.get(league).events.push(event);
  }
  const report = evaluateProspective(archive, boards, now());
  return { ...report, results: pairs.map(({ league, id, evidence }) => ({ league, id, ...evidence })) };
}

async function main() {
  const { values } = parseArgs({ options: {
    mode: { type: "string", default: "disabled" }, archive: { type: "string" },
    "worker-checkout": { type: "string" }, days: { type: "string", default: "7" },
    restore: { type: "string" }, bundle: { type: "boolean", default: false },
    baseline: { type: "string" }, "capture-from": { type: "string" }
  } });
  const { mode } = values;
  if (mode === "disabled") {
    console.log(JSON.stringify({ mode, liveDefault: "Worker v1.2" }));
    return;
  }
  if (!["capture", "settle", "cycle"].includes(mode) || !values.archive || !values["worker-checkout"]) {
    throw new Error("Use --mode capture|settle|cycle --archive ISOLATED_DIR --worker-checkout CLEAN_WORKER_DIR [--days 7]");
  }
  const days = Number(values.days);
  if (!Number.isSafeInteger(days) || days < 1 || days > 14) throw new Error("Days must be between 1 and 14");
  const captureFrom = values["capture-from"];
  if (captureFrom && parseDate(captureFrom) !== captureFrom) throw new Error("Use YYYY-MM-DD for capture start");
  const front = execFileSync("git", ["-C", __dirname, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (execFileSync("git", ["-C", __dirname, "status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim()) {
    throw new Error("Use a clean frontend checkout so forecast revisions are auditable");
  }
  const worker = await loadWorkerModels(values["worker-checkout"]);
  const ledger = openLedger(resolve(values.archive));
  if (values.restore) {
    const previous = JSON.parse(await readFile(resolve(values.restore)));
    await ledger.restore(previous.archive);
  }
  const provider = providers();
  const decisions = mode === "settle" ? [] : await capture(ledger, worker, { front, worker: worker.revision }, provider, days, captureFrom);
  const records = await ledger.list();
  const outcomes = mode === "capture" ? [] : await settle(records, provider, ledger);
  const legacy = mode === "capture" ? null : await legacyAudit(resolve(values["worker-checkout"],
    "research/real-pre-match-forecast-evidence-2026-11-22.json"), provider);
  const baseline = values.baseline ? JSON.parse(await readFile(resolve(values.baseline))).archive.predictions : null;
  console.log(JSON.stringify({
    schemaVersion: 1, mode, reportedAt: now(), liveDefault: "Worker v1.2",
    revisions: { front, worker: worker.revision }, captureDecisions: decisions, sourceFailures: provider.failures,
    records: records.map(({ fixture, recordedAt, sourceAt, sha256, snapshotSha256, models: p }) => ({
      fixture, recordedAt, sourceAt, sha256, snapshotSha256, firstHalfModels: models.filter(name => p[name].half)
    })),
    outcomes, storedOutcomes: (await ledger.results()).length, legacyV12: legacy,
    prospective: { full: compare(records, outcomes, "full"), half: compare(records, outcomes, "half") },
    ...(baseline && { pilotGroups: pilotGroups(records, outcomes, baseline) }),
    ...(values.bundle && { archive: await ledger.bundle() })
  }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { compare, findResult, leagueInputs, pilotGroups, readArchiveCsv, settle };
