// Safari 2: provider-independent regression guards for every configured ESPN league.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('const ESPN_LEAGUES=');
const end=html.indexOf('};',start);
assert.ok(start>=0&&end>start,'ESPN league registry missing');
const ctx={};vm.createContext(ctx);
vm.runInContext(html.slice(start,end+2).replace('const ESPN_LEAGUES=','globalThis.ESPN_LEAGUES='),ctx);
const leagues=ctx.ESPN_LEAGUES;
const entries=Object.entries(leagues);
test('every supported league has a nonempty provider slug, display name and country',()=>{
 assert.ok(entries.length>=30);
 for(const [id,league] of entries){
  assert.ok(id&&league.slug&&league.name&&league.country,'incomplete league: '+id);
  assert.match(league.slug,/^[a-z0-9._]+$/i,'unsafe ESPN slug: '+id);
 }
});
test('all provider slugs resolve to a deterministic canonical league entry',()=>{
 const first=new Map();
 for(const [id,league] of entries){if(!first.has(league.slug))first.set(league.slug,id);}
 assert.ok(first.size>25);
 for(const [slug,id] of first)assert.equal(leagues[id].slug,slug);
});
test('Super Lig mapping is present without replacing other major leagues',()=>{
 assert.equal(leagues['203'].slug,'tur.1');
 for(const id of ['39','140','78','135','61','2','3','253'])assert.ok(leagues[id]?.slug,'missing league '+id);
});
test('ESPN conversion never fabricates a noon UTC kickoff for missing dates',()=>{
 assert.match(html,/date:event.date\|\|competition.date\|\|null/);
 assert.match(html,/Number\.isFinite\(Date\.parse\(match\.fixture\.date\|\|""\)\)/);
 assert.doesNotMatch(html,/date:event.date\|\|date\+"T12:00:00Z"/);
});
test('ESPN converter distinguishes canceled, postponed, suspended and abandoned matches',()=>{
 const match=html.match(/const statusShort=([^;]+);/);
 assert.ok(match,'status conversion missing');
 const statusFor=(detail,state='pre',completed=false)=>vm.runInNewContext('('+match[1]+')',{detail,state,completed,halftime:false,live:false});
 assert.equal(statusFor('Postponed'),'PST');
 assert.equal(statusFor('Cancelled'),'CANC');
 assert.equal(statusFor('Suspended'),'SUSP');
 assert.equal(statusFor('Abandoned'),'ABD');
 assert.equal(statusFor('Full Time','post',true),'FT');
});
