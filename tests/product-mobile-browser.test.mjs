import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdirSync,readFileSync} from 'node:fs';
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
async function verifyStartupAndBrowserHistory(context,browserName){
 const isolated=await context.browser().newContext({serviceWorkers:'block'});
 const pageErrors=[];
 try{
  const page=await isolated.newPage();
  page.on('pageerror',error=>pageErrors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await page.addInitScript(()=>{
   localStorage.setItem('mam_session_token','local-browser-acceptance');
   window.__mamDashboardStatusRequests=[];
   const fetchNetwork=window.fetch.bind(window);
   window.fetch=(input,options)=>{
    const url=String(input);
    if(url.includes('/api/archive/d1-status')||url.includes('/api/archive/sync-status')){
     window.__mamDashboardStatusRequests.push(url);
     return Promise.resolve(new Response('{"ok":true,"total":12,"statistics":{"withStatistics":8,"missingStatistics":4,"coveragePercent":67},"statisticsQueuePending":2,"complete":false,"leagues":[]}'));
    }
    if(url==='https://odd-sunset-6c83.m-ahmetisildak34.workers.dev/auth/check')return Promise.resolve(new Response('{"ok":true}'));
    return new URL(url,location.href).origin===location.origin
     ?fetchNetwork(input,options)
     :Promise.reject(new TypeError('External requests disabled in the acceptance test'));
   };
  });
  await page.goto(origin+'/index.html');
  await page.locator('#mamAuthGate').waitFor({state:'hidden'});
  await page.waitForTimeout(50);
  const statusRequests=await page.evaluate(()=>window.__mamDashboardStatusRequests);
  assert.equal(statusRequests.filter(url=>url.includes('/api/archive/d1-status')).length,1,browserName+' should preserve the archive-league lookup');
  assert.equal(statusRequests.filter(url=>url.includes('/api/archive/sync-status')).length,0,browserName+' should skip unused KPI sync stats when no KPI widgets exist');
  assert.equal(pageErrors.some(message=>message.includes('Cannot set properties of null')),false,browserName+' should not throw while dashboard KPI widgets are absent');
  const match={fixture:{id:'history-test-1',date:'2026-11-24T12:00:00Z',status:{short:'FT'}},league:{id:'203',name:'Süper Lig',country:'Türkiye'},teams:{home:{id:'1',name:'Ev sahibi'},away:{id:'2',name:'Deplasman'}},goals:{home:1,away:0}};
  await page.evaluate(match=>{setMamScreen('finished');document.getElementById('date').value='2026-11-24';allMatches=[match];renderMatches();},match);
  const opener=page.locator('#matches .mam-match-open').first();
  await opener.click();
  const dialog=page.getByRole('dialog',{name:/Ev sahibi/});
  await dialog.waitFor({state:'visible'});
  await page.goBack();
  await page.waitForFunction(()=>location.hash!=='#match-detail');
  assert.equal(await dialog.isVisible(),false,browserName+' browser Back should close match details');
  await page.goForward();
  await page.waitForFunction(()=>location.hash==='#match-detail');
  await page.waitForTimeout(50);
  assert.equal(await dialog.isVisible(),true,browserName+' browser Forward should restore match details');
 }finally{await isolated.close();}
}
async function verifyMainApp(context,browserName){
 await verifyStartupAndBrowserHistory(context,browserName);
 const main=await context.newPage();
 try{
  await main.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await main.addInitScript(()=>{
   localStorage.setItem('mam_session_token','local-browser-acceptance');
   sessionStorage.setItem('mam_auth_refresh_v1','local-browser-refresh');
   const worker='https://odd-sunset-6c83.m-ahmetisildak34.workers.dev';
   const model={
    role:'PREMIUM',quota:{used:1,limit:50,remaining:49},day:'2026-11-24',
    lambdaHome:1.5,lambdaAway:1.2,homeWin:.45,draw:.3,awayWin:.25,
    over15:.65,over25:.45,over35:.28,btts:.52,hasHalf:false,
    first05:null,first15:null,second05:null,second15:null,
    topScores:[{h:1,a:0,p:.2},{h:1,a:1,p:.15},{h:2,a:0,p:.12},{h:0,a:0,p:.1},{h:0,a:1,p:.08}],
    outcome:{label:'Ev sahibi kazanır',chance:.45}
   };
   const respond=data=>Promise.resolve(new Response(JSON.stringify(data)));
   const fetchNetwork=window.fetch.bind(window);
   window.fetch=(input,options)=>{
    const url=String(input);
    if(url===worker+'/membership/config')return respond({configured:false,turnstileSiteKey:null});
    if(url===worker+'/membership/auth/refresh')return respond({access_token:'local-premium-access',refresh_token:'local-browser-refresh'});
    if(url===worker+'/membership/me')return respond({role:'PREMIUM',quota:{used:0,limit:50,remaining:50}});
    if(url===worker+'/membership/analysis')return respond(model);
    if(url===worker+'/auth/check')return respond({ok:true});
    return new URL(url,location.href).origin===location.origin
     ?fetchNetwork(input,options)
     :Promise.reject(new TypeError('External requests disabled in the acceptance test'));
   };
  });
  await main.goto(origin+'/index.html');
  await main.locator('#mamAuthGate').waitFor({state:'hidden'});
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
  assert.equal(await card.locator('[data-mam-star]:visible').count(),1);
  const opener=card.locator('.mam-match-open');
  const detailStart=performance.now();
  await opener.click();
  const dialog=main.getByRole('dialog',{name:/Erzurum BB/});
  await dialog.waitFor();
  measurements.detailMs=Math.round(performance.now()-detailStart);
  await dialog.locator('[data-mam-star="1"]').click();
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
  const espnProfile=JSON.parse(readFileSync(new URL('./fixtures/espn-arsenal-profile-20261123.json',import.meta.url),'utf8'));
  await main.evaluate(sample=>{
   const originalFetch=window.fetch.bind(window);
   window.originalMobileNow=Date.now;
   Date.now=()=>Date.parse('2026-11-23T06:00:00Z');
   const directory={teams:[{team:{id:'359',displayName:'Arsenal'}}]};
   window.fixtureProfileRequests=[];window.espnDirectoryRequests=[];
   window.fetch=(input,options)=>{
    const url=new URL(String(input),location.href);
    if(url.hostname==='site.api.espn.com'&&url.pathname.endsWith('/teams')){
      window.espnDirectoryRequests.push(url.pathname);
     const teams=url.pathname.includes('/eng.1/')||url.pathname.includes('/uefa.champions/')?directory:{teams:[]};
     return Promise.resolve(new Response(JSON.stringify({sports:[{leagues:[teams]}]})));
    }
    const route=url.pathname.split('/api/')[1];
    if(route?.startsWith('espn/eng.1/')){
     window.fixtureProfileRequests.push(route+'?'+url.searchParams);
     const payload=route.includes('/teams/359/schedule')?sample.schedule:sample.scoreboards[url.searchParams.get('dates')];
     if(payload)return Promise.resolve(new Response(JSON.stringify(payload)));
    }
    return originalFetch(input,options);
   };
   const base={league:{id:'39',name:'Premier League',country:'England'},
    fixture:{id:2229,date:'2026-11-23T21:30:00Z',status:{short:'NS'}},
    teams:{home:{id:42,name:'Arsenal'},away:{id:-1,name:'Club With Missing ID'}},goals:{home:0,away:0}};
   setMamScreen('home');document.getElementById('league').value='all';
   document.getElementById('date').value='2026-11-24';
   allMatches=[base];renderMatches();
  },espnProfile);
  const midnightCard=main.locator('#matches article.match').filter({hasText:'Club With Missing ID'});
  await midnightCard.locator('.match-clock').getByText('00:30',{exact:true}).waitFor();
  await midnightCard.locator('[data-mam-star="0"]').waitFor();
  assert.equal(await midnightCard.locator('[data-mam-star="2"]').count(),0);
  const search=main.locator('#mamSearchToggle');
  await search.click();
  assert.equal(await main.locator('#mamTeamSearchResults button').count(),0);
  const input=main.locator('#mamTeamSearchInput');
  await input.fill('Ars');
  const arsenal=main.locator('#mamTeamSearchResults [data-search-team="espn:eng.1:359"]');
  await arsenal.waitFor().catch(async error=>{
    const diagnostic=await main.evaluate(()=>({
     input:document.getElementById('mamTeamSearchInput')?.value,
     help:document.getElementById('mamTeamSearchHelp')?.textContent,
     results:document.getElementById('mamTeamSearchResults')?.innerText,
     requests:window.espnDirectoryRequests||[],
     cache:localStorage.getItem('mam_search_espn_teams_v1')?.slice(0,500)
    }));
    throw new Error('ESPN directory search failed: '+JSON.stringify(diagnostic),{cause:error});
   });
  assert.equal(await main.locator('#mamTeamSearchResults button').count(),1);
  await arsenal.click();
  const foundProfile=main.getByRole('dialog',{name:'Arsenal takım profili',exact:true});
  await foundProfile.locator('#mamHistoryPastView').getByText(/Newcastle United/).first().waitFor();
  await foundProfile.locator('[data-history-view="upcoming"]').click();
  await foundProfile.locator('#mamHistoryUpcomingView').getByText('Manchester City',{exact:true}).waitFor();
  await foundProfile.locator('#mamHistoryUpcomingView').getByText(/Önümüzdeki 30 gün/).waitFor();
  assert.equal(await main.evaluate(()=>window.fixtureProfileRequests.some(x=>x.includes('/teams/42/'))),false);
  assert.equal(await foundProfile.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  await foundProfile.locator('#mamTeamHistoryBack').press('Escape');
  assert.equal(await search.evaluate(el=>el===document.activeElement),true);
  await main.evaluate(()=>{
   const now=Date.now();
   const live=(id,league,name,status,goals={home:1,away:0})=>({fixture:{id,date:new Date(now-70*60000).toISOString(),status},
    league,teams:{home:{id:2001,name},away:{id:2002,name:'Rakip'}},goals});
   const league={id:'39',name:'Premier League',country:'England'};
   setMamScreen('live');
   allMatches=[live('espn-abc.1-800',{id:'999',name:'Diğer Lig'},'Diğer Canlı',{short:'LIVE',elapsed:69}),
    live('espn-eng.1-801',league,'Arsenal Test',{short:'HT',elapsed:45}),
    live('espn-eng.1-802',league,'Saat Verisi Yok',{short:'LIVE',elapsed:null,displayClock:'Nov 23, 2026'},{home:null,away:null}),
    live('espn-eng.1-803',league,'Ertelenen Test',{short:'PST'}),
    live('espn-eng.1-804',league,'İptal Test',{short:'CANC'}),
    live('espn-eng.1-805',league,'Biten Test',{short:'FT'})];
   document.getElementById('date').value=mamIstanbulDay(allMatches[0].fixture.date);
   renderMatches();
  });
  assert.equal(await main.locator('#matches .mam-league-heading strong').first().innerText(),'Premier League');
  const halftimeClock=main.locator('#matches article').filter({hasText:'Arsenal Test'}).locator('.match-time');
  await halftimeClock.waitFor();
  assert.match(await halftimeClock.innerText(),/Devre arası/);
  const missingClock=main.locator('#matches article').filter({hasText:'Saat Verisi Yok'});
  assert.doesNotMatch(await missingClock.locator('.match-time').innerText(),/\d+'/);
  assert.equal(await missingClock.locator('.match-clock').innerText(),'—');
  assert.equal(await main.locator('#matches article').filter({hasText:/Ertelenen Test|İptal Test|Biten Test/}).count(),0);
  // Regression for the original 8849f62 Chromium/WebKit hidden #matches article timeout.
  // Hidden cards must be excluded from visibility-based checks, never assumed visible
  // just because a text selector resolves to a DOM node.
  const visibleHalf=main.locator('#matches article.match:visible').filter({hasText:'Arsenal Test'});
  assert.equal(await visibleHalf.count(),1);
  assert.match(await visibleHalf.locator('.match-time').innerText(),/Devre arası/);
  await main.evaluate(()=>{
   const source=document.querySelector('#matches article.match');
   if(!source)throw new Error('Missing visible card to clone');
   const hidden=source.cloneNode(true);
   hidden.dataset.testHiddenCard='1';
   hidden.style.setProperty('display','none','important');
   document.querySelector('#matches').appendChild(hidden);
  });
  const hiddenCard=main.locator('#matches article[data-test-hidden-card="1"]');
  assert.equal(await hiddenCard.count(),1);
  assert.equal(await hiddenCard.isVisible(),false);
  assert.equal(await main.locator('#matches article:visible[data-test-hidden-card="1"]').count(),0);
  assert.ok(await main.locator('#matches article:visible').count()>0);
  await main.evaluate(()=>document.querySelector('#matches article[data-test-hidden-card="1"]').remove());
  await main.evaluate(()=>{
   const now=Date.now();
   const league={id:'39',name:'Premier League',country:'England'};
    const make=(id,status,team,offset)=>({fixture:{id,date:new Date(now+offset*86400000).toISOString(),status:{short:status}},
     league,teams:{home:{id:2001,name:team},away:{id:2002,name:'Rakip'}},goals:{home:null,away:null}});
    window.__visibilityFixtures=[make('upcoming-ui','NS','Gelecek Kart',2),make('finished-ui','FT','Biten Kart',-2)];
    setMamScreen('upcoming');allMatches=window.__visibilityFixtures.filter(m=>m.fixture.status.short==='NS');
    document.getElementById('date').value=mamIstanbulDay(allMatches[0].fixture.date);renderMatches();
   });
  assert.equal(await main.locator('#matches article:visible').filter({hasText:'Gelecek Kart'}).count(),1);
  assert.equal(await main.locator('#matches article:visible').filter({hasText:'Biten Kart'}).count(),0);
  await main.evaluate(()=>{setMamScreen('finished');allMatches=window.__visibilityFixtures.filter(m=>m.fixture.status.short==='FT');
   document.getElementById('date').value=mamIstanbulDay(allMatches[0].fixture.date);renderMatches();});
  assert.equal(await main.locator('#matches article:visible').filter({hasText:'Gelecek Kart'}).count(),0);
  await main.evaluate(()=>{setMamScreen('live');allMatches=[];renderMatches();});
  assert.equal(await main.locator('#matches article:visible').count(),0);
  assert.ok(await main.locator('#matches').isVisible());

  await main.evaluate(()=>{Date.now=window.originalMobileNow;});
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
  await main.locator('#mamStandingsBack').click();
  await main.locator('#mamStandingsScreen [data-standing-league="206"]').first().click();
  const officialCup=table.getByRole('link',{name:'TFF resmî kupa fikstürünü aç'});
  assert.equal(await officialCup.getAttribute('href'),'https://www.tff.org/default.aspx?pageID=598');
  assert.equal(await table.locator('table').count(),0);
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
    document.getElementById('date').value=mamIstanbulDay(allMatches[0].fixture.date);
    renderMatches();
   },{transition:recording,step});
  }
  async function toggleRecordedFavorites(){
   const card=main.locator('#matches article.match').first();
   const button=card.locator('[data-mam-star]:visible');
   assert.equal(await button.count(),1);
   assert.equal(await button.getAttribute('aria-pressed'),'false');
   await button.click();
   assert.equal(await button.getAttribute('aria-pressed'),'true');
   await button.click();
   assert.equal(await button.getAttribute('aria-pressed'),'false');
  }
  await replayEspn('live');
  await main.locator('#matches article.match').getByText(/90\+6/).waitFor();
  await main.locator('#matches article.match').getByText('2 – 1',{exact:true}).waitFor();
  await toggleRecordedFavorites();
  await replayEspn('finished');
  assert.equal(await main.locator('#matches article.match').count(),0);
  const brazil=JSON.parse(readFileSync(new URL('./fixtures/espn-bra1-401841318-score-change.json',import.meta.url),'utf8'));
  await replayEspn('before',brazil);
  await main.locator('#matches article.match').getByText('1 – 0',{exact:true}).waitFor();
  await replayEspn('after',brazil);
  await main.locator('#matches article.match').getByText('2 – 0',{exact:true}).waitFor();
  await main.locator('#matches article.match').getByText(/33'/).waitFor();
  await toggleRecordedFavorites();
  await replayEspn('finished');

  // Rewind only the test clock. Match identity, kickoff and the two ten-match
  // histories come from ESPN recordings. Percentages are computed by the app.
  const analysisInputs=JSON.parse(readFileSync(new URL('./fixtures/espn-poisson-historical-inputs.json',import.meta.url),'utf8'));
  for(const sample of analysisInputs){
   await main.clock.setFixedTime(new Date(Date.parse(sample.fixture.date)-60000));
   await main.evaluate(sample=>{
    window.getTeamFixtures=async teamId=>sample.history[String(teamId)]??[];
    const match={league:sample.league,teams:sample.teams,fixture:{...sample.fixture,status:{short:'NS'}}};
    setMamScreen('home');
    allMatches=[match];
    renderMatches();
   },sample);
   const forecastCard=main.locator('#matches article.match');
   await forecastCard.locator('.mam-match-open').click();
   const forecast=main.getByRole('dialog',{name:sample.teams.home.name+' – '+sample.teams.away.name});
   await forecast.getByText('Maç önü tahmini',{exact:true}).waitFor();
   await forecast.getByText(/En yeni örnek maç: 2026-/).waitFor();
   await forecast.getByText('En olası 5 skor',{exact:true}).waitFor();
   assert.equal(await forecast.locator('.scoreline').count(),5);
   await forecast.getByRole('button',{name:'Geri',exact:true}).click();
  }
  await main.clock.setFixedTime(new Date());
  const visualDir=process.env.MAM_VISUAL_DIR;
  if(visualDir){
   mkdirSync(visualDir,{recursive:true});
   const baseline='717c273d40b7cd2d6a1467942e86e819f5c64f1a';
   const beforeHtml=execFileSync('git',['show',baseline+':index.html'],{encoding:'utf8',maxBuffer:2_000_000});
   const beforeFavorites=execFileSync('git',['show',baseline+':mobile/main-favorites.mjs'],{encoding:'utf8'});
   const visualContext=await context.browser().newContext({isMobile:true,hasTouch:true,serviceWorkers:'block'});
   try{
    const visual=await visualContext.newPage();
    await visual.addInitScript(()=>{
     localStorage.setItem('mam_session_token','local-browser-acceptance');
     localStorage.removeItem('mam_app_view_state');
     const fetchNetwork=window.fetch.bind(window);
     window.fetch=(input,options)=>String(input).endsWith('/auth/check')
      ?Promise.resolve(new Response('{"ok":true}'))
      :new URL(String(input),location.href).origin===location.origin?fetchNetwork(input,options):Promise.reject(new Error('External requests disabled'));
    });
    let before=true;
    await visual.route('**/*',route=>{
     const url=new URL(route.request().url());
     if(url.origin!==origin)return route.abort();
     if(before&&url.pathname==='/index.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:beforeHtml});
     if(before&&url.pathname==='/mobile/main-favorites.mjs')return route.fulfill({contentType:'text/javascript; charset=utf-8',body:beforeFavorites});
     return route.continue();
    });
    for(const mode of ['before','after']){
     before=mode==='before';
     for(const width of [375,390,430]){
      await visual.setViewportSize({width,height:844});
      await visual.goto(origin+'/index.html?visual='+mode+width);
      await visual.locator('#mamAuthGate').waitFor({state:'hidden'});
      await visual.evaluate(match=>{
       setMamScreen('finished');
       allMatches=[match];
       renderMatches();
      },match);
      const card=visual.locator('#matches article.match');
      await card.locator('[data-mam-star="0"]').waitFor();
      if(!before){
       assert.equal(await visual.locator('.mam-bottom-nav button:visible').count(),5);
       assert.equal(await visual.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
       assert.equal(await card.locator('[data-mam-star]:visible').evaluateAll(buttons=>buttons.every(button=>button.offsetWidth>=44&&button.offsetHeight>=44)),true);
       assert.equal(await card.locator('.team-block strong').evaluateAll(names=>names.every(name=>name.scrollHeight<=name.clientHeight+1&&name.scrollWidth<=name.clientWidth+1)),true);
      }
      await visual.screenshot({path:visualDir+'/'+browserName+'-'+width+'-'+mode+'-matches.png',animations:'disabled'});
      await visual.locator('[data-mam-bottom="standings"]').click();
      await visual.screenshot({path:visualDir+'/'+browserName+'-'+width+'-'+mode+'-leagues.png',animations:'disabled'});
      if(!before){
       await visual.locator('#mamMenuToggle').click();
       await visual.getByRole('button',{name:'Özel analizler'}).waitFor();
       await visual.getByRole('button',{name:'Maç listesi',exact:true}).waitFor();
       await visual.locator('#mamMenuClose').click();
       await visual.getByRole('button',{name:'Takım ara',exact:true}).click();
       const search=visual.getByRole('dialog',{name:'Takım ve lig arama'});
       await search.locator('#mamTeamSearchInput').waitFor();
       await search.getByRole('button',{name:'Aramayı kapat'}).click();
       await search.waitFor({state:'hidden'});
      }
     }
    }
   }finally{await visualContext.close();}
  }
  await main.setViewportSize({width:320,height:720});
  assert.equal(await main.locator('.mam-bottom-nav button:visible').evaluateAll(buttons=>buttons.every(button=>button.getBoundingClientRect().height>=44&&button.getBoundingClientRect().width>=44)),true);
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
   await verifyMainApp(page.context(),name);
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
    await offlineMain.locator('#mamAuthGate').waitFor({state:'hidden'});
    await offlineMain.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    assert.equal(await offlineMain.evaluate(()=>localStorage.getItem('mam_session_token')),'local-browser-acceptance');
    await offlineMain.goto(url);
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
    await reconnected.locator('#mamAuthGate').waitFor({state:'hidden'});
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
