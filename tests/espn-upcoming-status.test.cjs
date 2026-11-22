'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('function mamEspnUpcomingStatus(type){');
const end = html.indexOf('     leagueFixtures=(payload.events||[]).map(event=>{', start);
assert.ok(start >= 0 && end > start, 'ESPN upcoming status classifier must be used by league fixture screen');
const source = html.slice(start, end);
const classify = vm.runInNewContext(source + ';mamEspnUpcomingStatus', { String }, { timeout: 1000 });

const cases = [
 ['scheduled', { state: 'pre', detail: 'Scheduled' }, 'NS'],
 ['cancelled', { state: 'pre', detail: 'Cancelled' }, 'CANC'],
 ['canceled', { state: 'pre', detail: 'Canceled' }, 'CANC'],
 ['postponed', { state: 'pre', detail: 'Postponed' }, 'PST'],
 ['abandoned', { state: 'post', detail: 'Abandoned' }, 'ABD'],
 ['suspended', { state: 'in', detail: 'Suspended' }, 'SUSP'],
 ['active', { state: 'in', detail: 'First Half' }, 'LIVE'],
 ['completed', { state: 'post', completed: true, detail: 'Full Time' }, 'FT'],
 ['missing status', {}, 'UNKNOWN'],
 ['unknown state', { state: 'mystery' }, 'UNKNOWN'],
 ['name-only postponement', { state: 'pre', name: 'Postponed' }, 'PST'],
];
for (const [name, input, expected] of cases) {
 test('league future ESPN status: ' + name, () => assert.equal(classify(input), expected));
}
test('ESPN league upcoming screen retains only genuinely scheduled fixtures', () => {
 assert.match(html.slice(end, end + 1200), /mamEspnUpcomingStatus\(event\.status\?\.type\|\|comp\.status\?\.type\|\|\{\}\)/);
 assert.ok(html.includes('filter(m=>String(m.fixture.status.short)==="NS"&&Date.parse(m.fixture.date)>=Date.now())'));
 for (const [, input, expected] of cases) {
  assert.equal(classify(input) === 'NS', expected === 'NS');
 }
});
