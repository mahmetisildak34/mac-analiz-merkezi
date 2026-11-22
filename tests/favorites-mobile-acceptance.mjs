import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';

const url = process.env.TEST_URL || 'http://127.0.0.1:8765/';
for (const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]) {
  const browser = await engine.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'tr-TR'});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    // Local UI-only acceptance: no credentials or production authentication are exercised.
    // The app's authentication overlay blocks clicks on the static preview.
    await page.locator('#mamAuthGate').evaluate(gate => { gate.style.display='none'; });
    await page.locator('#mamSearchToggle').click();
    const search = page.locator('#mamTeamSearch');
    await search.waitFor({state:'visible'});
    await page.locator('#mamTeamSearchInput').fill('Beşiktaş');
    const results = page.locator('#mamTeamSearchResults [data-search-team]');
    await results.first().waitFor({state:'visible',timeout:10000});
    assert.match(await results.first().innerText(),/Beşiktaş/i,name+' team search');
    assert.equal(await page.locator('#mamTeamSearchResults [aria-pressed]').count(),0,name+' search must not favorite teams');
    await page.locator('#mamTeamSearchInput').fill('Süper Lig');
    await results.first().waitFor({state:'visible'});
    assert.equal(await page.locator('#mamTeamSearchResults [data-search-league]').count(),0,name+' no league result rows');
    assert.ok(await results.count()>0,name+' league filters teams');
    await page.locator('#mamTeamSearchInput').fill('Beşiktaş');
    await results.first().click();
    await page.locator('#mamTeamHistoryScreen').waitFor({state:'visible',timeout:10000});
    assert.equal(await search.isVisible(),false,name+' search closes on team selection');
    await page.locator('#mamTeamHistoryBack').click();
    await page.locator('#mamTeamHistoryScreen').waitFor({state:'detached'});
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
