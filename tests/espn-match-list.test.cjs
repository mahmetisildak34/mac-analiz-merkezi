// Verify real match-list helpers from the app, not a duplicated implementation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const begin = html.indexOf('function mamCanonicalMatchStatus(match){');
const end = html.indexOf('function renderMatches(){', begin);
assert.ok(begin >= 0 && end > begin, 'match filtering helpers must be present');
const helpers = vm.runInNewContext(html.slice(begin, end) + ';({mamCanonicalMatchStatus,mamDeduplicateFixtures,mamIstanbulDay,mamIsCrediblyLive,mamIsFutureUnplayed})', { Date, Intl, Number, String, Array, Math }, { timeout: 1000 });
const now = Date.parse('2026-11-22T12:00:00Z');
const fixture = (id, status, date, league = 203) => ({
  fixture: { id, date, status: { short: status } },
  league: { id },
  teams: { home: { name: 'Fenerbahçe' }, away: { name: 'Galatasaray' } }
});
test('current live match remains visible', () => assert.equal(helpers.mamIsCrediblyLive(fixture(1, 'LIVE', '2026-11-22T11:00:00Z'), now), true));
test('future live label does not count as started', () => assert.equal(helpers.mamIsCrediblyLive(fixture(2, 'LIVE', '2026-11-22T13:00:00Z'), now), false));
test('stale live label is rejected', () => assert.equal(helpers.mamIsCrediblyLive(fixture(3, 'LIVE', '2026-11-21T11:00:00Z'), now), false));
test('future scheduled match belongs to upcoming today', () => assert.equal(helpers.mamIsFutureUnplayed(fixture(4, 'NS', '2026-11-22T13:00:00Z'), now), true));
test('past scheduled match is not falsely upcoming', () => assert.equal(helpers.mamIsFutureUnplayed(fixture(5, 'NS', '2026-11-22T11:00:00Z'), now), false));
test('Istanbul day rolls over at UTC+3', () => assert.equal(helpers.mamIstanbulDay('2026-11-21T22:30:00Z'), '2026-11-22'));
test('duplicate fixture IDs are collapsed', () => assert.equal(helpers.mamDeduplicateFixtures([fixture(8, 'NS', '2026-11-22T13:00:00Z'), fixture(8, 'FT', '2026-11-22T13:00:00Z')]).length, 1));
test('different leagues are not merged', () => assert.equal(helpers.mamDeduplicateFixtures([fixture(8, 'NS', '2026-11-22T13:00:00Z'), fixture(8, 'NS', '2026-11-22T13:00:00Z', 999)]).length, 2));
