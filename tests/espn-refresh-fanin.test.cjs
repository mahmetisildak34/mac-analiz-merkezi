'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('let apiQueue=Promise.resolve();');
const end=html.indexOf('function avg(a){',start);
assert.ok(start>=0&&end>start,'real app provider client must be present');
const source=html.slice(start,end);
function client(fetchImpl){
 const values=new Map();
 const localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v))};
 const context={
  WORKER:'https://example.invalid',localStorage,fetch:fetchImpl,
  mamIstanbulDateString:()=> '2026-11-22',
  URLSearchParams,AbortController,setTimeout,clearTimeout,Promise,Map,Date,String,Number,Object,
 };
 return {api:vm.runInNewContext(source+';api',context,{timeout:1000}),localStorage};
}
const response=(status=200,payload={events:[]})=>({ok:status>=200&&status<300,status,headers:{get:()=>null},json:async()=>payload});
const endpoint='espn/tur.1/scoreboard?dates=20261122&limit=500';
test('80 concurrent refreshes of one league/date make one outbound request',async()=>{
 let calls=0,release;
 const gate=new Promise(r=>release=r);
 const {api}=client(async()=>{calls++;await gate;return response();});
 const inflight=Array.from({length:80},()=>api(endpoint));
 await Promise.resolve();
 release();
 const rows=await Promise.all(inflight);
 assert.equal(calls,1);
 assert.equal(rows.length,80);
 assert.ok(rows.every(row=>Array.isArray(row.events)));
});
test('80 repeat scoreboard reads reuse successful local cache',async()=>{
 let calls=0;
 const {api}=client(async()=>{calls++;return response();});
 await api(endpoint);
 await Promise.all(Array.from({length:80},()=>api(endpoint)));
 assert.equal(calls,1);
});
test('different ESPN slugs do not share an incorrect response',async()=>{
 let calls=0;
 const {api}=client(async()=>{calls++;return response(200,{events:[{id:calls}]});});
 const [a,b]=await Promise.all([api(endpoint),api('espn/eng.1/scoreboard?dates=20261122&limit=500')]);
 assert.equal(calls,2);
 assert.notEqual(a.events[0].id,b.events[0].id);
});
test('transient 503 is retried exactly once',async()=>{
 let calls=0;
 const {api}=client(async()=>{calls++;return calls===1?response(503,{error:'gateway'}):response();});
 const result=await api(endpoint);
 assert.equal(calls,2);
 assert.equal(result.events.length,0);
});
test('repeated 503 gives a bounded failure instead of infinite retries',async()=>{
 let calls=0;
 const {api}=client(async()=>{calls++;return response(503,{error:'gateway'});});
 await assert.rejects(api(endpoint));
 assert.equal(calls,2);
});
test('429 rate limiting never causes an automatic retry storm',async()=>{
 let calls=0;
 const {api}=client(async()=>{calls++;return response(429,{error:'rate limit'});});
 await assert.rejects(api(endpoint),/İstek sınırı/);
 assert.equal(calls,1);
});
test('malformed JSON is never retried as a transient gateway failure',async()=>{
 let calls=0;
 const {api}=client(async()=>{calls++;return {ok:true,status:200,headers:{get:()=>null},json:async()=>{throw Error('broken')}};});
 await assert.rejects(api(endpoint),/okunabilir yanıt/);
 assert.equal(calls,1);
});
test('failed request clears in-flight state so a later refresh can recover',async()=>{
 let calls=0;
 const {api}=client(async()=>{calls++;return calls===1?response(429,{error:'rate limit'}):response();});
 await assert.rejects(api(endpoint));
 const data=await api(endpoint);
 assert.equal(calls,2);
 assert.equal(data.events.length,0);
});
