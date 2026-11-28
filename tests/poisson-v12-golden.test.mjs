import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const baseline = JSON.parse(readFileSync(new URL("./fixtures/poisson-v12-baseline.json", import.meta.url), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
function extractFunction(name) {
  const start = html.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must remain present`);
  const end = html.indexOf("\n}", start) + 2;
  return html.slice(start, end).trim();
}
const poissonSource = extractFunction("poisson");
const overSource = extractFunction("overProb");
const formulaStart = html.indexOf("  const lh=Math.max(.15");
const formulaEnd = html.indexOf("  const hasHalf=", formulaStart);
assert.ok(formulaStart >= 0 && formulaEnd > formulaStart);
const formula = html.slice(formulaStart, formulaEnd).replace(/\n$/, "");
assert.deepEqual({ poisson: hash(poissonSource), overProb: hash(overSource), formulaBlock: hash(formula) }, baseline.sourceHashes,
  "Poisson v1.2 formulas must remain byte-for-byte unchanged");

const compute = runInNewContext(`${poissonSource}\n${overSource}\n((vectors)=>vectors.map(({homeStats:hs,awayStats:as})=>{
 const lh=Math.max(.15,Math.min(4,(hs.gf+as.ga)/2));
 const la=Math.max(.15,Math.min(4,(as.gf+hs.ga)/2));
 const total=lh+la;let win=0,draw=0,lose=0;
 for(let h=0;h<=10;h++)for(let a=0;a<=10;a++){const p=poisson(lh,h)*poisson(la,a);if(h>a)win+=p;else if(h===a)draw+=p;else lose+=p;}
 return {lh,la,total,win,draw,lose,over15:overProb(total,2),over25:overProb(total,3),over35:overProb(total,4),btts:(1-Math.exp(-lh))*(1-Math.exp(-la))};
}))`, {});
const result = JSON.parse(JSON.stringify(compute(baseline.inputs)));
assert.equal(result.length, baseline.goldenOutputs.length);
assert.deepEqual(result, baseline.goldenOutputs, "fixed Poisson v1.2 golden predictions changed");
