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

## Persistent data-center rollout protections

- Treat the B data layer as shadow/opt-in and analysis-only. It must never decide whether a fixture appears in Today, Live, Finished, or Upcoming lists. Missing, ambiguous, stale, or incomplete B data must leave the fixture visible and use the existing history path.
- Keep the current design, live score/minute/precise-second/statistics behavior, and Poisson v1.2 unchanged. B histories are usable only when both teams resolve unambiguously and each side has exactly ten distinct, verified, completed matches before kickoff. Never weaken the minimum-ten rule.
- B requests must bypass browser caches and have a bounded timeout of at most 2.5 seconds. An error, timeout, disabled gate, or invalid bundle must silently return to the existing application path; do not expose infrastructure status in the UI.
- Before any release, compare the legacy and B paths with real data in shadow mode. Synthetic tests and green GitHub checks are necessary but not sufficient. Report fixture coverage, duplicate/time/team-identity differences, history/statistics validity, latency, and API/D1/KV cost separately from synthetic results.
- Read-only production acceptance must not copy production rows into B, mutate D1/KV, or seed production identities. Any bounded real-data staging or transfer requires separate explicit authorization and an isolated target.
- The daily B preparation is separate from the existing five-minute Worker schedule. Its intended UTC expression is `1 21 * * *` (00:01 Europe/Istanbul); it must remain disabled until the approved release gate is opened. Never interrupt or repurpose the five-minute live/archive path.
- Production migration, data transfer, Cron activation, merge, and deploy require explicit user approval. B must fail closed when a release gate or runtime switch is absent, off, or unreadable.
