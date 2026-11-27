import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';

const url = process.env.TEST_URL || 'http://127.0.0.1:8765/';
for (const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]) {
  const browser = await engine.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'tr-TR'});
    const origin = new URL(url).origin;
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    // Local UI-only acceptance: no credentials or production authentication are exercised.
    // The app's authentication overlay blocks clicks on the static preview.
    await page.locator('#mamAuthGate').evaluate(gate => { gate.style.display='none'; });
    const expectedIds=['1','2','3','4','5','39','40','61','78','88','94','135','140','203','204','848'].sort();
    const mainScope=await page.evaluate(()=>({ids:window.MAMActiveLeagueScope.activeIds,options:Array.from(document.querySelectorAll('#league option')).filter(option=>!option.hidden).map(option=>option.value).sort(),menu:Array.from(document.querySelectorAll('#leagueMenu [data-league-value]')).map(option=>option.dataset.leagueValue).sort()}));
    assert.deepEqual([...mainScope.ids].sort(),expectedIds,name+' centralized active competition IDs');
    assert.deepEqual(mainScope.options,['all',...expectedIds].sort(),name+' only active league options are visible');
    assert.deepEqual(mainScope.menu,['all',...expectedIds].sort(),name+' only active custom picker options are visible');
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
    const besiktasResult=results.filter({hasText:/Beşiktaş/i}).first();
    await besiktasResult.waitFor({state:'visible',timeout:10000});
    assert.match(await besiktasResult.innerText(),/Beşiktaş/i,name+' final debounced search result');
    await page.waitForTimeout(100);
    await besiktasResult.click();
    await page.waitForTimeout(100);
    await page.locator('#mamTeamHistoryScreen').waitFor({state:'visible',timeout:10000});
    assert.equal(await search.isVisible(),false,name+' search closes on team selection');
    const back = page.locator('#mamTeamHistoryBack');
    await back.waitFor({state:'attached',timeout:10000});
    const backBox = await back.boundingBox();
    const backState = await back.evaluate(button=>{
      const rect=button.getBoundingClientRect(),style=getComputedStyle(button),header=button.closest('header');
      return {rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},display:style.display,visibility:style.visibility,opacity:style.opacity,pointerEvents:style.pointerEvents,headerDisplay:header&&getComputedStyle(header).display,screen:button.closest('#mamTeamHistoryScreen')?.getBoundingClientRect().toJSON()};
    });
    assert.ok(backBox && backBox.width >= 44 && backBox.height >= 44,name+' team-history back control must be visible and touch-sized: '+JSON.stringify(backState));
    await back.tap();
    await page.locator('#mamTeamHistoryScreen').waitFor({state:'detached'});
    assert.equal(await page.locator('#mamDrawer').isVisible(),false,name+' back tap must not activate the drawer underneath');
    await page.locator('#mamFavoriteBottom').click();
    await page.locator('#mamFavoritePanel').waitFor({state:'visible'});
    assert.equal(await page.locator('#mamFavoriteBottom').getAttribute('aria-expanded'),'true');
    if(await page.locator('#mamFavoritePanel [data-mam-remove-team]').count()){
      await page.locator('#mamFavoritePanel [data-mam-remove-team]').first().click();
    }
    const hub=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'tr-TR'});
    await hub.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await hub.goto(new URL('./mobile/product-hub.html',url).href,{waitUntil:'domcontentloaded',timeout:30000});
    const hubLeagues=await hub.locator('#espnLeague option').evaluateAll(options=>options.map(option=>option.value).sort());
    assert.deepEqual(hubLeagues,['eng.1','eng.2','esp.1','fra.1','fifa.world','ger.1','ita.1','ned.1','por.1','tur.1','tur.2','uefa.champions','uefa.europa','uefa.europa.conf','uefa.euro','uefa.nations'].sort(),name+' product hub standings selector active scope');
    await hub.close();
    console.log(name+': search dialog and bottom Favorites navigation passed');
    await page.close();
  } finally { await browser.close(); }
}
