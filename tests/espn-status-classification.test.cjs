// Regression tests for the ESPN scoreboard status classifier embedded in index.html.
// No network calls, API-Football quota or production data required.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('const eventType=event.status?.type||{}');
const end = html.indexOf('const clock=mamEspnClock(event);', start);
assert.ok(start >= 0 && end > start, 'ESPN status mapping must exist in index.html');
const source = html.slice(start, end);

function classify(eventType, competitionType = {}) {
  const context = { event: { status: { type: eventType }, competitions: [{ status: { type: competitionType } }] }, competition: { status: { type: competitionType } } };
  return vm.runInNewContext('(function(){' + source + ';return statusShort;})()', context, { timeout: 1000 });
}

const cases = [
  ['pre-match live coverage text', { state: 'pre', detail: 'Live coverage starts soon' }, 'NS'],
  ['pre-match preview', { state: 'pre', detail: 'Preview: Live' }, 'NS'],
  ['scheduled fixture', { state: 'pre', detail: 'Scheduled' }, 'NS'],
  ['pre-match halftime text is not active', { state: 'pre', detail: 'Halftime preview' }, 'NS'],
  ['pre-match second-half teaser is not active', { state: 'pre', detail: 'Second Half' }, 'NS'],
  ['live first half', { state: 'in', detail: 'First Half' }, 'LIVE'],
  ['halftime', { state: 'in', detail: 'Halftime' }, 'HT'],
  ['full time', { state: 'post', detail: 'Full Time', completed: true }, 'FT'],
  ['post-match live text', { state: 'post', detail: 'Live coverage ended' }, 'FT'],
  ['postponed', { state: 'pre', detail: 'Postponed' }, 'PST'],
  ['cancelled', { state: 'pre', detail: 'Cancelled' }, 'CANC'],
  ['abandoned', { state: 'post', detail: 'Abandoned' }, 'ABD'],
  ['suspended', { state: 'in', detail: 'Suspended' }, 'SUSP'],
  ['missing state with explicit live label', { detail: 'Live' }, 'LIVE'],
];
for (const [name, type, expected] of cases) {
  test('ESPN status: ' + name, () => assert.equal(classify(type), expected));
}
test('competition status fallback', () => assert.equal(classify({}, { state: 'in', detail: 'First Half' }), 'LIVE'));

const espnCaptured = require('./fixtures/espn-tur1-20261122.json');
const clockStart = html.indexOf('function mamEspnClock(event){');
const clockEnd = html.indexOf('async function mamFindEspnLiveEvent', clockStart);
assert.ok(clockStart>=0 && clockEnd>clockStart, 'real ESPN clock must be present');
const mamEspnClock = vm.runInNewContext(html.slice(clockStart,clockEnd)+';mamEspnClock', { Number, String }, { timeout:1000 });

test('ESPN saved Süper Lig sample: scheduled timestamp is not a match minute', () => {
 const scheduled=espnCaptured.events.find(e=>e.status.type.state==='pre');
 assert.ok(scheduled);
 assert.equal(mamEspnClock(scheduled).elapsed,null);
 assert.equal(new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit'}).format(new Date(scheduled.date)),'19:00');
});
test('ESPN saved Süper Lig sample: active clocks use only leading elapsed minute', () => {
 const inPlay=espnCaptured.events.filter(e=>e.status.type.state==='in');
 assert.equal(inPlay.length,2);
 assert.deepEqual(inPlay.map(e=>mamEspnClock(e).elapsed),[32,31]);
});
test('ESPN clock never converts dates or schedule copy into playing time',()=>{
 for(const detail of ['Sun, November 22nd at 11:00 AM EST','2026-11-22 19:00','Scheduled 20:00','Live coverage starts soon']){
  assert.equal(mamEspnClock({status:{type:{state:'pre',detail}}}).elapsed,null,detail);
 }
 assert.equal(mamEspnClock({status:{type:{state:'in',detail:"45'+2'"}}}).elapsed,45);
});

const refreshStart=html.indexOf('async function refreshActiveMatchScore(){');
const refreshEnd=html.indexOf('const existing=fresh||',refreshStart);
assert.ok(refreshStart>=0&&refreshEnd>refreshStart,'active ESPN score refresh classifier must be present');
const refreshSource=html.slice(refreshStart,refreshEnd);
const classifierStart=refreshSource.indexOf('const type=event.status?.type||competition.status?.type||{};');
assert.ok(classifierStart>=0,'refresh classifier anchor must be present');
const refreshClassifier=refreshSource.slice(classifierStart);
function classifyRefresh(type){
 const event={status:{type}}, competition={status:{type:{}}};
 return vm.runInNewContext('(function(){'+refreshClassifier+';return statusShort;})()',{
  event,competition,mamEspnClock:()=>({elapsed:null,displayClock:''}),String,
 },{timeout:1000});
}
test('open detail refresh keeps scheduled, cancelled and postponed games out of LIVE',()=>{
 for(const [type,expected] of [
  [{state:'pre',detail:'Scheduled'},'NS'],
  [{state:'pre',detail:'Live coverage starts soon'},'NS'],
  [{state:'pre',detail:'Postponed'},'PST'],
  [{state:'pre',detail:'Cancelled'},'CANC'],
  [{state:'post',detail:'Abandoned'},'ABD'],
  [{state:'in',detail:'Suspended'},'SUSP'],
  [{state:'in',detail:'Halftime'},'HT'],
  [{state:'in',detail:'First Half'},'LIVE'],
  [{state:'post',detail:'Full Time',completed:true},'FT'],
  [{state:'pre',detail:'Unknown'},'NS'],
 ]){
  assert.equal(classifyRefresh(type),expected,JSON.stringify(type));
 }
});
test('saved ESPN sample statuses agree between fixture parser and open-detail refresh',()=>{
 for(const event of espnCaptured.events){
  const fixture=classify(event.status.type);
  const refresh=classifyRefresh(event.status.type);
  assert.equal(refresh,fixture,'ESPN fixture '+event.id);
 }
});
