import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const start=source.indexOf("const MAM_UEFA_TEAM_GROUPS=");
const end=source.indexOf("// D1 kalıcı maç arşivi",start);
const api=vm.runInNewContext(`${source.slice(start,end)};({mamCanonicalHistoryTeamKey,mamHistoricalIdentity,mamDeduplicateHistoricalMatches,mamHistoryCompetitionAllowed})`,{
  mamFixtureTeamKey:value=>String(value||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/ı/g,"i").replace(/[^a-z0-9]/g,""),
  mamIstanbulDay:value=>String(value||"").slice(0,10)
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
