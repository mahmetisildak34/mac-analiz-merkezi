// Offline evaluation of paired forecasts. All dates are archive-local match days.
const { parseDate } = require("./poisson-football-data.cjs");

const metrics = ["accuracy", "logLoss", "brier", "over25Accuracy", "bttsAccuracy", "top5Accuracy"];
const log = probability => Math.log(Math.max(1e-15, probability));
const resultOf = ({ hg, ag }) => hg > ag ? 0 : hg === ag ? 1 : 2;
const blockDays = 28;
const emptyBins = () => Array(20).fill(0);
const eceDifference = bins => bins.reduce((sum, value, i) => sum + Math.abs(value) * (i < 10 ? 1 : -1), 0);
const replicates = 6000;

function temperatureScale(probabilities, temperature) {
  if (probabilities.length !== 3 || probabilities.some(p => !Number.isFinite(p) || p < 0 || p > 1)
      || probabilities.every(p => p === 0) || !Number.isFinite(temperature) || temperature <= 0) {
    throw new RangeError("Invalid calibration input");
  }
  const values = probabilities.map(log);
  const peak = Math.max(...values);
  const weights = values.map(value => Math.exp((value - peak) / temperature));
  const mass = weights.reduce((sum, value) => sum + value, 0);
  return weights.map(value => value / mass);
}

function fitTemperature(rows, model) {
  if (!rows.length) throw new Error("Temperature calibration requires training matches");
  // Multiclass log loss is convex in the inverse temperature.
  const inputs = rows.map(({ match, models }) => {
    const scores = models[model].probabilities.map(log);
    const peak = Math.max(...scores);
    return { centered: scores.map(score => score - peak), result: resultOf(match) };
  });
  let lower = 1 / 3, upper = 2;
  for (let step = 0; step < 48; step++) {
    const inverse = (lower + upper) / 2;
    let slope = 0;
    for (const { centered, result } of inputs) {
      const weights = centered.map(value => Math.exp(value * inverse));
      const sum = weights.reduce((total, weight) => total + weight, 0);
      slope += weights.reduce((total, weight, i) => total + weight * centered[i], 0) / sum - centered[result];
    }
    if (slope > 0) upper = inverse;
    else lower = inverse;
  }
  return 2 / (lower + upper);
}

function scored({ match, models }, key) {
  const { probabilities: p, over25, btts, scores } = models[key];
  const result = resultOf(match);
  const peak = Math.max(...p);
  const pick = p.findIndex(value => peak - value <= 1e-12);
  const correct = Number(pick === result);
  const values = [
    correct,
    -log(p[result]),
    p.reduce((sum, value, i) => sum + (value - Number(i === result)) ** 2, 0),
    Number((over25 >= 0.5) === (match.hg + match.ag >= 3)),
    Number((btts >= 0.5) === (match.hg > 0 && match.ag > 0)),
    Number(scores.some(([home, away]) => home === match.hg && away === match.ag))
  ];
  return { values, bin: Math.min(9, Math.floor(p[pick] * 10)), gap: p[pick] - correct };
}

function pairedComparison(rows, candidate, baseline, confidence = 0.95) {
  const seasons = new Map();
  const totals = metrics.map(() => 0);
  const allBins = emptyBins();
  for (const row of rows) {
    if (!seasons.has(row.season)) seasons.set(row.season, new Map());
    const season = seasons.get(row.season);
    const index = Math.floor(Date.parse(row.day) / (86400000 * blockDays));
    if (!season.has(index)) season.set(index, { n: 0, values: metrics.map(() => 0), bins: emptyBins() });
    const block = season.get(index);
    const next = scored(row, candidate);
    const old = scored(row, baseline);
    block.n++;
    block.bins[next.bin] += next.gap;
    block.bins[old.bin + 10] += old.gap;
    allBins[next.bin] += next.gap;
    allBins[old.bin + 10] += old.gap;
    for (let i = 0; i < metrics.length; i++) {
      const difference = next.values[i] - old.values[i];
      block.values[i] += difference;
      totals[i] += difference;
    }
  }

  const strata = [...seasons.values()].map(season => [...season.values()]);
  const blocks = strata.reduce((sum, season) => sum + season.length, 0);
  const count = rows.length;
  const names = [...metrics, "ece"];
  const samples = names.map(() => []);
  // A deterministic seed gives pairwise comparisons the same resampled date blocks.
  let seed = 0x6f403ad1;
  function pick(length) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return Math.floor((seed >>> 0) / 4294967296 * length);
  }

  const enoughBlocks = strata.length > 0 && strata.every(season => season.length >= 2);
  for (let trial = 0; enoughBlocks && trial < replicates; trial++) {
    let n = 0;
    const values = metrics.map(() => 0);
    const bins = emptyBins();
    for (const season of strata) {
      for (let draw = 0; draw < season.length; draw++) {
        const sampled = season[pick(season.length)];
        n += sampled.n;
        for (let i = 0; i < metrics.length; i++) values[i] += sampled.values[i];
        for (let i = 0; i < bins.length; i++) bins[i] += sampled.bins[i];
      }
    }
    for (let i = 0; i < metrics.length; i++) samples[i].push(values[i] / n);
    samples[metrics.length].push(eceDifference(bins) / n);
  }
  totals.push(eceDifference(allBins));
  const tail = (1 - confidence) / 2;
  return {
    candidate, baseline, matches: count, blocks, confidence,
    metrics: Object.fromEntries(names.map((name, i) => {
      const values = samples[i].sort((a, b) => a - b);
      return [name, {
        delta: count ? totals[i] / count : null,
        interval: values.length ? [values[Math.floor(tail * (values.length - 1))],
          values[Math.ceil((1 - tail) * (values.length - 1))]] : null
      }];
    }))
  };
}

function allPairs(rows, names) {
  return names.flatMap((candidate, i) =>
    names.slice(0, i).map(baseline => pairedComparison(rows, candidate, baseline)));
}

const calibratedKey = model => `${model} / calibrated`;
function scaleRows(rows, model, temperatureByLeague) {
  return rows.map(row => {
    const temperature = temperatureByLeague.get(row.league);
    const original = row.models[model];
    const forecast = temperature == null ? original : {
      ...original, probabilities: temperatureScale(original.probabilities, temperature)
    };
    return { ...row, models: { ...row.models, [calibratedKey(model)]: forecast } };
  });
}

function calibrationExperiment(fit, validation, test, names, summarize) {
  const leagues = [...new Set(fit.map(row => row.league))].sort();
  return Object.fromEntries(names.map(model => {
    const pooled = fitTemperature(fit, model);
    const chosen = new Map();
    const choices = {};
    for (const league of leagues) {
      const train = fit.filter(row => row.league === league);
      const check = validation.filter(row => row.league === league);
      const base = summarize(check, model);
      const temperatures = { pooled, league: fitTemperature(train, model) };
      const candidates = Object.entries(temperatures).map(([kind, temperature]) => {
        const evaluated = summarize(scaleRows(check, model, new Map([[league, temperature]])), calibratedKey(model));
        return { kind, temperature, logLoss: evaluated.logLoss, brier: evaluated.multiclassBrier };
      });
      const winner = candidates.filter(x => x.logLoss < base.logLoss && x.brier <= base.multiclassBrier)
        .sort((a, b) => a.logLoss - b.logLoss)[0];
      if (winner) chosen.set(league, winner.temperature);
      choices[league] = { fitMatches: train.length, validationMatches: check.length,
        candidates, selected: winner?.kind ?? "uncalibrated" };
    }
    function beforeAfter(rows) {
      const adjusted = scaleRows(rows, model, chosen);
      const before = summarize(adjusted, model);
      const after = summarize(adjusted, calibratedKey(model));
      return {
        before, after, paired: pairedComparison(adjusted, calibratedKey(model), model),
        comparisonWithCurrentFrontend: model === "Frontend legacy" || !names.includes("Frontend legacy") ? null :
          pairedComparison(adjusted, calibratedKey(model), "Frontend legacy"),
        leagues: Object.fromEntries(leagues.map(league => {
          const group = adjusted.filter(row => row.league === league);
          return [league, { before: summarize(group, model), after: summarize(group, calibratedKey(model)) }];
        }))
      };
    }
    const validationResults = beforeAfter(validation);
    const testResults = beforeAfter(test);
    const passesTest = testResults.after.logLoss < testResults.before.logLoss
      && testResults.after.multiclassBrier <= testResults.before.multiclassBrier;
    return [model, { choices, validation: validationResults, test: testResults, passesTest }];
  }));
}

function evaluateExperiments(rows, names, { validationStart, testStart }, summarize) {
  if (parseDate(validationStart) !== validationStart || parseDate(testStart) !== testStart
      || validationStart >= testStart) throw new Error("Calibration boundaries must be ordered ISO dates");
  const fit = rows.filter(row => row.day < validationStart);
  const validation = rows.filter(row => row.day >= validationStart && row.day < testStart);
  const test = rows.filter(row => row.day >= testStart);
  if ([fit, validation, test].some(period => !period.length)) throw new Error("Calibration needs three nonempty periods");
  const researchCandidates = ["Worker v1.3", "Worker v1.4"].filter(name => names.includes(name));
  const candidateChecks = Object.fromEntries(researchCandidates.map(name => {
    // Two pre-specified comparisons against the default in each independent period.
    const a = pairedComparison(validation, name, "Worker v1.2", 0.975);
    const b = pairedComparison(test, name, "Worker v1.2", 0.975);
    return [name, { validation: a, test: b, supportedInBothPeriods: [a, b].every(x =>
      x.metrics.logLoss.interval?.[1] < 0 && x.metrics.brier.interval?.[1] < 0) }];
  }));
  const leagues = [...new Set(rows.map(row => row.league))].sort();
  const calibration = calibrationExperiment(fit, validation, test, names, summarize);
  function calibratedRows(data, model) {
    const selections = Object.entries(calibration[model].choices).flatMap(([league, choice]) => {
      const selected = choice.candidates.find(candidate => candidate.kind === choice.selected);
      return selected ? [[league, selected.temperature]] : [];
    });
    return scaleRows(data, model, new Map(selections));
  }
  const calibratedCandidateChecks = Object.fromEntries(researchCandidates.map(name => {
    const baseline = "Worker v1.2";
    const compare = data => pairedComparison(calibratedRows(calibratedRows(data, baseline), name),
      calibratedKey(name), calibratedKey(baseline), 0.975);
    return [name, { validation: compare(validation), test: compare(test) }];
  }));
  return {
    validationStart, testStart, blockDays, replicates,
    counts: { fit: fit.length, validation: validation.length, test: test.length },
    paired: { all: allPairs(rows, names), validation: allPairs(validation, names), test: allPairs(test, names),
      leagues: Object.fromEntries(leagues.map(league => [league, allPairs(rows.filter(row => row.league === league), names)])) },
    candidateChecks, calibratedCandidateChecks, calibration
  };
}

module.exports = { evaluateExperiments, fitTemperature, pairedComparison, temperatureScale };
