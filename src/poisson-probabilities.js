/* Dependency-free pre-match probability calculations, isolated from the application. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MAMProbability = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function validLambda(value) {
    return Number.isFinite(value) && value >= 0 && value <= 100;
  }

  function poisson(lambda, goals) {
    if (!validLambda(lambda) || !Number.isSafeInteger(goals) || goals < 0) {
      throw new RangeError("Invalid Poisson inputs");
    }
    let mass = Math.exp(-lambda);
    for (let i = 1; i <= goals && mass > 0; i++) mass *= lambda / i;
    return mass;
  }

  function distribution(lambda, tolerance = 1e-12) {
    if (!validLambda(lambda) || !Number.isFinite(tolerance) || tolerance <= 0 || tolerance >= 1) {
      throw new RangeError("Invalid distribution inputs");
    }
    if (lambda === 0) return [1];
    const values = [Math.exp(-lambda)];
    let sum = values[0];
    for (let k = 1; ; k++) {
      const mass = values[k - 1] * lambda / k;
      values.push(mass);
      sum += mass;
      const ratio = lambda / (k + 1);
      // The remaining ratios decrease, so a geometric series bounds the omitted tail.
      if (ratio < 1 && mass * ratio / (1 - ratio) <= tolerance) break;
    }
    return values.map(mass => mass / sum);
  }

  function overGoals(total, minimum) {
    if (total <= 1) {
      // Add small upper tails directly to avoid subtracting two nearly equal numbers.
      let mass = Math.exp(-total);
      for (let goals = 1; goals <= minimum; goals++) mass *= total / goals;
      let above = mass;
      for (let goals = minimum + 1; mass > 0; goals++) {
        mass *= total / goals;
        if (above + mass === above) break;
        above += mass;
      }
      return above;
    }
    let mass = Math.exp(-total);
    let below = mass;
    for (let goals = 1; goals < minimum; goals++) {
      mass *= total / goals;
      below += mass;
    }
    return 1 - below;
  }

  function markets(home, away) {
    const h = distribution(home);
    const a = distribution(away);
    let win = 0, draw = 0, loss = 0;
    const scores = [];
    for (let i = 0; i < h.length; i++) {
      for (let j = 0; j < a.length; j++) {
        const probability = h[i] * a[j];
        if (i > j) win += probability;
        else if (i === j) draw += probability;
        else loss += probability;
        scores.push({ home: i, away: j, probability });
      }
    }
    const mass = win + draw + loss;
    const total = home + away;
    scores.sort((x, y) => y.probability - x.probability || x.home - y.home || x.away - y.away);
    return {
      homeWin: win / mass,
      draw: draw / mass,
      awayWin: loss / mass,
      over15: overGoals(total, 2),
      over25: overGoals(total, 3),
      over35: overGoals(total, 4),
      btts: -Math.expm1(-home) * -Math.expm1(-away),
      topScores: scores.slice(0, 5)
    };
  }

  return Object.freeze({ poisson, distribution, markets });
});
