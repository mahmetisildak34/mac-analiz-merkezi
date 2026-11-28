const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const MAMTeamIdentity = require("../team-identity-registry.js");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const groupStart = html.indexOf("const MAM_UEFA_TEAM_GROUPS=");
const groupEnd = html.indexOf(";\nfunction mamUefaTeamMatch", groupStart) + 1;
assert.ok(groupStart >= 0 && groupEnd > groupStart, "Existing verified alias groups must be available as the seed source");
const legacyGroups = vm.runInNewContext(`${html.slice(groupStart, groupEnd)}; MAM_UEFA_TEAM_GROUPS;`);
const specialPairs = [["Plzen", "Viktoria Plzen"]];
const normalize = MAMTeamIdentity.normalizeTeamName;

function identity(teamId, canonicalName, aliases, providerTeamId, countryCode) {
  const allNames = [canonicalName, ...aliases];
  return {
    teamId,
    countryCode,
    names: allNames.map((displayName, index) => ({
      displayName,
      nameType: index === 0 ? "current" : "alternate",
      normalizedName: normalize(displayName),
      verified: true,
      validFrom: "2020-01-01T00:00:00Z",
      validTo: null,
      countryCode
    })),
    providerIds: [{
      provider: "fixture-test",
      providerTeamId,
      verified: true,
      validFrom: "2020-01-01T00:00:00Z",
      validTo: null,
      countryCode
    }]
  };
}

const controlledTeams = [
  identity("fixture:viktoria-plzen", "Viktoria Plzeň", ["Viktoria Plzen", "FC Viktoria Plzeň", "Plzen"], "plz-test-1", "CZ"),
  identity("fixture:afc-bournemouth", "AFC Bournemouth", ["Bournemouth"], "bou-test-1", "GB"),
  identity("fixture:mjallby-aif", "Mjällby AIF", ["Mjällby", "Mjallby"], "mja-test-1", "SE")
];

function newMemoryDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(root, "schema/team-identity-v1.sql"), "utf8"));
  return db;
}

function insertIdentity(db, teamId, countryCode, now = "2026-11-26T00:00:00Z") {
  db.prepare("INSERT INTO mam_team_identities(team_id,country_code,created_at,updated_at) VALUES(?,?,?,?)")
    .run(teamId, countryCode, now, now);
}

function insertName(db, { nameId, teamId, displayName, normalizedName, nameType, validFrom = "2020-01-01T00:00:00Z", validTo = null }) {
  db.prepare(`INSERT INTO mam_team_names
    (name_id,team_id,display_name,normalized_name,name_type,verified,source,valid_from,valid_to,verified_at,approved_by)
    VALUES(?,?,?,?,?,1,'controlled-test',?,?, '2026-11-26T00:00:00Z','controlled-fixture')`)
    .run(nameId, teamId, displayName, normalizedName || normalize(displayName), nameType, validFrom, validTo);
}

test("current verified alias mechanism is reused for Plzen, Bournemouth, and Mjällby", () => {
  assert.equal(MAMTeamIdentity.matchesExplicitAliases("Plzen", "Viktoria Plzeň", legacyGroups, specialPairs), true);
  assert.equal(MAMTeamIdentity.canonicalHistoryKey("Plzen", legacyGroups, normalize, specialPairs), "viktoriaplzen");
  assert.ok(MAMTeamIdentity.historySearchNames("Plzen", [], legacyGroups, specialPairs).includes("FC Viktoria Plzeň"));

  assert.equal(MAMTeamIdentity.matchesExplicitAliases("Bournemouth", "AFC Bournemouth", legacyGroups), true);
  assert.ok(MAMTeamIdentity.historySearchNames("Bournemouth", [], legacyGroups).includes("AFC Bournemouth"));

  assert.equal(MAMTeamIdentity.matchesExplicitAliases("Mjällby", "Mjallby", legacyGroups), true);
  assert.equal(MAMTeamIdentity.matchesExplicitAliases("Mjällby AIF", "Mjallby", legacyGroups), true);
});

test("provider IDs and verified old/alternate names resolve to one stable identity", () => {
  const cases = [
    { name: "Plzen", providerTeamId: "plz-test-1", expected: "fixture:viktoria-plzen" },
    { name: "AFC Bournemouth", providerTeamId: "bou-test-1", expected: "fixture:afc-bournemouth" },
    { name: "Mjallby", providerTeamId: "mja-test-1", expected: "fixture:mjallby-aif" }
  ];
  for (const entry of cases) {
    const byId = MAMTeamIdentity.resolveIdentity({ provider: "fixture-test", providerTeamId: entry.providerTeamId, name: "untrusted label" }, controlledTeams);
    assert.deepEqual(byId, { status: "matched", teamId: entry.expected, method: "verified_provider_id" });
    const byAlias = MAMTeamIdentity.resolveIdentity({ name: entry.name, countryCode: controlledTeams.find(team => team.teamId === entry.expected).countryCode }, controlledTeams);
    assert.equal(byAlias.status, "matched");
    assert.equal(byAlias.teamId, entry.expected);
    assert.equal(byAlias.method, "verified_name");
  }
  assert.equal(MAMTeamIdentity.resolveIdentity({ provider: "fixture-test", providerTeamId: "plz-test-1", countryCode: "GB" }, controlledTeams).status, "unresolved");
});

test("approved rename preserves the canonical team key, old-name history, and provider IDs", () => {
  const original = identity("fixture:afc-bournemouth", "Bournemouth", ["AFC Bournemouth"], "bou-test-1", "GB");
  const renamed = MAMTeamIdentity.applyVerifiedRename(original, {
    newName: "AFC Bournemouth FC",
    effectiveAt: "2026-07-01T00:00:00Z",
    source: "controlled-fixture",
    approvedBy: "human-review-test"
  });
  assert.equal(renamed.teamId, original.teamId);
  assert.deepEqual(renamed.providerIds, original.providerIds);
  const former = renamed.names.find(item => item.displayName === "Bournemouth");
  assert.equal(former.nameType, "former");
  assert.equal(former.validTo, "2026-07-01T00:00:00Z");
  const oldMatch = MAMTeamIdentity.resolveIdentity({ name: "Bournemouth", eventDate: "2026-03-01T12:00:00Z" }, [renamed]);
  assert.equal(oldMatch.status, "matched");
  assert.equal(oldMatch.teamId, original.teamId);
  const newMatch = MAMTeamIdentity.resolveIdentity({ name: "AFC Bournemouth FC", eventDate: "2026-08-01T12:00:00Z" }, [renamed]);
  assert.equal(newMatch.status, "matched");
  assert.equal(newMatch.teamId, original.teamId);
  assert.throws(() => MAMTeamIdentity.applyVerifiedRename(original, {
    newName: "AFC Bournemouth FC", effectiveAt: "2026-07-01T00:00:00Z", source: "controlled-fixture"
  }), /approval/);
});

test("ambiguous names and unapproved candidates are never automatically merged", () => {
  const teams = [
    identity("fixture:united-gb", "United", [], "united-gb-test", "GB"),
    identity("fixture:united-us", "United", [], "united-us-test", "US")
  ];
  const ambiguous = MAMTeamIdentity.resolveIdentity({ name: "United" }, teams);
  assert.equal(ambiguous.status, "ambiguous");
  assert.deepEqual(ambiguous.candidateTeamIds.sort(), ["fixture:united-gb", "fixture:united-us"]);
  assert.equal(MAMTeamIdentity.resolveIdentity({ name: "United", countryCode: "GB" }, teams).teamId, "fixture:united-gb");

  const pending = MAMTeamIdentity.resolveIdentity({ name: "New Mjallby Name" }, [], [
    { rawName: "New Mjällby Name", status: "pending", suggestedTeamId: "fixture:mjallby-aif" }
  ]);
  assert.deepEqual(pending, { status: "needs_review", teamId: null, reason: "unapproved_name_candidate" });
  assert.equal(MAMTeamIdentity.resolveIdentity({ name: "Mjallby FC" }, controlledTeams).status, "unresolved");
});

test("schema stores versioned names and provider IDs while keeping ambiguous aliases reviewable", () => {
  const db = newMemoryDb();
  try {
    insertIdentity(db, "fixture:team-a", "GB");
    insertIdentity(db, "fixture:team-b", "US");
    insertName(db, { nameId: "name-a-current", teamId: "fixture:team-a", displayName: "AFC Example", nameType: "current" });
    insertName(db, { nameId: "name-a-former", teamId: "fixture:team-a", displayName: "Example FC", normalizedName: "examplefc", nameType: "former", validTo: "2026-01-01T00:00:00Z" });
    insertName(db, { nameId: "name-b-current", teamId: "fixture:team-b", displayName: "Example United", nameType: "current" });
    insertName(db, { nameId: "name-a-shared", teamId: "fixture:team-a", displayName: "United", nameType: "alternate" });
    insertName(db, { nameId: "name-b-shared", teamId: "fixture:team-b", displayName: "United", nameType: "alternate" });

    db.prepare(`INSERT INTO mam_team_provider_ids
      (provider,provider_team_id,team_id,verified,source,valid_from,verified_at,approved_by)
      VALUES('fixture-test','provider-id-1','fixture:team-a',1,'controlled-test','2020-01-01T00:00:00Z','2026-11-26T00:00:00Z','controlled-fixture')`).run();
    assert.throws(() => db.prepare(`INSERT INTO mam_team_provider_ids
      (provider,provider_team_id,team_id,verified,source,valid_from,verified_at,approved_by)
      VALUES('fixture-test','provider-id-1','fixture:team-b',1,'controlled-test','2020-01-01T00:00:00Z','2026-11-26T00:00:00Z','controlled-fixture')`).run());

    db.prepare(`INSERT INTO mam_team_identity_review_queue
      (candidate_key,provider,raw_name,normalized_name,status,created_at)
      VALUES('candidate-test-1','fixture-test','United','united','pending','2026-11-26T00:00:00Z')`).run();
    const pending = db.prepare("SELECT status FROM mam_team_identity_review_queue WHERE candidate_key=?").get("candidate-test-1");
    assert.equal(pending.status, "pending");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM mam_team_names WHERE normalized_name='united'").get().n, 2,
      "cross-team name collisions must be representable for explicit ambiguity handling");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM mam_team_provider_ids").get().n, 1);
  } finally {
    db.close();
  }
});

test("shared canonical aliases repair only deterministic mojibake and preserve collision guards", () => {
  const crypto = require("node:crypto");
  const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "team-identity-registry.js"))).digest("hex");
  assert.equal(hash, "7dde8ab382d3a638ab2eb9f765ca232b09e6a0a6c5ddc6407f427235f3380d0f", "frontend and Worker registry copies must stay synchronized");
  assert.equal(MAMTeamIdentity.canonicalKey("Erzurum BB"), MAMTeamIdentity.canonicalKey("Erzurumspor"));
  assert.equal(MAMTeamIdentity.canonicalKey("Amed SFK"), MAMTeamIdentity.canonicalKey("Amedspor"));
  assert.equal(MAMTeamIdentity.canonicalKey("Leeds"), "leeds");
  assert.notEqual(MAMTeamIdentity.canonicalKey("Leeds"), MAMTeamIdentity.canonicalKey("Leeds United"));
  assert.notEqual(MAMTeamIdentity.canonicalKey("Inter Miami"), MAMTeamIdentity.canonicalKey("Internazionale"));
  assert.notEqual(MAMTeamIdentity.canonicalKey("Paris FC"), MAMTeamIdentity.canonicalKey("Paris Saint-Germain"));
  assert.equal(MAMTeamIdentity.repairMojibake("FenerbahÃ§e"), "Fenerbahçe");
  assert.equal(MAMTeamIdentity.canonicalKey("Fenerbah\uFFFD"), "");
});
