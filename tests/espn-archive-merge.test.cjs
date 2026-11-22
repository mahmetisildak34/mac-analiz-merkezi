// Exercise the real archive/live merging identity predicate from index.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const begin = html.indexOf('const teamKey=value=>');
const end = html.indexOf('for(const incoming of [...allMatches,...archivedDayRows])', begin);
assert.ok(begin >= 0 && end > begin, 'archive/live identity predicate must exist');
const { sameFixture } = vm.runInNewContext('(()=>{' + html.slice(begin, end) + ';return {sameFixture};})()', {}, {timeout:1000});
const fixture = (id, league, away='Galatasaray', date='2026-11-22T16:00:00Z') => ({
 fixture:{id,date}, league:{id:league}, teams:{home:{name:'Fenerbahçe'},away:{name:away}}
});
test('archive ID collision across leagues must not merge', () => assert.equal(sameFixture(fixture(1,203),fixture(1,999)),false));
test('archive ID collision with conflicting away team must not merge', () => assert.equal(sameFixture(fixture(1,203),fixture(1,203,'Beşiktaş')),false));
test('same ID, same teams and league remains matchable', () => assert.equal(sameFixture(fixture(1,203),fixture(1,203)),true));
test('cross-provider IDs match on teams and nearby kickoff', () => assert.equal(sameFixture(fixture('espn-tur.1-2',203),fixture(123,203,'Galatasaray','2026-11-22T16:05:00Z')),true));
test('different opponents never match across IDs', () => assert.equal(sameFixture(fixture(1,203),fixture(2,203,'Beşiktaş')),false));
test('kickoff difference above ten minutes prevents cross-ID merge', () => assert.equal(sameFixture(fixture(1,203),fixture(2,203,'Galatasaray','2026-11-22T16:11:00Z')),false));
