import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const source=readFileSync(new URL("../safari2-favorites-search.js",import.meta.url),"utf8");
const start=html.indexOf("function setMamScreen("),end=html.indexOf("function mamCanonicalMatchStatus(",start);
assert.ok(start>=0&&end>start);
const routing=html.slice(start,end);
test("Favorites route is a dedicated screen with its own physical bottom-nav control",()=>{
 assert.match(html,/data-mam-bottom="favorites" aria-label="Favoriler"/);
 assert.match(html,/main\.mam-screen-favorites > :not\(#mamSafariFavoritesScreen\)\{display:none!important\}/);
 assert.match(source,/function openFavorites\(\)/);
 assert.match(html,/if\(mode==="favorites"\)\{window\.mamSafari2Favorites\?\.open\(\)/);
});
test("Special and Favorites screens dismiss each other during navigation",()=>{
 assert.match(routing,/main\.classList\.remove\("mam-screen-special","mam-screen-special-archive","mam-screen-favorites"\)/);
 assert.match(routing,/const favoritesScreen=\$\("mamSafariFavoritesScreen"\);if\(favoritesScreen\)favoritesScreen\.hidden=true/);
 assert.match(routing,/const specialScreen=\$\("mamSpecialScreen"\);if\(specialScreen\)specialScreen\.hidden=true/);
 assert.match(routing,/const halfGoalScreen=\$\("mamHalfGoalScreen"\);if\(halfGoalScreen\)halfGoalScreen\.hidden=true/);
});
