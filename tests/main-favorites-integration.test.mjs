import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';
const js=readFileSync(new URL('../mobile/main-favorites.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('main page loads real match-card favorites module',()=>{assert.match(html,/src="\.\/mobile\/main-favorites\.mjs"/);assert.match(js,/#matches article\.match/);assert.match(js,/button\[data-id\]/);});
test('favorites share persisted keys with product hub and support remove',()=>{assert.match(js,/mam-product-hub-v1/);assert.match(js,/favoriteMatches/);assert.match(js,/favoriteTeams/);assert.match(js,/data-mam-remove-match/);assert.match(js,/data-mam-remove-team/);});
test('favorites DOM observer avoids recursive text writes',()=>{assert.match(js,/button\.textContent!==labelText/);assert.match(js,/MutationObserver/);});
test('main favorites JavaScript parses',()=>{const check=spawnSync(process.execPath,['--check','--input-type=module'],{input:js,encoding:'utf8'});assert.equal(check.status,0,check.stderr);});
