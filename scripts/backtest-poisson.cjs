#!/usr/bin/env node
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { basename } = require("node:path");
const { parseArgs } = require("node:util");
const { markets, poisson } = require("../src/poisson-probabilities.js");
const { parseDate, cleanArchive } = require("./poisson-football-data.cjs");
const { loadWorkerModels } = require("./poisson-worker-models.cjs");
const { evaluateExperiments } = require("./poisson-evaluation.cjs");

const frontends = ["Frontend legacy", "Frontend normalized"];
const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;

function frontendRates(home, away) {
  if (home.length < 10 || away.length < 10) return null;
  function stats(past, venue) {
    const recent = past.slice(-10);
    const split = recent.filter(match => match.venue === venue);
    const sample = split.length >= 3 ? split : recent;
    return { gf: average(sample.map(match => match.gf)), ga: average(sample.map(match => match.ga)) };
  }
  const h = stats(home, "home");
  const a = stats(away, "away");
  const rate = (gf, ga) => Math.max(0.15, Math.min(4, (gf + ga) / 2));
  return [rate(h.gf, a.ga), rate(a.gf, h.ga)];
}

function legacyMarkets(home, away) {
  // Mirrors the pre-match calculation in index.html, including the 0–10/0–7 limits.
  const probabilities = [0, 0, 0];
  const scores = [];
  for (let h = 0; h <= 10; h++) {
    for (let a = 0; a <= 10; a++) {
      const p = poisson(home, h) * poisson(away, a);
      probabilities[h > a ? 0 : h === a ? 1 : 2] += p;
      if (h <= 7 && a <= 7) scores.push({ h, a, p });
    }
  }
  const total = home + away;
  const over25 = Math.max(0, Math.min(1, 1 - [0, 1, 2].reduce((sum, goals) => sum + poisson(total, goals), 0)));
  const btts = (1 - Math.exp(-home)) * (1 - Math.exp(-away));
  scores.sort((a, b) => b.p - a.p);
  return { probabilities, over25, btts, scores: scores.slice(0, 5).map(({ h, a }) => [h, a]) };
}

function normalizedMarkets(home, away) {
  const m = markets(home, away);
  return {
    probabilities: [m.homeWin, m.draw, m.awayWin],
    over25: m.over25, btts: m.btts,
    scores: m.topScores.map(score => [score.home, score.away])
  };
}

function* walkForward(fixtures, testStart, worker) {
  const leagues = new Map();
  for (let start = 0; start < fixtures.length;) {
    const { day } = fixtures[start];
    let end = start + 1;
    while (end < fixtures.length && fixtures[end].day === day) end++;
    const observations = [];
    for (const match of fixtures.slice(start, end)) {
      const { id, league, season, home, away } = match;
      if (!leagues.has(league)) {
        leagues.set(league, { clubs: new Map(), worker: worker?.createLeague(testStart) });
      }
      const state = leagues.get(league);
      function club(name) {
        const previous = state.clubs.get(name);
        if (!previous || season > previous.season + 1) {
          const current = { key: `${name} [${season}]`, season, history: [] };
          state.clubs.set(name, current);
          return current;
        }
        previous.season = season;
        return previous;
      }
      const h = club(home);
      const a = club(away);
      const target = { kickoff: day, home_team: h.key, away_team: a.key };
      const forecast = state.worker?.predict(target);
      const rates = day >= testStart ? frontendRates(h.history, a.history) : null;
      let models = null;
      if (rates && (!worker || forecast.models)) {
        models = {
          [frontends[0]]: legacyMarkets(...rates),
          [frontends[1]]: normalizedMarkets(...rates),
          ...forecast?.models
        };
      }
      observations.push({ match, state, target, h, a, forecast });
      yield { id, league, season, day, match, rates, models, rho: state.worker?.fittedRho() };
    }

    // All predictions for the local calendar date precede all result updates.
    for (const { match, state, target, h, a, forecast } of observations) {
      h.history.push({ venue: "home", gf: match.hg, ga: match.ag });
      a.history.push({ venue: "away", gf: match.ag, ga: match.hg });
      state.worker?.observe(target, match, forecast);
    }
    start = end;
  }
}

function wilson(hits, count) {
  const z = 1.959963984540054;
  const rate = hits / count;
  const factor = 1 + z ** 2 / count;
  const center = (rate + z ** 2 / (2 * count)) / factor;
  const margin = z * Math.sqrt((rate * (1 - rate) + z ** 2 / (4 * count)) / count) / factor;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function summarize(rows, model) {
  if (!rows.length) return { matches: 0 };
  const newBins = () => Array.from({ length: 10 }, () => ({ count: 0, probability: 0, observed: 0 }));
  const bins = newBins();
  const byOutcome = [newBins(), newBins(), newBins()];
  const binary = Object.fromEntries(["over25", "btts"].map(key => [key, {
    correct: 0, logLoss: 0, brier: 0, positive: 0, predicted: 0
  }]));
  let correct = 0, strictCorrect = 0, logLoss = 0, brier = 0, top1 = 0, top5 = 0, probabilityMass = 0;
  function addBin(group, p, observed) {
    const bin = group[Math.min(9, Math.floor(p * 10))];
    bin.count++;
    bin.probability += p;
    bin.observed += Number(observed);
  }
  const loss = p => -Math.log(Math.max(1e-15, p));
  for (const { match: { hg, ag }, models } of rows) {
    const forecast = models[model];
    const p = forecast.probabilities;
    const result = hg > ag ? 0 : hg === ag ? 1 : 2;
    const peak = Math.max(...p);
    const strictPick = p.indexOf(peak);
    // Resolve numerical ties uniformly in 1-X-2 order for the paired comparison.
    const pick = p.findIndex(probability => peak - probability <= 1e-12);
    strictCorrect += Number(strictPick === result);
    correct += Number(pick === result);
    logLoss += loss(p[result]);
    for (let i = 0; i < p.length; i++) {
      probabilityMass += p[i];
      brier += (p[i] - Number(i === result)) ** 2;
      addBin(byOutcome[i], p[i], i === result);
    }
    addBin(bins, p[pick], pick === result);
    const scoreHit = ([home, away]) => hg === home && ag === away;
    top1 += Number(scoreHit(forecast.scores[0]));
    top5 += Number(forecast.scores.some(scoreHit));
    for (const [key, actual] of [["over25", hg + ag >= 3], ["btts", hg > 0 && ag > 0]]) {
      const metrics = binary[key];
      const probability = forecast[key];
      metrics.correct += Number((probability >= 0.5) === actual);
      metrics.logLoss += loss(actual ? probability : 1 - probability);
      metrics.brier += (probability - Number(actual)) ** 2;
      metrics.positive += Number(actual);
      metrics.predicted += probability;
    }
  }
  const n = rows.length;
  const calibration = group => group.flatMap((bin, index) => bin.count ? [{
    from: index / 10, to: (index + 1) / 10, n: bin.count, meanProbability: bin.probability / bin.count,
    observedRate: bin.observed / bin.count, wilson95: wilson(bin.observed, bin.count)
  }] : []);
  return {
    matches: n, accuracy: correct / n, strictAccuracy: strictCorrect / n, logLoss: logLoss / n, multiclassBrier: brier / n,
    mean1x2Mass: probabilityMass / n,
    ece: bins.reduce((sum, bin) => sum + Math.abs(bin.probability - bin.observed), 0) / n,
    calibration: calibration(bins), byOutcomeCalibration: byOutcome.map(calibration),
    byOutcomeEce: byOutcome.map(group =>
      group.reduce((sum, bin) => sum + Math.abs(bin.probability - bin.observed), 0) / n),
    topScoreAccuracy: top1 / n, top5ScoreAccuracy: top5 / n,
    binary: Object.fromEntries(Object.entries(binary).map(([key, x]) => [key, {
      accuracy: x.correct / n, logLoss: x.logLoss / n, brier: x.brier / n,
      baseRate: x.positive / n, meanProbability: x.predicted / n
    }]))
  };
}

function evaluate(inputs, { testStart, worker, experiment, period = "full" } = {}) {
  if (!["full", "half"].includes(period)) throw new Error("Period must be full or half");
  const { reports, fixtures: archive } = cleanArchive(inputs);
  // Use period-specific history for the replay. An absent half-time score has no proxy.
  const fixtures = period === "full" ? archive : archive
    .filter(match => match.half)
    .map(match => ({ ...match, hg: match.half[0], ag: match.half[1] }));
  const days = [...new Set(fixtures.map(match => match.day))];
  const cutoff = testStart ?? days[Math.floor(days.length * 0.7)];
  if (!cutoff || parseDate(cutoff) !== cutoff || cutoff <= days[0] || cutoff > days.at(-1)) {
    throw new Error("Test start must be an ISO day inside the archive, after its first day");
  }
  const modelNames = [...frontends, ...(worker?.names ?? [])];
  const slices = new Map();
  function slice(key) {
    if (!slices.has(key)) slices.set(key, { train: 0, test: 0, frontendEligible: 0, paired: [], rho: null });
    return slices.get(key);
  }
  for (const row of walkForward(fixtures, cutoff, worker)) {
    for (const key of ["overall", row.league, `${row.league}/${row.season}`]) {
      const entry = slice(key);
      if (row.day < cutoff) {
        entry.train++;
      } else {
        entry.test++;
        if (row.rates) entry.frontendEligible++;
        if (row.models) entry.paired.push(row);
        if (key !== "overall" && row.rho != null) entry.rho = row.rho;
      }
    }
  }
  if (!slice("overall").paired.length) throw new Error("No matches met all model eligibility criteria");
  const groups = Object.fromEntries([...slices].map(([key, { paired, ...counts }]) => [key, {
    ...counts, paired: paired.length,
    cohortSha256: createHash("sha256").update(JSON.stringify(paired.map(row => row.id))).digest("hex"),
    models: Object.fromEntries(modelNames.map(name => [name, summarize(paired, name)]))
  }]));
  return {
    testStart: cutoff, period, cleanFullTime: archive.length, periodFixtures: fixtures.length,
    workerRevision: worker?.revision ?? null, sources: reports, groups,
    ...(experiment && { experiments: evaluateExperiments(slice("overall").paired, modelNames, experiment, summarize) })
  };
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      "test-start": { type: "string" }, "worker-checkout": { type: "string" }, period: { type: "string" },
      "calibration-validation-start": { type: "string" }, "calibration-test-start": { type: "string" }
    },
    allowPositionals: true
  });
  if (!positionals.length) {
    console.error("Usage: node scripts/backtest-poisson.cjs [--test-start DATE] [--worker-checkout DIR] "
      + "[--period full|half] [--calibration-validation-start DATE --calibration-test-start DATE] FILE.csv ...");
    process.exitCode = 2;
    return;
  }
  const inputs = positionals.map(path => {
    const name = basename(path);
    const known = /^(\d{2})(\d{2})-([A-Z]{1,2}[0-9])\.csv$/.exec(name);
    if (known && (Number(known[1]) + 1) % 100 !== Number(known[2])) throw new Error(`Invalid season in ${name}`);
    return {
      name, bytes: readFileSync(path),
      ...(known && {
        league: known[3], season: 2000 + Number(known[1]),
        url: `https://www.football-data.co.uk/mmz4281/${known[1]}${known[2]}/${known[3]}.csv`
      })
    };
  });
  const worker = values["worker-checkout"] ? await loadWorkerModels(values["worker-checkout"]) : null;
  const validationStart = values["calibration-validation-start"];
  const calibrationTestStart = values["calibration-test-start"];
  if (Boolean(validationStart) !== Boolean(calibrationTestStart)) {
    throw new Error("Supply both calibration dates together");
  }
  const experiment = validationStart ? { validationStart, testStart: calibrationTestStart } : undefined;
  console.log(JSON.stringify(evaluate(inputs, {
    testStart: values["test-start"], worker, period: values.period, experiment
  }), null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { evaluate, frontendRates, legacyMarkets, normalizedMarkets, summarize, walkForward };
