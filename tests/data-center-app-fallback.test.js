const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const test = require("node:test");

const html = fs.readFileSync(require.resolve("../index.html"), "utf8");
const source = html.match(/async function mamLoadAnalysisHistories\([\s\S]*?\n\}/)?.[0];
assert.ok(source, "the app's history selector should remain testable");
function run(clientResult, provider = "espn", providerFixtureId = "fixture-1") {
  const legacyCalls = [];
  const apiCalls = [];
  const button = { dataset: { provider, id: "fixture-1", providerFixtureId, kickoff: "2026-11-27T15:00:00Z", homeName: "Home", awayName: "Away", league: "39" } };
  const window = { MAMDataCenterClient: { loadPreparedAnalysis: async (fetchBundle, request) => {
    const response = await fetchBundle({ provider: request.provider, fixtureId: request.fixtureId });
    apiCalls.push(response);
    return clientResult;
  } } };
  const mamLoadAnalysisHistories = vm.runInNewContext(`${source}; mamLoadAnalysisHistories`, {
    window,
    api: async path => { apiCalls.push(path); return { fixture: null }; },
    qs: values => new URLSearchParams(values).toString(),
    getTeamFixtures: async (...args) => { legacyCalls.push(args); return [{ legacy: true }]; }
  });
  return { call: () => mamLoadAnalysisHistories(button, 101, 202, "2026-11-27"), legacyCalls, apiCalls };
}

test("validated B histories are selected before legacy history requests", async () => {
  const prepared = { homeHistory: [{ prepared: "home" }], awayHistory: [{ prepared: "away" }] };
  const result = run(prepared);
  assert.deepEqual(JSON.parse(JSON.stringify(await result.call())), [prepared.homeHistory, prepared.awayHistory]);
  assert.equal(result.legacyCalls.length, 0);
  assert.match(result.apiCalls[0], /^data-center\/fixture-bundle\?/);
});

test("match-level ESPN provider and decorated event IDs map to the prepared-bundle request", async () => {
  const helper = html.match(/function mamPreparedAnalysisIdentity\(match\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(helper, "the shared fixture identity mapper should be present");
  const mamPreparedAnalysisIdentity = vm.runInNewContext(`${helper}; mamPreparedAnalysisIdentity`);
  const identity = mamPreparedAnalysisIdentity({ mamSource: "espn", fixture: { id: "espn-uefa.champions-401915290" } });
  assert.deepEqual(JSON.parse(JSON.stringify(identity)), { provider: "espn", fixtureId: "401915290" });
  const prepared = { homeHistory: [{ prepared: "home" }], awayHistory: [{ prepared: "away" }] };
  const result = run(prepared, identity.provider, identity.fixtureId);
  await result.call();
  assert.match(result.apiCalls[0], /provider=espn&fixtureId=401915290/);
  assert.ok(html.includes('mamPreparedAnalysisIdentity(m)?.provider||""'));
  assert.ok(html.includes('mamPreparedAnalysisIdentity(m)?.fixtureId||""'));
});

test("missing, malformed, or unready B data silently uses the existing history path", async () => {
  const result = run(null);
  const histories = await result.call();
  assert.deepEqual(JSON.parse(JSON.stringify(histories)), [[{ legacy: true }], [{ legacy: true }]]);
  assert.equal(result.legacyCalls.length, 2);
});

test("a card without a trustworthy provider identifier does not query B", async () => {
  const result = run({ homeHistory: [], awayHistory: [] }, "");
  assert.deepEqual(JSON.parse(JSON.stringify(await result.call())), [[{ legacy: true }], [{ legacy: true }]]);
  assert.equal(result.apiCalls.length, 0);
  assert.equal(result.legacyCalls.length, 2);
});

test("B kill-switch reads bypass stale browser cache and propagate abort signals", () => {
  assert.ok(html.includes("const isDataCenterB=cleanPath.startsWith(\"data-center/fixture-bundle\");"));
  assert.ok(html.includes("if(!isDiagnostic&&!isDataCenterB&&cachedEntry?.time"));
  assert.ok(html.includes("!isLineupRequest&&!isArchiveBackfill&&!isDataCenterB"));
  assert.ok(html.includes("cache:isEspnLiveScoreboard||isDataCenterB?\"no-store\":\"default\""));
  assert.ok(html.includes("({provider,fixtureId,signal})=>"));
  assert.ok(html.includes("api(\"data-center/fixture-bundle?\"+qs({provider,fixtureId}),{signal})"));
});
