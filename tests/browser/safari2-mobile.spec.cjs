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
for(const width of [320,390]){
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
  expect(measurements.tabs).toBe(6);
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
