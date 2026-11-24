import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { chromium, webkit } from "playwright";
import test from "node:test";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const handlerStart = source.indexOf('if("serviceWorker" in navigator){');
const handlerEnd = source.indexOf('window.addEventListener("offline"', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, "app Service Worker handler must exist");
const registrationHandler = source.slice(handlerStart, handlerEnd);

async function runEngine(engine, name, origin, setWorkerVersion) {
  setWorkerVersion(1);
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(origin);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 15000 });
    await page.waitForTimeout(250);
    const initialLoads = await page.evaluate(() => Number(sessionStorage.getItem("mam_test_loads")));
    assert.equal(initialLoads, 1, `${name}: initial controller acquisition must not reload the page`);

    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 15000 });
    const updateAndCheckReload = async version => {
      const before = await page.evaluate(() => Number(sessionStorage.getItem("mam_test_loads")));
      setWorkerVersion(version);
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();
      });
      await page.waitForFunction(previous => Number(sessionStorage.getItem("mam_test_loads")) > previous, before, { timeout: 20000 });
      await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 15000 });
      const after = await page.evaluate(() => Number(sessionStorage.getItem("mam_test_loads")));
      assert.equal(after, before + 1, `${name}: each worker update must reload exactly once`);
      return after;
    };

    const afterSecondWorker = await updateAndCheckReload(2);
    const afterThirdWorker = await updateAndCheckReload(3);
    assert.equal(afterThirdWorker, afterSecondWorker + 1, `${name}: a second update in the same tab must reload exactly once`);
  } finally {
    await browser.close();
  }
}

test("Chromium and WebKit reload once for each subsequent Service Worker update in the same tab", async () => {
  let workerVersion = 1;
  const server = createServer((request, response) => {
    if (request.url === "/sw.js") {
      response.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
      response.end(`// worker-version-${workerVersion}\nself.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));`);
      return;
    }
    if (request.url === "/" || request.url === "/index.html") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(`<!doctype html><meta charset="utf-8"><title>SW update regression</title><script>sessionStorage.setItem('mam_test_loads',String(Number(sessionStorage.getItem('mam_test_loads')||'0')+1));</script><script>${registrationHandler}</script><main>Local-only service worker update test</main>`);
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const setWorkerVersion = version => { workerVersion = version; };
  try {
    await runEngine(chromium, "Chromium", origin, setWorkerVersion);
    await runEngine(webkit, "WebKit", origin, setWorkerVersion);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
