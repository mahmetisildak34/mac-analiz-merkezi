import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
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
const origin=new URL(url).origin;
async function verifyMainApp(context){
 const main=await context.newPage();
 try{
  await main.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await main.addInitScript(()=>{
   localStorage.setItem('mam_session_token','local-browser-acceptance');
   const fetchNetwork=window.fetch.bind(window);
   window.fetch=(input,options)=>String(input)==='https://odd-sunset-6c83.m-ahmetisildak34.workers.dev/auth/check'
    ?Promise.resolve(new Response('{"ok":true}'))
    :new URL(String(input),location.href).origin===location.origin
     ?fetchNetwork(input,options)
     :Promise.reject(new TypeError('External requests disabled in the acceptance test'));
  });
  await main.goto(origin+'/index.html');
  await main.locator('#mamAuthGate').waitFor({state:'detached'});
  const measurements=await main.evaluate(()=>({openingMs:Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd)}));
  const initialFavorites=await main.evaluate(()=>localStorage.getItem('mam-product-hub-v1'));
  // Real ESPN tur.1 result 401888243, captured 2026-11-22.
  const match={
   fixture:{id:'espn-tur.1-401888243',date:'2026-11-22T10:30Z',status:{short:'FT'}},
   league:{id:'203',name:'Süper Lig',country:'Türkiye'},
   teams:{home:{id:19267,name:'Erzurum BB'},away:{id:789,name:'Goztepe'}},
   goals:{home:0,away:1}
  };
  const summary=JSON.parse(readFileSync(new URL('./fixtures/espn-tur1-401888243-summary.json',import.meta.url),'utf8'));
  await main.evaluate(({match,summary})=>{
   localStorage.setItem('mam_api_cache_v2_espn/tur.1/summary?event=401888243',JSON.stringify({time:Date.now(),data:summary}));
   setMamScreen('finished');
   document.getElementById('date').value='2026-11-22';
   allMatches=[match];
   renderMatches();
  },{match,summary});
  const card=main.locator('#matches article.match');
  assert.match(await card.innerText(),/0 – 1/);
  await card.locator('[data-mam-star="0"]').click();
  await card.locator('[data-mam-star="1"]').click();
  const opener=card.locator('.mam-match-open');
  const detailStart=performance.now();
  await opener.click();
  const dialog=main.getByRole('dialog',{name:/Erzurum BB/});
  await dialog.waitFor();
  measurements.detailMs=Math.round(performance.now()-detailStart);
  await dialog.getByRole('button',{name:'⚽ Detay'}).click();
  const profileLink=dialog.getByRole('button',{name:'Erzurum BB takım profili'});
  await profileLink.click();
  const fromDetail=main.getByRole('dialog',{name:'Erzurum BB takım profili',exact:true});
  await fromDetail.locator('#mamTeamHistoryBack').press('Escape');
  assert.equal(await profileLink.evaluate(button=>button===document.activeElement),true);
  await dialog.getByRole('button',{name:/Olaylar/}).click();
  const events=dialog.locator('.match-detail-pane[data-pane="goals"]');
  await events.getByText('Sarı kart',{exact:true}).first().waitFor();
  await events.getByText('Sinclair Armstrong / André Henrique',{exact:true}).waitFor();
  await events.getByText('Gol',{exact:true}).waitFor();
  await dialog.getByRole('button',{name:/İstatistik/}).click();
  await dialog.getByRole('cell',{name:'55.2%'}).waitFor();
  await dialog.getByRole('cell',{name:'44.8%'}).waitFor();
  await dialog.getByRole('button',{name:/Kadro/}).click();
  await dialog.getByText(/3-5-2 · 11 ilk 11/).waitFor();
  await dialog.getByText('Ertugrul Taskiran',{exact:true}).waitFor();
  const profile=dialog.locator('.lineup-player-profile').filter({hasText:'Oyuncu: Ertugrul Taskiran'});
  await profile.locator('summary').press('Enter');
  await profile.getByText('Yapılan faul',{exact:true}).waitFor();
  assert.equal(await profile.locator('dd').first().innerText(),'0');
  await dialog.getByRole('button',{name:'Yedekler',exact:true}).click();
  assert.equal(await dialog.locator('.lineup-bench-content li,.lineup-bench-content .lineup-bench-item').count(),10);
  await dialog.getByRole('button',{name:/Goztepe/}).click();
  await dialog.getByText(/3-4-1-2 · 11 ilk 11/).waitFor();
  await dialog.getByRole('button',{name:'Kadro ekranını kapat'}).click();
  await dialog.getByRole('button',{name:'Geri',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  assert.equal(await opener.evaluate(button=>document.activeElement===button),true);
  assert.equal(await main.locator('#date').inputValue(),'2026-11-22');
  await main.evaluate(()=>{allMatches=[];renderMatches();localStorage.removeItem('mam_product_hub_fixtures_v1');});
  const favorites=main.locator('#mamFavoriteBottom');
  await favorites.click();
  await main.locator('[data-fav-matches]').getByText(/Erzurum BB.*Goztepe/).waitFor();
  await main.locator('[data-fav-teams]').getByText(/Erzurum BB/).waitFor();
  await main.reload();
  await favorites.click();
  await main.locator('[data-fav-matches]').getByText(/Erzurum BB.*Goztepe/).waitFor();
  await main.locator('[data-mam-remove-match="espn-tur.1-401888243"]').click();
  await main.locator('[data-fav-matches]').getByText('Favori maç yok.').waitFor();
  const historical=JSON.parse(readFileSync(new URL('./fixtures/espn-tur1-2025-standings.json',import.meta.url),'utf8'));
  await main.evaluate(payload=>{
   const fetchNetwork=window.fetch.bind(window);
   window.historicalStandingsRequests=0;
   window.fetch=(input,options)=>{
    if(!String(input).endsWith('/api/espn/tur.1/standings?season=2025'))return fetchNetwork(input,options);
    window.historicalStandingsRequests++;
    if(window.historicalStandingsRequests>1)return Promise.reject(new TypeError('Test connection unavailable'));
    return Promise.resolve(new Response(JSON.stringify(payload)));
   };
  },historical);
  await main.locator('[data-mam-bottom="standings"]').click();
  const table=main.locator('#mamStandingsTable');
  const standingsStart=performance.now();
  await main.locator('#mamStandingsScreen [data-standing-league="203"]').first().click();
  await table.locator('[data-standing-team="Galatasaray"]').waitFor();
  measurements.cachedStandingsMs=Math.round(performance.now()-standingsStart);
  assert.match(await main.locator('#mamStandingsSeason').innerText(),/2026-27/);
  const profileRow=table.locator('[data-standing-team="Galatasaray"]');
  await profileRow.press('Enter');
  const teamProfile=main.getByRole('dialog',{name:'Galatasaray takım profili'});
  await teamProfile.getByText(/1\. sıra.*31 puan/).waitFor();
  await teamProfile.locator('#mamTeamHistoryBack').press('Escape');
  assert.equal(await profileRow.evaluate(row=>row===document.activeElement),true);
  const season=main.locator('#mamStandingsSeasonSelect');
  await season.selectOption('2025');
  await table.locator('[data-standing-team="'+historical.children[0].standings.entries[0].team.displayName+'"]').waitFor();
  assert.match(await main.locator('#mamStandingsSeason').innerText(),/2025-26/);
  await season.selectOption('');
  await table.locator('[data-standing-team="Galatasaray"]').waitFor();
  await season.selectOption('2025');
  assert.equal(await main.evaluate(()=>window.historicalStandingsRequests),1);
  await main.locator('#mamStandingsRefresh').click();
  await table.getByText(/Kaydedilmiş ESPN tablosu/).waitFor();
  assert.equal(await main.evaluate(()=>window.historicalStandingsRequests),2);
  await main.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/sw.js'));
  console.log('Main mobile timing '+JSON.stringify(measurements));
  const transition=JSON.parse(readFileSync(new URL('./fixtures/espn-esp2-401883109-transition.json',import.meta.url),'utf8'));
  async function replayEspn(step,recording=transition){
   await main.evaluate(({transition,step})=>{
    const {fixture}=transition,record=transition[step];
    const clock=mamEspnClock(record),short=mamEspnStatus(record.status.type);
    const side=key=>fixture.competitors.find(row=>row.homeAway===key).team;
    const team=key=>({id:side(key).id,name:side(key).displayName});
    const scores=Object.fromEntries(record.scores);
    allMatches=[{fixture:{id:'espn-'+transition.league+'-'+fixture.id,date:fixture.date,status:{short,...clock}},
     league:transition.league==='bra.1'?{id:'71',name:'Brasileirão',country:'Brazil'}:{id:'141',name:'La Liga 2',country:'Spain'},teams:{home:team('home'),away:team('away')},
     goals:{home:Number(scores.home),away:Number(scores.away)}}];
    setMamScreen('live');
    renderMatches();
   },{transition:recording,step});
  }
  await replayEspn('live');
  await main.locator('#matches article.match').getByText(/90\+6/).waitFor();
  await main.locator('#matches article.match').getByText('2 – 1',{exact:true}).waitFor();
  await replayEspn('finished');
  assert.equal(await main.locator('#matches article.match').count(),0);
  const brazil=JSON.parse(readFileSync(new URL('./fixtures/espn-bra1-401841318-score-change.json',import.meta.url),'utf8'));
  await replayEspn('before',brazil);
  await main.locator('#matches article.match').getByText('1 – 0',{exact:true}).waitFor();
  await replayEspn('after',brazil);
  await main.locator('#matches article.match').getByText('2 – 0',{exact:true}).waitFor();
  await main.locator('#matches article.match').getByText(/33'/).waitFor();
  await replayEspn('finished');

  await main.setViewportSize({width:320,height:720});
  assert.equal(await main.locator('.mam-bottom-nav button').evaluateAll(buttons=>buttons.every(button=>button.getBoundingClientRect().height>=44&&button.getBoundingClientRect().width>=44)),true);
  assert.equal(await main.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  await main.setViewportSize({width:430,height:932});
  assert.equal(await main.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  await main.evaluate(saved=>{localStorage.setItem('mam-product-hub-v1',saved);localStorage.removeItem('mam_app_view_state');},initialFavorites);
 }finally{await main.close();}
}

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
  let server=startServer();
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
   await verifyMainApp(page.context());
   await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
   // Stop the origin so both engines exercise a real connection failure.
   // Playwright's offline override prevents WebKit from dispatching this navigation to the worker.
   await stopServer(server);
   await assert.rejects(fetch(url));
   const offlineMain=await page.context().newPage();
   try{
    await offlineMain.addInitScript(()=>{
     const fetchNetwork=window.fetch.bind(window);
     window.fetch=(input,options)=>new URL(String(input),location.href).origin===location.origin
      ?fetchNetwork(input,options):Promise.reject(new TypeError('Test connection unavailable'));
    });
    await offlineMain.goto(origin+'/');
    await offlineMain.locator('#mamAuthGate').waitFor({state:'visible'});
    await offlineMain.getByText(/Cihazdaki favoriler korunuyor/).waitFor();
    assert.equal(await offlineMain.evaluate(()=>localStorage.getItem('mam_session_token')),'local-browser-acceptance');
    await offlineMain.getByRole('link',{name:'Cihazdaki kayıtları aç'}).click();
    await offlineMain.waitForURL('**/mobile/product-hub.html');
    await offlineMain.locator('[data-tab="favorites"]').click();
    await offlineMain.locator('#favTeams').getByText(/Fenerbahçe/).waitFor();
    await offlineMain.locator('[data-tab="live"]').click();
    await offlineMain.getByText(/Kaydedilmiş görünüm açık/).waitFor();
   }finally{await offlineMain.close();}
   await page.goto('about:blank');
   await page.goto(url);
   await page.locator('[data-tab="favorites"]').click();
   assert.match(await page.locator('#favTeams').innerText(),/Fenerbahçe/);
   await page.locator('[data-tab="leagues"]').click();
   await table.getByText(/Galatasaray/).waitFor();
   assert.ok(await page.evaluate(()=>navigator.serviceWorker.controller!==null));
   await page.evaluate(async origin=>{
    const cache=await caches.open('mam-main-shell-v2');
    await cache.put(origin+'/index.html',new Response('<h1>Old offline shell</h1>',{headers:{'content-type':'text/html'}}));
   },origin);
   server=startServer();
   await waitForServer(server);
   const reconnected=await page.context().newPage();
   try{
    await reconnected.addInitScript(()=>{
     const fetchNetwork=window.fetch.bind(window);
     window.fetch=(input,options)=>String(input).endsWith('/auth/check')
      ?Promise.resolve(new Response('{"ok":true}'))
      :new URL(String(input),location.href).origin===location.origin?fetchNetwork(input,options):Promise.reject(new TypeError('External requests disabled'));
    });
    await reconnected.goto(origin+'/');
    await reconnected.locator('#mamAuthGate').waitFor({state:'detached'});
    assert.equal(await reconnected.getByText('Old offline shell').count(),0);
    await reconnected.locator('#mamFavoriteBottom').click();
    await reconnected.locator('[data-fav-teams]').getByText(/Fenerbahçe/).waitFor();
   }finally{await reconnected.close();}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true);
  }finally{
   try{await browser?.close();}finally{await stopServer(server);}
  }
 });
}
