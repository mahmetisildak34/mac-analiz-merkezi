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
