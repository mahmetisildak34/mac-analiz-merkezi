import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../safari2-favorites-search.js",import.meta.url),"utf8");
const start=source.indexOf("function syncFavoriteSnapshots(){");
const end=source.indexOf('window.addEventListener("mam:fresh-live"',start);
assert.ok(start>=0&&end>start,"favorites synchronization must be present");

function runSync(previous,fixture){
 const saved={kind:"match",league:"203",id:"42",snapshot:{...previous}};
 const favorites=[saved];
 let writes=0,renders=0;
 const sandbox={favorites,findMatch:()=>fixture,
  fixtureStatus:match=>match.fixture.status.short,
  save:()=>{writes++},renderFavorites:()=>{renders++},
  Number,JSON};
 vm.createContext(sandbox);
 vm.runInContext(source.slice(start,end),sandbox,{timeout:1000});
 sandbox.syncFavoriteSnapshots();
 return {snapshot:saved.snapshot,writes,renders};
}
const fixture=(at,home,away,status="LIVE")=>({
 _mamLastVerifiedAt:at,fixture:{status:{short:status}},goals:{home,away}
});

test("a late verified response cannot roll back a newer favorite score",()=>{
 const old={status:"FT",home:2,away:1,savedAt:2000};
 const result=runSync(old,fixture(1000,1,1));
 assert.deepEqual(result.snapshot,old);
 assert.equal(result.writes,0);
});
test("equal timestamps cannot overwrite the last verified score",()=>{
 const old={status:"LIVE",home:2,away:1,savedAt:2000};
 assert.deepEqual(runSync(old,fixture(2000,1,1)).snapshot,old);
});
test("newer confirmed scores and FT status are persisted",()=>{
 const result=runSync({status:"LIVE",home:1,away:0,savedAt:1000},fixture(2000,2,0,"FT"));
 assert.deepEqual(result.snapshot,{status:"FT",home:2,away:0,savedAt:2000});
 assert.equal(result.writes,1);
});
test("missing or invalid newer scores must not erase verified goals",()=>{
 const old={status:"LIVE",home:2,away:0,savedAt:1000};
 for(const [home,away] of [[null,null],["",0],[2,-1],[2,1.5]]){
  const result=runSync(old,fixture(3000,home,away));
  assert.deepEqual(result.snapshot,old);
  assert.equal(result.writes,0);
 }
});
test("newer complete score may replace an incomplete prior snapshot",()=>{
 const result=runSync({status:"NS",home:null,away:null,savedAt:1000},fixture(2000,0,0));
 assert.deepEqual(result.snapshot,{status:"LIVE",home:0,away:0,savedAt:2000});
 assert.equal(result.writes,1);
});
test("unverified fixture data never modifies persistent favorite",()=>{
 const old={status:"LIVE",home:1,away:0,savedAt:1000};
 const result=runSync(old,fixture(undefined,3,3));
 assert.deepEqual(result.snapshot,old);
 assert.equal(result.writes,0);
});
