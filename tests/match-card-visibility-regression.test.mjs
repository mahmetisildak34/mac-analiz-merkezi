import {runInNewContext} from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const render=source.slice(source.indexOf('function renderMatches(){'),source.indexOf('function renderMatches(){')+18000);
test('upcoming uses shared clickable match-card renderer instead of dead-end fixture rows',()=>{
 assert.doesNotMatch(render,/mam-fixture-analyze/);
 assert.doesNotMatch(render,/mam-fixture-row/);
 assert.match(render,/mamScreenMode==="upcoming"/);
});
test('live no-results branch preserves non-live fixtures for all screens',()=>{
 const live=source.slice(source.indexOf('function loadLiveMatchesNow(){'),source.indexOf('async function mamSportScoreLiveStats('));
 assert.match(live,/publishLiveSnapshot\(\[\]\);/);
 assert.doesNotMatch(live,/if\(mamScreenMode==="live"\)allMatches=\[\];\s*renderMatches\(\);/);
});

test('known provider aliases collapse to one fixture without combining unrelated games',()=>{

 const start=source.indexOf('const mamFixtureTeamKey=value=>');
 const end=source.indexOf('let mamFixtureLoadQueued=false;',start);
 assert.ok(start>0&&end>start);
 const snippet=source.slice(start,end);
 const create=(id,home,away,date='2026-11-23T17:00:00Z',league='203')=>({
  fixture:{id,date,status:{short:'NS'}},league:{id:league},
  teams:{home:{name:home},away:{name:away}},goals:{home:null,away:null}
 });
 const context={mamFixtureInstant:value=>Date.parse(value),mamCanonicalMatchStatus:()=> 'NS',mamHasCompletedScore:()=>false};
 runInNewContext(snippet+';globalThis.mergeFixtureRows=mamMergeFixtureRows;',context);
 const rows=[
  create('espn-401888370','İstanbul Başakşehir','Çorum FK'),
  create('source-2','�STANBUL BA�AK�EH�R FK','ARCA �ORUM FK'),
  create('source-3','Başakşehir','Çorum FK')
 ];
 assert.equal(context.mergeFixtureRows(rows).length,1);
 assert.equal(context.mergeFixtureRows(rows)[0].teams.home.name,'İstanbul Başakşehir');
 assert.equal(context.mergeFixtureRows([create('a','Başakşehir','Çorum FK'),create('b','Başakşehir','Çorum FK','2026-11-24T17:00:00Z')]).length,2);
 assert.equal(context.mergeFixtureRows([create('a','Başakşehir','Çorum FK'),create('b','Başakşehir','Çorum FK','2026-11-23T17:00:00Z','204')]).length,2);
 const corruptedFirst=context.mergeFixtureRows([rows[1],rows[0]]);
 assert.equal(corruptedFirst[0].teams.home.name,'İstanbul Başakşehir');
 assert.equal(corruptedFirst[0].fixture.id,'source-2');
});
