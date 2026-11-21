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
assert.match(html, /mam_history_v76_/, "Provider-scoped history cache missing");
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
assert.match(html, /list=list\.filter\(m=>\["NS","TBD"\]\.includes\(mamCanonicalMatchStatus\(m\)\)\)/, "Today must show only not-started fixtures");
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
