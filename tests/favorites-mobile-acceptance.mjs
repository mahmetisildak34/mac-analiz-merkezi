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
    await page.evaluate(()=>{
      window.__teamHistoryLifecycle=[];
      const remove=Element.prototype.remove;
      Element.prototype.remove=function(){if(this.id==='mamTeamHistoryScreen')window.__teamHistoryLifecycle.push({type:'remove',stack:new Error().stack});return remove.apply(this,arguments);};
      new MutationObserver(records=>records.forEach(record=>record.removedNodes.forEach(node=>{if(node.id==='mamTeamHistoryScreen')window.__teamHistoryLifecycle.push({type:'detached',html:node.innerHTML.slice(-500)});}))).observe(document.body,{childList:true,subtree:true});
    });
    await results.first().click();
    await page.waitForTimeout(100);
    console.log(name+' team-history lifecycle '+JSON.stringify(await page.evaluate(()=>{const screen=document.getElementById('mamTeamHistoryScreen');return {exists:!!screen,buttons:[...(screen?.querySelectorAll('button')||[])].map(button=>({id:button.id,text:button.textContent,display:getComputedStyle(button).display,rect:button.getBoundingClientRect().toJSON()})),htmlTail:screen?.innerHTML.slice(-700),removals:window.__teamHistoryLifecycle};})));
    await page.locator('#mamTeamHistoryScreen').waitFor({state:'visible',timeout:10000});
    assert.equal(await search.isVisible(),false,name+' search closes on team selection');
    const screenState = await page.locator('#mamTeamHistoryScreen').evaluate(screen=>({htmlTail:screen.innerHTML.slice(-900),buttons:[...screen.querySelectorAll('button')].map(button=>({id:button.id,text:button.textContent,display:getComputedStyle(button).display,rect:button.getBoundingClientRect().toJSON()})),screenDisplay:getComputedStyle(screen).display,openHandler:String(window.mamOpenStandingTeamHistory).slice(0,100)}));
    console.log(name+' team-history DOM '+JSON.stringify(screenState));
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
