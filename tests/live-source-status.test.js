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
  [{name:"STATUS_UNKNOWN"},"UNK"]
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
 assert.match(html,/footballDataLiveFixtures\(\)[\s\S]*?status:\{short:String\(m\.status\|\|""\)/);
 assert.match(html,/\["HT","ET","P","SUSP","LIVE"\]\.includes\(short\)/);
});

test("the verified AFC Champions League Elite ESPN scoreboard is configured",()=>{
 const start=html.indexOf("const ESPN_LEAGUES={"),end=html.indexOf("\n};",start);
 const mapping=html.slice(start,end);
 assert.match(mapping,/"afc_champions":\{slug:"afc\.champions",name:"AFC Champions League Elite"/);
 assert.match(html,/const liveCodes=new Set\(\["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"\]\)/);
});

test("SportScore supplements normalize AFC and Turkish First League to stable league IDs",async()=>{
 const methods=["mamExplicitUtc","mamFixtureInstant","mamSportScoreMatchSlug","mamSportScoreKickoff","mamSportScoreLiveFixtures"];
 const js=methods.map(name=>html.match(new RegExp("(?:async )?function "+name+"\\([\\s\\S]*?\\n\\}"))[0]).join("\n");
 const payload={matches:[
  {id:"bodrum",status:"live",status_text:"1st half",time:"2026-11-23T17:00:00Z",home:"Bodrum FK",away:"Belediye Vanspor",home_score:"0",away_score:"0",competition:"Turkish First League"},
  {id:"afc",status:"live",status_text:"2nd half",time:"2026-11-23T16:00:00Z",home:"Al-Ain FC",away:"Esteghlal Tehran",home_score:"0",away_score:"1",competition:"AFC Champions League Elite"}
 ]};
 const load=require("node:vm").runInNewContext(js+";mamSportScoreLiveFixtures",{
  WORKER:"https://fixture.invalid",qs:x=>new URLSearchParams(x),mamIstanbulDateString:()=>"2026-11-23",
  localStorage:{getItem:()=>null,setItem:()=>{}},fetch:async()=>({ok:true,json:async()=>payload})
 });
 const rows=await load(true);
 assert.deepEqual(rows.map(row=>row.league.id),["204","afc_champions"]);
 assert.ok(rows.every(row=>row.fixture.status.short==="LIVE"));
 assert.equal(rows[1].fixture.status.elapsed,null,"the provider's '2nd half' label is not a minute");
});

test("SportScore preserves provider minute fields and nested competition identity",async()=>{
 const methods=["mamExplicitUtc","mamFixtureInstant","mamSportScoreMatchSlug","mamSportScoreKickoff","mamSportScoreLiveFixtures"];
 const js=methods.map(name=>html.match(new RegExp("(?:async )?function "+name+"\\([\\s\\S]*?\\n\\}"))[0]).join("\n");
 const payload={matches:[{id:"nested",status:{short:"LIVE"},status_text:"2nd half",elapsed:"26:15",time:"2026-11-23T18:00:00Z",home:"Ev",away:"Rakip",home_score:1,away_score:0,tournament:{id:"provider-204",name:"Turkish First League",country:"Türkiye"}}]};
 const load=require("node:vm").runInNewContext(js+";mamSportScoreLiveFixtures",{
  WORKER:"https://fixture.invalid",qs:x=>new URLSearchParams(x),mamIstanbulDateString:()=>"2026-11-23",
  localStorage:{getItem:()=>null,setItem:()=>{}},fetch:async()=>({ok:true,json:async()=>payload})
 });
 const [row]=await load(true);
 assert.equal(row.fixture.status.elapsed,26);
 assert.equal(row.league.id,"204");
 assert.equal(row.league.name,"Turkish First League");
});

test("published standings keep missing fields blank and prefer source goal difference",()=>{
 const standings=html.slice(html.indexOf("async function loadStandings"),html.indexOf("const MAM_MATCH_STATS_TTL"));
 assert.match(standings,/await loadEspnStandings\(espnLeague,\{season:seasonValue,refresh\}\)/);
 assert.match(standings,/difference:row.goalDifference/);
 assert.match(standings,/x\.difference\?\?\(x\.goals!=null&&x\.against!=null/);
 assert.match(standings,/isTeamDirectory\?"Puan tablosu yok"/);
});

test("fresh terminal ESPN statuses suppress old live entries through shared fixture identity",()=>{
 assert.match(html,/const freshFixtures=\[\.\.\.fallback,\.\.\.previousDayFixtures\]/);
 assert.match(html,/const unrepresentedCache=recentCachedLive\.filter\(match=>!freshFixtures\.some\(row=>mamSameFixture\(row,match\)\)\)/);
 assert.match(html,/const combinedLive=mamMergeFixtureRows\(\[\.\.\.unrepresentedCache,\.\.\.supplementalLive,\.\.\.checkedFallback,\.\.\.primaryLiveMatches\]\)/);
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

test("ESPN player profiles show only published match statistics and preserve zero values",()=>{
 const source=html.match(/function lineupPlayerProfiles\([\s\S]*?\n\}/)?.[0];
 const render=require("node:vm").runInNewContext(source+"; lineupPlayerProfiles",{esc:String,mamDisplayStatisticName:value=>value,mamDisplayPositionName:value=>value});
 const {rosters}=require("./fixtures/espn-tur1-401888243-summary.json");
 const goalkeeper=rosters[0].roster[0];
 const profile=render([{player:{source:"espn",name:goalkeeper.athlete.displayName,stats:goalkeeper.stats}}]);
 assert.match(profile,/Ertugrul Taskiran/);
 assert.match(profile,/<dt>Yapılan faul<\/dt><dd>0<\/dd>/);
 assert.match(render([{player:{source:"espn",name:goalkeeper.athlete.displayName}}]),/istatistiği paylaşmadı/);
});

test("today's ESPN scoreboard refreshes after five seconds and concurrent refreshes share one request",async()=>{
 const source=html.match(/async function api\([\s\S]*?\n\}/)?.[0];
 const path="espn/tur.1/scoreboard?dates=20261122";
 const key="mam_api_cache_v2_"+path;
 const payload={events:[{id:"401888243",date:"2026-11-22T10:30Z",status:{type:{state:"post",name:"STATUS_FULL_TIME",completed:true}}}]};
 const entries=new Map([[key,JSON.stringify({time:Date.now()-6000,data:payload})]]);
 let requests=0,requestCache="";
 let respond;
 const api=require("node:vm").runInNewContext("const mamEspnPending=new Map();\n"+source+"\napi",{
  WORKER:"https://fixture.invalid",
  mamIstanbulDateString:()=>"2026-11-22",
  localStorage:{getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value)},
  AbortController,setTimeout,clearTimeout,
  fetch:(_url,options)=>{requests++;requestCache=options?.cache||"";return new Promise(resolve=>{respond=()=>resolve({ok:true,json:async()=>payload});});}
 });
 const first=api(path),second=api(path);
 assert.equal(requests,1);
 respond();
 assert.deepEqual(await first,payload);
 assert.deepEqual(await second,payload);
 assert.equal(requestCache,"no-store","current ESPN scoreboard must bypass browser and intermediary HTTP caches");
 assert.equal(JSON.stringify(await api(path)),JSON.stringify(payload));
 assert.equal(requests,1);
});

test("team profiles only show completed matches with two known scores",()=>{
 const fn=name=>html.match(new RegExp("function "+name+"\\([\\s\\S]*?\\n\\}"))?.[0];
 const completed=require("node:vm").runInNewContext(fn("mamCanonicalMatchStatus")+"\n"+fn("mamHasCompletedScore")+"\n mamHasCompletedScore");
 const fixture={id:"espn-tur.1-401888243",status:{short:"FT"}};
 assert.equal(completed({fixture,goals:{home:0,away:1}}),true);
 assert.equal(completed({fixture,goals:{home:null,away:1}}),false);
});

test("captured ESPN Spain second division match transitions from added time to full time",()=>{
 const fn=name=>html.match(new RegExp("function "+name+"\\([\\s\\S]*?\\n\\}"))?.[0];
 const {status,clock}=require("node:vm").runInNewContext(fn("mamEspnStatus")+"\n"+fn("mamEspnClock")+"\n({status:mamEspnStatus,clock:mamEspnClock})");
 const {live,finished}=require("./fixtures/espn-esp2-401883109-transition.json");
 assert.equal(status(live.status.type),"LIVE");
 assert.equal(clock(live).displayClock,"90+6'");
 assert.equal(clock(live).elapsed,90);
 assert.equal(status(finished.status.type),"FT");
 assert.equal(clock({status:{type:{detail:"11/22 - 8:30 PM"}}}).elapsed,null);
 assert.equal(status({state:"in",name:"STATUS_OVERTIME"}),"ET");
 assert.equal(status({state:"in",name:"STATUS_PENALTY_SHOOTOUT"}),"P");
});

test("ESPN precise detail clock advances from provider seconds without per-second requests",()=>{
 const source=html.slice(html.indexOf("function mamTickVisibleMatchClock"),html.indexOf("let mamTodayScoreRequest"));
 let now=100000;
 const clock={textContent:""};
 const detail={querySelector:selector=>selector===".match-head .match-time"?clock:null};
 const button={dataset:{liveSource:"espn",liveClockSecondsBase:"3795",liveClockSecondsAt:String(now),liveClockPrecise:"true",liveClockStatus:"LIVE"},closest:selector=>selector===".match.in-detail"?detail:null};
 const tick=require("node:vm").runInNewContext(source+"\n mamTickVisibleMatchClock",{Date:{now:()=>now},document:{querySelectorAll:()=>[button]}});
 now+=9000;
 tick();
 assert.equal(clock.textContent,"🔴 63:24 · Canlı");
 button.dataset.liveClockStatus="HT";
 clock.textContent="";
 now+=10000;
 tick();
 assert.equal(clock.textContent,"","HT stops the local timer");
 assert.match(html,/window\.mamLiveClockTimer=setInterval\(mamTickVisibleMatchClock,1000\)/);
 assert.match(html,/window\.mamLiveScoreTimer=setInterval\(refreshOpenLiveScore,8000\)/);
});

test("minute-only API-Football clock does not invent provider seconds",()=>{
 const seed=html.match(/function mamSeedVisibleMatchClock\([\s\S]*?\n\}/)?.[0];
 const espnClock=html.match(/function mamEspnClock\([\s\S]*?\n\}/)?.[0];
 const button={dataset:{liveSource:"api",liveId:"42",liveLeagueId:"39"},closest:()=>null};
 const context={
  Date:{now:()=>100000},
  allMatches:[{fixture:{id:"42",status:{short:"LIVE",elapsed:63,displayClock:"63'"}}}],
  mamEspnClock:require("node:vm").runInNewContext(espnClock+";mamEspnClock")
 };
 require("node:vm").runInNewContext(seed+";mamSeedVisibleMatchClock",context)(button);
 assert.equal(button.dataset.liveClockSecondsBase,undefined);
 assert.equal(button.dataset.liveClockPrecise,undefined);
});
test("a stale not-started label cannot authorize a prematch prediction after ESPN kickoff",()=>{
 const source=html.match(/function mamCanAnalyzePrematch\([\s\S]*?\n\}/)?.[0];
 const eligible=require("node:vm").runInNewContext(source+"\n mamCanAnalyzePrematch");
 const {fixture}=require("./fixtures/espn-esp2-401883109-transition.json");
 const at=Date.parse(fixture.date);
 assert.equal(eligible("NS",fixture.date,at-1000),true);
 assert.equal(eligible("NS",fixture.date,at),false);
 assert.equal(eligible("NS",fixture.date,at+1000),false);
 assert.equal(eligible("TBD",fixture.date,at-1000),false);
 assert.equal(eligible("NS",fixture.date.slice(0,10),at-1000),false);
});

test("ESPN rejects placeholder and malformed scores while keeping provider zero",()=>{
 const source=html.match(/function mamEspnGoal\([\s\S]*?\n\}/)?.[0];
 const score=require("node:vm").runInNewContext(source+";mamEspnGoal");
 for(const value of [null,undefined,""," ",false,-1,"-1",0.5,"1.5","4e1",Infinity,{}])assert.equal(score(value),null);
 for(const value of [0,"0",{value:0},{displayValue:"0"}])assert.equal(score(value),0);
 assert.equal(score({value:2,displayValue:"2"}),2);
});

test("ESPN stoppage time and exact known status survive the real parser",()=>{
 const status=html.match(/function mamEspnStatus\([\s\S]*?\n\}/)?.[0];
 const clock=html.match(/function mamEspnClock\([\s\S]*?\n\}/)?.[0];
 const parse=require("node:vm").runInNewContext(status+clock+";[mamEspnStatus,mamEspnClock]");
 assert.equal(parse[0](null,{state:"in",name:"STATUS_HALFTIME"}),"HT");
 assert.equal(parse[0]({state:"post",name:"STATUS_FINAL_PEN"}),"PEN");
 assert.equal(parse[1]({status:{displayClock:"90'+10'"}}).displayClock,"90+10'");
 assert.equal(parse[1]({status:{clock:2129}}).elapsed,35,"numeric ESPN clock seconds produce the current elapsed minute");
 assert.equal(parse[1]({competitions:[{status:{clock:540}}]}).displayClock,"9'");
 assert.equal(parse[1]({status:{displayClock:"2'",clock:2129}}).displayClock,"35:29","a stale display label cannot mask a newer numeric ESPN clock");
 assert.equal(parse[1]({status:{displayClock:"90'+2'",clock:5400}}).displayClock,"90+2'","stoppage time remains authoritative at the same base minute");
 assert.equal(parse[1]({status:{displayClock:"20'"},competitions:[{status:{displayClock:"26'"}}]}).displayClock,"26'","the newer competition display clock wins over stale event status");
 assert.equal(parse[1]({status:{clock:1200},competitions:[{status:{clock:1575}}]}).displayClock,"26:15","all numeric status clocks are compared, not only the first valid one");
 assert.equal(parse[1]({status:{clock:null}}).elapsed,null);
 assert.equal(parse[1]({status:{displayClock:"Nov 23, 2026"}}).elapsed,null);
});

test("ESPN precise provider seconds are retained for a local one-second display tick",()=>{
 const clock=html.match(/function mamEspnClock[\s\S]*?\n\}/)?.[0];
 const parse=require("node:vm").runInNewContext(clock+";mamEspnClock");
 const display=parse({status:{displayClock:"26:15"}});
 assert.equal(display.displayClock,"26:15");assert.equal(display.elapsed,26);assert.equal(display.elapsedSeconds,1575);assert.equal(display.precise,true);
 const minute=parse({status:{displayClock:"26'"}});
 assert.equal(minute.displayClock,"26'");assert.equal(minute.elapsed,26);assert.equal(minute.elapsedSeconds,null);assert.equal(minute.precise,false);
 const numeric=parse({status:{clock:1575}});
 assert.equal(numeric.displayClock,"26:15");assert.equal(numeric.elapsed,26);assert.equal(numeric.elapsedSeconds,1575);assert.equal(numeric.precise,true);
 const direct=parse({status:{elapsedSeconds:1575}});
 assert.equal(direct.displayClock,"26:15");assert.equal(direct.elapsedSeconds,1575);assert.equal(direct.precise,true);
});

test("active detail refresh clears an old elapsed minute when neither fresh provider supplies a clock",()=>{
 const start=html.indexOf("async function refreshActiveMatchScore()"),end=html.indexOf("\n\n",start);
 const detail=html.slice(start,end);
 assert.match(detail,/const safeElapsed=clock\.elapsed!=null\?clock\.elapsed:Number\.isFinite\(apiElapsed\)/);
 assert.doesNotMatch(detail,/existingStatus\.elapsed!=null\?existingStatus\.elapsed/);
 assert.match(detail,/apiElapsed=apiStatus\.elapsed==null\|\|apiStatus\.elapsed===""\?NaN:Number\(apiStatus\.elapsed\)/);
 assert.match(detail,/displayClock=clock\.displayClock\|\|String\(freshApi\?apiStatus\.displayClock/);
});

test("live clock keeps precise seconds while minute-only providers do not invent them",()=>{
 const tick=html.match(/function mamTickVisibleMatchClock\(\)[\s\S]*?\n\}/)?.[0];
 const refresh=html.match(/async function refreshActiveMatchScore\(\)[\s\S]*?\n\}/)?.[0];
 assert.match(tick,/liveClockSecondsBase/);
 assert.match(tick,/liveClockPrecise!=="true"/);
 assert.match(tick,/SUSP.*INT.*FT/);
 assert.match(tick,/Math\.floor\(elapsed\/60\)/);
 assert.match(refresh,/rawProviderSeconds!==null&&rawProviderSeconds!==undefined/);
 assert.match(refresh,/\["SUSP","INT"\]\.includes\(statusShort\)/);
 assert.match(refresh,/button\.dataset\.liveClockStatus=statusShort/);
 assert.match(refresh,/delete button\.dataset\.liveClockSecondsBase/);
});

test("live statistics merge preserves verified sides when a refresh omits fields",()=>{
 const source=html.match(/function mamMergeLiveStatsRows\([\s\S]*?\n\}/)?.[0];
 const merge=require("node:vm").runInNewContext(source+";mamMergeLiveStatsRows");
 const result=merge([["Toplam şut","12","—"],["Korner","3","4"]],[["Toplam şut","10","8"],["İsabetli şut","2","1"]]);
 assert.equal(JSON.stringify(result),JSON.stringify([
  ["Toplam şut","12","8"],["İsabetli şut","2","1"],["Korner","3","4"]
 ]));
});

test("live analysis auto-refresh is throttled and only runs after the user opens it",()=>{
 const helper=html.match(/function mamMaybeRefreshLiveAnalysis\([\s\S]*?\n\}/)?.[0];
 assert.match(helper,/liveAnalysisOpen!=="true"/);
 assert.match(helper,/now-last<15000/);
 assert.match(helper,/analyzeLiveMatch\(button\)/);
 assert.match(html,/button\.dataset\.liveAnalysisOpen="true"/);
});

test("live screen keeps previous-Istanbul-day matches after midnight while date screens remain day-scoped",()=>{
 const render=html.slice(html.indexOf("function renderMatches()"),html.indexOf("\nfunction mamRenderMatchCard",html.indexOf("function renderMatches()")));
 assert.match(render,/if\(mamScreenMode==="live"\)list=list\.filter\(m=>navigator\.onLine!==false&&liveCodes\.has\(mamCanonicalMatchStatus\(m\)\)\);/);
 assert.match(render,/if\(mamScreenMode==="today"\)[\s\S]*?mamIstanbulDay\(m\.fixture\?\.date\)===selectedDay/);
 assert.match(render,/if\(mamScreenMode==="upcoming"\)[\s\S]*?day===selectedDay/);
 assert.match(render,/if\(mamScreenMode==="finished"\)list=list\.filter\(m=>mamIstanbulDay\(m\.fixture\?\.date\)===selectedDay/);
});

test("SportScore live statistics use the worker widget detail route",()=>{
 const stats=html.match(/async function mamSportScoreLiveStats\([\s\S]*?\n\}/)?.[0];
 assert.match(stats,/base\+"match\/\?sport=football&slug=/);
 assert.doesNotMatch(stats,/base\+"match\?sport=football&slug=/);
});

test("SportScore live matches expose the existing analysis engine and reuse its provider stats",()=>{
 const render=html.slice(html.indexOf("function renderMatches()"),html.indexOf("\nfunction mamRenderMatchCard",html.indexOf("function renderMatches()")));
 const analysis=html.slice(html.indexOf("async function analyzeLiveMatch"),html.indexOf("\nfunction factorialLive",html.indexOf("async function analyzeLiveMatch")));
 assert.match(render,/startsWith\("sportscore-"\).*liveAnalyzeBtn/);
 assert.match(render,/data-live-source="\'\+\(isSportScore\?"sportscore"/);
 assert.match(analysis,/source==="sportscore"/);
 assert.match(analysis,/mamSportScoreLiveStats\(button\)/);
 assert.match(analysis,/factorialLive/);
});

test("opening a live match seeds provider precise seconds without per-second requests",()=>{
 const seed=html.match(/function mamSeedVisibleMatchClock\([\s\S]*?\n\}/)?.[0];
 assert.match(seed,/providerClock\.elapsedSeconds/);
 assert.match(seed,/liveClockSecondsBase/);
 assert.match(html,/window\.mamLiveClockTimer=setInterval\(mamTickVisibleMatchClock,1000\)/);
 assert.match(html,/window\.mamLiveScoreTimer=setInterval\(refreshOpenLiveScore,8000\)/);
});

test("real ESPN historical and monthly fixtures use exact team IDs across Istanbul month boundaries",async()=>{
 const methods=["mamEspnStatus","mamEspnGoal","mamFixtureInstant","mamIstanbulDateString","mamIstanbulDay","mamHasCompletedScore","mamCanonicalMatchStatus","mamIsFutureUnplayed","mamEspnProfileFixtures","mamSearchEspnProfile"];
 const js=methods.map(name=>html.match(new RegExp("(?:async )?function "+name+"\\([\\s\\S]*?\\n\\}"))?.[0]).join("\n");
 const sample=require("./fixtures/espn-arsenal-profile-20261123.json");
 const fake=structuredClone(sample.scoreboards["202612"].events[0]);
 const target=fake.competitions[0].competitors.find(team=>team.team.id==="359");
 target.team.id="999";
 fake.id="99999";
 sample.scoreboards["202612"].events.push(fake);
 const starts=Date.parse("2026-11-23T06:00:00Z"),urls=[];
 const context={ESPN_LEAGUES:{"39":{slug:"eng.1",name:"Premier League",country:"England"}},qs:x=>new URLSearchParams(x),
  api:async request=>{urls.push(request);return request.includes("schedule")?sample.schedule:sample.scoreboards[new URLSearchParams(request.split("?")[1]).get("dates")];}};
 const load=require("node:vm").runInNewContext(js+";mamSearchEspnProfile",context);
 const result=await load("359","39",starts);
 assert.equal(result.recent[0].goals.home,2);
 assert.equal(result.recent[0].goals.away,2);
 assert.ok(result.upcoming.some(m=>m.teams.home.name==="Arsenal"&&m.teams.away.name==="Manchester City"));
 assert.ok(result.upcoming.some(m=>m.fixture.date.startsWith("2026-12-")));
 assert.ok(result.upcoming.every(m=>m.fixture.id!=="espn-eng.1-99999"&&m.goals.home===null&&m.goals.away===null));
 assert.deepEqual(urls,["espn/eng.1/teams/359/schedule?season=2026","espn/eng.1/scoreboard?dates=202611&limit=500","espn/eng.1/scoreboard?dates=202612&limit=500"]);
});

test("source kickoffs keep the Istanbul date, respect European DST and reject ambiguous times",()=>{
 const methods=["mamExplicitUtc","mamFixtureInstant","mamIstanbulDateString","mamIstanbulDay","mamKickoffTime","mamZonedKickoff"];
 const js=methods.map(name=>html.match(new RegExp("function "+name+"\\([\\s\\S]*?\\n\\}"))[0]).join("\n");
 const time=require("node:vm").runInNewContext(js+";({mamExplicitUtc,mamIstanbulDay,mamKickoffTime,mamZonedKickoff})");
 assert.equal(time.mamExplicitUtc("2026-11-23 17:00:00"),"2026-11-23T17:00:00Z");
 assert.equal(time.mamKickoffTime({date:"2026-11-23T17:00Z"}),"20:00");
 assert.equal(time.mamIstanbulDay("2026-11-23T22:30Z"),"2026-11-24");
 assert.equal(time.mamKickoffTime({date:"2026-11-23T19:30-03:00"}),"01:30");
 assert.equal(time.mamZonedKickoff("2026-07-18","21:00","Europe/Madrid"),"2026-07-18T19:00:00.000Z");
 assert.equal(time.mamZonedKickoff("2026-11-23","21:00","Europe/Paris"),"2026-11-23T20:00:00.000Z");
 assert.equal(time.mamZonedKickoff("2026-03-29","02:30","Europe/Paris"),"");
 assert.equal(time.mamZonedKickoff("2026-10-25","02:30","Europe/Madrid"),"");
 assert.equal(time.mamKickoffTime({date:"2026-11-23T17:00"}),"");
 assert.equal(time.mamKickoffTime({date:"2026-11-23",timeUnknown:true}),"");
});

test("duplicate source rows preserve fixture identity and protect a verified final score",()=>{
 const groupsStart=html.indexOf("const MAM_UEFA_TEAM_GROUPS="),groupsEnd=html.indexOf(";",groupsStart)+1;
 const helpers=html.slice(groupsStart,groupsEnd)+"\n"+html.slice(html.indexOf("const mamFixtureTeamKeyBase="),html.indexOf("let mamFixtureLoadQueued="));
 const methods=["mamFixtureInstant","mamCanonicalMatchStatus","mamHasCompletedScore"];
 const js=methods.map(name=>html.match(new RegExp("function "+name+"\\([\\s\\S]*?\\n\\}"))[0]).join("\n");
 const merge=require("node:vm").runInNewContext(helpers+"\n"+js+";mamMergeFixtureRows");
 const fixture=(id,date,short,home,away,league="203")=>({fixture:{id,date,status:{short}},league:{id:league},
  teams:{home:{name:id.startsWith("espn")?"Çorum FK":"Corum"},away:{name:"Rakip"}},goals:{home,away}});
 const kickoff="2026-11-23T17:00Z";
 const result=merge([fixture("15",kickoff,"NS",null,null),
  fixture("espn-tur.1-17","2026-11-23T20:00+03:00","1H",1,0),
  fixture("espn-tur.1-17",kickoff,"FT",2,1),
  fixture("espn-tur.1-17",kickoff,"NS",0,0),
  fixture("espn-tur.1-99","2026-12-01T17:00Z","NS",null,null),
  fixture("espn-tur.cup-17",kickoff,"NS",null,null,"204")]);
 assert.equal(result.length,3);
 assert.equal(result[0].fixture.id,"15");
 assert.equal(result[0].fixture.status.short,"FT");
 assert.equal(result[0].goals.home,2);
 assert.equal(result[0].goals.away,1);
});

test("fallback sources reject malformed live feeds and do not invent a kickoff or live status",async()=>{
 const methods=["mamExplicitUtc","mamFixtureInstant","mamSportScoreMatchSlug","mamSportScoreKickoff","footballDataLiveFixtures","mamSportScoreLiveFixtures"];
 const js=methods.map(name=>html.match(new RegExp("(?:async )?function "+name+"\\([\\s\\S]*?\\n\\}"))[0]).join("\n");
 let footballData={},sportScore={};
 const {footballDataLiveFixtures,sportScoreLiveFixtures}=require("node:vm").runInNewContext(js+";({footballDataLiveFixtures,sportScoreLiveFixtures:mamSportScoreLiveFixtures})",{
  WORKER:"https://example.test",qs:x=>new URLSearchParams(x),api:async()=>footballData,
  fetch:async()=>({ok:true,json:async()=>sportScore}),
  localStorage:{getItem:()=>null,setItem:()=>{}}
 });
 await assert.rejects(footballDataLiveFixtures(),/geçersiz/);
 await assert.rejects(sportScoreLiveFixtures(),/geçersiz/);
 footballData={matches:[{id:1,utcDate:"2026-11-23T17:00:00",homeTeam:{name:"Ev"},awayTeam:{name:"Rakip"}}]};
 const [footballMatch]=await footballDataLiveFixtures();
 assert.equal(footballMatch.fixture.status.short,"");
 assert.equal(footballMatch.fixture.date,"2026-11-23T17:00:00Z");
 sportScore={matches:[{id:1,status:"live",time:"20:00",home:"Ev",away:"Rakip"},
  {id:2,status:"live",date:"2026-11-23",home:"Tarihsiz",away:"Rakip"},
  {id:3,status:"live",utc_date:"2026-11-23 17:00:00",home:"Ev",away:"Rakip"}]};
 const parsed=await sportScoreLiveFixtures();
 assert.equal(parsed.length,1,"incomplete time-only and date-only event rows are rejected");
 assert.equal(parsed[0].fixture.date,"2026-11-23T17:00:00Z","explicit UTC provider field is normalized without guessing a local timezone");
 assert.equal(parsed[0].fixture.timeUnknown,false);
});
