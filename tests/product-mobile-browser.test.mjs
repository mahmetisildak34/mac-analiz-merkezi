import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,webkit} from 'playwright';

const port=18761;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
server.unref();
const fixture={id:'101',homeTeamId:'1',awayTeamId:'2',homeTeamName:'Fenerbahçe',awayTeamName:'Galatasaray',homeGoals:2,awayGoals:1,status:'FT',kickoff:'2026-11-22T17:00:00Z',leagueId:'tr',leagueName:'Süper Lig',events:[{time:{elapsed:15},team:{name:'Fenerbahçe'},player:{name:'Örnek Oyuncu'},type:'Goal'}],statistics:[{type:'Topla sahip olma',home:'55%',away:'45%'}]};
const url='http://127.0.0.1:'+port+'/mobile/product-hub.html';
async function open(browserType){
 const browser=await browserType.launch({headless:true});
 const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
 await context.addInitScript(({fixture})=>{
  localStorage.setItem('mam_product_hub_fixtures_v1',JSON.stringify({savedAt:Date.now(),matches:[fixture]}));
 },{fixture});
 const page=await context.newPage();
 await page.goto(url);
 return {browser,context,page};
}
for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){
 test(name+' mobile favorites, refresh, search, details and navigation',async()=>{
  const {browser,page}=await open(type);
  try{
   await page.locator('#homeList [data-favmatch="101"]').click();
   await page.locator('[data-tab="favorites"]').click();
   assert.match(await page.locator('#favMatches').innerText(),/Fenerbahçe/);
   await page.reload();
   await page.locator('[data-tab="favorites"]').click();
   assert.match(await page.locator('#favMatches').innerText(),/Fenerbahçe/);
   await page.locator('#favMatches [data-favmatch="101"]').click();
   assert.match(await page.locator('#favMatches').innerText(),/Favori maç bulunamadı/);
   await page.locator('[data-tab="teams"]').click();
   await page.locator('#teamsList [data-favteam="1"]').click();
   await page.locator('[data-tab="favorites"]').click();
   assert.match(await page.locator('#favTeams').innerText(),/Fenerbahçe/);
   await page.locator('[data-tab="search"]').click();
   await page.locator('#query').fill('fenerbahçe');
   assert.match(await page.locator('#results').innerText(),/Fenerbahçe/);
   await page.locator('#results [data-match="101"]').click();
   assert.match(await page.locator('#detailsContent').innerText(),/Örnek Oyuncu/);
   assert.match(await page.locator('#detailsContent').innerText(),/55%/);
   await page.locator('#detailsBack').click();
   assert.equal(await page.locator('#home').isVisible(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  }finally{await browser.close();}
 });
}
process.on('exit',()=>server.kill());
