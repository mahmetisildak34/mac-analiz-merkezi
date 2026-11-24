import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const start=source.indexOf('const feedMap={');
const end=source.indexOf('const feedErrors=',start);
assert.ok(start>=0&&end>start,'UEFA selected-feed block is present');
const block=source.slice(start,end);

test('UEFA upcoming feed is selected by league id instead of merging all cups',()=>{
 assert.match(block,/"2":\{slug:"champions-league",id:"2"/);
 assert.match(block,/"3":\{slug:"europa-league",id:"3"/);
 assert.match(block,/"848":\{slug:"conference-league",id:"848"/);
 assert.match(block,/const selectedFeed=feedMap\[String\(leagueId\)\]/);
 assert.match(block,/Promise\.allSettled\(\[selectedFeed\]\.map/);
 assert.doesNotMatch(block,/Promise\.allSettled\(feedMap\.map/);
});

test('UEFA fixture normalization preserves the selected competition id',()=>{
 assert.match(source,/league:\{id:comp\.id,name:comp\.name,country:"Europe"\}/);
});
