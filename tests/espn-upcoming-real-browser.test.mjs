// On-demand real ESPN acceptance. Uses public read-only scoreboards and a local app server.
// No Worker, D1 or API-Football requests are issued.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';

const port=18788,origin='http://127.0.0.1:'+port, now=Date.parse('2026-11-23T07:00:00Z');
const cases=[
 {slug:'tur.1',leagueId:'203',day:'20261123'},
 {slug:'eng.1',leagueId:'39',day:'20261123'},
 {slug:'uefa.champions',leagueId:'2',day:'20261124'}
];
async function getSource(sample){
 const url='https://site.api.espn.com/apis/site/v2/sports/soccer/'+sample.slug+'/scoreboard?dates='+sample.day;
 const result=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 assert.equal(result.status,200,url+' returned HTTP '+result.status);
 const board=await result.json();
 const event=(board.events||[]).find(e=>{
  const sides=e.competitions?.[0]?.competitors||[];
  return e.status?.type?.state==='pre'&&Date.parse(e.date)>now&&
   sides.length===2&&sides.every(c=>/^\\d+$/.test(String(c.team?.id||''))&&c.team?.displayName)&&
   sides.some(c=>c.homeAway==='home')&&sides.some(c=>c.homeAway==='away');
 });
 assert.ok(event,'No public ESPN upcoming event found for '+sample.slug+' on '+sample.day+'; records='+JSON.stringify((board.events||[]).slice(0,4).map(e=>({id:e.id,date:e.date,state:e.status?.type?.state,competitors:e.competitions?.[0]?.competitors?.map(c=>({homeAway:c.homeAway,id:c.team?.id,name:c.team?.displayName||c.team?.name}))}))));
 const home=event.competitions[0].competitors.find(x=>x.homeAway==='home');
 const away=event.competitions[0].competitors.find(x=>x.homeAway==='away');
 return {...sample,event,board,home,away,url};
}
async function serve(){
 const child=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{stdio:'ignore'});
 for(let i=0;i<50;i++){
  try{if((await fetch(origin+'/index.html',{signal:AbortSignal.timeout(1000)})).ok)return child;}catch{}
  await delay(100);
 }
 child.kill();
 throw new Error('Isolated browser server did not start');
}
async function stop(child){
 if(!child)return;
 if(child.exitCode===null&&child.signalCode===null)child.kill();
}
test('Real public ESPN upcoming fixtures appear in iPhone team profiles (Chromium and WebKit)',{timeout:180000},async()=>{
 const casesReady=await Promise.all(cases.map(getSource));
 console.log('Real source evidence '+JSON.stringify(casesReady.map(x=>({slug:x.slug,url:x.url,id:x.event.id,date:x.event.date,home:x.home.team.id,away:x.away.team.id}))));
 const server=await serve();
 try{
  for(const [engineName,engine] of [['Chromium',chromium],['WebKit',webkit]]){
   const browser=await engine.launch({headless:true});
   try{
    for(const sample of casesReady){
     const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,serviceWorkers:'block'});
     try{
      const page=await context.newPage();
      await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
      await page.addInitScript(({board,slug})=>{
       localStorage.setItem('mam_session_token','local-browser-acceptance');
       const original=window.fetch.bind(window);
       window.fetch=(input,options)=>{
        const url=new URL(String(input),location.href);
        if(url.pathname.endsWith('/auth/check'))return Promise.resolve(new Response('{"ok":true}'));
        if(url.pathname.includes('/api/espn/')){
         const part=url.pathname.split('/api/espn/')[1];
         if(part===slug+'/teams/'+window.__testTeamId+'/schedule' || (part.startsWith(slug+'/teams/')&&part.endsWith('/schedule')))
          return Promise.resolve(new Response('{"events":[]}'));
         if(part===slug+'/scoreboard')return Promise.resolve(new Response(JSON.stringify(board)));
         return Promise.resolve(new Response('{"events":[]}'));
        }
        return url.origin===location.origin?original(input,options):Promise.reject(new Error('Other network requests disabled'));
       };
      },{board:sample.board,slug:sample.slug});
      await page.goto(origin+'/index.html');
      await page.locator('#mamAuthGate').waitFor({state:'detached'});
      await page.clock.setFixedTime(new Date(now));
      const props={teamId:String(sample.home.team.id),leagueId:sample.leagueId,name:sample.home.team.displayName};
      await page.evaluate(async ({teamId,leagueId,name})=>{
       const button=document.createElement('button');
       button.dataset.standingTeam=name;
       button.dataset.standingTeamId=teamId;
       button.dataset.teamSource='espn';
       button.dataset.exactSearch='1';
       button.textContent=name;document.body.append(button);
       await openStandingTeamHistory(button,leagueId,button);
      },props);
      const dialog=page.getByRole('dialog',{name:props.name+' takım profili',exact:true});
      await dialog.locator('[data-history-view="upcoming"]').click();
      const card=dialog.locator('#mamHistoryUpcomingView .mam-upcoming-match').filter({hasText:sample.away.team.displayName}).first();
      await card.waitFor({state:'visible',timeout:15000});
      assert.match(await card.innerText(),new RegExp(sample.home.team.displayName.replace(/[.*+?^${\}()|[\]\\]/g,'\\$&')));
      const visible=await card.evaluate(el=>({
       text:el.innerText,
       date:el.querySelector('.match-time')?.innerText,
       logos:[...el.querySelectorAll('.team-logo,img')].map(x=>x.getAttribute('src')),
       fixture:el.getAttribute('data-fixture'),
       width:el.getBoundingClientRect().width,
       viewport:window.innerWidth
      }));
      const istanbul=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(sample.event.date));
      const [datePart,timePart]=istanbul.split(' ');
      assert.ok(visible.date?.includes(datePart)&&visible.date?.includes(timePart),
       engineName+' '+sample.slug+' Istanbul kickoff mismatch '+JSON.stringify({visible,istanbul}));
      assert.ok(visible.fixture?.includes(String(sample.event.id)),engineName+' '+sample.slug+' ESPN event ID mismatch');
      assert.ok(visible.logos.length>=2&&visible.logos.every(Boolean),engineName+' '+sample.slug+' missing logos');
      assert.ok(visible.width<=visible.viewport+1,'mobile horizontal overflow');
      console.log('PASS real ESPN profile '+JSON.stringify({engine:engineName,slug:sample.slug,id:sample.event.id,teamId:props.teamId,opponent:sample.away.team.displayName,istanbul,logos:visible.logos.length}));
     }finally{await context.close();}
    }
   }finally{await browser.close();}
  }
 }finally{await stop(server);}
});
