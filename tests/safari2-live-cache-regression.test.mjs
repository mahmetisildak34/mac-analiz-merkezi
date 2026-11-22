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
 assert.match(live,/const isRecentLive=match=>isLive\(match\)&&mamIsCrediblyLive\(match,Date\.now\(\)\)/);
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

test("all live provider success paths label their actual last client verification time",()=>{
 assert.match(html,/function mamLiveCheckedLabel\(\)/);
 assert.match(html,/window\.mamLiveLastVerifiedAt=checkedAt/);
 for(const source of ["API-Football kaynağı","Football-data.org yedek kaynağı","SportScore yedek kaynağı"]){
  const line=live.split("\n").find(x=>x.includes(source)&&x.includes('$("status").textContent='));
  assert.ok(line&&line.includes("mamLiveCheckedLabel()"),"missing timestamp for "+source);
 }
});

test("goal alerts ignore missing, empty, negative and fractional scores",()=>{
 const start=html.indexOf("function mamNotifyLiveGoalChanges(");
 const end=html.indexOf("let mamLiveLoadPromise=",start);
 assert.ok(start>0&&end>start);
 const source=html.slice(start,end);
 assert.match(source,/rawHome==null\|\|rawAway==null/);
 assert.match(source,/rawHome===""\|\|rawAway===""/);
 assert.match(source,/Number\.isInteger\(home\)/);
 assert.match(source,/Number\.isInteger\(away\)/);
 assert.match(source,/home<0\|\|away<0/);
});

test("favorites only persist provider-verified live snapshots",()=>{
 const favorites=readFileSync(new URL("../safari2-favorites-search.js",import.meta.url),"utf8");
 const start=favorites.indexOf("function syncFavoriteSnapshots(){");
 const end=favorites.indexOf('window.addEventListener("mam:fresh-live"',start);
 assert.ok(start>0&&end>start);
 const sync=favorites.slice(start,end);
 assert.match(sync,/const verifiedAt=Number\(match\._mamLastVerifiedAt\)/);
 assert.match(sync,/if\(!Number\.isFinite\(verifiedAt\)\|\|verifiedAt<=0\)continue/);
 assert.doesNotMatch(sync,/savedAt:Number\(match\._mamLastVerifiedAt\)\|\|Date\.now\(\)/);
});
