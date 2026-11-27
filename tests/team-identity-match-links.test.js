const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const normalize = require("../team-identity-registry.js").normalizeTeamName;

const schema = fs.readFileSync(path.join(__dirname, "../schema/team-identity-v1.sql"), "utf8");

test("historical fixture links remain attached to stable team IDs after a verified name change", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(schema);
    db.prepare(`INSERT INTO mam_team_identities(team_id,country_code,created_at,updated_at)
      VALUES('fixture:club-1','GB','2020-01-01T00:00:00Z','2026-11-26T00:00:00Z')`).run();
    db.prepare(`INSERT INTO mam_team_names
      (name_id,team_id,display_name,normalized_name,name_type,source,valid_from,verified_at,approved_by)
      VALUES('current-before','fixture:club-1','Old Club Name',?,'current','controlled-test','2020-01-01T00:00:00Z','2020-01-01T00:00:00Z','controlled-fixture')`)
      .run(normalize("Old Club Name"));
    db.prepare(`INSERT INTO mam_team_match_links
      (provider,provider_fixture_id,side,match_date,team_id,provider_team_id,raw_team_name,verified_at,verification_source,approved_by)
      VALUES('fixture-test','match-test-1','home','2025-10-01T18:00:00Z','fixture:club-1','team-test-1','Old Club Name','2025-10-01T22:00:00Z','controlled-test','controlled-fixture')`).run();

    db.prepare(`UPDATE mam_team_names SET name_type='former',valid_to='2026-07-01T00:00:00Z'
      WHERE name_id='current-before'`).run();
    db.prepare(`INSERT INTO mam_team_names
      (name_id,team_id,display_name,normalized_name,name_type,source,valid_from,verified_at,approved_by)
      VALUES('current-after','fixture:club-1','New Club Name',?,'current','controlled-test','2026-07-01T00:00:00Z','2026-07-01T00:00:00Z','human-review-test')`)
      .run(normalize("New Club Name"));

    const link = db.prepare(`SELECT team_id,raw_team_name,match_date FROM mam_team_match_links
      WHERE provider='fixture-test' AND provider_fixture_id='match-test-1' AND side='home'`).get();
    assert.deepEqual({ ...link }, {
      team_id: "fixture:club-1",
      raw_team_name: "Old Club Name",
      match_date: "2025-10-01T18:00:00Z"
    });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM mam_team_names WHERE team_id='fixture:club-1'").get().n, 2);
  } finally {
    db.close();
  }
});
