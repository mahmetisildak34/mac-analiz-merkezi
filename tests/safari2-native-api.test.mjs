import test from "node:test";
import assert from "node:assert/strict";
import {fetchFixtures} from "../mobile/api-client.js";
const now=Date.parse("2026-11-22T12:00:00Z");
const ok=response=>({ok:true,status:200,json:async()=>({response})});
const fixture=(id,status,date)=>({fixture:{id,date,status:{short:status}},league:{id:203,name:"Süper Lig"},teams:{home:{name:"Ev sahibi"},away:{name:"Deplasman"}},goals:{home:null,away:null}});

test("live client requests the Worker live endpoint and filters future/non-live fixtures",async()=>{
 let requested="";
 const result=await fetchFixtures({tab:"live",now,apiBase:"https://example.test/api",fetchImpl:async(url)=>{requested=url;return ok([
  fixture(1,"LIVE","2026-11-22T11:30:00Z"),fixture(2,"LIVE","2026-11-22T12:30:00Z"),fixture(3,"FT","2026-11-22T10:00:00Z")
 ]);}});
 assert.equal(requested,"https://example.test/api/fixtures?live=all&timezone=Europe%2FIstanbul");
 assert.deepEqual(result.matches.map(x=>x.fixture.id),[1]);
});

test("today endpoint uses the Istanbul calendar date and upcoming-only rules",async()=>{
 let requested="";
 const result=await fetchFixtures({tab:"today",now,apiBase:"https://example.test/api",fetchImpl:async(url)=>{requested=url;return ok([
  fixture(1,"NS","2026-11-22T13:00:00Z"),fixture(2,"LIVE","2026-11-22T11:00:00Z"),fixture(3,"NS","2026-11-23T00:30:00Z")
 ]);}});
 assert.equal(requested,"https://example.test/api/fixtures?date=2026-11-22&timezone=Europe%2FIstanbul");
 assert.deepEqual(result.matches.map(x=>x.fixture.id),[1]);
});

test("HTTP and provider rate-limit errors are classified without returning empty success",async()=>{
 await assert.rejects(fetchFixtures({tab:"live",now,fetchImpl:async()=>({ok:false,status:503,json:async()=>({response:[]})})}),e=>e.kind==="http"&&e.status===503);
 await assert.rejects(fetchFixtures({tab:"live",now,fetchImpl:async()=>({ok:true,status:200,json:async()=>({errors:{rateLimit:"limited"},response:[]})})}),e=>e.kind==="rate_limit");
});

test("malformed JSON and malformed response shapes fail closed",async()=>{
 await assert.rejects(fetchFixtures({tab:"live",now,fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw new Error("bad json");}})}),e=>e.kind==="invalid_json");
 await assert.rejects(fetchFixtures({tab:"live",now,fetchImpl:async()=>({ok:true,status:200,json:async()=>({response:{}})})}),e=>e.kind==="invalid_payload");
});

test("network timeout aborts the upstream request",async()=>{
 let aborted=false;
 await assert.rejects(fetchFixtures({tab:"live",now,timeoutMs:5,fetchImpl:(_url,{signal})=>new Promise((resolve,reject)=>{
  signal.addEventListener("abort",()=>{aborted=true;reject(new Error("aborted"));},{once:true});
 })}),e=>e.kind==="timeout");
 assert.equal(aborted,true);
});

test("already-cancelled requests never contact the provider",async()=>{
 const controller=new AbortController();controller.abort(new Error("cancelled"));
 let called=false;
 await assert.rejects(fetchFixtures({tab:"live",now,signal:controller.signal,fetchImpl:async()=>{called=true;return ok([]);}}));
 assert.equal(called,false);
});

test("invalid tabs and dates do not call the provider",async()=>{
 let called=false;
 await assert.rejects(fetchFixtures({tab:"other",now,fetchImpl:async()=>{called=true;return ok([]);}}),e=>e.kind==="invalid_request");
 await assert.rejects(fetchFixtures({tab:"live",now:"not-a-date",fetchImpl:async()=>{called=true;return ok([]);}}),e=>e.kind==="invalid_request");
 assert.equal(called,false);
});
