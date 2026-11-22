"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");

test("live screen accepts supported provider live states",()=>{
 const block=html.match(/const liveStatuses=new Set\(\[([^\]]+)\]\)/);
 assert.ok(block,"live status allow-list must exist");
 const states=[...block[1].matchAll(/"([^"]+)"/g)].map(x=>x[1]);
 for(const state of ["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE","IN_PLAY","PAUSED"])assert.ok(states.includes(state),state+" must be accepted");
});

test("ESPN lists only provider-declared in-progress and halftime events as live",()=>{
 const source=html.match(/function mamEspnStatus\([\s\S]*?\n\}/)?.[0];
 assert.ok(source);
 const status=require("node:vm").runInNewContext(source+"; mamEspnStatus");
 for(const [input,expected] of [
  [{state:"in",name:"STATUS_IN_PROGRESS"},"LIVE"],
  [{state:"in",name:"STATUS_HALFTIME"},"HT"],
  [{state:"pre",detail:"Live coverage starts soon"},"NS"],
  [{state:"post",name:"STATUS_FULL_TIME",completed:true},"FT"],
  [{state:"post",name:"STATUS_POSTPONED",completed:true},"PST"],
  [{state:"post",name:"STATUS_CANCELLED"},"CANC"],
  [{state:"post",name:"STATUS_CANCELED"},"CANC"],
  [{state:"in",name:"STATUS_ABANDONED"},"ABD"],
  [{name:"STATUS_UNKNOWN"},"NS"]
 ])assert.equal(status(input),expected);
 assert.equal(status({}, {state:"in"}),"LIVE");
 assert.equal(status({state:"in"}, {name:"STATUS_POSTPONED"}),"PST");
});

test("ESPN live events preserve score, team identity and clock",()=>{
 const start=html.indexOf("async function espnFixtures");
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

test("published standings keep missing fields blank and prefer source goal difference",()=>{
 const standings=html.slice(html.indexOf("async function loadStandings"),html.indexOf("const MAM_MATCH_STATS_TTL"));
 assert.match(standings,/await loadEspnStandings\(espnLeague,\{season:seasonValue,refresh\}\)/);
 assert.match(standings,/difference:row.goalDifference/);
 assert.match(standings,/x\.difference\?\?\(x\.goals!=null&&x\.against!=null/);
 assert.match(standings,/isTeamDirectory\?"Puan tablosu yok"/);
});

test("fresh terminal ESPN statuses suppress old live entries within the same league",()=>{
 assert.match(html,/const matchPair=match=>String\(match\.league\?\.id\?\?""\)/);
 assert.match(html,/const freshPairs=new Set\(fallback\.map\(matchPair\)\)/);
 assert.match(html,/recentCachedLive\.forEach\(match=>\{const key=matchPair\(match\);if\(!freshPairs\.has\(key\)\)/);
});

test("ESPN tur.1 scoreboard captured on 22 November keeps all four full-time results out of live",async()=>{
 const source=html.match(/function mamEspnStatus\([\s\S]*?\n\}/)?.[0];
 const status=require("node:vm").runInNewContext(source+"; mamEspnStatus");
 const {isLiveMatch,isIstanbulToday}=await import("../mobile/product-features.mjs");
 const captured=[
  ["401888243","2026-11-22T10:30Z"],
  ["401888248","2026-11-22T13:00Z"],
  ["401888246","2026-11-22T13:00Z"],
  ["401888249","2026-11-22T16:00Z"]
 ];
 const type={state:"post",name:"STATUS_FULL_TIME",completed:true};
 const localMidnight=Date.parse("2026-11-22T21:00:00Z");
 for(const [id,date] of captured){
  assert.equal(status(type),"FT",id);
  assert.equal(isLiveMatch({status:{type}}),false,id);
  assert.equal(isIstanbulToday({date},localMidnight-1),true,id);
  assert.equal(isIstanbulToday({date},localMidnight),false,id);
 }
});

test("main date shortcuts follow the Istanbul day across midnight and month rollover",()=>{
 const selector=name=>html.match(new RegExp("function "+name+"\\([\\s\\S]*?\\n\\}"))?.[0];
 const relative=require("node:vm").runInNewContext(selector("mamIstanbulDateString")+"\n"+selector("mamRelativeIstanbulDay")+"\n mamRelativeIstanbulDay");
 const before=new Date("2026-11-30T20:59:00Z"),after=new Date("2026-11-30T21:00:00Z");
 assert.equal(relative(0,before),"2026-11-30");
 assert.equal(relative(0,after),"2026-12-01");
 assert.equal(relative(-1,after),"2026-11-30");
 assert.equal(relative(1,after),"2026-12-02");
});

test("ESPN summary event types retain goals, cards and substitutions from the captured fixture",()=>{
 const source=html.match(/function mamMatchEventKind\([\s\S]*?\n\}/)?.[0];
 const eventKind=require("node:vm").runInNewContext(source+"; mamMatchEventKind");
 const summary=require("./fixtures/espn-tur1-401888243-summary.json");
 const counts=summary.keyEvents.reduce((out,event)=>{
  const kind=eventKind(event);
  out[kind]=(out[kind]??0)+1;
  return out;
 },{});
 assert.deepEqual(counts,{"Sarı kart":3,"Değişiklik":10,"Gol":1});
 assert.equal(eventKind({type:{text:"Red Card"}}),"Kırmızı kart");
 assert.equal(eventKind({type:{text:"Offside"}}),"");
});
