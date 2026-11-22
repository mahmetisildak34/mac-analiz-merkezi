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
  ['live first half', { state: 'in', detail: 'First Half' }, 'LIVE'],
  ['halftime', { state: 'in', detail: 'Halftime' }, 'HT'],
  ['full time', { state: 'post', detail: 'Full Time', completed: true }, 'FT'],
  ['post-match live text', { state: 'post', detail: 'Live coverage ended' }, 'NS'],
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
