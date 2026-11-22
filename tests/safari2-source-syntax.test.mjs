import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
const source=readFileSync(new URL("../index.html",import.meta.url),"utf8");
test("all inline classic JavaScript blocks in Safari 2 HTML parse under Node 22",()=>{
 const scripts=[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
 let checked=0;
 for(const [,attributes,body] of scripts){
  if(/\bsrc\s*=/.test(attributes)||!body.trim())continue;
  const type=attributes.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
  if(type&&!["text/javascript","application/javascript"].includes(type))continue;
  assert.doesNotThrow(()=>new vm.Script(body,{filename:"inline-script-"+(checked+1)+".js"}));
  checked++;
 }
 assert.ok(checked>0,"Expected JavaScript inline source");
});
test("Safari 2 favorites and native pure-match logic compile",()=>{
 for(const filename of ["../safari2-favorites-search.js","../mobile/match-rules.js"]){
  const code=readFileSync(new URL(filename,import.meta.url),"utf8");
  assert.doesNotThrow(()=>new vm.Script(code,{filename}));
 }
});
