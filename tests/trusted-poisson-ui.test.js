"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const html=fs.readFileSync(path.join(__dirname,"../index.html"),"utf8");
const section=html.slice(html.indexOf("async function analyze(button)"),html.indexOf("function factorialLive(")>html.indexOf("async function analyze(button)")?html.indexOf("function factorialLive("):undefined);
test("pre-match UI imports shared trusted calculator",()=>assert.match(section,/await import\("\.\/trusted-goal-poisson\.js"\)/));
test("pre-match UI blocks predictions when evidence is insufficient",()=>assert.match(section,/if\(!trusted\.available\)throw new Error/));
test("pre-match UI reports used and excluded fixtures",()=>{assert.match(section,/trusted\.used/);assert.match(section,/trusted\.excluded/)});
test("pre-match UI requires explicit identity and score verification",()=>{assert.match(section,/identity_verified===true/);assert.match(section,/score_verified===true/)});

test("archive source takes precedence and absent proof is never promoted",()=>{assert.match(section,/source:m\.source\?\?m\.mamSource/);assert.match(section,/identity_verified:m\.identity_verified===true/);assert.match(section,/score_verified:m\.score_verified===true/)});
