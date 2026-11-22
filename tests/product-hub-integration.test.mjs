import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const html=readFileSync(new URL('../mobile/product-hub.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('product hub exposes seven feature areas and responsive navigation',()=>{
 for(const id of ['home','favorites','teams','leagues','search','settings','details'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/aria-label="Alt gezinme"/);assert.match(html,/env\(safe-area-inset-bottom\)/);
});
test('product hub uses local data only, not live APIs or notification permissions',()=>{
 assert.match(html,/type="file"/);assert.match(html,/localStorage/);
 assert.doesNotMatch(html,/fetch\s*\(|Notification\.requestPermission|navigator\.serviceWorker\.register/);
});
test('main app links to product hub without replacing existing rendering',()=>{
 assert.match(app,/href="\.\/mobile\/product-hub\.html"/);
 assert.match(app,/function renderMatches\(\)/);
});
test('product hub module script is syntactically valid',()=>{
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'module script present');
 const check=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});assert.equal(check.status,0,check.stderr);
});
