// Safari 2: date-specific counters and Istanbul calendar regression tests.
// Run with: node --test tests/safari2-today-filter.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const getFunction=(name,nextName)=>{
 const start=html.indexOf('function '+name+'(');
 const end=html.indexOf('function '+nextName+'(',start+1);
 assert.ok(start>=0&&end>start,'missing source function '+name);
 return html.slice(start,end);
};
const sandbox={Intl,Date};
vm.createContext(sandbox);
vm.runInContext(getFunction('mamCanonicalMatchStatus','mamIstanbulDay')+
 getFunction('mamIstanbulDay','mamIsFutureUnplayed')+
 getFunction('mamIsFutureUnplayed','renderMatches'),sandbox);
const fixture=(date,short)=>({fixture:{date,status:{short}}});
test('Istanbul calendar crosses UTC day boundary correctly',()=>{
 assert.equal(sandbox.mamIstanbulDay('2026-11-21T22:30:00Z'),'2026-11-22');
 assert.equal(sandbox.mamIstanbulDay('2026-11-22T20:59:00Z'),'2026-11-22');
 assert.equal(sandbox.mamIstanbulDay('2026-11-22T21:00:00Z'),'2026-11-23');
});
test('live, finished and stale kickoff never count as future unplayed',()=>{
 const now=Date.parse('2026-11-22T12:00:00Z');
 assert.equal(sandbox.mamIsFutureUnplayed(fixture('2026-11-22T15:00:00Z','NS'),now),true);
 assert.equal(sandbox.mamIsFutureUnplayed(fixture('2026-11-22T11:00:00Z','NS'),now),false);
 assert.equal(sandbox.mamIsFutureUnplayed(fixture('2026-11-22T15:00:00Z','LIVE'),now),false);
 assert.equal(sandbox.mamIsFutureUnplayed(fixture('2026-11-22T15:00:00Z','FT'),now),false);
});
test('Today counters use selected day only',()=>{
 assert.match(html,/const dayMatches=allMatches\.filter\(m=>mamIstanbulDay\(m\.fixture\?\.date\)===selectedDay\)/);
 assert.match(html,/const counts=\{all:dayMatches\.length,live:dayMatches\.filter\(m=>mamIsCrediblyLive\(m,mamNow\)\)\.length/);
 assert.match(html,/upcoming:dayMatches\.filter\(m=>mamIsFutureUnplayed\(m,mamNow\)\)/);
});
test('live and Today remain separate screen filters',()=>{
 assert.match(html,/if\(mamScreenMode==="live"\)list=list\.filter\(m=>mamIsCrediblyLive\(m,mamNow\)\)/);
 assert.match(html,/const isRecentLive=match=>isLive\(match\)&&mamIsCrediblyLive\(match,Date\.now\(\)\)/);
 assert.match(html,/list=list\.filter\(m=>mamIsFutureUnplayed\(m,mamNow\)&&mamIstanbulDay\(m\.fixture\?\.date\)===selectedDay\)/);
});

test('Super Lig ESPN mapping retains canonical league 203 and tur.1',()=>{
 assert.match(html,/"203":\{slug:"tur\.1",name:"Süper Lig",country:"Türkiye"\}/);
});

test('Istanbul calendar handles dates around local midnight and rejects invalid values',()=>{
 assert.equal(sandbox.mamIstanbulDay('2026-11-22T20:59:59Z'),'2026-11-22');
 assert.equal(sandbox.mamIstanbulDay('2026-11-22T21:00:00Z'),'2026-11-23');
 assert.equal(sandbox.mamIstanbulDay('not-a-date'),'');
});
test('Today heading uses same canonical Istanbul day as fixture filtering',()=>{
 assert.match(html,/const todayKey=mamIstanbulDay\(new Date\(\)\.toISOString\(\)\)/);
});

test('team match history uses Istanbul timezone for displayed dates',()=>{
 assert.match(html,/new Date\(m\.fixture\.date\)\.toLocaleDateString\("tr-TR",\{timeZone:"Europe\/Istanbul",day:"2-digit",month:"2-digit",year:"2-digit"\}\)/);
 const kickoff=new Date('2026-11-22T21:30:00Z');
 assert.equal(kickoff.toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'2-digit'}),'23.11.26');
});

test('screen filters share a single time snapshot',()=>{
 const now=Date.parse('2026-11-22T12:00:00Z');
 const live={fixture:{date:'2026-11-22T10:00:00Z',status:{short:'2H',elapsed:80}}};
 const upcoming={fixture:{date:'2026-11-22T17:00:00Z',status:{short:'NS'}}};
 const liveCode=html.slice(html.indexOf('function mamIsCrediblyLive('),html.indexOf('function mamIsFutureUnplayed('));
 const context={Date,Number};vm.createContext(context);
 vm.runInContext(getFunction('mamCanonicalMatchStatus','mamIstanbulDay')+liveCode,context);
 assert.equal(context.mamIsCrediblyLive(live,now),true);
 assert.equal(context.mamIsCrediblyLive(upcoming,now),false);
 assert.equal(sandbox.mamIsFutureUnplayed(live,now),false);
 assert.equal(sandbox.mamIsFutureUnplayed(upcoming,now),true);
 assert.equal(sandbox.mamIstanbulDay(upcoming.fixture.date),'2026-11-22');
});

test('initial mobile date picker uses Istanbul day, not the device timezone',()=>{
 assert.match(html,/\$\("date"\)\.value=mamIstanbulDay\(today\.toISOString\(\)\)/);
 const timestamp='2026-11-22T21:15:00Z';
 assert.equal(sandbox.mamIstanbulDay(timestamp),'2026-11-23');
});
