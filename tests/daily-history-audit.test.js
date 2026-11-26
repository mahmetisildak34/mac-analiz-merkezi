const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { runDailyHistoryAudit } = require("../daily-history-audit.js");
const base = path.join(__dirname, "..");
const schema = fs.readFileSync(path.join(base, "schema/team-identity-v1.sql"), "utf8") +
  fs.readFileSync(path.join(base, "schema/daily-history-v1.sql"), "utf8");
const db = () => { const d = new DatabaseSync(":memory:"); d.exec(schema);
  for (const team of teams) d.prepare("INSERT INTO mam_team_identities(team_id,country_code,created_at,updated_at) VALUES(?,?,?,?)").run(team.teamId,"GB",now,now);
  return d; };
const now = "2026-11-26T00:01:00Z";
const teams = [
  { teamId: "t:enough", countryCode: "GB", names: [{displayName:"Enough FC",nameType:"current",verified:true}], providerIds:[{provider:"espn",providerTeamId:"101",verified:true}] },
  { teamId: "t:short", countryCode: "GB", names: [{displayName:"Short FC",nameType:"current",verified:true}], providerIds:[{provider:"espn",providerTeamId:"102",verified:true}] },
  { teamId: "t:other", countryCode: "GB", names: [{displayName:"Other FC",nameType:"current",verified:true}], providerIds:[{provider:"espn",providerTeamId:"103",verified:true}] }
];
function record(teamId, opponent, id, kickoff, homeScore=1, awayScore=0) {
  return { provider:"espn", providerFixtureId:id, kickoff, homeTeamId:teamId, awayTeamId:opponent, homeScore, awayScore,
    competitionId:"39", status:"completed", verified:true, source:"ESPN schedule API" };
}
function fixture(id, home, away, date="2026-11-27T15:00:00Z") {
  return { provider:"espn", providerFixtureId:id, kickoff:date,
    home:{provider:"espn",providerTeamId:home.providerIds[0].providerTeamId,name:home.names[0].displayName,countryCode:"GB"},
    away:{provider:"espn",providerTeamId:away.providerIds[0].providerTeamId,name:away.names[0].displayName,countryCode:"GB"} };
}
function adapters(database, counters={}) {
  counters.queries=0; counters.insertCalls=0; counters.writes=0;
  const keyExists=database.prepare("SELECT 1 FROM mam_verified_history_matches WHERE provider=? AND provider_fixture_id=? AND team_id=?");
  return {
    listSupportedLeagues: async()=>[{id:"39",slug:"eng.1"},{id:"2",slug:"uefa.champions"}],
    listFixtures: async l => l.id==="39" ? [fixture("future-a",teams[0],teams[1]),fixture("future-a",teams[0],teams[1])] : [fixture("future-b",teams[1],teams[2])],
    loadIdentities: async()=>teams,
    loadVerifiedHistory: async id => id==="t:enough" ? Array.from({length:10},(_,i)=>record(id,"opponent",`old-${i}`,`2026-10-${String(i+1).padStart(2,"0")}T12:00:00Z`)) : [],
    loadExistingKeys: async id => database.prepare("SELECT provider,provider_fixture_id FROM mam_verified_history_matches WHERE team_id=?").all(id).map(x=>`${x.provider}:${x.provider_fixture_id}`),
    fetchTeamHistory: async ({teamId}) => { counters.queries++;
      if(teamId!=="t:short") return [];
      return Array.from({length:10},(_,i)=>record("t:short","t:other",`hist-${i}`,`2026-10-${String(i+1).padStart(2,"0")}T12:00:00Z`))
        .concat([record("t:short","t:other","hist-0","2026-10-01T12:00:00Z",2,0),record("t:short","t:other","future","2026-11-27T16:00:00Z")]); },
    appendVerifiedMatches: async (id, rows) => { counters.insertCalls++; let n=0;
      const insert=database.prepare(`INSERT OR IGNORE INTO mam_verified_history_matches
       (provider,provider_fixture_id,team_id,opponent_team_id,kickoff,competition_id,home_team_id,away_team_id,home_score,away_score,status,verified,source,verified_at)
       VALUES(?,?,?,?,?,?,?,?,?,?, 'completed',1,?,?)`);
      for(const r of rows){const result=insert.run(r.provider,r.providerFixtureId,r.subjectTeamId,r.awayTeamId,r.kickoff,r.competitionId,r.homeTeamId,r.awayTeamId,r.homeScore,r.awayScore,r.source,now); n+=Number(result.changes);}
      counters.writes+=n; return n; }
  };
}
test("dry-run checks every supported league, honors 10 verified games and performs no writes", async()=>{
  const database=db(); try { const c={}; const a=adapters(database,c);
    const report=await runDailyHistoryAudit(a,{now,dryRun:true,threshold:1});
    assert.equal(report.leaguesChecked,2); assert.equal(report.fixturesChecked,2);
    assert.equal(report.teamsChecked,3); assert.equal(report.sufficientTeams.length,1);
    assert.equal(report.sufficientTeams[0].verifiedHistory,10); assert.equal(c.queries,2);
    assert.equal(report.newlyInsertable,9); assert.equal(report.conflicts.length,1); assert.equal(report.inserted,0); assert.equal(c.writes,0);
  } finally { database.close(); }
});
test("write pass inserts only unique verified completed matches and rerun is idempotent", async()=>{
  const database=db(); try { const c={}; const a=adapters(database,c);
    const first=await runDailyHistoryAudit(a,{now,dryRun:false});
    assert.equal(first.inserted,9); assert.equal(c.writes,9); assert.equal(first.conflicts.length,1);
    const second=await runDailyHistoryAudit(a,{now,dryRun:false});
    assert.equal(second.inserted,0); assert.equal(second.newlyInsertable,0);
    assert.equal(database.prepare("SELECT COUNT(*) AS n FROM mam_verified_history_matches").get().n,9);
  } finally { database.close(); }
});
test("failed provider history lookup retries only to configured cap and reports the unresolved team", async()=>{
  const a={listSupportedLeagues:async()=>[{id:"39"}],loadIdentities:async()=>[teams[1],teams[2]],
    listFixtures:async()=>[fixture("f",teams[1],teams[2])],loadVerifiedHistory:async()=>[],loadExistingKeys:async()=>[],
    fetchTeamHistory:async()=>{a.calls++;throw Error("upstream 503");},calls:0};
  const report=await runDailyHistoryAudit(a,{now,dryRun:true,maxAttempts:2});
  assert.equal(a.calls,4); assert.equal(report.retryFailures.filter(x=>x.attempts===2).length,2);
});
