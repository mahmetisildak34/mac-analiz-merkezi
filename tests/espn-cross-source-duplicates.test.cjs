'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function mamCanonicalMatchStatus(match){');
const end=html.indexOf('function mamIstanbulDay(value){',start);
assert.ok(start>=0&&end>start,'real match deduplicator must exist');
const dedupe=vm.runInNewContext(html.slice(start,end)+';mamDeduplicateFixtures',{Intl,Date,Number,String,Array},{timeout:1000});
function fixture(id,home,away,{status='NS',date='2026-11-22T16:00:00Z',league=203,goals=null}={}){
 return {fixture:{id,date,status:{short:status}},league:{id:league},teams:{home:{name:home},away:{name:away}},goals:goals||{home:null,away:null}};
}
const clean=fixture('espn-tur.1-123','Trabzonspor','Eyüpspor',{goals:{home:0,away:0}});
const damaged=fixture(987,'TRABZONSPOR','EY\uFFFDPSPOR');
test('real screenshot: corrupted duplicate from another source collapses',()=>{
 const result=dedupe([damaged,clean]);
 assert.equal(result.length,1);
 assert.equal(result[0].fixture.id,'espn-tur.1-123');
 assert.equal(result[0].teams.away.name,'Eyüpspor');
 assert.equal(result[0].goals.home,0);
});
test('clean ESPN record is preferred independent of source order',()=>{
 const result=dedupe([clean,damaged]);
 assert.equal(result.length,1);
 assert.equal(result[0].fixture.id,'espn-tur.1-123');
});
test('genuine same-time different clubs are retained',()=>{
 const result=dedupe([clean,fixture(4,'Trabzonspor','Fenerbahçe')]);
 assert.equal(result.length,2);
});
test('one corrupted character does not allow different opponents',()=>{
 const result=dedupe([clean,fixture(5,'TRABZONSPOR','E\uFFFDZURUMSPOR')]);
 assert.equal(result.length,2);
});
test('different league is not merged even with damaged team name',()=>{
 const result=dedupe([clean,fixture(6,'TRABZONSPOR','EY\uFFFDPSPOR',{league:204})]);
 assert.equal(result.length,2);
});
test('different kickoff is not merged even with identical teams',()=>{
 const result=dedupe([clean,fixture(7,'TRABZONSPOR','EY\uFFFDPSPOR',{date:'2026-11-22T16:11:00Z'})]);
 assert.equal(result.length,2);
});
test('missing club identity is never merged',()=>{
 const result=dedupe([clean,fixture(8,'','EY\uFFFDPSPOR')]);
 assert.equal(result.length,2);
});
test('live state outranks an unplayed clean record',()=>{
 const live=fixture(9,'TRABZONSPOR','EY\uFFFDPSPOR',{status:'LIVE',goals:{home:1,away:0}});
 const result=dedupe([clean,live]);
 assert.equal(result.length,1);
 assert.equal(result[0].fixture.status.short,'LIVE');
});
test('two clean sources with different identities remain separate',()=>{
 const result=dedupe([clean,fixture(10,'Trabzonspor','Eyüpspor B')]);
 assert.equal(result.length,2);
});
test('same ID but conflicting real opponents never merges',()=>{
 const result=dedupe([clean,fixture('espn-tur.1-123','Trabzonspor','Fenerbahçe')]);
 assert.equal(result.length,2);
});
