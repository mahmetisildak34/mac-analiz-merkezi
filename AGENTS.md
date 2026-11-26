# Repository Agent Instructions

These rules apply to every human or AI agent working in this repository, including future sessions and external coding tools.

## Stable production baseline

- The released baseline is commit `57ddf062c3e3ff0f8c2d9afec0cb423030b4cf17`, recorded by the annotated tag `stable-2026-11-26-pr95`.
- Treat that tag as an immutable reference: do not move, delete, or force-update it. Compare future changes against this baseline when diagnosing regressions.
- Preserve the already-working live match list and match-detail behavior. Do not make unrelated changes to working features as part of a narrowly scoped fix.

## Protected live-match behavior and regression tests

The following are production-critical and must remain covered by automated regression tests:

1. Live scores and score changes reflect provider data correctly.
2. The live list displays the provider's reliable match minute and preserves stoppage-time labels such as `90+6`.
3. Match details display a continuously advancing seconds counter only when precise provider seconds are available. A minute-only provider value is not precise seconds.
4. Missing or untrustworthy provider time remains unknown; never infer a live minute from kickoff time or present an estimate as confirmed data.
5. SportScore match details and its HTTP 404/error handling continue to work.
6. Live statistics remain provider-verified, and live analysis continues to use valid statistics without treating missing or stale values as facts.

Keep and maintain the relevant existing regression coverage, especially in `tests/live-source-status.test.js`, `tests/product-mobile-browser.test.mjs`, and `tests/real-espn-browser.test.mjs`, plus their CI workflows. Do not weaken assertions, remove tests, skip failing tests, or alter fixtures merely to obtain a green result. If a regression appears, fix the underlying behavior and add a focused regression test when coverage is genuinely missing. Do not add redundant tests when existing assertions already protect the behavior.

## Change, merge, and release gate

- Make changes on a topic branch and use a pull request; do not push directly to `main` or bypass its protection.
- Preserve the existing strict `main` protection and all six required checks: `details-node`, `integrity`, `browser-acceptance`, `premium-mobile`, `syntax`, and `details-browser-regression`.
- Do not merge or publish while any required check is failing, pending, cancelled, or missing. All six must pass for the exact proposed commit. Fix a failed check rather than weakening it.
- Do not merge or deploy a change unless the user or an explicitly authorized release workflow approves that action. GitHub Pages is sourced from `main`; account for its deployment when considering a merge.
- Before release, confirm the intended commit is on `main`, the required checks passed, and the resulting Pages build completed successfully.

## Scope and safety

Do not modify the Worker, D1, Poisson v1.2, or production security controls as part of live-match work. Do not reduce security protections. Such work requires a separate explicit request and narrowly scoped review.
