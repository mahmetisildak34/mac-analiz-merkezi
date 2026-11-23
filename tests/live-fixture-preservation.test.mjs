import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const source=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const live=source.slice(source.indexOf("function loadLiveMatchesNow(){"),source.indexOf("\n\nasync function mamSportScoreLiveStats("));
test("live polling publishes ESPN fixtures alongside live matches",()=>{
 assert.match(live,/const publishLiveSnapshot=liveRows=>/);
 assert.match(live,/for\\(const match of \\(fallbackSchedule\\.length\\?fallbackSchedule:allMatches\\)\\)/);
 assert.match(live,/publishLiveSnapshot\(combinedLive\)/);
 assert.match(live,/publishLiveSnapshot\(\[\]\)/);
 assert.doesNotMatch(live,/if\(mamScreenMode==="live"\)allMatches=\[\]/);
});
test("today and upcoming still render match cards",()=>{
 assert.match(source,/if\(mamScreenMode==="today"\)/);
 assert.match(source,/if\(mamScreenMode==="upcoming"\)/);
 assert.match(source,/document\.querySelectorAll\("#matches \.match"\)\.forEach\(makeMamDetailTab\)/);
});
