import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const productionWorker = "https://odd-sunset-6c83.m-ahmetisildak34.workers.dev";
const previewWorker = "https://repair-worker-archive-guards-20261128-odd-sunset-6c83.m-ahmetisildak34.workers.dev";

test("Pages Preview hosts select the isolated Worker and production hostnames keep the existing Worker", () => {
  assert.match(html, /location\.hostname==="mam-iphone-preview\.pages\.dev"\|\|location\.hostname\.endsWith\("\.mam-iphone-preview\.pages\.dev"\)/);
  assert.ok(html.includes(`?"${previewWorker}":"${productionWorker}"`));
  assert.equal(html.split(productionWorker).length - 1, 1, "production Worker URL must appear only as the selector fallback");
  assert.equal(html.includes(previewWorker), true);
  assert.equal(html.includes("fetch(MAM_WORKER_API_BASE+\"/api/archive/d1-status\")"), true);
  assert.equal(html.includes("fetch(MAM_WORKER_API_BASE+\"/api/archive/sync-status\")"), true);
  assert.equal(html.includes("base=MAM_WORKER_API_BASE"), true);
});
