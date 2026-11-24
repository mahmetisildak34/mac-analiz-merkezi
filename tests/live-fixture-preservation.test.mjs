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

test("SportScore's observed AFC spellings deduplicate without replacing ESPN scores",()=>{
 const start=source.indexOf("const mamFixtureTeamKey=value=>"),end=source.indexOf("let mamFixtureLoadQueued=false;",start);
 const merge=runInNewContext(source.slice(start,end)+";mamUnrepresentedLiveFixtures",{mamFixtureInstant:value=>Date.parse(value)});
 const fixture=(id,home,away,score,date="2026-11-23T18:15:00Z")=>({fixture:{id,date,status:{short:"LIVE"}},league:{id:"afc_champions"},
  teams:{home:{name:home},away:{name:away}},goals:{home:score[0],away:score[1]}});
 const primary=[fixture("espn-ittihad","Al Ittihad","Pakhtakor",[1,0]),fixture("espn-jawiya","Al-Quwa Al-Jawiya","Al-Gharafa",[0,0])];
 const supplemental=[
  fixture("sportscore-ittihad","Al Ittihad","Pakhtakor",[1,1]),
  fixture("sportscore-jawiya","Al Quwa Al Jawiya","Al-Gharafa Sports Club",[0,0]),
  fixture("sportscore-libya","Al Ittihad Tripoli","Al-Madina SC",[1,0])
 ];
 assert.deepEqual(merge(primary,supplemental).map(row=>row.fixture.id),["sportscore-libya"]);
 assert.deepEqual(primary.map(row=>[row.goals.home,row.goals.away]),[[1,0],[0,0]],"conflicting SportScore values never overwrite ESPN scores");
});

test("SportScore supplemental lookup has a 3.5-second cold-request budget",()=>{
 assert.match(live,/setTimeout\(\(\)=>controller\.abort\(\),3500\)/);
 assert.doesNotMatch(live,/setTimeout\(\(\)=>controller\.abort\(\),1400\)/);
});

test("historical cross-provider identity does not split a fixture when scores differ",()=>{
 const start=source.indexOf("const addMatch=m=>"),end=source.indexOf("\n\n  // Süper Lig geçmişi",start);
 const merge=source.slice(start,end);
 assert.match(merge,/const identity=\[d,normalize\(h\),normalize\(a\)\]\.join\("\\|"\)/);
 assert.doesNotMatch(merge,/const identity=\[d,normalize\(h\),normalize\(a\),Number\(gh\),Number\(ga\)\]/);
 assert.match(source,/const key=\[date,home,away\]\.join\("\\|"\)/);
});

test("ESPN profile history enriches optional statistics without API-Football fallback",()=>{
 const historyStart=source.indexOf("const openStandingTeamHistory=async");
 const historyEnd=source.indexOf("\n\nfunction renderStandings",historyStart);
 const history=source.slice(historyStart,historyEnd);
 assert.match(history,/if\(useEspnProfile&&recent\.length\)\{[\s\S]*?mamEnrichHistoricalStats\(recent,leagueId\)/);
 assert.match(history,/if\(useEspnProfile&&recent\.length\)\{[\s\S]*?catch\(_\)\{/);
 assert.match(source,/const isEspn=id\.startsWith\("espn-"\)/);
});

test("SportScore parses the provider ID from the observed match URL and rejects incomplete event identity",async()=>{
	const start=source.indexOf("function mamSportScoreMatchSlug("),end=source.indexOf("\n\nconst MAM_LIVE_MATCH_CACHE_KEY",start);
	assert.ok(start>=0&&end>start,"shared SportScore URL identity helper and live parser must exist");
	const observed={home:"Al Ittihad",away:"Pakhtakor",home_score:"2",away_score:"0",status:"live",status_text:"2nd half",time:"2026-11-23T18:15:00+00:00",competition:"AFC Champions League Elite",url:"/football/match/al-ittihad-club-vs-pakhtakor/n54qllhnlk1lqvy/"};
 const rows=[
  observed,
  {...observed,home:"No URL",away:"No ID",url:""},
  {...observed,home:"Invalid route",away:"Invalid route",url:"/football/other/path/abcdefghijklmno/"},
  {...observed,home:"No kickoff",away:"No kickoff",time:undefined,date:"2026-11-23"},
  {...observed,home:"",away:"Missing home"},
  {...observed,home:"Missing away",away:""}
 ];
	const instantStart=source.indexOf("function mamFixtureInstant("),instantEnd=source.indexOf("\nfunction mamIstanbulDay",instantStart);
	const code=source.slice(instantStart,instantEnd)+"\n"+source.slice(start,end);
	const api=runInNewContext(code+";({mamSportScoreMatchSlug,mamSportScoreFindLiveMatch,mamSportScoreLiveFixtures})",{
		WORKER:"https://worker.example",qs:params=>new URLSearchParams(params).toString(),URL,Date,
		mamIstanbulDateString:()=>"2026-11-23",mamExplicitUtc:value=>value,
		localStorage:{getItem:()=>null,setItem:()=>{}},
		fetch:async()=>({ok:true,json:async()=>({matches:rows})})
 });
 const parsed=await api.mamSportScoreLiveFixtures(true);
 assert.equal(parsed.length,1,"rows without a verifiable URL ID, absolute kickoff, or both teams are dropped");
 assert.equal(parsed[0].fixture.id,"sportscore-n54qllhnlk1lqvy");
 assert.equal(parsed[0].fixture.date,observed.time);
 assert.equal(parsed[0].fixture.timeUnknown,false);
 assert.equal(api.mamSportScoreMatchSlug(parsed[0]),"n54qllhnlk1lqvy");
	const matched=api.mamSportScoreFindLiveMatch(rows,"alittihad","pakhtakor",value=>String(value||"").toLowerCase().replace(/[^a-z0-9]/g,""));
 assert.equal(api.mamSportScoreMatchSlug(matched),"n54qllhnlk1lqvy","detail lookup uses the same URL-derived provider identity");
 const detailStart=source.indexOf("async function mamSportScoreLiveStats(");
 const detailEnd=source.indexOf("\nasync function ",detailStart+10);
	assert.ok(source.slice(detailStart,detailEnd).includes("mamSportScoreFindLiveMatch(matches"),"SportScore detail lookup must use the tested safe matcher");
});

test("Today refresh reconciles the same ESPN and API fixture despite provider league IDs, without status regression",async()=>{
	const start=source.indexOf("const mamFixtureTeamKey=value=>"),end=source.indexOf("let mamFixtureLoadQueued=false;",start);
	const helpers=runInNewContext(source.slice(start,end)+";({mamSameFixture,mamMergeFixtureRows})",{
  mamFixtureInstant:value=>Date.parse(value),
  mamCanonicalMatchStatus:row=>String(row.fixture?.status?.short||"UNK").toUpperCase(),
  mamHasCompletedScore:row=>row.goals?.home!=null&&row.goals?.away!=null
 });
 const api={fixture:{id:401912601,date:"2026-11-23T18:15:00Z",status:{short:"NS"}},league:{id:17,name:"AFC Champions League Elite"},
  teams:{home:{name:"Al Ittihad"},away:{name:"Pakhtakor"}},goals:{home:null,away:null}};
 const espn={fixture:{id:"espn-afc.champions-401912601",date:"2026-11-23T18:15:00Z",status:{short:"LIVE",elapsed:77}},league:{id:"afc.champions",name:"AFC Champions League Elite"},
  teams:{home:{name:"Al Ittihad"},away:{name:"Pakhtakor"}},goals:{home:2,away:0}};
 assert.equal(helpers.mamSameFixture(api,espn),true,"same home/away and kickoff identify the cross-provider fixture");
 const merged=helpers.mamMergeFixtureRows([api,espn]);
 assert.equal(merged.length,1,"Today has one row, not a scheduled duplicate beside its live update");
	assert.equal(merged[0].fixture.status.short,"LIVE");
	assert.deepEqual([merged[0].goals.home,merged[0].goals.away],[2,0]);
	assert.ok(/const index=mamFindSameFixtureIndex\(next,row\)/.test(source),"Today refresh uses the shared fixture identity rule");
	const refreshStart=source.indexOf("async function refreshTodayScores(){"),refreshEnd=source.indexOf("\n\nlet mamLastIstanbulFixtureDay",refreshStart);
	const dateControl={value:"2026-11-23"};
	let rendered=null;
	const refreshContext={allMatches:[api],mamScreenMode:"today",mamTodayScoreRequest:null,mamActiveMatch:null,
		mamFixtureInstant:value=>Date.parse(value),
		mamCanonicalMatchStatus:row=>String(row.fixture?.status?.short||"UNK").toUpperCase(),
		mamHasCompletedScore:row=>row.goals?.home!=null&&row.goals?.away!=null,
		mamIstanbulDateString:()=>"2026-11-23",mamIstanbulDay:()=>"2026-11-23",
		navigator:{onLine:true},window:{mamLoadMatchesBusy:false},
		$:id=>id==="date"?dateControl:{value:"all"},espnFixtures:async()=>[espn],
		renderMatches:()=>{rendered=refreshContext.allMatches;}
	};
	const refresh=runInNewContext(source.slice(start,end)+"\n"+source.slice(refreshStart,refreshEnd)+"\nrefreshTodayScores",refreshContext);
	await refresh();
	assert.equal(refreshContext.allMatches.length,1,"the actual Today refresh path keeps one cross-provider row");
	assert.equal(refreshContext.allMatches[0].fixture.status.short,"LIVE");
	assert.deepEqual([refreshContext.allMatches[0].goals.home,refreshContext.allMatches[0].goals.away],[2,0]);
	assert.equal(rendered,refreshContext.allMatches,"Today renders the same refreshed fixture state");
	const final={...api,fixture:{...api.fixture,status:{short:"FT"}},goals:{home:2,away:0}};
 const lateLive={...espn,fixture:{...espn.fixture,status:{short:"LIVE",elapsed:88}},goals:{home:3,away:0}};
 const afterFinal=helpers.mamMergeFixtureRows([final,lateLive]);
 assert.equal(afterFinal.length,1);
 assert.equal(afterFinal[0].fixture.status.short,"FT","a late live response cannot regress a final fixture");
 assert.deepEqual([afterFinal[0].goals.home,afterFinal[0].goals.away],[2,0]);
 const sameProviderOtherLeague={...espn,fixture:{...espn.fixture,id:"espn-afc-cup-7"},league:{id:"afc.cup"}};
 assert.equal(helpers.mamSameFixture(espn,sameProviderOtherLeague),false,"different ESPN competitions are not merged from team/time alone");
 const apiThenEspnThenOtherLeague=helpers.mamMergeFixtureRows([api,espn,sameProviderOtherLeague]);
 assert.equal(apiThenEspnThenOtherLeague.length,2,"after API and ESPN are reconciled, another ESPN competition remains a separate fixture");
 assert.equal(apiThenEspnThenOtherLeague[1].fixture.id,"espn-afc-cup-7");
});
