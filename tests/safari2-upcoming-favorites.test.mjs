import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../safari2-favorites-search.js",import.meta.url),"utf8");
test("favorite and detail buttons also decorate upcoming fixture rows",()=>{
 assert.match(source,/#matches article\.match-modern,#matches article\.mam-fixture-row/);
 assert.match(source,/article\.dataset\.safariFixtureId\|\|article\.querySelector\("\.predBtn"\)\?\.dataset\.id/);
});
test("upcoming identity resolution prevents collision between league IDs",()=>{
 assert.match(source,/const leagueId=article\.querySelector\("\.predBtn"\)\?\.dataset\.league/);
 assert.match(source,/clean\(row\.fixture\?\.id\)===fixtureId&&\(!leagueId\|\|clean\(row\.league\?\.id\)===leagueId\)/);
});
test("finished match detail does not show last elapsed minute as live",()=>{
 assert.match(source,/const active=\["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"\]\.includes\(status\.toUpperCase\(\)\)/);
 assert.match(source,/const minute=active&&m\.fixture\?\.status\?\.elapsed!=null/);
});
test("upcoming favorite controls fit a full grid row on narrow screens",()=>{
 assert.match(source,/#matches \.mam-fixture-row \.mam-safari-actions\{grid-column:1\/-1;min-width:0;max-width:100%\}/);
 assert.match(source,/wrap\.style\.cssText="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;min-width:0;max-width:100%"/);
});
