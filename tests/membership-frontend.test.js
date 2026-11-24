"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");

test("live analysis is Premium-gated before data fetch and calls the Worker model",()=>{
 const start=html.indexOf("async function analyzeLiveMatch(button)");
 const end=html.indexOf("/* ANALİZ */",start);
 const source=html.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.ok(source.indexOf("requirePremium")<source.indexOf("api(\"espn/"));
 assert.match(source,/window\.mamAuth\.analyze\(\{modelType:"live-v1"/);
 assert.doesNotMatch(source,/const baseRate=|factorialLive|const pois=/);
 assert.match(html,/data-live-home-name=/);
 assert.match(html,/data-live-away-name=/);
});

test("coupon entry points use Premium authorization rather than directly exposing the panel",()=>{
 assert.match(html,/async function setCouponOpen\(open\)\{\s*if\(open&&\(!window\.mamAuth\|\|!\(await window\.mamAuth\.requirePremium\(\)\)\)\)/);
 assert.match(html,/if\(action==="coupon"\)\{setMamScreen\("home"\);await setCouponOpen\(true\);\}/);
 assert.match(html,/if\(mode==="coupon"\)\{setMamScreen\("home"\);await setCouponOpen\(true\);\}/);
 assert.match(html,/async coupon\(payload\)/);
 assert.match(html,/fetch\(base\+"\/membership\/coupon",init\)/);
 assert.match(html,/action:"build",mode:safe\?"safe":"risky",candidates:couponCandidates/);
 assert.match(html,/action:"add",item/);
 assert.match(html,/action:"remove",index:/);
 assert.match(html,/action:"set-odds",index:/);
 assert.match(html,/action:"clear"/);
 assert.doesNotMatch(html,/const pool=couponCandidates\.filter/);
 assert.doesNotMatch(html,/couponItems\.push\(item\)/);
 assert.doesNotMatch(html,/\$\("couponPanel"\)\.hidden=false/);
});

test("password recovery callback submits a new password through the authenticated Worker proxy",()=>{
 assert.match(html,/type==="recovery"\)\{setRecoveryMode\(true\);showGate\(\)/);
 assert.match(html,/\/membership\/auth\/update-password/);
 assert.match(html,/password:pass\.value/);
 assert.match(html,/mamAuthClose[\s\S]{0,100}hideGate/);
});
