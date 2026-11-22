"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const vm=require("node:vm");
const fs=require("node:fs");
const path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");

test("live screen accepts supported provider live states",()=>{
 const canonical=html.slice(html.indexOf("function mamCanonicalMatchStatus("),html.indexOf("function mamIstanbulDay("));
 const active=html.match(/^function mamIsActiveMatch\(.*$/m)[0];
 const check=vm.runInNewContext(canonical+active+";mamIsActiveMatch");
 const match=short=>({fixture:{status:{short}}});
 for(const status of ["1H","HT","2H","ET","BT","P","LIVE","IN_PLAY","PAUSED"])assert.equal(check(match(status)),true,status);
 for(const status of ["NS","FT","PST","CANC","SUSP","INT"])assert.equal(check(match(status)),false,status);
});

test("ESPN scoreboard maps in-progress and halftime events to live states",()=>{
 assert.match(html,/const live=!completed&&\(state==="in"\|\|state==="live"\|\|state==="inprogress"\|\|\/in progress\|halftime\|live\|first half\|second half/);
 assert.match(html,/completed\?"FT":halftime\?"HT":live\?"LIVE":"NS"/);
});

test("ESPN live events preserve score, team identity and clock",()=>{
 const start=html.indexOf("function mamEspnScoreboardMatches");
 const end=html.indexOf("\n}\n",start);
 const block=html.slice(start,end);
 assert.match(block,/goals:\{home:toGoals\(home\.score\),away:toGoals\(away\.score\)\}/);
 assert.match(block,/elapsed:clock\.elapsed/);
 assert.match(block,/home:\{id:teamId\(home\.team\?\.id\),name:/);
 assert.match(block,/away:\{id:teamId\(away\.team\?\.id\),name:/);
});

test("stale live cache is limited to three minutes and plausible kickoff window",()=>{
 assert.match(html,/age>3\*60\*1000/);
 assert.match(html,/age>=-20\*60\*1000&&age<=4\*60\*60\*1000/);
});

test("ESPN archive write cannot block rendering of its live matches",()=>{
 const start=html.indexOf("async function loadLiveMatchesNow");
 const end=html.indexOf("\nasync function ",start+30);
 const block=html.slice(start,end);
 assert.match(block,/mamSaveMatchesToD1\(fallback\)\.catch/);
 assert.doesNotMatch(block,/await\s+mamSaveMatchesToD1\(fallback\)/);
});

test("fallback providers normalize only active match states",()=>{
 assert.match(html,/footballDataLiveFixtures\(\)[\s\S]*?status:\{short:String\(m\.status\|\|"IN_PLAY"\)/);
 assert.match(html,/\["HT","ET","P","SUSP","LIVE"\]\.includes\(short\)/);
});

test("ESPN unavailable statuses cannot enter today or finished as scheduled or completed",()=>{
 const start=html.indexOf("function mamEspnScoreboardMatches");
 const end=html.indexOf("\n}\n",start);
 const parse=vm.runInNewContext(html.slice(start,end+2)+";mamEspnScoreboardMatches",{
  mamEspnClock:()=>({elapsed:null,displayClock:""})
 });
 const event=(name,state,completed,date="2026-11-23T12:00:00Z",detail="")=>({
  id:123,date,status:{type:{name,state,completed,detail}},
  competitions:[{competitors:[{homeAway:"home",team:{id:1,name:"A"}},{homeAway:"away",team:{id:2,name:"B"}}]}]
 });
 const fixtures=parse([
  event("STATUS_POSTPONED","pre",false),event("STATUS_CANCELED","post",true),
  event("STATUS_SUSPENDED","in",false),event("STATUS_SCHEDULED","pre",false),
  event("STATUS_HALFTIME","in",false,undefined,"Halftime"),event("STATUS_FULL_TIME","post",true),
  event("STATUS_SCHEDULED","pre",false,"invalid")
 ],"203",{slug:"tur.1"});
 assert.deepEqual(Array.from(fixtures,m=>m.fixture.status.short),["PST","CANC","SUSP","NS","HT","FT"]);
});

test("opening a completed match does not redirect to pre-match analysis",()=>{
 const begin=html.indexOf("function activateMamFixture(");
 const end=html.indexOf("function openMamMatchDetail(",begin);
 let opened=0;
 const activate=vm.runInNewContext(html.slice(begin,end)+";activateMamFixture",{
  mamActiveMatch:null, makeMamDetailTab(){}, openMamMatchDetail(){opened++;}
 });
 for(const hasProviderStats of [false,true]){
  activate({dataset:{fixtureCompleted:"true"},querySelector(selector){
   assert.doesNotMatch(selector,/data-pane="analysis"/);
   return hasProviderStats&&selector===".finishedStatsBtn"?{}:null;
  }});
 }
 assert.equal(opened,2);
});

test("fresh ESPN closures suppress old copies across sources without affecting another league or date",()=>{
 const start=html.indexOf("function mamConfirmedInactiveEspnMatches(");
 const end=html.indexOf("async function mamEspnLiveScoreboard(",start);
 const create=vm.runInNewContext(html.slice(start,end)+";mamConfirmedInactiveEspnMatches",{
  mamCanonicalMatchStatus:match=>match.fixture.status.short,
  mamIstanbulDay:date=>new Date(Date.parse(date)+10800000).toISOString().slice(0,10),
  mamNormalizeLiveTeamName:name=>name.toLowerCase()
 });
 const ended={fixture:{id:"espn-tur.1-1",date:"2026-11-23T21:30:00Z",status:{short:"FT"}},league:{id:203},teams:{home:{name:"A"},away:{name:"B"}}};
 const ongoing={...ended,fixture:{...ended.fixture,id:"espn-tur.1-2",status:{short:"HT"}},teams:{home:{name:"C"},away:{name:"D"}}};
 const inactive=create([ended,ongoing]);
 assert.equal(inactive(ended),true);
 const cached={...ended,fixture:{id:"31",date:"2026-11-24T00:30:00+03:00",status:{short:"LIVE"}}};
 assert.equal(inactive(cached),true);
 assert.equal(inactive({...cached,league:{id:39}}),false);
 assert.equal(inactive({...cached,fixture:{...cached.fixture,date:"2026-11-25T00:30:00+03:00"}}),false);
 assert.equal(inactive(ongoing),false);
});

test("an exact ESPN event lookup cannot use another fixture with the same teams",async()=>{
 const start=html.indexOf("async function mamFindEspnLiveEvent(");
 const end=html.indexOf("function mamEventType(",start);
 const teams=[{homeAway:"home",team:{displayName:"A"}},{homeAway:"away",team:{displayName:"B"}}];
 const different={id:"other",competitions:[{competitors:teams}]};
 const lookup=vm.runInNewContext(html.slice(start,end)+";mamFindEspnLiveEvent",{
  api:async()=>({events:[different]}),qs:()=>"",mamNormalizeLiveTeamName:name=>name
 });
 const options={slug:"tur.1",date:"2026-11-22",homeName:"A",awayName:"B"};
 assert.equal(await lookup({...options,eventId:"required"}),null);
 assert.equal(await lookup(options),different);
});

test("absence records must contain the exact fixture identity",()=>{
 const start=html.indexOf("function mamRowsForFixture(");
 const end=html.indexOf("function mamNormalizeAbsenceRows(",start);
 const select=vm.runInNewContext(html.slice(start,end)+";mamRowsForFixture");
 const correct={fixture:{id:71},team:"Galatasaray"};
 assert.deepEqual(Array.from(select([correct,{fixture_id:72,team:"Galatasaray"},{team:"Galatasaray"}],"71")),[correct]);
 assert.equal(select([correct],"").length,0);
});
