const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveIdentity } = require("../team-identity-registry.js");

test("verified provider ID does not override contradictory canonical-team country context", () => {
  const identities = [{
    teamId: "fixture:team-cz",
    countryCode: "CZ",
    providerIds: [{ provider: "fixture-test", providerTeamId: "id-1", verified: true }],
    names: []
  }];
  const result = resolveIdentity({
    provider: "fixture-test",
    providerTeamId: "id-1",
    countryCode: "GB"
  }, identities);
  assert.deepEqual(result, { status: "unresolved", teamId: null, reason: "no_verified_identity" });
});
