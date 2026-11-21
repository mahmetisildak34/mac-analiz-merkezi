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

test("ESPN scoreboard maps in-progress and halftime events to live states",()=>{
 assert.match(html,/const live=!completed&&\(state==="in"\|\|state==="live"\|\|state==="inprogress"\|\|\/in progress\|halftime\|live\|first half\|second half/);
 assert.match(html,/const statusShort=completed\?"FT":halftime\?"HT":live\?"LIVE":"NS"/);
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
