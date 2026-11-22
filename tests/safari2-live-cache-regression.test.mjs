import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const apiStart=html.indexOf("async function api(path){");
const liveStart=html.indexOf("async function loadLiveMatchesNow(){");
const liveEnd=html.indexOf("async function mamSportScoreLiveStats(",liveStart);
assert.ok(apiStart>0&&liveEnd>liveStart);
const live=html.slice(liveStart,liveEnd);
test("today and yesterday ESPN scoreboards expire in 15 seconds instead of 30 minutes",()=>{
 assert.match(html,/const isEspnLiveScoreboard=isEspnScoreboard&&/);
 const expression=html.match(/const cacheAge=([^;]+);/)?.[1];
 assert.ok(expression);
 const resolve=(liveScoreboard)=>vm.runInNewContext(expression,{
  isEspnLiveScoreboard:liveScoreboard,isLive:false,isTffFixtures:false,isArchive:false,isLiveStats:false
 });
 assert.equal(resolve(true),15000);
 assert.equal(resolve(false),1800000);
});
test("live refresh never resurrects unconfirmed cached matches into ESPN provider results",()=>{
 assert.doesNotMatch(live,/recentCachedLive\.forEach/);
 assert.match(live,/const mergedByPair=new Map\(\)/);
 assert.match(live,/fallbackLive\.forEach\(match=>/);
 assert.match(live,/const isRecentLive=match=>mamIsCrediblyLive\(match,Date\.now\(\)\)/);
});
test("cached live preview is explicitly labeled old until a successful provider response",()=>{
 assert.match(live,/Önceki veri \(/);
 assert.match(live,/henüz güncel değil/);
 assert.match(html,/window\.mamLiveLastVerifiedAt=checkedAt/);
 assert.match(html,/Son uygulama veri kontrolü/);
});
test("ESPN provider timestamp is preserved when supplied without guessing an update time",()=>{
 assert.match(html,/updated:event\.status\?\.lastUpdated\|\|competition\.status\?\.lastUpdated\|\|null/);
});
test("new live response dispatches a UI freshness event for favorites sync",()=>{
 assert.match(html,/new CustomEvent\("mam:fresh-live"/);
 assert.match(html,/_mamLastVerifiedAt:checkedAt/);
});
