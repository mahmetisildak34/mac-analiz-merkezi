import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('advanced ESPN details is wired to the real match overlay',()=>{
 assert.match(html,/void mamLoadAdvancedEspnDetails\(article\)/);
 assert.match(html,/async function mamLoadAdvancedEspnDetails\(article\)/);
 assert.match(html,/import\("\.\/mobile\/espn-match-details\.mjs"\)/);
 assert.match(html,/\.match-detail-pane\[data-pane="overview"\]/);
 assert.match(html,/ESPN takım karşılaştırması/);
});
test('ESPN event matching supports actual numeric event IDs',()=>{
 const source=html.slice(html.indexOf('async function mamLoadAdvancedEspnDetails'),html.indexOf('function openMamMatchDetail(article){'));
 assert.match(source,/\\d\+/);
 assert.match('espn-eng.1-401879232',/^espn-[a-z0-9._-]+-(\d+)$/i);
});
