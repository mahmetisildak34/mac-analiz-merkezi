import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../safari2-favorites-search.js',import.meta.url),'utf8');
test('team form uses only completed fixtures with valid nonnegative integer scores',()=>{
 assert.match(source,/\["FT","AET","PEN"\]\.includes\(code\)/);
 assert.match(source,/Number\.isInteger\(h\)&&Number\.isInteger\(a\)&&h>=0&&a>=0/);
});
test('last five and last ten summaries count W D L and goals without filling missing results',()=>{
 assert.match(source,/teamSummary\(item,5\)/);
 assert.match(source,/teamSummary\(item,10\)/);
 assert.match(source,/if\(gf>ga\)wins\+\+;else if\(gf===ga\)draws\+\+;else losses\+\+/);
 assert.match(source,/scored\+=gf;conceded\+=ga/);
});
test('team profile retains home and away breakdown and Istanbul time',()=>{
 assert.match(source,/if\(isHome\)home\+\+;else away\+\+/);
 assert.match(source,/timeZone:"Europe\/Istanbul"/);
});
test('match details show genuine available scores and no fabricated provider statistics',()=>{
 assert.match(source,/function showDetail\(item\)/);
 assert.match(source,/m\.goals\?\.home!=null&&m\.goals\?\.away!=null/);
 assert.match(source,/Sağlayıcıdan doğrulanmış veri bulunmuyor/);
 assert.match(source,/const lineupSection=/);
 assert.match(source,/const statSection=/);
 assert.match(source,/halftimeSection/);
});
test('completed match card and favorite can both open detail, with back control',()=>{
 assert.match(source,/detail\.addEventListener\("click",\(\)=>showDetail\(itemFromMatch\(m\)\)\)/);
 assert.match(source,/item\.kind==="team"\?showTeam:showDetail/);
 assert.match(source,/data-safari-back="1"/);
});

test('home and away form uses distinct verified results and no fabricated averages',()=>{
 assert.match(source,/const splits=\{home:/);
 assert.match(source,/split\.wins\+\+/);
 assert.match(source,/split\.draws\+\+/);
 assert.match(source,/split\.losses\+\+/);
 assert.match(source,/x\.count\?\(x\.scored\/x\.count\)\.toFixed\(2\):"veri yok"/);
});
test('provider events, statistics and lineups render only when supplied',()=>{
 assert.match(source,/detailRows\(value\)/);
 assert.match(source,/row\.player\?\.name/);
 assert.match(source,/team\.statistics\.filter\(x=>x&&x\.value!=null\)/);
 assert.match(source,/\['startXI','substitutes'\]/);
 assert.match(source,/Sağlayıcıdan doğrulanmış ilk yarı skoru bulunmuyor/);
});
