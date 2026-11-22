import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {Script} from "node:vm";

const manifest=JSON.parse(await readFile(new URL("../manifest.webmanifest",import.meta.url),"utf8"));
const worker=await readFile(new URL("../service-worker.js",import.meta.url),"utf8");
const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
const icon=await readFile(new URL("../icons/app-icon.svg",import.meta.url),"utf8");

test("PWA manifest is scoped to the GitHub Pages project path and installable",()=>{
 assert.equal(manifest.lang,"tr-TR");
 assert.equal(manifest.start_url,"./");
 assert.equal(manifest.scope,"./");
 assert.equal(manifest.display,"standalone");
 assert.ok(manifest.icons.some(icon=>icon.src==="./icons/app-icon.svg"&&icon.type==="image/svg+xml"));
 assert.match(html,/<link rel="manifest" href="\.\/manifest\.webmanifest">/);
 assert.match(html,/apple-mobile-web-app-capable/);
 assert.match(html,/serviceWorker\.register\("\.\/service-worker\.js", \{scope:"\.\/"\}\)/);
});

test("service worker is syntactically valid and precaches both local app modules",()=>{
 assert.doesNotThrow(()=>new Script(worker));
 assert.match(worker,/half-goal-algorithm\.js/);
 assert.match(worker,/safari2-favorites-search\.js/);
 assert.equal(worker.includes(String.raw`\n`),false);
});

test("offline shell caches only same-origin static assets, never API responses",()=>{
 assert.match(worker,/request\.method !== "GET"/);
 assert.match(worker,/new URL\(request\.url\)\.origin !== self\.location\.origin/);
 assert.match(worker,/url\.pathname\.includes\("\/api\/"\)/);
 assert.match(worker,/request\.mode === "navigate"/);
 assert.match(worker,/cache\.addAll\(SHELL\)/);
 assert.doesNotMatch(worker,/https:\/\/odd-sunset|api-football/i);
});

test("app icon is a valid scalable SVG with an accessible viewBox",()=>{
 assert.match(icon,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512">/);
 assert.match(icon,/<\/svg>\s*$/);
});
