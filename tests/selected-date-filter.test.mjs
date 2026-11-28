import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const require=createRequire(import.meta.url);
const MAMActiveLeagueScope=require('../active-league-scope.js');
const renderStart=html.indexOf('function renderMatches(){');
const filterStart=html.indexOf(' const league=$("league").value;',renderStart);
const filterEnd=html.indexOf(' // Today\'s scoreboard order',filterStart);
assert.ok(renderStart>=0&&filterStart>renderStart&&filterEnd>filterStart,'renderMatches filter block must be identifiable');
const filterBlock=html.slice(filterStart,filterEnd);

function sourceFunction(name){
 const match=html.match(new RegExp('function '+name+'\\([\\s\\S]*?\\n\\}'));
 assert.ok(match,`${name} must exist`);
 return match[0];
}
const helperNames=['mamIstanbulDateString','mamOffsetFixtureDate','mamCanonicalMatchStatus','mamFixtureInstant','mamIstanbulDay','mamIsFutureUnplayed'];
const helpers=runInNewContext(helperNames.map(sourceFunction).join('\n')+'\n({'+helperNames.join(',')+'})',{Intl,Date});

function fixture(id,date,status,league='203',timeUnknown=false){
 return {fixture:{id,date,timeUnknown,status:{short:status,elapsed:status==='ET'?105:status==='1H'?33:null}},league:{id:league},teams:{home:{name:'Home '+id},away:{name:'Away '+id}},goals:{home:1,away:0}};
}
const rows=[
 fixture('nov22','2026-11-22T18:00:00Z','FT'),
 fixture('nov21','2026-11-21T18:00:00Z','FT'),
 fixture('nov08','2026-11-08T18:00:00Z','FT'),
 fixture('nov07','2026-11-07T18:00:00Z','FT'),
 fixture('nov23-final','2026-11-23T17:00:00Z','FT'),
 fixture('nov23-live','2026-11-23T18:00:00Z','1H'),
 fixture('nov23-extra','2026-11-23T18:00:00Z','ET'),
 fixture('nov23-future','2026-11-23T20:00:00Z','NS'),
 fixture('nov23-postponed','2026-11-23T19:00:00Z','PST'),
 fixture('nov24-future','2026-11-24T18:00:00Z','NS'),
 fixture('nov23-other-league','2026-11-23T17:00:00Z','FT','204')
];

function filterMatches({mode='today',selectedDate='2026-11-23',matches=rows,now=Date.parse('2026-11-23T18:00:00Z'),league='all',todayFilter='all',online=true}={}){
 const FixedDate=class extends Date{static now(){return now;}};
 const elements=new Map();
 const get=id=>{
  if(id==='date')return {value:selectedDate};
  if(id==='league')return {value:league};
  if(id==='mamTodayTabs')return {querySelectorAll:()=>[]};
  if(!elements.has(id))elements.set(id,{textContent:'',dataset:{},querySelectorAll:()=>[]});
  return elements.get(id);
 };
 return runInNewContext(`(()=>{${filterBlock}\nreturn list;})()`,{
  allMatches:matches,mamScreenMode:mode,mamTodayFilter:todayFilter,Date:FixedDate,
  mamIstanbulDateString:helpers.mamIstanbulDateString,mamOffsetFixtureDate:helpers.mamOffsetFixtureDate,
  mamCanonicalMatchStatus:helpers.mamCanonicalMatchStatus,mamFixtureInstant:helpers.mamFixtureInstant,
  mamIstanbulDay:helpers.mamIstanbulDay,mamIsFutureUnplayed:helpers.mamIsFutureUnplayed,
  navigator:{onLine:online},window:{MAMActiveLeagueScope},$:get
 });
}

test('finished view excludes Nov 22, 21, 8 and 7 when Nov 23 is selected',()=>{
 const result=filterMatches({mode:'finished'});
 assert.deepEqual(result.map(row=>row.fixture.id),['nov23-final','nov23-other-league']);
});

test('changing selected date updates finished results without retaining prior-day rows',()=>{
 assert.deepEqual(filterMatches({mode:'finished',selectedDate:'2026-11-22'}).map(row=>row.fixture.id),['nov22']);
 assert.deepEqual(filterMatches({mode:'finished',selectedDate:'2026-11-23'}).map(row=>row.fixture.id),['nov23-final','nov23-other-league']);
 assert.deepEqual(filterMatches({mode:'finished',selectedDate:'2026-11-24'}),[]);
});

test('today filters status within the selected Istanbul day, including extra time and postponements only in All',()=>{
 assert.deepEqual(filterMatches({mode:'today'}).map(row=>row.fixture.id).sort(),['nov23-extra','nov23-final','nov23-future','nov23-live','nov23-other-league','nov23-postponed'].sort());
 assert.deepEqual(filterMatches({mode:'today',todayFilter:'finished'}).map(row=>row.fixture.id),['nov23-final','nov23-other-league']);
 assert.deepEqual(filterMatches({mode:'today',todayFilter:'live'}).map(row=>row.fixture.id),['nov23-live','nov23-extra']);
 assert.deepEqual(filterMatches({mode:'today',todayFilter:'upcoming'}).map(row=>row.fixture.id),['nov23-future']);
});

test('live view retains active fixtures across selected-date changes and respects offline state',()=>{
 assert.deepEqual(filterMatches({mode:'live'}).map(row=>row.fixture.id),['nov23-live','nov23-extra']);
 assert.deepEqual(filterMatches({mode:'live',selectedDate:'2026-11-22'}).map(row=>row.fixture.id),['nov23-live','nov23-extra']);
 assert.deepEqual(filterMatches({mode:'live',online:false}),[]);
});

test('upcoming view includes only unstarted fixtures on the selected date and excludes postponed events',()=>{
 assert.deepEqual(filterMatches({mode:'upcoming'}).map(row=>row.fixture.id),['nov23-future']);
 assert.deepEqual(filterMatches({mode:'upcoming',selectedDate:'2026-11-24'}).map(row=>row.fixture.id),['nov24-future']);
 assert.deepEqual(filterMatches({mode:'upcoming',selectedDate:'2026-11-22'}),[]);
});

test('Istanbul midnight assigns adjacent UTC kickoffs to different selected dates',()=>{
 const boundary=[fixture('before-midnight','2026-11-23T20:59:00Z','FT'),fixture('at-midnight','2026-11-23T21:00:00Z','FT')];
 assert.deepEqual(filterMatches({mode:'finished',matches:boundary,selectedDate:'2026-11-23'}).map(row=>row.fixture.id),['before-midnight']);
 assert.deepEqual(filterMatches({mode:'finished',matches:boundary,selectedDate:'2026-11-24'}).map(row=>row.fixture.id),['at-midnight']);
});

test('league selection remains effective in finished and live views',()=>{
 assert.deepEqual(filterMatches({mode:'finished',league:'203'}).map(row=>row.fixture.id),['nov23-final']);
 assert.deepEqual(filterMatches({mode:'live',league:'204'}),[]);
});
