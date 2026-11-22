// Exercises the real ESPN conversion with mocked read-only provider responses for every league.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const extract=(start,end)=>{
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'source block missing: '+start);
 return html.slice(a,b);
};
const registry=extract('const ESPN_LEAGUES=','function mamEspnClock(');
const clock=extract('function mamEspnClock(','async function mamFindEspnLiveEvent(');
const converter=extract('async function espnFixtures(','async function loadMatches(');
const context={Date,Intl,Number,Math,Set,Map,Array,Object,JSON,String,Promise,console,localStorage:{getItem:()=>null,setItem:()=>{}},qs:args=>new URLSearchParams(args).toString(),$:()=>({value:'all'}),api:async()=>({events:[]})};
vm.createContext(context);
vm.runInContext(registry+clock+converter+';globalThis.__espn={ESPN_LEAGUES,espnFixtures};',context);
const leagues=Object.entries(context.__espn.ESPN_LEAGUES);
const event=(id,status,date='2026-11-22T21:30:00Z')=>({id,date,status:{type:status},competitions:[{competitors:[{homeAway:'home',team:{id:'10',displayName:'Home'},score:'2'},{homeAway:'away',team:{id:'20',displayName:'Away'},score:'1'}]}]});
test('every configured ESPN slug produces an isolated fixture with correct league and Istanbul date',async()=>{
 const calls=[];
 context.api=async path=>{
  calls.push(path);
  const slug=path.split('/')[1];
  return {events:[event(slug,{state:'post',completed:true,detail:'Full Time'})]};
 };
 const result=await context.__espn.espnFixtures('2026-11-23',true);
 const unique=new Map(leagues.map(([id,league])=>[league.slug,id]));
 assert.equal(result.length,unique.size);
 assert.equal(calls.length,unique.size);
 for(const match of result){
  assert.equal(match.league.id,unique.get(match.fixture.id.split('espn-')[1].split('-')[0]));
  assert.equal(match.fixture.status.short,'FT');
  assert.equal(match.goals.home,2);
  assert.equal(match.goals.away,1);
  assert.equal(new Date(match.fixture.date).toLocaleDateString('en-CA',{timeZone:'Europe/Istanbul'}),'11/23/2026');
 }
});
test('invalid or missing kickoff never becomes a fabricated scheduled match',async()=>{
 context.$=()=>({value:'203'});
 context.api=async()=>({events:[event('missing',{state:'pre'},null),event('invalid',{state:'pre'},'bad-date'),event('valid',{state:'pre'})]});
 const result=await context.__espn.espnFixtures('2026-11-23');
 assert.equal(result.length,1);
 assert.equal(result[0].fixture.id,'espn-tur.1-valid');
});
test('postponed and canceled matches are not mapped to scheduled',async()=>{
 context.$=()=>({value:'203'});
 context.api=async()=>({events:[event('postponed',{state:'pre',detail:'Postponed'}),event('canceled',{state:'pre',detail:'Cancelled'}),event('normal',{state:'pre',detail:'Scheduled'})]});
 const result=await context.__espn.espnFixtures('2026-11-23');
 assert.deepEqual(Array.from(result,m=>m.fixture.status.short),['PST','CANC','NS']);
});
