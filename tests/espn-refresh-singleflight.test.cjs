'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('async function espnFixtures(date,includeAllLeagues=false){');
const end=html.indexOf('async function loadMatches(){',start);
assert.ok(start>=0&&end>start,'real app ESPN scoreboard implementation required');
const captured=require('./fixtures/espn-tur1-20261122.json');
function harness(api){
 const storage=new Map();
 const context={
  $:()=>({value:'203'}),
  ESPN_LEAGUES:{203:{slug:'tur.1',name:'Süper Lig',country:'Türkiye'}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  qs:q=>new URLSearchParams(q).toString(),
  mamEspnClock:()=>({elapsed:null,displayClock:''}),
  api,
  setTimeout:(resolve)=>resolve(),
  console:{warn(){}},
 };
 return {load:vm.runInNewContext(html.slice(start,end)+';espnFixtures',context,{timeout:1000}),storage};
}
test('two simultaneous live/today reads of same ESPN league/day use one upstream request',async()=>{
 let calls=0,finish;
 const {load}=harness(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
 const first=load('2026-11-22'),second=load('2026-11-22');
 await Promise.resolve();
 assert.equal(calls,1);
 finish(captured);
 const [a,b]=await Promise.all([first,second]);
 assert.equal(a.length,4);assert.equal(b.length,4);
});
test('one transient ESPN HTTP 503 retries once then succeeds',async()=>{
 let calls=0;const {load}=harness(async()=>{calls++;if(calls===1)throw Error('HTTP 503 temporarily unavailable');return captured;});
 assert.equal((await load('2026-11-22')).length,4);
 assert.equal(calls,2);
});
test('ESPN 429 quota response is never automatically retried',async()=>{
 let calls=0;const {load}=harness(async()=>{calls++;throw Error('HTTP 429 quota exceeded');});
 await assert.rejects(load('2026-11-22'),/ESPN sonuçları/);
 assert.equal(calls,1);
});
test('malformed success payload cannot masquerade as empty league and cannot enter cache',async()=>{
 let calls=0;const {load,storage}=harness(async()=>{calls++;return {message:'bad payload'};});
 await assert.rejects(load('2026-11-22'),/ESPN sonuçları/);
 assert.equal(calls,1);assert.equal(storage.size,0);
});
test('repeated transient failures are bounded at two attempts',async()=>{
 let calls=0;const {load}=harness(async()=>{calls++;throw Error('HTTP 503 outage');});
 await assert.rejects(load('2026-11-22'),/ESPN sonuçları/);
 assert.equal(calls,2);
});
test('valid no-match ESPN scoreboard is an empty success, not a provider error',async()=>{
 let calls=0;const {load}=harness(async()=>{calls++;return {events:[]};});
 const result=await load('2026-11-22');
 assert.equal(result.length,0);assert.equal(calls,1);
});
test('short-lived ESPN match cache prevents immediate extra reads',async()=>{
 let calls=0;const {load}=harness(async()=>{calls++;return captured;});
 assert.equal((await load('2026-11-22')).length,4);
 assert.equal((await load('2026-11-22')).length,4);
 assert.equal(calls,1);
});
