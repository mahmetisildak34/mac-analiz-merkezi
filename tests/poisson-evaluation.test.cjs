const assert = require("node:assert/strict");
const test = require("node:test");
const { summarize } = require("../scripts/backtest-poisson.cjs");
const { temperatureScale, fitTemperature, pairedComparison, evaluateExperiments } =
  require("../scripts/poisson-evaluation.cjs");

const forecast = probabilities => ({ probabilities, scores: [[1, 0]], over25: 0.2, btts: 0.2 });
function row(day, hg, ag, league = "E0") {
  return { season: Number(day.slice(0, 4)), day, league, match: { hg, ag },
    models: { model: forecast([0.8, 0.15, 0.05]), other: forecast([0.4, 0.3, 0.3]) } };
}
function cohort(year) {
  return ["01", "02", "03"].flatMap(month => [
    row(`${year}-${month}-01`, 1, 0), row(`${year}-${month}-02`, 0, 0),
    row(`${year}-${month}-03`, 1, 0), row(`${year}-${month}-04`, 0, 1)
  ]);
}

test("temperature scaling preserves ranks and normalized finite probabilities", () => {
  const softened = temperatureScale([0.8, 0.15, 0.05], 2);
  assert.ok(softened[0] < 0.8 && softened[0] > softened[1] && softened[1] > softened[2]);
  assert.ok(Math.abs(softened.reduce((sum, value) => sum + value, 0) - 1) < 1e-14);
  assert.deepEqual(temperatureScale([1, 0, 0], Number.MIN_VALUE), [1, 0, 0]);
  for (const value of [0, NaN, -1, Infinity]) assert.throws(() => temperatureScale([1, 0, 0], value), RangeError);
  assert.throws(() => temperatureScale([0, 0, 0], 1), RangeError);
  assert.ok(fitTemperature(cohort(2023), "model") > 1.5);
});

test("paired bootstrap preserves calendar blocks, direction, and identical model scores", () => {
  const rows = cohort(2024);
  const same = pairedComparison(rows, "model", "model");
  assert.ok(same.blocks >= 2);
  for (const metric of Object.values(same.metrics)) assert.deepEqual(metric, { delta: 0, interval: [0, 0] });
  const comparison = pairedComparison(rows, "other", "model");
  assert.deepEqual(comparison, pairedComparison(rows, "other", "model"));
  assert.ok(comparison.metrics.logLoss.interval[1] < 0);
  assert.ok(comparison.metrics.brier.interval[1] < 0);
  assert.equal(pairedComparison(rows.slice(0, 2), "other", "model").metrics.logLoss.interval, null);
});

test("the last period cannot influence fitted temperatures or validation choices", () => {
  const rows = [...cohort(2023), ...cohort(2024), ...cohort(2025)];
  const options = { validationStart: "2024-01-01", testStart: "2025-01-01" };
  const run = data => evaluateExperiments(data, ["model"], options, summarize).calibration.model;
  const original = run(rows);
  const changed = run(rows.map(x => x.day >= options.testStart ? { ...x, match: { hg: 4, ag: 0 } } : x));
  assert.deepEqual(changed.choices, original.choices);
  assert.deepEqual(changed.validation, original.validation);
  assert.equal(original.passesTest, true);
  assert.equal(changed.passesTest, false);
  assert.equal(original.test.after.byOutcomeEce.length, 3);
  assert.throws(() => evaluateExperiments(rows, ["model"], {
    ...options, testStart: options.validationStart
  }, summarize), /ordered/);
});
