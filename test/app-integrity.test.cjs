const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const html = fs.readFileSync("index.html", "utf8");

function blockAfter(source, marker, endMarker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, "Missing source marker: " + marker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, "Missing end marker for: " + marker);
  return source.slice(start, end);
}

const competitionBlock = blockAfter(html, "const standingCompetitions=[", "\n ];");
const competitionIds = [...competitionBlock.matchAll(/\{id:"(\d+)"/g)].map(x => x[1]);
assert.equal(competitionIds.length, 40, "Expected 40 configured competitions");
assert.equal(new Set(competitionIds).size, competitionIds.length, "Duplicate competition IDs");

const espnBlock = blockAfter(html, "const ESPN_LEAGUES={", "\n};");
const espnIds = [...espnBlock.matchAll(/^\s*"(\d+)":\{/gm)].map(x => x[1]);
assert.equal(espnIds.length, 39, "Expected 39 numeric ESPN league mappings");
assert.equal(new Set(espnIds).size, espnIds.length, "Duplicate ESPN league mappings");
assert.deepEqual(
  competitionIds.filter(id => id !== "206").sort(),
  espnIds.slice().sort(),
  "ESPN mappings must cover every configured competition except the known Turkish Cup gap"
);
assert.ok(competitionIds.includes("206"), "Turkish Cup must remain selectable");
assert.ok(!espnIds.includes("206"), "Do not invent an unverified Turkish Cup ESPN slug");
assert.match(html, /"9":\{slug:"conmebol\.america"/, "Copa América ESPN slug must be corrected");

assert.match(html, /api\("espn\/".*?\/teams\?/, "ESPN team-directory fallback missing");
assert.match(html, /api\("teams\?"\+qs\(\{league:leagueId,season\}\)\)/, "API-Football team-directory fallback missing");
assert.match(html, /teamSource==="api-football"/, "Provider-aware history/future fallback missing");
assert.match(html, /fixtures\?"\+qs\(\{team:teamId,next:20/, "API-Football upcoming fixtures fallback missing");
assert.match(html, /mam_history_v79_/, "Provider-scoped history cache missing");
assert.match(html, /teamSource="football-data"/, "Football-data standings provider is not identified");
assert.match(html, /Football-data takım geçmişi:/, "Football-data team-history fallback missing");
assert.match(html, /ESPN yedek geçmişi:/, "ESPN team-history fallback missing");
assert.match(html, /mamSportScoreTeamSchedule\(teamName\)/, "SportScore team-history fallback missing");
assert.match(html, /data-team-source=/, "Selected provider is not carried into team rows");
assert.match(html, /const teamSource=row\.dataset\.teamSource/, "Selected provider is not read when opening team history");

assert.match(html, /id="mamTodayHeader"/, "Dedicated daily fixtures section missing");
assert.match(html, /data-mam-action="today"/, "Homepage daily matches shortcut missing");
assert.match(html, /data-mam-action="upcoming"/, "Homepage upcoming matches shortcut missing");
assert.match(html, /id="mamTodayTabs"/, "Dedicated daily match filter tabs missing");
assert.match(html, /data-today-filter="finished"/, "Finished matches tab missing");
assert.match(html, /function mamIsFutureUnplayed\(match,now=Date\.now\(\)\)/, "Future kickoff status guard missing");
assert.match(html, /stamp>now/, "Past kickoff must not remain upcoming");
assert.match(html, /mamIstanbulDay\(m\.fixture\?\.date\)===selectedDay/, "Today must use Istanbul calendar day");
assert.match(html, /const day=mamIstanbulDay\(m\.fixture\?\.date\);\s*return day===selectedDay&&mamIsFutureUnplayed\(m,mamNow\)/, "Upcoming must use the selected Istanbul day and include its remaining fixtures");
assert.match(html, /main\.mam-screen-today #mamTodayTabs\{display:none!important\}/, "Redundant daily subfilter must be hidden");
assert.match(html, /if\(mamScreenMode==="live"\)list=list\.filter/, "Live match screen filtering missing");
assert.match(html, /if\(mamScreenMode==="finished"\)list=list\.filter/, "Finished match screen filtering missing");
assert.match(html, /const groupedMatches=\[\.\.\.list\.reduce\(/, "Fixtures must be grouped by league");
assert.match(html, /class="mam-league-heading"/, "League heading must be shown for each fixture group");
assert.match(html, /<nav id="mamLiveNav"[^>]*>[\s\S]*?data-live-action="live"/, "Dedicated live-screen navigation is missing");
assert.match(html, /\.mam-screen-live #mamLiveNav:not\(\[hidden\]\)\{display:flex!important/, "Existing live screen shortcuts remain hidden");
assert.match(html, /function mamCanonicalMatchStatus\(match\)/, "Provider match-status normalization missing");
assert.match(html, /const mamStatusRank=m=>/, "Daily scoreboard status ordering missing");
assert.match(html, /return mamLiveMinute\(b\)-mamLiveMinute\(a\)/, "Highest live minutes must sort first");
assert.match(html, /return Date\.parse\(b\.fixture\?\.date\|\|0\)-Date\.parse\(a\.fixture\?\.date\|\|0\)/, "Finished matches must sort newest-first at the bottom");
assert.match(html, /FINISHED:"FT".*IN_PLAY:"LIVE".*PAUSED:"HT".*SCHEDULED:"NS"/, "Football-data match states are not normalized");

let checkedScripts = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  const attrs = match[1];
  const body = match[2].trim();
  if (!body) continue;
  const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.toLowerCase();
  if (type && !["text/javascript", "application/javascript", "module"].includes(type)) continue;
  new vm.Script(body, { filename: "index.html:inline-script-" + (++checkedScripts) });
}
assert.ok(checkedScripts > 0, "No inline JavaScript blocks were syntax-checked");

console.log("PASS: 40 competition entries, 39 ESPN mappings, Turkish Cup exception, fallback paths, cache version and " + checkedScripts + " inline scripts.");


// Regression: live polling must not destroy the already loaded fixture snapshot.
{
  const helperStart = html.indexOf(" const publishLiveSnapshot=liveRows=>");
  const helperEnd = html.indexOf("\n // Son başarılı canlı listeyi", helperStart);
  assert.ok(helperStart > -1 && helperEnd > helperStart, "Live fixture preservation helper must exist");
  const helper = html.slice(helperStart, helperEnd);
  const makeMatch = (id, status) => ({fixture:{id, status:{short:status}}});
  const context = {
    allMatches:[makeMatch("today","NS"),makeMatch("future","NS"),makeMatch("old-live","1H")],
    fallbackSchedule:[],
    isLive:m => m.fixture.status.short === "1H",
    renderMatches:()=>{},
    isCurrent:()=>true,
    mamMergeFixtureRows:rows=>rows,
  };
  vm.runInNewContext(helper + "\n globalThis.publish=publishLiveSnapshot;", context);
  context.publish([makeMatch("new-live","1H")]);
  assert.deepEqual(Array.from(context.allMatches,m=>m.fixture.id).sort(),["future","new-live","today"],"New live scores cannot erase scheduled matches");
  context.publish([]);
  assert.deepEqual(Array.from(context.allMatches,m=>m.fixture.id).sort(),["future","today"],"No live events cannot erase scheduled matches");
  context.fallbackSchedule=[makeMatch("espn-today","NS"),makeMatch("espn-live","1H")];
  context.publish([makeMatch("fresh-live","1H")]);
  assert.deepEqual(Array.from(context.allMatches,m=>m.fixture.id).sort(),["espn-today","fresh-live","future","today"],"ESPN schedule wins over old fixture state");
}

{
 const start=html.indexOf("async function loadLiveMatchesNow(){");
 const end=html.indexOf("async function mamSportScoreLiveStats(",start);
 const live=html.slice(start,end);
 assert.ok(live.includes("mamSaveMatchesToD1(backupLive)"),"Only confirmed Football-data live matches may reach its existing archive call");
 assert.ok(live.includes("mamSaveMatchesToD1(sportScoreLive)"),"Only confirmed SportScore live matches may reach its existing archive call");
 assert.ok(!live.includes("mamSaveMatchesToD1(allMatches)"),"Live refresh must never write the entire fixture snapshot");
 assert.ok(live.includes("combinedLive.length+\" canlı maç"),"Live count must not include preserved non-live fixtures");
}


// Directory profile IDs must win over provider-specific fixture IDs for the same club.
{
 const start=html.indexOf(" function buildTeams(){",html.indexOf('id="mamTeamSearchLogic"'));
 const end=html.indexOf(" function getTeamSearchCatalog()",start);
 assert.ok(start!==-1&&end>start,"Team-search data merger must exist");
 const source=html.slice(start,end);
 const ctx={
  allMatches:[{league:{name:"Premier League",country:"England"},teams:{home:{id:42,name:"Arsenal"},away:{id:-1,name:"Test Club"}}}],
  directory:new Map([
   ["espn:uefa.champions:359",{id:"espn:uefa.champions:359",name:"Arsenal",league:"UEFA Champions League"}],
   ["espn:eng.1:359",{id:"espn:eng.1:359",name:"Arsenal",league:"Premier League",country:"England"}],
  ]),
  ESPN_LEAGUES:["eng.1","uefa.champions"],
  FALLBACK_TEAMS:[],
  read:()=>({}),
  normalize:value=>String(value||"").toLocaleLowerCase("tr-TR"),
 };
 vm.runInNewContext(source+"\n globalThis.mergeTeams=buildTeams;",ctx);
 const merged=ctx.mergeTeams();
 const arsenal=Array.from(merged).filter(team=>team.name==="Arsenal");
 assert.equal(arsenal.length,1,"Search should not duplicate the same team");
 assert.equal(arsenal[0].id,"espn:eng.1:359","ESPN profile identity must supersede fixture-only ID");
}


// Today must include all provider-confirmed states for the selected Istanbul date.
{
 const today=blockAfter(html,' if(mamScreenMode==="today"){','\n // Today\'s scoreboard order:');
 assert.ok(today.includes("mamIstanbulDay(m.fixture?.date)===selectedDay"),"Today must match Istanbul calendar day");
 assert.match(today,/mamTodayFilter==="live"/);
 assert.match(today,/mamTodayFilter==="finished"/);
 assert.match(today,/mamTodayFilter==="upcoming"/);
 assert.ok(!today.includes("list=list.filter(m=>mamIsFutureUnplayed(m,mamNow)&&"),"Today must not discard already started fixtures");
}
