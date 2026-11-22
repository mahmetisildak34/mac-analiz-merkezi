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
  league: { id: league },
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

test('cross-source ESPN and API-Football fixture deduplicates', () => {
  const first = fixture('espn-tur.1-123', 'NS', '2026-11-22T16:00:00Z');
  const second = fixture(456, 'LIVE', '2026-11-22T16:05:00Z');
  second.teams.home.name = 'Fenerbahce';
  assert.equal(helpers.mamDeduplicateFixtures([first, second]).length, 1);
});
test('different opponents never deduplicate', () => {
  const first = fixture(1, 'NS', '2026-11-22T16:00:00Z');
  const second = fixture(2, 'NS', '2026-11-22T16:00:00Z');
  second.teams.away.name = 'Beşiktaş';
  assert.equal(helpers.mamDeduplicateFixtures([first, second]).length, 2);
});
test('kickoffs more than ten minutes apart remain separate', () => {
  const first = fixture(1, 'NS', '2026-11-22T16:00:00Z');
  const second = fixture(2, 'NS', '2026-11-22T16:11:00Z');
  assert.equal(helpers.mamDeduplicateFixtures([first, second]).length, 2);
});

test('same fixture ID with conflicting teams is not merged', () => {
  const first = fixture(700, 'NS', '2026-11-22T16:00:00Z');
  const second = fixture(700, 'NS', '2026-11-22T16:00:00Z');
  second.teams.away.name = 'Beşiktaş';
  assert.equal(helpers.mamDeduplicateFixtures([first, second]).length, 2);
});
test('same fixture ID with matching teams remains deduplicated', () => {
  const first = fixture(701, 'NS', '2026-11-22T16:00:00Z');
  const second = fixture(701, 'LIVE', '2026-11-22T16:00:00Z');
  assert.equal(helpers.mamDeduplicateFixtures([first, second]).length, 1);
});

test('same fixture ID on a different kickoff date is not deduplicated', () => {
  const first = fixture(801, 'NS', '2026-11-22T16:00:00Z');
  const second = fixture(801, 'NS', '2026-11-23T16:00:00Z');
  assert.equal(helpers.mamDeduplicateFixtures([first, second]).length, 2);
});

test('Istanbul midnight separates UTC dates correctly', () => {
  assert.equal(helpers.mamIstanbulDay('2026-11-22T20:59:59Z'), '2026-11-22');
  assert.equal(helpers.mamIstanbulDay('2026-11-22T21:00:00Z'), '2026-11-23');
});
test('today upcoming excludes already-started and finished fixtures', () => {
  const now = Date.parse('2026-11-22T21:30:00Z');
  assert.equal(helpers.mamIsFutureUnplayed(fixture(901, 'NS', '2026-11-22T21:00:00Z'), now), false);
  assert.equal(helpers.mamIsFutureUnplayed(fixture(902, 'FT', '2026-11-22T22:00:00Z'), now), false);
  assert.equal(helpers.mamIsFutureUnplayed(fixture(903, 'NS', '2026-11-22T22:00:00Z'), now), true);
});

test('same fixture ID with missing opponent identity remains separate', () => {
 const first = fixture(920, 'NS', '2026-11-22T16:00:00Z');
 const second = fixture(920, 'NS', '2026-11-22T16:00:00Z');
 second.teams.away.name = '';
 assert.equal(helpers.mamDeduplicateFixtures([first,second]).length,2);
});

test('Süper Lig is prioritized in the all-league ESPN live scan', () => {
 const leaguesStart=html.indexOf('const ESPN_LEAGUES={');
 const leaguesEnd=html.indexOf('const MAM_MATCH_STATS_TTL=',leaguesStart);
 const fnStart=html.indexOf('async function espnFixtures(date,includeAllLeagues=false){');
 const fnEnd=html.indexOf('async function loadMatches(){',fnStart);
 assert.ok(leaguesStart>=0&&leaguesEnd>leaguesStart&&fnStart>=0&&fnEnd>fnStart);
 const source=html.slice(leaguesStart,leaguesEnd)+html.slice(fnStart,fnEnd);
 assert.ok(source.includes('targets.sort((a,b)=>Number(b[0]==="203")-Number(a[0]==="203"))'), 'Turkish league must lead the scan');
});

test('live ESPN refresh does not write provider snapshots to D1', () => {
 const begin=html.indexOf('async function loadLiveMatchesNow(){');
 const end=html.indexOf('async function ',begin+20);
 assert.ok(begin>=0,'live refresh must exist');
 const source=html.slice(begin,end>begin?end:undefined);
 assert.equal(source.includes('mamSaveMatchesToD1(fallback)'),false);
});

test('ESPN fixture kickoff falls back to competition date', () => {
 assert.ok(html.includes('date:event.date||competition.date||null'));
});
test('midnight ESPN scan does not depend on absence of other live matches', () => {
 const begin=html.indexOf('async function loadLiveMatchesNow(){');
 const end=html.indexOf('const previousDateObj=',begin);
 assert.ok(begin>=0&&end>begin);
 const part=html.slice(begin,end);
 assert.equal(part.includes('if(!fallback.some(isLive))'),false);
 assert.ok(part.includes('localHour<6'));
});

test('captured ESPN Süper Lig response drives Live, Today and Finished classification', async () => {
  const payload = require('./fixtures/espn-tur1-20261122.json');
  const start = html.indexOf('async function espnFixtures');
  const end = html.indexOf('\nasync function loadMatches', start);
  assert.ok(start >= 0 && end > start);
  const load = vm.runInNewContext(html.slice(start, end) + ';espnFixtures', {
    $: () => ({ value: '203' }),
    localStorage: { getItem: () => null, setItem() {} },
    ESPN_LEAGUES: { 203: { slug: 'tur.1', name: 'Süper Lig', country: 'Türkiye' } },
    qs: query => new URLSearchParams(query).toString(),
    mamEspnClock: () => ({ elapsed: null }),
    api: async endpoint => {
      assert.equal(endpoint, 'espn/tur.1/scoreboard?dates=20261122&limit=500');
      return payload;
    },
  });
  const matches = await load('2026-11-22');
  const capturedAt = Date.parse('2026-11-22T13:30:00Z');
  const ids = rows => Array.from(rows, row => row.fixture.id).sort();
  assert.equal(matches.length, 4);
  assert.ok(matches.every(match => match.league.id === '203'));
  assert.deepEqual(ids(matches.filter(match => helpers.mamIsCrediblyLive(match, capturedAt))),
    ['espn-tur.1-401888246', 'espn-tur.1-401888248']);
  assert.deepEqual(ids(matches.filter(match => helpers.mamIsFutureUnplayed(match, capturedAt))),
    ['espn-tur.1-401888249']);
  assert.deepEqual(ids(matches.filter(match => helpers.mamCanonicalMatchStatus(match) === 'FT')),
    ['espn-tur.1-401888243']);
  const scheduled = matches.find(match => match.fixture.id.endsWith('401888249'));
  assert.equal(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit',
  }).format(new Date(scheduled.fixture.date)), '19:00');
});
