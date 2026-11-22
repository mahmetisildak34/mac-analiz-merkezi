import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';

const url = process.env.TEST_URL || 'http://127.0.0.1:8765/';
for (const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]) {
  const browser = await engine.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'tr-TR'});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    await page.locator('#mamSearchToggle').click();
    const search = page.locator('#mamTeamSearch');
    await search.waitFor({state:'visible'});
    await page.locator('#mamTeamSearchInput').fill('Fenerbahçe');
    await page.waitForTimeout(1200);
    const results = page.locator('#mamTeamSearchResults [data-search-team]');
    if (await results.count()) {
      await results.first().click();
      assert.equal(await results.first().getAttribute('aria-pressed'),'true',name+' favorite add');
    } else {
      console.log(name+': ESPN directory unavailable; cannot confirm remote team favorite flow');
    }
    await page.locator('#mamTeamSearchClose').click();
    await page.locator('#mamFavoriteBottom').click();
    await page.locator('#mamFavoritePanel').waitFor({state:'visible'});
    assert.equal(await page.locator('#mamFavoriteBottom').getAttribute('aria-expanded'),'true');
    if(await page.locator('#mamFavoritePanel [data-mam-remove-team]').count()){
      await page.locator('#mamFavoritePanel [data-mam-remove-team]').first().click();
    }
    console.log(name+': search dialog and bottom Favorites navigation passed');
    await page.close();
  } finally { await browser.close(); }
}
