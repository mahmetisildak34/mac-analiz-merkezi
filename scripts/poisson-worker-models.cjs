// Load the Worker predictors from a separate read-only checkout, with no Worker runtime.
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const revisions = new Set([
  "ee555aacb45f0ba80dda4c541c6cac352fcf0534",
  "11b33639352b58be6892ed04d87e4a9eea9bdc2e"
]);
const names = ["Worker v1.2", "Worker v1.3", "Worker v1.4"];

async function loadWorkerModels(checkout) {
  const revision = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (!revisions.has(revision) ||
      execFileSync("git", ["-C", checkout, "status", "--porcelain", "--untracked-files=no"], { encoding: "utf8" }).trim()) {
    throw new Error(`Use a clean Worker checkout at one of: ${[...revisions].join(", ")}`);
  }
  const file = path => pathToFileURL(resolve(checkout, path)).href;
  const { predictTrustedGoals } = await import(file("trusted-goal-poisson.js"));
  const { estimateRates, fitRho, scoreGrid, exactScoreProbability } = await import(file("research/poisson-v14.mjs"));

  function createLeague(testStart, { detailed = false } = {}) {
    const history = [];
    const training = [];
    let rho;
    let sumHome = 0, sumAway = 0;

    function predict(target) {
      const rates = estimateRates(history, target);
      if (target.kickoff < testStart) return { rates };
      if (rho === undefined) rho = fitRho(training, testStart);
      if (!detailed && (!rates || rho === null)) return { models: null };
      const models = {};
      const args = {
        ...target, as_of: target.kickoff, max_goals: 20,
        league_average_home_goals: sumHome / history.length,
        league_average_away_goals: sumAway / history.length
      };
      for (const version of ["1.2", "1.3"]) {
        const model = predictTrustedGoals(history, { ...args, model_version: version });
        if (!model.available) {
          if (detailed) continue;
          return { models: null };
        }
        const p = model.probabilities;
        models[`Worker v${version}`] = {
          probabilities: [p.home_win, p.draw, p.away_win],
          over25: p.over_2_5, btts: p.btts_yes,
          scores: model.most_likely_scores.map(({ home, away, probability }) =>
            detailed ? [home, away, probability] : [home, away]),
          ...(detailed && { rates: [model.lambda_home, model.lambda_away],
            venueMatches: [model.home_samples, model.away_samples] })
        };
      }

      if (!rates || rho === null) return { models };
      const p = scoreGrid(rates.home, rates.away, rho);
      // The rate bounds keep the mode at or below 20. Add room for the other top scores.
      const scores = [];
      for (let home = 0; home <= Math.ceil(rates.home) + 5; home++) {
        for (let away = 0; away <= Math.ceil(rates.away) + 5; away++) {
          scores.push({ home, away, p: exactScoreProbability(rates.home, rates.away, rho, home, away) });
        }
      }
      scores.sort((a, b) => b.p - a.p || a.home - b.home || a.away - b.away);
      models["Worker v1.4"] = {
        probabilities: [p.home, p.draw, p.away], over25: p.over25, btts: p.btts,
        scores: scores.slice(0, 5).map(({ home, away, p }) => detailed ? [home, away, p] : [home, away]),
        ...(detailed && { rates: [rates.home, rates.away], venueMatches: [rates.homeSample, rates.awaySample], rho })
      };
      return { models };
    }

    function observe(target, match, forecast) {
      sumHome += match.hg;
      sumAway += match.ag;
      history.push({
        ...target, fixture_id: match.id, home_goals: match.hg, away_goals: match.ag,
        source: "football-data.co.uk", identity_verified: true, score_verified: true,
        status: "FT", completed: true
      });
      if (forecast.rates) {
        training.push({
          ...forecast.rates, kickoff: target.kickoff, fixtureId: match.id,
          homeGoals: match.hg, awayGoals: match.ag
        });
      }
    }
    return { predict, observe, fittedRho: () => rho ?? null };
  }
  return { createLeague, revision, names };
}

module.exports = { loadWorkerModels };
