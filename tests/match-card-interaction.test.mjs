import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('match card opens via click and keyboard without stealing nested buttons',()=>{
 const start=html.indexOf('function makeMamDetailTab(article)');
 const end=html.indexOf('async function loadMamMatchForm(',start);
 const source=html.slice(start,end);
 assert.match(source,/article\.addEventListener\("click"/);
 assert.match(source,/event\.target\.closest\("button,a,input,select,textarea,\[role=button\]"/);
 assert.match(source,/article\.addEventListener\("keydown"/);
 assert.match(source,/activateMamFixture\(article\)/);
});
test('restoring a saved live detail can reassign the missing button',()=>{
 const start=html.indexOf('function mamRestorePendingDetail()');
 const end=html.indexOf('function activateMamFixture(',start);
 const source=html.slice(start,end);
 assert.match(source,/let button=\[/);
 assert.match(source,/button=\[/);
 assert.doesNotMatch(source,/const button=\[/);
});
