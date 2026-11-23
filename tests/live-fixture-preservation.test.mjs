import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {runInNewContext} from "node:vm";
const source=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const live=source.slice(source.indexOf("function loadLiveMatchesNow(){"),source.indexOf("\n\nasync function mamSportScoreLiveStats("));
test("live polling publishes ESPN fixtures alongside live matches",()=>{
 assert.match(live,/const publishLiveSnapshot=liveRows=>/);
 assert.ok(live.includes("[...allMatches,...fallbackSchedule].filter"));
 assert.match(live,/publishLiveSnapshot\(combinedLive\)/);
 assert.match(live,/publishLiveSnapshot\(\[\]\)/);
 assert.doesNotMatch(live,/if\(mamScreenMode==="live"\)allMatches=\[\]/);
});
test("partial ESPN live coverage is supplemented without querying API-Football",()=>{
 assert.match(live,/if\(fallbackLive\.length\)\{[\s\S]*?mamSportScoreLiveFixtures\(\)/);
 assert.match(live,/supplementalLive=mamUnrepresentedLiveFixtures\(fallbackLive,sportScoreLive\)/);
 assert.match(live,/if\(!espnLiveCount\)[\s\S]*?api\("fixtures\?"/);
 assert.match(live,/supplementalLive\.forEach\(match=>\{/);
});
test("live provider union removes same-kickoff AFC duplicates and keeps the distinct Bodrum fixture",()=>{
 const start=source.indexOf("const mamFixtureTeamKey=value=>"),end=source.indexOf("let mamFixtureLoadQueued=false;",start);
 const merge=runInNewContext(source.slice(start,end)+";mamUnrepresentedLiveFixtures",{
  mamFixtureInstant:value=>Date.parse(value)
 });
 const fixture=(id,league,home,away,date)=>({fixture:{id,date,status:{short:"LIVE"}},league:{id},
  teams:{home:{name:home},away:{name:away}},goals:{home:0,away:0}});
 const primary=[
  fixture("espn-afc-1","afc_champions","Al Ain","Esteghlal FC","2026-11-23T16:00:00Z"),
  fixture("espn-afc-2","afc_champions","Al-Shamal","Al Ahli","2026-11-23T16:00:00Z")
 ];
 const supplemental=[
  fixture("sportscore-afc-1","afc_champions","Al-Ain FC","Esteghlal Tehran","2026-11-23T16:00:00Z"),
  fixture("sportscore-afc-2","sportscore","Al-Shamal Sports Club","Al Ahli SC","2026-11-23T16:00:00Z"),
  fixture("sportscore-bodrum","204","Bodrum FK","Belediye Vanspor","2026-11-23T17:00:00Z")
 ];
 assert.deepEqual(merge(primary,supplemental).map(row=>row.fixture.id),["sportscore-bodrum"]);
 assert.equal(primary[0].goals.away,0,"ESPN score remains untouched when provider scores disagree");
});
test("today and upcoming still render match cards",()=>{
 assert.match(source,/if\(mamScreenMode==="today"\)/);
 assert.match(source,/if\(mamScreenMode==="upcoming"\)/);
 assert.match(source,/document\.querySelectorAll\("#matches \.match"\)\.forEach\(makeMamDetailTab\)/);
});
