const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { prepareDataCenter, publishDataCenter, applyLiveUpdate, DATA_CENTER_CRON_UTC } = require("../match-data-center.js");
const root = path.join(__dirname, "..");
const now = "2026-11-26T21:02:00.000Z";
const identities = [
  { teamId:"team:home", countryCode:"GB", names:[{displayName:"Home FC",nameType:"current",verified:true}], providerIds:[{provider:"espn",providerTeamId:"101",verified:true}] },
  { teamId:"team:away", countryCode:"GB", names:[{displayName:"Away FC",nameType:"current",verified:true}], providerIds:[{provider:"espn",providerTeamId:"202",verified:true}] }
];
function history(teamId, oppId, prefix) {
  return Array.from({length:10},(_,i)=>({provider:"espn",providerFixtureId:`${prefix}-${i}`,kickoff:`2026-11-${String(15-i).padStart(2,"0")}T15:00:00Z`,
    homeTeamId:i%2===0?teamId:oppId,awayTeamId:i%2===0?oppId:teamId,homeScore:i%3===0?2:1,awayScore:i%3===0?0:1,
    status:"completed",verified:true,competitionId:"39",source:"test-source",
    halftime:i===0?{homeScore:1,awayScore:0,provider:"espn"}:null,
    statistics:i===0?[{name:"corners",value:7,provider:"espn",source:"verified feed",verified:true},{name:"shots",value:null,provider:"espn",verified:false}]:[]}));
}
const fixture = (overrides={}) => ({provider:"espn",providerFixtureId:"future-1",competitionId:"39",kickoff:"2026-11-27T15:00:00Z",status:"scheduled",
  home:{provider:"espn",providerTeamId:"101",name:"Home FC",countryCode:"GB"},
  away:{provider:"espn",providerTeamId:"202",name:"Away FC",countryCode:"GB"},...overrides});
function batch(opts={}) {
  return prepareDataCenter({generatedAt:now,scopeComplete:true,expectedCompetitionIds:["39"],loadedCompetitionIds:["39"],identities,fixtures:[fixture(opts.fixture)],
    historiesByTeam:{"team:home":history("team:home","team:away","home"),"team:away":history("team:away","team:home","away")},
    statisticsByFixture:{"espn:future-1":[{name:"yellow_cards",value:2,provider:"espn",source:"match stats",verified:true},{name:"corners",value:4,provider:"unverified",verified:false}]},...opts});
}
function makeDb() {
  const db = new DatabaseSync(":memory:");
  for (const file of ["team-identity-v1.sql","daily-history-v1.sql","match-data-center-v1.sql"])
    db.exec(fs.readFileSync(path.join(root,"schema",file),"utf8"));
  db.prepare("INSERT INTO mam_team_identities(team_id,country_code,created_at,updated_at) VALUES(?,?,?,?)").run("team:home","GB",now,now);
  db.prepare("INSERT INTO mam_team_identities(team_id,country_code,created_at,updated_at) VALUES(?,?,?,?)").run("team:away","GB",now,now);
  db.prepare(`INSERT INTO mam_verified_history_matches
    (provider,provider_fixture_id,team_id,opponent_team_id,kickoff,competition_id,home_team_id,away_team_id,home_score,away_score,status,verified,source,verified_at)
    VALUES('archive-A','immutable-1','team:home','team:away','2026-11-20T15:00:00Z','39','team:home','team:away',1,0,'completed',1,'archive-A','2026-11-20T18:00:00Z')`).run();
  let failNext=false;
  const adapter={
    loadActiveItems(){const active=db.prepare("SELECT generation_id FROM mam_b_active_generation WHERE singleton=1").get();if(!active)return {generationId:null,items:[]};
      return {generationId:active.generation_id,items:db.prepare(`SELECT i.item_key AS key,i.item_kind AS kind,i.readiness,p.payload_hash AS hash,p.payload_json FROM mam_b_generation_items i JOIN mam_b_payloads p USING(payload_hash) WHERE i.generation_id=?`).all(active.generation_id).map(row=>({...row,payload:JSON.parse(row.payload_json)}))};},
    atomicCommit({generationId,manifest,items}){db.exec("BEGIN IMMEDIATE");try{
      db.prepare("INSERT INTO mam_b_generations(generation_id,created_at,status,manifest_json) VALUES(?,?,'staging',?)").run(generationId,now,JSON.stringify(manifest));
      const payload=db.prepare("INSERT OR IGNORE INTO mam_b_payloads(payload_hash,payload_json,created_at) VALUES(?,?,?)");
      const item=db.prepare("INSERT INTO mam_b_generation_items(generation_id,item_key,item_kind,readiness,payload_hash) VALUES(?,?,?,'analysis_ready',?)");
      for(const row of items){payload.run(row.hash,JSON.stringify(row.payload),now);item.run(generationId,row.key,row.kind,row.hash);}
      if(failNext){failNext=false;throw Error("injected commit failure");}
      db.prepare("UPDATE mam_b_generations SET status='retired' WHERE status='active'").run();
      db.prepare("UPDATE mam_b_generations SET status='active' WHERE generation_id=?").run(generationId);
      db.prepare(`INSERT INTO mam_b_active_generation(singleton,generation_id,updated_at) VALUES(1,?,?)
        ON CONFLICT(singleton) DO UPDATE SET generation_id=excluded.generation_id,updated_at=excluded.updated_at`).run(generationId,now);
      db.exec("COMMIT");
    }catch(e){db.exec("ROLLBACK");throw e;}},
    applyLiveOverlay(update){const fixtureKey=`fixture:${update.fixtureKey}`;const active=db.prepare("SELECT generation_id FROM mam_b_active_generation WHERE singleton=1").get();
      if(!active||!db.prepare("SELECT 1 FROM mam_b_generation_items WHERE generation_id=? AND item_key=? AND item_kind='fixture'").get(active.generation_id,fixtureKey))return {accepted:false,reason:"fixture_not_active"};
      const result=db.prepare(`INSERT INTO mam_b_live_overlay(fixture_key,provider,status,observed_at,home_score,away_score,minute_label,elapsed_seconds,clock_precise,statistics_json)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fixture_key) DO UPDATE SET provider=excluded.provider,status=excluded.status,observed_at=excluded.observed_at,
      home_score=excluded.home_score,away_score=excluded.away_score,minute_label=excluded.minute_label,elapsed_seconds=excluded.elapsed_seconds,
      clock_precise=excluded.clock_precise,statistics_json=excluded.statistics_json WHERE excluded.observed_at>mam_b_live_overlay.observed_at`)
      .run(update.fixtureKey,update.provider,update.status,update.observedAt,update.homeScore,update.awayScore,update.minuteLabel,update.elapsedSeconds,
        Number(update.clockPrecise),JSON.stringify(update.statistics));return {accepted:Number(result.changes)>0,reason:"stale_update"};},
    readFixture(key){const active=db.prepare("SELECT generation_id FROM mam_b_active_generation WHERE singleton=1").get();if(!active)return null;
      const row=db.prepare(`SELECT p.payload_json FROM mam_b_generation_items i JOIN mam_b_payloads p USING(payload_hash) WHERE i.generation_id=? AND i.item_key=?`).get(active.generation_id,`fixture:${key}`);
      const live=db.prepare("SELECT * FROM mam_b_live_overlay WHERE fixture_key=?").get(key);return {base:row?JSON.parse(row.payload_json):null,live};},
    failNext(){failNext=true;}, db
  };return adapter;
}

test("B preparation resolves identities, uses exactly ten verified pre-kickoff histories, and retains only verified stats",()=>{
  const b=batch();assert.equal(b.readyFixtures,1);assert.equal(b.readyTeams,2);assert.equal(b.records.length,3);assert.equal(b.minimumHistory,10);
  const home=b.records.find(r=>r.key.startsWith("team-analysis:team:home"));
  assert.equal(home.payload.historyCount,10);assert.equal(home.payload.home.played+home.payload.away.played,10);
  assert.equal(home.payload.history[0].halftime.provider,"espn");assert.deepEqual(home.payload.history[0].statistics.map(s=>s.name),["corners"]);
  const match=b.records.find(r=>r.kind==="fixture");assert.deepEqual(match.payload.statistics.map(s=>s.name),["yellow_cards"]);
  assert.equal(DATA_CENTER_CRON_UTC,"2 21 * * *");
});
test("under-ten or unresolved fixtures are quarantined and never become app-consumable B items",()=>{
  assert.throws(()=>prepareDataCenter({scopeComplete:true,expectedCompetitionIds:["39","2"],loadedCompetitionIds:["39"],identities,fixtures:[]}),/Every supported competition/);
  const nine=history("team:home","team:away","home").slice(0,9);
  const b=batch({historiesByTeam:{"team:home":nine,"team:away":history("team:away","team:home","away")}});
  assert.equal(b.readyFixtures,0);assert.equal(b.records.length,0);assert.ok(b.quarantined.some(x=>x.reason==="home_history_below_10"));
  const ambiguous=batch({identities:[{...identities[0],providerIds:[]},identities[1],{teamId:"team:third",countryCode:"GB",names:[{displayName:"Home FC",nameType:"current",verified:true}],providerIds:[]}]});
  assert.equal(ambiguous.readyFixtures,0);assert.ok(ambiguous.quarantined.some(x=>x.reason.startsWith("home_identity_")));
});
test("cross-provider copies count once and disagreeing scores make the fixture unready",()=>{
  const home=history("team:home","team:away","home"),away=history("team:away","team:home","away");
  const same={...home[0],provider:"second-source",providerFixtureId:"duplicate-cross-source"};
  const duplicated=prepareDataCenter({generatedAt:now,scopeComplete:true,expectedCompetitionIds:["39"],loadedCompetitionIds:["39"],identities,fixtures:[fixture()],
    historiesByTeam:{"team:home":[...home,same],"team:away":away}});
  assert.equal(duplicated.readyFixtures,1);assert.equal(duplicated.records.find(r=>r.key==="team-analysis:team:home:2026-11-27").payload.historyCount,10);
  const conflict={...same,homeScore:same.homeScore+1};
  const conflicted=prepareDataCenter({generatedAt:now,scopeComplete:true,expectedCompetitionIds:["39"],loadedCompetitionIds:["39"],identities,fixtures:[fixture()],
    historiesByTeam:{"team:home":[...home,conflict],"team:away":away}});
  assert.equal(conflicted.readyFixtures,0);assert.ok(conflicted.quarantined.some(x=>x.reason==="home_history_conflict"));
});
test("B generation publish is atomic, content-addressed, diff-aware and leaves A unchanged",async()=>{
  const a=makeDb();try{const original=a.db.prepare("SELECT * FROM mam_verified_history_matches WHERE provider_fixture_id='immutable-1'").get();
    const first=await publishDataCenter(a,batch());assert.equal(first.changes.inserted,3);assert.equal(first.changes.updated,0);
    const repeat=await publishDataCenter(a,batch());assert.equal(repeat.noOp,true);assert.equal(repeat.changes.unchanged,3);
    const changed=await publishDataCenter(a,batch({fixture:fixture({status:"live",homeScore:1,awayScore:0,scoreVerified:true,scoreSource:"verified feed"})}));
    assert.equal(changed.changes.updated,1);assert.equal(changed.changes.unchanged,2);
    const after=a.db.prepare("SELECT * FROM mam_verified_history_matches WHERE provider_fixture_id='immutable-1'").get();assert.deepEqual(after,original);
    assert.equal(a.db.prepare("SELECT COUNT(*) AS n FROM mam_b_payloads").get().n,4,"unchanged content is stored once by hash");
  }finally{a.db.close();}
});
test("failed candidate commit rolls back staging and preserves the last active generation",async()=>{
  const a=makeDb();try{const first=await publishDataCenter(a,batch());const prior=a.db.prepare("SELECT generation_id FROM mam_b_active_generation WHERE singleton=1").get().generation_id;
    a.failNext();const modified=batch({fixture:fixture({home:{provider:"espn",providerTeamId:"101",name:"Home FC",countryCode:"GB"},status:"completed",homeScore:3,awayScore:1,scoreVerified:true})});
    await assert.rejects(publishDataCenter(a,modified),/injected commit failure/);
    assert.equal(a.db.prepare("SELECT generation_id FROM mam_b_active_generation WHERE singleton=1").get().generation_id,prior);
    assert.equal(a.db.prepare("SELECT COUNT(*) AS n FROM mam_b_generations").get().n,1);
    assert.equal(a.db.prepare("SELECT COUNT(*) AS n FROM mam_b_generation_items WHERE generation_id=?").get(prior).n,3);assert.equal(first.generationId,prior);
  }finally{a.db.close();}
});
test("a quarantined incomplete fixture retains its last verified B bundle instead of deleting it",async()=>{
  const a=makeDb();try{const first=await publishDataCenter(a,batch());
    const short=batch({historiesByTeam:{"team:home":history("team:home","team:away","home").slice(0,9),"team:away":history("team:away","team:home","away")}});
    const update=await publishDataCenter(a,short);assert.equal(update.noOp,true);assert.equal(update.preservedPrevious,1);
    assert.equal(update.generationId,first.generationId);assert.equal(a.db.prepare("SELECT COUNT(*) AS n FROM mam_b_generation_items WHERE generation_id=? AND item_kind='fixture'").get(first.generationId).n,1);
    assert.equal(a.readFixture("espn:future-1").base.status,"scheduled");
  }finally{a.db.close();}
});
test("live overlay accepts only verified, ordered values and never invents seconds or removes the base B snapshot",async()=>{
  const a=makeDb();try{await publishDataCenter(a,batch());
    const accepted=await applyLiveUpdate(a,{fixtureKey:"espn:future-1",provider:"espn",providerVerified:true,status:"live",observedAt:"2026-11-27T15:30:00Z",homeScore:1,awayScore:0,minuteLabel:"30",clockPrecise:false,elapsedSeconds:1800,statistics:[{name:"shots",value:5,provider:"espn",verified:true}]});
    assert.equal(accepted.accepted,true);assert.equal(accepted.normalized.elapsedSeconds,null);assert.equal(accepted.normalized.clockPrecise,false);
    const stale=await applyLiveUpdate(a,{fixtureKey:"espn:future-1",provider:"espn",providerVerified:true,status:"live",observedAt:"2026-11-27T15:29:00Z",homeScore:0,awayScore:0});assert.equal(stale.accepted,false);
    const unverified=await applyLiveUpdate(a,{fixtureKey:"espn:future-1",provider:"espn",providerVerified:false,status:"live",observedAt:"2026-11-27T15:31:00Z",homeScore:2,awayScore:0});assert.equal(unverified.accepted,false);
    const current=a.readFixture("espn:future-1");assert.equal(current.base.status,"scheduled");assert.equal(current.live.home_score,1);assert.equal(current.live.elapsed_seconds,null);
  }finally{a.db.close();}
});
