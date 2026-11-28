import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import MAMTeamIdentity from "../team-identity-registry.js";

const source=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const realLeagueSamples=JSON.parse(readFileSync(new URL("./fixtures/wp0-real-league-samples.json",import.meta.url),"utf8"));
const leagueMapStart=source.indexOf("const ESPN_LEAGUES={");
const leagueMapEnd=source.indexOf("};",leagueMapStart)+2;
const identityStart=source.indexOf("const mamFixtureTeamKeyBase=");
const identityEnd=source.indexOf("function mamFixturePair(",identityStart);
const start=source.indexOf("const MAM_UEFA_TEAM_GROUPS=");
const end=source.indexOf("// D1 kalıcı maç arşivi",start);
const compStart=source.indexOf("function mamCanonicalFixtureLeagueId(");
const compEnd=source.indexOf("function mamMergeFixtureSources(",compStart);
const matchStart=source.indexOf("function mamFixtureProviderKeys(");
const matchEnd=source.indexOf("function mamSameLiveProviderFixture(",matchStart);
const api=vm.runInNewContext(`${source.slice(leagueMapStart,leagueMapEnd)}\n${source.slice(identityStart,identityEnd)}\n${source.slice(compStart,compEnd)}\n${source.slice(matchStart,matchEnd)}\n${source.slice(start,end)};({mamFixtureTeamKey,mamCanonicalHistoryTeamKey,mamHistoricalIdentity,mamSameRealMatch,mamDeduplicateHistoricalMatches,mamHistoryCompetitionAllowed})`,{
  MAMTeamIdentity,
  mamFixtureInstant:value=>Date.parse(value), mamIstanbulDay:value=>{const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(d):"";},
  MAMActiveLeagueScope:{leagueIdFor:match=>{
    const id=String(match?.league?.id||match?.leagueId||"").trim();if(id)return id;
    const name=String(match?.league?.name||"");return /Europa League/i.test(name)?"3":/Champions League/i.test(name)?"2":/Süper Lig/i.test(name)?"203":"";
  }}
});
const statsStart=source.indexOf("function mamParseEspnTeamStatistics");
const statsEnd=source.indexOf("const mamStatsInflight",statsStart);
const parseStats=vm.runInNewContext(`${source.slice(statsStart,statsEnd)};mamParseEspnTeamStatistics`);

test("Maccabi Tel-Aviv ad varyantları aynı geçmiş maç kimliğinde birleşir",()=>{
  assert.equal(api.mamCanonicalHistoryTeamKey("Maccabi Tel-Aviv"),api.mamCanonicalHistoryTeamKey("M. Tel-Aviv"));
  const rows=[
    {fixture:{id:"a",date:"2026-09-01T18:00:00Z"},league:{name:"UEFA Europa League"},teams:{home:{name:"Maccabi Tel-Aviv"},away:{name:"Besiktas"}},goals:{home:1,away:0},mamSource:"espn"},
    {fixture:{id:"b",date:"2026-09-01T18:00:00Z"},league:{name:"UEFA Europa League"},teams:{home:{name:"M. Tel-Aviv"},away:{name:"Beşiktaş"}},goals:{home:1,away:0},mamSource:"archive"}
  ];
  assert.equal(api.mamDeduplicateHistoricalMatches(rows).length,1);
});

test("WP0 gerçek-veri örnekleri 16 organizasyonda kimliği ve kaynaklar arası tekilleştirmeyi doğrular",()=>{
  assert.equal(realLeagueSamples.organizations.length,16);
  const ids=new Set();let independentProviderPairs=0,upcomingCount=0;
  for(const sample of realLeagueSamples.organizations){
    const leagueId=String(sample.organization.id);assert.ok(!ids.has(leagueId),`duplicate organization ${leagueId}`);ids.add(leagueId);
    const rows=sample.archiveSample.map(row=>({...row,mamArchiveOnly:true}));
    assert.ok(rows.length>=1,`${leagueId} must use an actual archived match`);
    for(const row of rows){
      assert.equal(String(row.league?.id),leagueId);
      assert.ok(api.mamFixtureTeamKey(row.teams?.home?.name),`${leagueId} home identity must resolve`);
      assert.ok(api.mamFixtureTeamKey(row.teams?.away?.name),`${leagueId} away identity must resolve`);
      assert.ok(api.mamHistoricalIdentity(row),`${leagueId} actual history record must have an identity`);
      assert.equal(api.mamHistoryCompetitionAllowed(row,leagueId),true,`${leagueId} must accept its own archive record`);
    }
    if(sample.sameDayProviderOverlap){
      assert.equal(rows.length,2,`${leagueId} overlap sample must be a reviewed provider pair`);
      assert.notEqual(String(rows[0].mamSource).toLowerCase(),String(rows[1].mamSource).toLowerCase());
      assert.equal(api.mamSameRealMatch(rows[0],rows[1]),true,`${leagueId} real provider pair should identify one match`);
      assert.equal(api.mamDeduplicateHistoricalMatches(rows).length,1,`${leagueId} real provider pair should deduplicate`);
      independentProviderPairs++;
    }
    if(sample.upcomingSample){
      const event=sample.upcomingSample.event;
      assert.ok(event?.id&&event?.date&&event?.homeName&&event?.awayName,`${leagueId} upcoming fixture must be a real captured event`);
      assert.equal(String(event.state).toLowerCase()==="pre"||String(event.status).toLowerCase()==="scheduled",true);
      upcomingCount++;
    }
  }
  assert.ok(independentProviderPairs>=8,`expected several independently sourced real pairs; got ${independentProviderPairs}`);
  assert.equal(upcomingCount,9,"captured public ESPN snapshot contains real upcoming fixtures in nine organizations; no event is fabricated for the rest");
});

test("Avrupa Ligi geçmişi Süper Lig veya Şampiyonlar Ligi kaydını kabul etmez",()=>{
  assert.equal(api.mamHistoryCompetitionAllowed({mamSource:"football-data-team",league:{name:"UEFA Europa League"}},"3"),true);
  assert.equal(api.mamHistoryCompetitionAllowed({mamSource:"football-data-team",league:{name:"Türkiye Süper Lig"}},"3"),false);
  assert.equal(api.mamHistoryCompetitionAllowed({mamSource:"football-data-team",league:{name:"UEFA Champions League"}},"3"),false);
  assert.equal(api.mamHistoryCompetitionAllowed({league:{id:"203",name:"Türkiye Süper Lig"}},"3"),false);
});

test("ESPN takım istatistiği toplam şut ve isabetli şutu ayrı okur",()=>{
  const parsed=parseStats({statistics:[
    {name:"totalShots",displayValue:"16"},
    {name:"shotsOnTarget",displayValue:"4"},
    {name:"corners",displayValue:"4"}
  ]});
  assert.equal(parsed.shots,16);
  assert.equal(parsed.shotsOnTarget,4);
  assert.equal(parsed.corners,4);
});

test("Gerçek ESPN Hapoel–OFI event 401915532 şut değerleri 16–11 ve 4–3",async()=>{
  const response=await fetch("https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.europa/summary?event=401915532");
  assert.equal(response.status,200);
  const payload=await response.json();
  const teams=payload.boxscore?.teams||[];
  assert.equal(teams.length>=2,true);
  const stats=teams.map(team=>({name:team.team?.displayName,values:parseStats(team)}));
  assert.deepEqual(stats.map(row=>row.values.shots),[16,11]);
  assert.deepEqual(stats.map(row=>row.values.shotsOnTarget),[4,3]);
});

test("Son 10 benzersiz tamamlanmış maç ve Poisson akışı korunur",()=>{
  assert.match(source,/saved\.matches\.length<10/);
  assert.match(source,/output\.length<10/);
  assert.match(source,/poisson/i);
  assert.match(source,/mamDeduplicateHistoricalMatches\(output\)/);
});
