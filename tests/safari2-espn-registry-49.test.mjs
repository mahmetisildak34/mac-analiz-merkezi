import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const source=readFileSync(new URL("../scripts/safari2-espn-acceptance.mjs",import.meta.url),"utf8");
const start=html.indexOf("const ESPN_LEAGUES=");
const end=html.indexOf("};",start);
assert.ok(start>=0&&end>start);
const ctx={};vm.createContext(ctx);
vm.runInContext(html.slice(start,end+2).replace("const ESPN_LEAGUES=","globalThis.ESPN_LEAGUES="),ctx);
const leagues=Object.entries(ctx.ESPN_LEAGUES);
test("all 49 unique ESPN scoreboard addresses include text-key aliases",()=>{
 assert.equal(leagues.length,54);
 assert.equal(new Set(leagues.map(([,v])=>v.slug)).size,49);
 assert.ok(ctx.ESPN_LEAGUES.concacaf_nations?.slug==="concacaf.nations.league");
 assert.ok(ctx.ESPN_LEAGUES.fifa_friendly_w?.slug==="fifa.friendly.w");
 assert.ok(ctx.ESPN_LEAGUES.conmebol_libertadores?.slug==="conmebol.libertadores");
});
test("HTTP acceptance parses both numeric and textual registry keys, then deduplicates by exact slug",()=>{
 assert.match(source,/const registered=Array\.from/);
 assert.match(source,/\[\^"\]\+/);
 assert.match(source,/if\(!unique\.has\(entry\.slug\)\)unique\.set\(entry\.slug,entry\)/);
 assert.match(source,/const entries=\[\.\.\.unique\.values\(\)\]/);
 assert.match(source,/if\(entries\.length<49\)/);
});
test("old numeric-only ESPN acceptance filter must not reappear",()=>{
 assert.doesNotMatch(source,/matchAll\(\/"\(\\d\+\)"/);
});
