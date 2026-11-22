const {test,expect} = require("@playwright/test");
// Static same-origin app assets are served locally. Every external request, including
// production Worker / API-Football, is aborted before it leaves the browser.
test.beforeEach(async ({page})=>{
 await page.route("**/*",route=>{
  const url=new URL(route.request().url());
  if(url.hostname==="127.0.0.1"||url.hostname==="localhost")return route.continue();
  return route.abort("blockedbyclient");
 });
});
for(const width of [320,375,390,414,430]){
 test("mobile navigation and fixture container fit "+width+"px without horizontal page clipping",async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await expect(page.locator("nav.mam-bottom-nav")).toBeVisible();
  await expect(page.locator("#matches")).toHaveCount(1);
  const measurements=await page.evaluate(()=>{
   const nav=document.querySelector("nav.mam-bottom-nav");
   return {pageWidth:document.documentElement.scrollWidth,viewport:window.innerWidth,
    navWidth:nav.scrollWidth,navViewport:nav.clientWidth,
    tabs:nav.querySelectorAll("[data-mam-bottom]").length};
  });
  expect(measurements.tabs).toBe(7);
  expect(measurements.navWidth).toBeLessThanOrEqual(measurements.navViewport+2);
  expect(measurements.pageWidth).toBeLessThanOrEqual(measurements.viewport+2);
 });
}
test("mobile authentication gate stays visible and usable without credentials",async({page})=>{
 await page.goto("/",{waitUntil:"domcontentloaded"});
 const gate=page.locator("#mamAuthGate");
 await expect(gate).toBeVisible();
 await expect(gate.locator("#mamAuthPassword")).toBeVisible();
 await expect(gate.locator("#mamAuthSubmit")).toBeVisible();
 await expect(page.locator('[data-match-mode="live"]')).toHaveCount(1);
 await expect(page.locator('[data-match-mode="today"]')).toHaveCount(1);
 const bounds=await gate.boundingBox();
 expect(bounds.width).toBeGreaterThan(0);
 expect(bounds.width).toBeLessThanOrEqual(390);
 // Deliberately do not enter, mock or bypass credentials.
});
test("Today and Live routes are distinct in the real application source",async({page})=>{
 await page.goto("/",{waitUntil:"domcontentloaded"});
 const classes=await page.locator("main").getAttribute("class");
 const live=page.locator('[data-match-mode="live"]'),today=page.locator('[data-match-mode="today"]');
 await expect(live).toHaveCount(1);
 await expect(today).toHaveCount(1);
 expect(await live.getAttribute("data-match-mode")).not.toBe(await today.getAttribute("data-match-mode"));
 // Full route click-through is intentionally not claimed: the auth gate requires real credentials.
});

for(const width of [320,375,390,414,430]){
 test("real favorites module survives reload and remove on "+width+"px",async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.goto("/tests/fixtures/safari2-favorites-harness.html");
  const save=page.getByRole("button",{name:"Göztepe – Erzurumspor favori"});
  await expect(save).toBeVisible();
  await save.click();
  await expect(save).toHaveAttribute("aria-pressed","true");
  await page.locator('[data-mam-bottom="favorites"]').click();
  await expect(page.locator("#mamSafariFavoritesScreen")).toBeVisible();
  await expect(page.locator("#mamSafariFavoritesBody")).toContainText("Göztepe – Erzurumspor");
  await expect(page.locator("#mamSafariFavoritesBody")).toContainText("1 – 0");
  await page.locator('#mamSafariFavoritesBody [data-fav-open]').first().click();
  await expect(page.locator("#mamSafariFavoritesDetail")).toContainText("Test Oyuncusu");
  await page.locator('#mamSafariFavoritesDetail [data-safari-back]').click();
  await page.reload();
  await page.locator('[data-mam-bottom="favorites"]').click();
  await expect(page.locator('#mamSafariFavoritesBody [data-fav-open]')).toHaveCount(1);
  await page.locator('#mamSafariFavoritesBody [data-fav-remove]').click();
  await expect(page.locator("#mamSafariFavoritesBody")).toContainText("Henüz favori eklenmedi");
  await page.reload();
  await page.locator('[data-mam-bottom="favorites"]').click();
  await expect(page.locator('#mamSafariFavoritesBody [data-fav-open]')).toHaveCount(0);
  const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:window.innerWidth}));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.width+2);
 });
}
test("team favorite opens verified last-five and last-ten profile, finished match stays saved",async({page})=>{
 await page.goto("/tests/fixtures/safari2-favorites-harness.html");
 await page.getByRole("button",{name:"Göztepe favori"}).click();
 await page.getByRole("button",{name:"Fenerbahçe – Galatasaray favori"}).click();
 await page.locator('[data-mam-bottom="favorites"]').click();
 await expect(page.locator("#mamSafariFavoritesBody")).toContainText("Favori takımlar (1)");
 await expect(page.locator("#mamSafariFavoritesBody")).toContainText("Favori maçlar (1)");
 await expect(page.locator("#mamSafariFavoritesBody")).toContainText("FT");
 await page.locator('#mamSafariFavoritesBody [data-fav-open]').last().click();
 await expect(page.locator("#mamSafariFavoritesDetail")).toContainText("Son 5");
 await expect(page.locator("#mamSafariFavoritesDetail")).toContainText("Son 10");
 await expect(page.locator("#mamSafariFavoritesDetail")).toContainText("İç saha");
 await page.locator('#mamSafariFavoritesDetail [data-safari-back]').click();
 await page.reload();
 await page.locator('[data-mam-bottom="favorites"]').click();
 await expect(page.locator('#mamSafariFavoritesBody [data-fav-open]')).toHaveCount(2);
});
test("latest fixture update wins and cached live score is clearly marked as old",async({page})=>{
 await page.goto("/tests/fixtures/safari2-favorites-harness.html");
 await page.getByRole("button",{name:"Göztepe – Erzurumspor favori"}).click();
 await page.locator('[data-mam-bottom="favorites"]').click();
 await expect(page.locator("#mamSafariFavoritesBody")).toContainText("LIVE · 1 – 0");
 await page.evaluate(()=>window.updateFixture());
 await expect(page.locator("#mamSafariFavoritesBody")).toContainText("FT · 2 – 0");
 await page.evaluate(()=>window.clearCurrent());
 await expect(page.locator("#mamSafariFavoritesBody")).toContainText("Son kaydedilen veri");
 await expect(page.locator("#mamSafariFavoritesBody")).toContainText("FT · 2 – 0");
 await page.reload();
 await page.locator('[data-mam-bottom="favorites"]').click();
 await expect(page.locator("#mamSafariFavoritesBody")).toContainText("FT · 2 – 0");
});

test("cached real-result history contributes to favorite team form without provider calls",async({page})=>{
 await page.goto("/tests/fixtures/safari2-favorites-harness.html");
 await page.getByRole("button",{name:"Göztepe favori"}).click();
 await page.locator('[data-mam-bottom="favorites"]').click();
 await page.locator('#mamSafariFavoritesBody [data-fav-open]').click();
 await expect(page.locator("#mamSafariFavoritesDetail")).toContainText("Son 5 (1 doğrulanmış maç)");
 await expect(page.locator("#mamSafariFavoritesDetail")).toContainText("Son 10 (1 doğrulanmış maç)");
 await expect(page.locator("#mamSafariFavoritesDetail")).toContainText("Bursaspor");
 await expect(page.locator("#mamSafariFavoritesDetail")).toContainText("İç saha");
});

test("PWA installs with project-scoped manifest and precaches the complete app shell",async({page,context})=>{
 await page.unroute("**/*");
 await page.setViewportSize({width:390,height:844});
 await page.goto("/",{waitUntil:"load"});
 expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe("./manifest.webmanifest");
 const manifest=await page.request.get("/manifest.webmanifest");
 expect(manifest.ok()).toBeTruthy();
 const data=await manifest.json();
 expect(data.display).toBe("standalone");
 expect(data.scope).toBe("./");
 expect(data.lang).toBe("tr-TR");
 const icon=await page.request.get("/icons/app-icon.svg");
 expect(icon.ok()).toBeTruthy();
 expect(await icon.text()).toContain("<svg");
 const appleIcon=await page.request.get("/icons/apple-touch-icon.png");
 expect(appleIcon.ok()).toBeTruthy();
 expect(appleIcon.headers()["content-type"]).toContain("image/png");
 await page.waitForFunction(async()=>{
  if(!("serviceWorker" in navigator))return false;
  const registration=await navigator.serviceWorker.getRegistration();
  return registration?.active?.state==="activated" && Boolean(navigator.serviceWorker.controller);
 },null,{timeout:10000});
 const cachedPaths=await page.evaluate(async()=>{
  const cache=await caches.open("mam-shell-v1");
  return (await cache.keys()).map(request=>new URL(request.url).pathname);
 });
 expect(cachedPaths.some(path=>path.endsWith("/index.html"))).toBeTruthy();
 expect(cachedPaths.some(path=>path.endsWith("/half-goal-algorithm.js"))).toBeTruthy();
 expect(cachedPaths.some(path=>path.endsWith("/safari2-favorites-search.js"))).toBeTruthy();
 await expect(page.locator("#mamAuthGate")).toBeVisible();
 await context.setOffline(true);
 const offlineNavigation=await page.reload({waitUntil:"load"});
 expect(offlineNavigation?.status()).toBe(200);
 await expect(page.locator("#mamAuthGate")).toBeVisible();
 await expect(page.locator("nav.mam-bottom-nav")).toBeVisible();
});
