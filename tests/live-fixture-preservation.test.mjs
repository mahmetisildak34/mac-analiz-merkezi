import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {runInNewContext} from "node:vm";
const source=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const live=source.slice(source.indexOf("function loadLiveMatchesNow(){"),source.indexOf("\n\nasync function mamSportScoreLiveStats("));
const teamGroupsStart=source.indexOf("const MAM_UEFA_TEAM_GROUPS=");
const teamGroupsEnd=source.indexOf(";",teamGroupsStart)+1;
const fixtureHelpers=expression=>{
 const start=source.indexOf("const mamFixtureTeamKeyBase=value=>"),end=source.indexOf("let mamFixtureLoadQueued=false;",start);
 assert.ok(teamGroupsStart>=0&&teamGroupsEnd>teamGroupsStart&&end>start);
 return source.slice(teamGroupsStart,teamGroupsEnd)+"\n"+source.slice(start,end)+"\n"+expression;
};
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
 assert.match(live,/const combinedLive=mamMergeFixtureRows\(\[\.\.\.unrepresentedCache,\.\.\.supplementalLive,\.\.\.checkedFallback,\.\.\.primaryLiveMatches\]\)/);
});
test("live provider union removes same-kickoff AFC duplicates and keeps the distinct Bodrum fixture",()=>{
	 const merge=runInNewContext(fixtureHelpers("mamUnrepresentedLiveFixtures"),{
  mamFixtureInstant:value=>Date.parse(value)
 });
 const fixture=(id,league,home,away,date)=>({fixture:{id,date,status:{short:"LIVE"}},league:{id,name:"AFC Champions League Elite"},
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
	 const merge=runInNewContext(fixtureHelpers("mamUnrepresentedLiveFixtures"),{mamFixtureInstant:value=>Date.parse(value)});
 const fixture=(id,home,away,score,date="2026-11-23T18:15:00Z")=>({fixture:{id,date,status:{short:"LIVE"}},league:{id:"afc_champions",name:"AFC Champions League Elite"},
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
 assert.match(merge,/output\.findIndex\(previous=>mamSameFixture\(previous,normalizedMatch\)\)/);
 assert.doesNotMatch(merge,/const identity=\[d,mamCanonicalHistoryTeamKey\(h\),mamCanonicalHistoryTeamKey\(a\)\]/);
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
		const start=source.indexOf("const mamFixtureTeamKeyBase=value=>"),end=source.indexOf("let mamFixtureLoadQueued=false;",start);
		const helpers=runInNewContext(fixtureHelpers("({mamSameFixture,mamMergeFixtureRows})"),{
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

test("Explicit club aliases merge across providers, but ID collisions and distinct competitions remain separate",()=>{
 const api=runInNewContext(fixtureHelpers("({mamSameFixture,mamMergeFixtureRows,mamFixtureTeamKey})"),{
  mamFixtureInstant:value=>Date.parse(value),
  mamCanonicalMatchStatus:row=>String(row.fixture?.status?.short||"UNK").toUpperCase(),
  mamHasCompletedScore:row=>row.goals?.home!=null&&row.goals?.away!=null
 });
 const row=(id,source,league,home,away,date="2026-11-23T18:15:00Z",score=[0,0])=>({
  mamSource:source,fixture:{id,date,status:{short:"LIVE",elapsed:30}},league:{id:league,name:"UEFA Europa League"},
  teams:{home:{name:home},away:{name:away}},goals:{home:score[0],away:score[1]}
 });
 const slavia=row("espn-1","ESPN","uefa.europa","Slavia Prague","Villarreal CF");
 const apiFootball=row("991","API_FOOTBALL","3","SK Slavia Praha","Villarreal");
 assert.equal(api.mamFixtureTeamKey("Slavia Prague"),api.mamFixtureTeamKey("SK Slavia Praha"));
 assert.equal(api.mamFixtureTeamKey("Villarreal CF"),api.mamFixtureTeamKey("Villarreal"));
 assert.equal(api.mamSameFixture(slavia,apiFootball),true,"explicit aliases + same competition + kickoff reconcile provider IDs");
 assert.equal(api.mamMergeFixtureRows([slavia,apiFootball]).length,1);
 const collision=row("991","ESPN","uefa.europa","Real Madrid","Arsenal");
 assert.equal(api.mamSameFixture(apiFootball,collision),false,"identical raw IDs cannot merge unrelated teams");
 assert.equal(api.mamMergeFixtureRows([apiFootball,collision]).length,2);
 const ambiguousIdA={...slavia,mamSource:undefined,fixture:{...slavia.fixture,id:"777"},league:{id:"7",name:"UEFA Europa League"}};
 const ambiguousIdB={...ambiguousIdA,league:{id:"7",name:"National Cup"}};
 assert.equal(api.mamSameFixture(ambiguousIdA,ambiguousIdB),false,"unidentified numeric provider IDs do not override conflicting competition names");
 assert.equal(api.mamMergeFixtureRows([ambiguousIdA,ambiguousIdB]).length,2);
 const otherCompetition={...apiFootball,fixture:{...apiFootball.fixture,id:"espn-cup-2"},league:{id:"cup",name:"National Cup"}};
 assert.equal(api.mamSameFixture(slavia,otherCompetition),false,"same teams/time in a different known competition remain distinct");
 assert.equal(api.mamMergeFixtureRows([slavia,otherCompetition]).length,2);
 const differentKickoff={...apiFootball,fixture:{...apiFootball.fixture,id:"api-late",date:"2026-11-23T18:30:00Z"}};
 assert.equal(api.mamSameFixture(slavia,differentKickoff),false,"kickoff outside the established tolerance remains separate");
});

test("known ESPN league IDs unify provider names in archive identity and team-history filtering",()=>{
 const identityStart=source.indexOf("function mamHistoricalIdentity("),identityEnd=source.indexOf("\nfunction mamHistoryCompetitionAllowed",identityStart);
 const allowance=source.match(/function mamHistoryCompetitionAllowed\([\s\S]*?\n\}/)?.[0];
 assert.ok(identityStart>=0&&identityEnd>identityStart&&allowance);
 const history=runInNewContext(fixtureHelpers("")+source.slice(identityStart,identityEnd)+"\n"+allowance+"\n({mamHistoricalIdentity,mamDeduplicateHistoricalMatches,mamHistoryCompetitionAllowed})",{
  ESPN_LEAGUES:{"3":{slug:"uefa.europa",name:"UEFA Europa League"},uefa_europa:{slug:"uefa.europa",name:"UEFA Europa League"}},
  mamIstanbulDay:value=>String(value||"").slice(0,10),mamCanonicalHistoryTeamKey:value=>String(value||"").toLowerCase()
 });
 const row=(id,name)=>({fixture:{id,date:"2026-11-23T18:15:00Z",status:{short:"FT"}},league:{id,name},
  teams:{home:{name:"Home Club"},away:{name:"Away Club"}},goals:{home:1,away:0}});
 const apiMatch=row("3","UEFA Europa League"),espnMatch=row("uefa.europa","2026/27 UEFA Europa League");
 const otherCompetition=row("501","National Cup");
 assert.equal(history.mamHistoricalIdentity(apiMatch),history.mamHistoricalIdentity(espnMatch));
 assert.notEqual(history.mamHistoricalIdentity(apiMatch),history.mamHistoricalIdentity(otherCompetition));
 assert.equal(history.mamDeduplicateHistoricalMatches([apiMatch,espnMatch,otherCompetition]).length,2);
 assert.equal(history.mamHistoryCompetitionAllowed({...espnMatch,mamSource:"espn"},"3"),true);
});

test("Today, Live, Finished, Upcoming, Favorites and team-history views use their shared fixture/archive paths",()=>{
 assert.match(source,/mamScreenMode==="live"\)list=list\.filter/);
 assert.match(source,/mamScreenMode==="finished"\)list=list\.filter/);
 assert.match(source,/mamScreenMode==="upcoming"\)\{/);
 assert.match(source,/mamScreenMode==="today"\)\{/);
 assert.match(source,/allMatches=mamMergeFixtureRows\(\[\.\.\.schedule,\.\.\.liveRows\]\)/);
 assert.match(source,/const uniqueOutput=mamDeduplicateHistoricalMatches\(output\)/);
 const tffStart=source.indexOf("async function getTFFSuperLigUpcoming()"),tffEnd=source.indexOf("async function loadSuperLigFixtures()",tffStart);
 const tff=source.slice(tffStart,tffEnd);
 assert.match(tff,/fixtures=mamMergeFixtureRows\(combined\)/);
 assert.doesNotMatch(tff,/similarity\(/,"TFF no longer uses a separate fuzzy identity rule");
 assert.match(source,/allMatches=mamMergeFixtureRows\(instantCache\.matches\)/);
 assert.match(source,/allMatches=mamMergeFixtureRows\(fallbackMatches\)/);
 const historyStart=source.indexOf("async function getTeamFixtures("),historyEnd=source.indexOf("\n/* TAKIM İSTATİSTİKLERİ */",historyStart);
 const history=source.slice(historyStart,historyEnd);
 assert.match(history,/const archiveMatches=saved\.matches\.slice\(\)/);
 assert.match(history,/matches:preservedArchive/,"cache enrichment must retain every original archive row");
 assert.match(history,/mamSaveMatchesToD1\(preservedArchive,leagueId\)/);
 const favorites=readFileSync(new URL("../mobile/main-favorites.mjs",import.meta.url),"utf8");
 assert.match(favorites,/snapshot\(\)/);
 assert.match(source,/mam_product_hub_fixtures_v1/);
});
