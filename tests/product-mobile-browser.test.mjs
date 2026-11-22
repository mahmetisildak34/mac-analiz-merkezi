import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';

const port=18761;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
server.unref();
async function waitForServer(){
 for(let attempt=0;attempt<50;attempt++){
  if(server.exitCode!==null)throw new Error('Isolated HTTP fixture server exited before browser tests');
  try{const response=await fetch('http://127.0.0.1:'+port+'/mobile/product-hub.html',{signal:AbortSignal.timeout(1000)});if(response.ok)return;}catch{}
  await delay(100);
 }
 throw new Error('Isolated HTTP fixture server did not become ready within 5 seconds');
}
const ready=waitForServer();
const fixture={id:'101',homeTeamId:'1',awayTeamId:'2',homeTeamName:'Fenerbahçe',awayTeamName:'Galatasaray',homeGoals:2,awayGoals:1,status:'FT',kickoff:'2026-11-22T17:00:00Z',leagueId:'tr',leagueName:'Süper Lig',events:[{time:{elapsed:15},team:{name:'Fenerbahçe'},player:{name:'Örnek Oyuncu'},type:'Goal'}],statistics:[{type:'Topla sahip olma',home:'55%',away:'45%'}]};
const url='http://127.0.0.1:'+port+'/mobile/product-hub.html';
async function open(browserType){
 await ready;
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
   // One published row from ESPN tur.1, captured 2026-11-22.
   const standings={season:{displayName:'2026-27 Turkish Super Lig'},children:[{name:'Turkish Super Lig',standings:{entries:[{
    team:{id:'432',displayName:'Galatasaray'},
    stats:Object.entries({gamesPlayed:12,losses:1,pointDifferential:13,points:31,ties:1,wins:10,rank:1}).map(([name,value])=>({name,value}))
   }]}}]};
   let requests=0;
   await page.route('https://site.api.espn.com/apis/v2/sports/soccer/*/standings',route=>{
    requests++;
    const url=route.request().url();
    if(url.includes('/tur.1/'))return route.fulfill({json:standings,headers:{'access-control-allow-origin':'*'}});
    if(url.includes('/tur.2/'))return route.fulfill({json:{children:[]},headers:{'access-control-allow-origin':'*'}});
    return route.fulfill({body:'{',headers:{'access-control-allow-origin':'*'}});
   });
   await page.locator('[data-tab="leagues"]').click();
   const table=page.locator('#espnTable');
   await table.getByText(/Galatasaray.*31 puan.*12 maç.*10 G.*1 B.*1 M.*13 averaj/).waitFor();
   assert.match(await table.innerText(),/2026-27/);
   await page.locator('#espnLeague').selectOption('tur.2');
   await table.getByText(/puan tablosu yayımlamadı/).waitFor();
   await page.locator('#espnLeague').selectOption('eng.1');
   await table.getByText(/puan tablosuna ulaşılamadı/).waitFor();
   await page.locator('#espnLeague').selectOption('tur.1');
   await table.getByText(/Galatasaray/).waitFor();
   assert.equal(requests,3);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  }finally{await browser.close();}
 });
}
process.on('exit',()=>server.kill());
