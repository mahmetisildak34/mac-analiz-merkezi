import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';

const port=18761;
function startServer(){
 return spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
}
async function stopServer(server){
 if(server.exitCode!==null||server.signalCode!==null)return;
 const exited=once(server,'exit');
 server.kill();
 await exited;
}
async function waitForServer(server){
 for(let attempt=0;attempt<50;attempt++){
  if(server.exitCode!==null)throw new Error('Isolated HTTP fixture server exited before browser tests');
  try{const response=await fetch('http://127.0.0.1:'+port+'/mobile/product-hub.html',{signal:AbortSignal.timeout(1000)});if(response.ok)return;}catch{}
  await delay(100);
 }
 throw new Error('Isolated HTTP fixture server did not become ready within 5 seconds');
}
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
  const server=startServer();
  let browser;
  try{
   await waitForServer(server);
   const session=await open(type);
   browser=session.browser;
   const {page}=session;
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
   assert.equal(await page.locator('#search').isVisible(),true);
   assert.equal(await page.locator('#results [data-match="101"]').evaluate(button=>document.activeElement===button),true);
   await page.locator('[data-tab="home"]').click();
   await page.locator('#matchFilter').selectOption('finished');
   await page.locator('#homeList [data-match="101"]').waitFor();
   await page.locator('#matchFilter').selectOption('upcoming');
   assert.match(await page.locator('#homeList').innerText(),/maç bulunamadı/);
   await page.locator('[data-tab="today"]').click();
   await page.locator('#matchDate').fill('2026-11-22');
   await page.locator('#todayList [data-match="101"]').waitFor();
   await page.locator('[data-tab="live"]').click();
   assert.match(await page.locator('#liveList').innerText(),/canlı maç bulunamadı/);
   // One published row from ESPN tur.1, captured 2026-11-22.
   const standings={season:{displayName:'2026-27 Turkish Super Lig'},children:[{name:'Turkish Super Lig',standings:{entries:[{
    team:{id:'432',displayName:'Galatasaray'},
    stats:Object.entries({gamesPlayed:12,losses:1,pointDifferential:13,points:31,ties:1,wins:10,rank:1}).map(([name,value])=>({name,value}))
   }]}}]};
   // Stub only the public ESPN endpoint at fetch, outside Playwright routing.
   // WebKit can send requests from a controlled page outside page.route().
   await page.evaluate(standings=>{
    const fetchNetwork=window.fetch.bind(window);
    window.standingsRequests=[];
    window.fetch=async (input,options)=>{
     const url=String(input);
     const prefix='https://odd-sunset-6c83.m-ahmetisildak34.workers.dev/api/espn/';
     if(!url.startsWith(prefix)||!url.endsWith('/standings'))return fetchNetwork(input,options);
     window.standingsRequests.push(url);
     if(url.includes('/tur.1/'))return new Response(JSON.stringify(standings));
     if(url.includes('/tur.2/'))return new Response('{"children":[]}');
     if(url.includes('/esp.1/')){
      await new Promise(resolve=>setTimeout(resolve,300));
      window.slowStandingsFinished=true;
     }
     return new Response('{');
    };
   },standings);
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
   assert.equal(await page.evaluate(()=>window.standingsRequests.length),3);
   await page.locator('#espnLeague').selectOption('esp.1');
   await table.getByText(/yükleniyor/).waitFor();
   await page.locator('#espnLeague').selectOption('tur.1');
   await page.waitForFunction(()=>window.slowStandingsFinished===true);
   await table.getByText(/Galatasaray/).waitFor();
   assert.equal(await page.evaluate(()=>window.standingsRequests.length),4);
   const metrics=await page.evaluate(async()=>{
    const navigation=performance.getEntriesByType('navigation')[0];
    const start=performance.now();
    document.querySelector('[data-tab="search"]').click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    return {openingMs:Math.round(navigation.domContentLoadedEventEnd),transitionMs:Math.round(performance.now()-start)};
   });
   assert.ok(metrics.openingMs>0&&metrics.openingMs<5000);
   assert.ok(metrics.transitionMs<500);
   console.log(name+' mobile timing '+JSON.stringify(metrics));
   assert.equal(await page.locator('.nav [aria-current="page"]').count(),1);
   assert.equal(await page.locator('.nav button').evaluateAll(buttons=>buttons.every(button=>button.getBoundingClientRect().height>=44&&button.textContent.trim())),true);
   await page.locator('#query').focus();
   assert.equal(await page.locator('#query').evaluate(input=>document.activeElement===input&&getComputedStyle(input).outlineStyle!=='none'),true);
   await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
   // Stop the origin so both engines exercise a real connection failure.
   // Playwright's offline override prevents WebKit from dispatching this navigation to the worker.
   await stopServer(server);
   await assert.rejects(fetch(url));
   await page.goto('about:blank');
   await page.goto(url);
   await page.locator('[data-tab="favorites"]').click();
   assert.match(await page.locator('#favTeams').innerText(),/Fenerbahçe/);
   await page.locator('[data-tab="leagues"]').click();
   await table.getByText(/Galatasaray/).waitFor();
   assert.ok(await page.evaluate(()=>navigator.serviceWorker.controller!==null));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  }finally{
   try{await browser?.close();}finally{await stopServer(server);}
  }
 });
}
