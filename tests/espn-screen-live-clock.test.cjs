'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function mamVisibleLiveMinute(status){');
const end=html.indexOf('function renderMatches(){',start);
assert.ok(start>=0&&end>start,'the real match-card live minute helper must exist');
const minute=vm.runInNewContext(html.slice(start,end)+';mamVisibleLiveMinute',{Number,String},{timeout:1000});
const cases=[
 ['null minute and no clock',{elapsed:null,displayClock:''},null],
 ['missing minute',{displayClock:''},null],
 ['empty minute',{elapsed:'',displayClock:''},null],
 ['explicit zero minute',{elapsed:0},0],
 ['real minute',{elapsed:31},31],
 ['stoppage time',{elapsed:null,displayClock:"45'+2'"},45],
 ['valid display clock',{elapsed:null,displayClock:"32'"},32],
 ['scheduled timestamp',{elapsed:null,displayClock:'Sun, November 22 at 11:00 AM EST'},null],
 ['ISO date',{elapsed:null,displayClock:'2026-11-22 19:00'},null],
 ['scheduled text',{elapsed:null,displayClock:'Scheduled at 19:00'},null],
 ['invalid negative minute',{elapsed:-1},null],
 ['invalid elapsed over 130',{elapsed:131},null],
 ['invalid clock over 130',{elapsed:null,displayClock:"195'"},null],
];
for(const [name,value,expected] of cases){
 test('real match-card clock: '+name,()=>assert.equal(minute(value),expected));
}
test('match-card renderer uses guarded minute and preserves explicit missing value',()=>{
 const fragment=html.slice(end,html.indexOf('/* Kadroları maçtan',end));
 assert.ok(fragment.includes('const effectiveElapsed=mamVisibleLiveMinute(f.status);'));
 assert.ok(fragment.includes('if(isLiveStatus){'));
 assert.ok(fragment.includes('else liveMinute="Canlı";'));
 assert.ok(fragment.includes('esc(effectiveElapsed??"")'));
});
