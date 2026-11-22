import test from "node:test";
import assert from "node:assert/strict";
import rules from "../mobile/match-rules.js";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../mobile/App.js",import.meta.url),"utf8");
const fixture=(id,date,status,home="Ev",away="Dep",league=203)=>({
 fixture:{id,date,status:{short:status,elapsed:90}},
 teams:{home:{name:home},away:{name:away}},league:{id:league,name:"Süper Lig"},
 goals:{home:2,away:1}
});
test("native Today requests the Istanbul calendar date rather than UTC",()=>{
 assert.equal(rules.istanbulDay("2026-11-22T21:30:00Z"),"2026-11-23");
 assert.match(app,/istanbulDay\(new Date\(\)\)/);
 assert.doesNotMatch(app,/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});
test("native Today only lists matches not yet played on Istanbul day",()=>{
 const now=Date.parse("2026-11-22T21:15:00Z");
 const upcoming=fixture(1,"2026-11-22T22:15:00Z","NS");
 const finished=fixture(2,"2026-11-22T21:01:00Z","FT");
 const live=fixture(3,"2026-11-22T21:05:00Z","2H");
 const wrongDay=fixture(4,"2026-11-23T21:10:00Z","NS");
 assert.deepEqual(rules.visibleMatches([upcoming,finished,live,wrongDay],"today",now).map(m=>m.fixture.id),[1]);
});
test("native LIVE rejects finished, scheduled, postponed and canceled",()=>{
 const now=Date.parse("2026-11-22T13:00:00Z");
 const date="2026-11-22T12:00:00Z";
 const rows=["FT","NS","PST","CANC","2H"].map((status,i)=>fixture(i+1,date,status));
 assert.deepEqual(rules.visibleMatches(rows,"live",now).map(m=>m.fixture.id),[5]);
});
test("native LIVE does not use future kickoff as proof of play",()=>{
 const now=Date.parse("2026-11-22T13:00:00Z");
 assert.equal(rules.isCrediblyLive(fixture(1,"2026-11-22T13:05:00Z","LIVE"),now),false);
});
test("native status always shows final/canceled/postponed before elapsed minute",()=>{
 for(const [code,text] of [["FT","MS"],["CANC","İPTAL"],["PST","ERTELENDİ"],["ABD","YARIDA KALDI"]]){
  assert.equal(rules.statusLabel(fixture(1,"2026-11-22T12:00:00Z",code)),text);
 }
 assert.equal(rules.statusLabel(fixture(1,"2026-11-22T12:00:00Z","2H")),"90'");
});
test("native list rejects missing identities, teams and invalid kickoffs",()=>{
 const now=Date.parse("2026-11-22T13:00:00Z");
 const valid=fixture(10,"2026-11-22T12:00:00Z","2H");
 const noId=fixture(null,"2026-11-22T12:00:00Z","2H");
 const noTeams=fixture(11,"2026-11-22T12:00:00Z","2H");delete noTeams.teams.home.name;
 const noDate=fixture(12,"bad-date","2H");
 assert.deepEqual(rules.visibleMatches([valid,noId,noTeams,noDate],"live",now).map(m=>m.fixture.id),[10]);
});
test("native deduplication preserves separate games on different days",()=>{
 const now=Date.parse("2026-11-22T13:00:00Z");
 const a=fixture(10,"2026-11-22T12:00:00Z","2H","Göztepe SK","Erzurumspor");
 const b=fixture("espn-tur.1-10","2026-11-22T12:03:00Z","2H","Göztepe","Erzurumspor");
 const later=fixture(12,"2026-11-21T12:00:00Z","2H","Göztepe","Erzurumspor");
 assert.equal(rules.visibleMatches([a,b,later],"live",now).length,1);
});
test("native UI guards stale tab responses and narrows layout without clipping",()=>{
 assert.match(app,/const requestId = \+\+latestRequest\.current/);
 assert.match(app,/requestId === latestRequest\.current/);
 assert.match(app,/visibleMatches\(data\.response, selectedTab, Date\.now\(\)\)/);
 assert.match(app,/team:\{flex:1,minWidth:0\}/);
 assert.match(app,/fontVariant:\["tabular-nums"\]/);
});
