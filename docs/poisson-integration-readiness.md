# Poisson integration readiness (isolated frontend branch)

Node.js 22.16.0: 6/6 isolated tests passed locally; both JavaScript files passed `node --check`.

## Existing frontend behavior
`index.html` already implements `poisson`, `overProb`, `topScores`, 1X2, over 1.5/2.5/3.5 and BTTS. Its 1X2 loop sums scores only from 0 to 10 for each side. Preserve these features and the approved premium dark/red UI.

## Deterministic 1X2 comparison

| Home/away lambda | Existing 1X2 sum | New normalized 1X2 sum |
|---|---:|---:|
| 1.3 / 1.1 | 0.999999837 | 1.000000000 |
| 2.0 / 1.5 | 0.999991140 | 1.000000000 |
| 5.0 / 4.0 | 0.983503857 | 1.000000000 |
| 12.0 / 8.0 | 0.283299549 | 1.000000000 |

Large-lambda cases are numerical stress tests, not realistic football predictions. Normalization improves mathematical consistency but does not establish predictive accuracy.

## Integration gates
1. Keep the new module isolated and unloaded in production.
2. Compare existing and new 1X2 on representative pre-match fixtures; verify lambda units and missing-data handling.
3. Extend compatibility tests to over 1.5/2.5/3.5, BTTS, top scores, match cards and completed matches.
4. Backtest with held-out results and pre-match-only inputs; measure calibration and log loss before changing defaults.
5. Verify GitHub Actions and Chromium/WebKit mobile regression tests before any integration approval.

Worker, D1 and production are out of scope. Do not merge PRs.
