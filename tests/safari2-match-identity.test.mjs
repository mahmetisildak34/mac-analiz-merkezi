// Behavioral regressions for Safari 2 provider identity and kickoff guards.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const extract=(start,end)=>{
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,"missing source block: "+start);
 return html.slice(a,b);
};
const ctx={Date,Intl,Number,Math,Set,Map,Array,Object,JSON,String,Promise,console,
 localStorage:{getItem:()=>null,setItem:()=>{}},qs:args=>new URLSearchParams(args).toString(),
 $:()=>({value:"203"}),api:async()=>({events:[]})};
vm.createContext(ctx);
vm.runInContext(
 extract("function mamCanonicalMatchStatus(","function mamIstanbulDay(")+
 extract("function mamIsCrediblyLive(","function mamIsFutureUnplayed(")+
 ";globalThis.__dedupe=mamDeduplicateFixtures;",ctx
);
const fixture=(id,league,home,away,date,status="NS",goals={home:null,away:null})=>({
 fixture:{id,date,status:{short:status}},
 league:{id:league},teams:{home:{name:home},away:{name:away}},goals
});
test("different provider IDs of the same league, teams and kickoff make one card",()=>{
 const a=fixture(4018,"203","Göztepe SK","Erzurumspor","2026-11-22T10:30:00Z");
 const b=fixture("espn-tur.1-4018","203","Göztepe","Erzurumspor","2026-11-22T10:34:00Z","LIVE");
 const rows=ctx.__dedupe([a,b]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].fixture.status.short,"LIVE");
});
test("a real final result wins over an older scheduled duplicate",()=>{
 const planned=fixture(20,"203","Fenerbahçe","Galatasaray","2026-11-22T15:00:00Z");
 const complete=fixture("espn-tur.1-20","203","Fenerbahçe","Galatasaray","2026-11-22T15:00:00Z","FT",{home:2,away:1});
 const rows=ctx.__dedupe([planned,complete]);
 assert.equal(rows.length,1);
 assert.equal(rows[0].goals.home,2);
 assert.equal(rows[0].fixture.status.short,"FT");
});
test("cancellation and postponement stay terminal, never auto-convert to FT",()=>{
 for(const state of ["CANC","PST"]){
  const rows=ctx.__dedupe([
   fixture("scheduled","203","Home","Away","2026-11-22T15:00:00Z"),
   fixture("espn-tur.1-canceled","203","Home","Away","2026-11-22T15:00:00Z",state)
  ]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].fixture.status.short,state);
 }
});
test("same teams on different days, competitions or reversed sides stay separate",()=>{
 const base=fixture("api-10","203","A","B","2026-11-22T15:00:00Z");
 const later=fixture("api-11","203","A","B","2026-11-23T15:00:00Z");
 const otherLeague=fixture("api-12","204","A","B","2026-11-22T15:00:00Z");
 const reversed=fixture("api-13","203","B","A","2026-11-22T15:00:00Z");
 assert.equal(ctx.__dedupe([base,later,otherLeague,reversed]).length,4);
});
test("five minutes before kickoff cannot be accepted as LIVE",()=>{
 const now=Date.parse("2026-11-22T12:00:00Z");
 const row=fixture("espn-tur.1-1","203","Home","Away","2026-11-22T12:05:00Z","LIVE");
 assert.equal(ctx.mamIsCrediblyLive(row,now),false);
});
const registry=extract("const ESPN_LEAGUES=","};")+"};";
const clock=extract("function mamEspnClock(","async function mamFindEspnLiveEvent(");
const converter=extract("async function espnFixtures(","async function loadMatches(");
vm.runInContext(registry+clock+converter+";globalThis.__fixtures=espnFixtures;",ctx);
const event=id=>({id,date:"2026-11-22T15:00:00Z",status:{type:{state:"pre",detail:"Scheduled"}},
 competitions:[{competitors:[{homeAway:"home",team:{id:"10",displayName:"Home"}},{homeAway:"away",team:{id:"20",displayName:"Away"}}]}]});
test("ESPN skips placeholder, whitespace, object and path-like event IDs",async()=>{
 ctx.api=async()=>({events:[event("  "),event("undefined"),event("NaN"),event("../../bad"),event({x:1}),event(-1),event("good-123")]});
 const rows=await ctx.__fixtures("2026-11-22");
 assert.deepEqual(Array.from(rows,r=>r.fixture.id),["espn-tur.1-good-123"]);
});
test("ESPN retains a valid numeric provider identifier without inventing one",async()=>{
 ctx.api=async()=>({events:[event(401888243)]});
 const rows=await ctx.__fixtures("2026-11-22");
 assert.equal(rows.length,1);
 assert.equal(rows[0].fixture.id,"espn-tur.1-401888243");
});
