import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source=readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("UEFA history scans the current and two prior seasons for every supported cup",()=>{
 const start=source.indexOf("const uefaFeeds=");
 const end=source.indexOf("const loadUefaFeed=",start);
 assert.ok(start>=0&&end>start,"UEFA history loader was not found");
 const archive=source.slice(start,end);
 assert.match(archive,/const uefaYears=\[currentSeasonStart,currentSeasonStart-1,currentSeasonStart-2\]\.filter\(y=>y>=2024\)/);
 assert.doesNotMatch(archive,/\[2027,2026,2025\]/,"Conference League must not skip 2024/25 or request future 2027 data");
});
