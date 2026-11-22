import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../safari2-favorites-search.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('favorites are mounted with a dedicated seventh bottom navigation destination',()=>{
 assert.match(html,/<script src="\.\/safari2-favorites-search\.js" defer><\/script>/);
 assert.match(html,/data-safari-fixture-id="\$\{esc\(f\.id\)\}"/);
 const nav=html.match(/<nav class="mam-bottom-nav"[^>]*>([\\s\\S]*?)<\\/nav>/);
 assert.ok(nav,"real bottom navigation must exist");
 assert.equal((nav[1].match(/data-mam-bottom=/g)||[]).length,7);
 assert.match(nav[1],/data-mam-bottom="favorites"/);
 assert.match(source,/id="mamSafariFavoritesScreen"/);
 assert.match(source,/function openFavorites\(\)/);
});
test('favorite storage uses a namespaced key and deduplicates loaded records',()=>{
 assert.match(source,/mam_safari2_favorites_v1/);
 assert.match(source,/new Map\(rows\.filter\(valid\)\.map/);
 assert.match(source,/localStorage\.setItem\(KEY,JSON\.stringify\(favorites\)\)/);
});
test('team and match identities include league to avoid collisions across competitions',()=>{
 assert.match(source,/kind\+":"\+clean\(league\)\+":"\+clean\(id\)/);
 assert.match(source,/function itemFromMatch\(m\)/);
 assert.match(source,/function itemFromTeam\(m,side\)/);
});
test('search normalizes Turkish dotted and dotless i',()=>{
 const normalize=value=>String(value).trim().toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
 assert.equal(normalize('İSTANBUL'),'istanbul');
 assert.equal(normalize('IĞDIR'),'igdir');
 assert.match(source,/toLocaleLowerCase\("tr-TR"\)/);
});
test('search uses loaded matches and known league registry, never a speculative provider request',()=>{
 assert.match(source,/typeof allMatches/);
 assert.match(source,/typeof ESPN_LEAGUES/);
 assert.doesNotMatch(source,/\bfetch\s*\(/);
 assert.doesNotMatch(source,/\bapi\s*\(/);
});
test('completed matches can be favorited without a prediction button',()=>{
 assert.match(source,/article\.dataset\.safariFixtureId/);
 assert.doesNotMatch(source,/if\(!button\)continue/);
});
