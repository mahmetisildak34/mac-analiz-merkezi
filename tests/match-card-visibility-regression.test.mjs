import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const render=source.slice(source.indexOf('function renderMatches(){'),source.indexOf('function renderMatches(){')+18000);
test('upcoming uses shared clickable match-card renderer instead of dead-end fixture rows',()=>{
 assert.doesNotMatch(render,/mam-fixture-analyze/);
 assert.doesNotMatch(render,/mam-fixture-row/);
 assert.match(render,/mamScreenMode==="upcoming"/);
});
test('live no-results branch preserves non-live fixtures for all screens',()=>{
 const live=source.slice(source.indexOf('function loadLiveMatchesNow(){'),source.indexOf('async function mamSportScoreLiveStats('));
 assert.match(live,/publishLiveSnapshot\(\[\]\);/);
 assert.doesNotMatch(live,/if\(mamScreenMode==="live"\)allMatches=\[\];\s*renderMatches\(\);/);
});
