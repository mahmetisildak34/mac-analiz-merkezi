import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {chromium,webkit} from "playwright";
import {espnCompetitions} from "../mobile/product-features.mjs";

const origin="http://127.0.0.1:19172";
const espn="https://site.api.espn.com";
const leagues=[["tur.1","203"],["eng.1","39"]];
const supportedLeagues=[...espnCompetitions.keys()];
const istanbulDay=date=>new Intl.DateTimeFormat("en-CA",{
 timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"
}).format(date);
const shift=(date,days)=>new Date(Date.parse(date+"T12:00:00Z")+days*86400000).toISOString().slice(0,10);
const code=day=>day.replaceAll("-","");
const scoreboard=(slug,dates)=>`/apis/site/v2/sports/soccer/${slug}/scoreboard?dates=${dates}&limit=500`;
const isFinished=event=>event.status?.type?.state==="post"&&event.status?.type?.completed===true;
const isScheduled=event=>event.status?.type?.name==="STATUS_SCHEDULED";
const competitor=(event,side)=>event.competitions[0].competitors.find(team=>team.homeAway===side);
const home=event=>competitor(event,"home");
const eventDay=event=>istanbulDay(new Date(event.date));

async function getEspn(path){
 const response=await fetch(espn+path,{signal:AbortSignal.timeout(15000)});
 assert.ok(response.ok,"Public ESPN GET "+path+" returned "+response.status);
 return response.json();
}

async function mapLimit(items,limit,mapper){
 let cursor=0;
 const results=new Array(items.length);
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{
  while(cursor<items.length){
   const index=cursor++;
   results[index]=await mapper(items[index],index);
  }
 }));
 return results;
}

async function waitForScrollSettled(page){
 await page.evaluate(()=>new Promise(resolve=>{
  let previous=window.scrollY,stableFrames=0;
  const started=performance.now();
  const sample=()=>{
   const current=window.scrollY;
   stableFrames=Math.abs(current-previous)<0.5?stableFrames+1:0;
   previous=current;
   if(stableFrames>=4||performance.now()-started>=2000)resolve();
   else requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
 }));
}

async function serverStart(){
 const child=spawn("python3",["-m","http.server","19172","--bind","127.0.0.1"],{stdio:"ignore"});
 for(let i=0;i<60;i++){
  if(child.exitCode!==null)throw Error("HTTP fixture host stopped");
  try{if((await fetch(origin+"/index.html")).ok)return child;}catch{}
  await delay(100);
 }
 child.kill();
 throw Error("HTTP fixture host not ready");
}

test("Public ESPN responses render through the iPhone fixture screens in Chromium and WebKit",async()=>{
 assert.ok(supportedLeagues.length>=40,"Search today's real fixtures across the app's supported ESPN competition catalogue");
 const today=istanbulDay(new Date());
 const months=[...new Set([-30,0,30].map(n=>code(shift(today,n)).slice(0,6)))];
 const season=Number(today.slice(0,4))-(Number(today.slice(5,7))<7?1:0);
 const publicSoccer="/apis/site/v2/sports/soccer/";
 const teamDirectory=publicSoccer+"eng.1/teams?limit=500";
 const teamSchedule=publicSoccer+"eng.1/teams/359/schedule?season="+season;
 const dayBoards=[code(shift(today,-1)),code(today)];
 const sampledDates=[...new Set([...dayBoards,...months])];
 const paths=[...new Set([
  ...leagues.flatMap(([slug])=>sampledDates.map(dates=>scoreboard(slug,dates))),
  ...supportedLeagues.flatMap(slug=>dayBoards.map(dates=>scoreboard(slug,dates)))
 ])];
 const payloads=new Map(await mapLimit(paths,8,async path=>{
  const payload=await getEspn(path);
  assert.ok(Array.isArray(payload.events),"ESPN response must contain an events array "+path);
  return [path,payload];
 }));
 const rows=leagues.flatMap(([slug,leagueId])=>[code(today),...months].flatMap(dates=>
  payloads.get(scoreboard(slug,dates)).events.map(event=>({slug,leagueId,event}))
 ));
 const todayRows=supportedLeagues.flatMap(slug=>dayBoards.flatMap(dates=>payloads.get(scoreboard(slug,dates)).events)
  .filter(event=>eventDay(event)===today).map(event=>({slug,event})));
 const daily=todayRows.find(({event})=>isScheduled(event))||todayRows[0];
 const future=rows.find(({event})=>isScheduled(event)&&eventDay(event)>today&&eventDay(event)<=shift(today,30));
 const finished=rows.filter(({event})=>isFinished(event)&&eventDay(event)>=shift(today,-30)&&eventDay(event)<today)
  .sort((a,b)=>Date.parse(b.event.date)-Date.parse(a.event.date))[0];
 assert.ok(daily,"No real match was published today in the sampled ESPN leagues");
 assert.ok(future,"No real upcoming fixture in the sampled ESPN leagues");
 assert.ok(finished,"No verified final in the sampled ESPN leagues");
 const finalPath=`/apis/site/v2/sports/soccer/${finished.slug}/summary?event=${finished.event.id}`;
 const summary=await getEspn(finalPath);
 payloads.set(finalPath,summary);
 for(const path of [teamDirectory,teamSchedule])payloads.set(path,await getEspn(path));
 const arsenalRows=rows.filter(({slug,event})=>slug==="eng.1"&&event.competitions?.[0]?.competitors?.some(
  team=>team.team?.id==="359"
 ));
 const pastArsenal=arsenalRows.filter(({event})=>isFinished(event)&&eventDay(event)<today)
  .sort((a,b)=>Date.parse(b.event.date)-Date.parse(a.event.date))[0];
 const futureArsenal=arsenalRows.find(({event})=>isScheduled(event)&&eventDay(event)>today&&eventDay(event)<=shift(today,30));
 assert.ok(pastArsenal&&futureArsenal,"ESPN must publish both past and upcoming Arsenal fixtures for acceptance");
 const opponent=({event})=>event.competitions[0].competitors.find(team=>team.team.id!=="359").team.displayName;
 console.log("ESPN run-time evidence",JSON.stringify({
  today:daily.event.id,upcoming:future.event.id,finished:finished.event.id,
  leagues:supportedLeagues,
  sampledInPlay:todayRows.filter(({event})=>event.status?.type?.state==="in").map(({event})=>event.id)
 }));
 const server=await serverStart();
 try{
  for(const [name,engine] of [["Chromium",chromium],["WebKit",webkit]]){
   const browser=await engine.launch({headless:true});
   try{
    for(const viewport of [{width:390,height:844}]){
     const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,serviceWorkers:"block"});
     try{
      const page=await context.newPage();
      await page.route("**/*",route=>route.request().url().startsWith(origin+"/")?route.continue():route.abort());
      await page.addInitScript(({espn,payloads})=>{
       localStorage.setItem("mam_session_token","local-browser-acceptance");
       const native=window.fetch.bind(window);
       const bodies=new Map(payloads);
       window.__mamEspnSummaryReads=Object.create(null);
       const worker="https://odd-sunset-6c83.m-ahmetisildak34.workers.dev";
       // Bridge only sampled public GETs to their fetched ESPN bodies. The app still
       // performs its own requests, parsing, filtering and rendering.
       window.fetch=(input,options)=>{
        const url=new URL(String(input),location.href);
        if(url.origin===location.origin)return native(input,options);
        if((options?.method||"GET").toUpperCase()!=="GET"||!navigator.onLine)
         return Promise.reject(new TypeError("External writes and offline requests are blocked"));
        if(url.origin===worker&&url.pathname==="/auth/check")return Promise.resolve(new Response('{"ok":true}'));
        const path=url.origin===worker&&url.pathname.startsWith("/api/espn/")
         ?"/apis/site/v2/sports/soccer/"+url.pathname.slice("/api/espn/".length)+url.search
         :url.origin===espn?url.pathname+url.search:"";
        if(bodies.has(path)){
         if(path.includes("/summary?event="))window.__mamEspnSummaryReads[path]=(window.__mamEspnSummaryReads[path]||0)+1;
         return Promise.resolve(new Response(JSON.stringify(bodies.get(path))));
        }
        return Promise.resolve(new Response('{"error":"Provider unavailable in isolated acceptance"}',{status:503}));
       };
      },{espn,payloads:[...payloads]});
      await page.goto(origin+"/index.html");
      await page.locator("#mamAuthGate").waitFor({state:"detached"});
      await page.waitForFunction(()=>!window.mamLoadMatchesBusy,{timeout:25000});
      for(const [mode,{slug,leagueId,event}] of [["today",daily],["upcoming",future],["finished",finished]]){
       await waitForScrollSettled(page);
       const modeTab=page.locator(`#mamMatchTabs [data-match-mode="${mode}"]`);
       let modeViaHomeShortcut=false;
       await page.evaluate(mode=>{
        window.__mamModeClickProbe={mode,pointerdown:false,click:false,target:null};
        window.__mamHomeActionProbe={mode,pointerdown:false,click:false};
        const selector=`[data-match-mode="${mode}"]`;
        const homeSelector=`#mamHomeShortcuts [data-mam-action="${mode}"]`;
        document.addEventListener("pointerdown",event=>{
         const target=event.target.closest?.(selector);if(target){window.__mamModeClickProbe.pointerdown=true;window.__mamModeClickProbe.pointerType=event.pointerType;window.__mamModeClickProbe.trusted=event.isTrusted;window.__mamModeClickProbe.target=target.outerHTML.slice(0,240);}
         const home=event.target.closest?.(homeSelector);if(home){window.__mamHomeActionProbe.pointerdown=true;window.__mamHomeActionProbe.trusted=event.isTrusted;}
        },true);
        document.addEventListener("click",event=>{
         const target=event.target.closest?.(selector);if(target){window.__mamModeClickProbe.click=true;window.__mamModeClickProbe.clickTrusted=event.isTrusted;window.__mamModeClickProbe.target=target.outerHTML.slice(0,240);}
         const home=event.target.closest?.(homeSelector);if(home){window.__mamHomeActionProbe.click=true;window.__mamHomeActionProbe.clickTrusted=event.isTrusted;}
        },true);
       },mode);
       if(!(await modeTab.isVisible())){
        modeViaHomeShortcut=true;
        const homeAction=page.locator(`#mamHomeShortcuts [data-mam-action="${mode}"]`);
        assert.equal(await homeAction.isVisible(),true,`${mode} mode must be reachable from the visible Home shortcut`);
        const homePoint=await page.evaluate(mode=>{
         const element=document.querySelector(`#mamHomeShortcuts [data-mam-action="${mode}"]`),rect=element.getBoundingClientRect();
         const x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
         return {x,y,width:rect.width,height:rect.height,hitInside:!!hit&&element.contains(hit)};
        },mode);
        assert.ok(homePoint.width>0&&homePoint.height>0&&homePoint.hitInside,`Home ${mode} shortcut must be the physical input target`);
        await page.mouse.click(homePoint.x,homePoint.y);
        const homeProbe=await page.evaluate(()=>window.__mamHomeActionProbe);
        assert.equal(homeProbe.pointerdown,true,`A trusted pointerdown must reach the Home ${mode} shortcut`);
        assert.equal(homeProbe.click,true,`A trusted click must reach the Home ${mode} shortcut`);
        assert.equal(homeProbe.trusted,true,`The Home ${mode} pointerdown must be browser-generated`);
        assert.equal(homeProbe.clickTrusted,true,`The Home ${mode} click must be browser-generated`);
        await page.waitForFunction(mode=>document.querySelector("main")?.classList.contains(`mam-screen-${mode}`),mode,{timeout:5000});
       }
       if(!modeViaHomeShortcut){
        await modeTab.waitFor({state:"visible"});
        assert.equal(await modeTab.isEnabled(),true,`${mode} tab must be enabled`);
        const point=await page.evaluate(mode=>{
         const element=document.querySelector(`#mamMatchTabs [data-match-mode="${mode}"]`),rect=element.getBoundingClientRect();
         const x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
         return {x,y,width:rect.width,height:rect.height,disabled:element.disabled,
          pointerEvents:getComputedStyle(element).pointerEvents,hitInside:!!hit&&element.contains(hit)};
        },mode);
        assert.ok(point.width>0&&point.height>0&&!point.disabled&&point.pointerEvents!=="none"&&point.hitInside,
         `The ${mode} tab's physical input point must hit its visible, enabled target`);
        // Locator.click stalls before sending input in this live mobile viewport; this remains a browser-generated input.
        await page.mouse.click(point.x,point.y);
        const clickProbe=await page.evaluate(()=>window.__mamModeClickProbe);
        assert.equal(clickProbe.pointerdown,true,`A trusted pointerdown must reach the ${mode} tab`);
        assert.equal(clickProbe.click,true,`A trusted click must reach the ${mode} tab`);
        assert.equal(clickProbe.trusted,true,`The ${mode} pointerdown must be browser-generated`);
        assert.equal(clickProbe.clickTrusted,true,`The ${mode} click must be browser-generated`);
       }
       await page.waitForFunction(()=>!window.mamLoadMatchesBusy,{timeout:25000});
       await page.waitForFunction(mode=>document.querySelector("main")?.classList.contains(`mam-screen-${mode}`),mode,{timeout:5000});
       if(mode!=="today"){
        await page.locator("#date").fill(eventDay(event));
        await page.locator("#date").dispatchEvent("change");
       }
       if(mode==="finished"){
        await page.locator("#leagueTrigger").click();
        await page.locator(`#leagueMenu [data-league-value="${leagueId}"]`).click();
       }
       const card=page.locator("#matches article.match").filter({
        has:page.locator(`.lineupBtn[data-id="espn-${slug}-${event.id}"]`)
       });
       await card.waitFor({state:"visible",timeout:25000});
       if(isScheduled(event)){
        const kickoff=new Intl.DateTimeFormat("tr-TR",{
         timeZone:"Europe/Istanbul",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
        }).format(new Date(event.date));
        await card.locator(".match-clock").getByText(kickoff,{exact:true}).waitFor();
       }
       if(mode==="upcoming"){
        await page.locator("#mamRefNext").click();
        assert.equal(await page.locator("#date").inputValue(),shift(eventDay(event),1));
        await card.waitFor({state:"hidden"});
        await page.locator("#mamRefPrev").click();
        await card.waitFor({state:"visible"});
        await page.locator("#leagueTrigger").click();
        await page.locator(`#leagueMenu [data-league-value="${leagueId}"]`).click();
        await card.waitFor({state:"visible"});
       }
       if(mode==="finished"){
        const away=competitor(event,"away");
        assert.ok((await card.innerText()).includes(home(event).score+" – "+away.score),"Expected ESPN final score");
       }
       await card.locator(".match-versus").click();
       const overlay=page.locator(".match-detail-overlay:not([hidden])");
       await overlay.waitFor({state:"visible"});
       assert.ok((await overlay.innerText()).includes(home(event).team.displayName),"Match identity lost in "+mode);
       if(mode==="finished"){
        await overlay.locator('.match-detail-tab[data-pane="overview"]').click();
        if(summary.boxscore?.teams?.some(team=>team.statistics?.length)){
         await overlay.locator(".mam-advanced-espn table").waitFor({state:"visible"});
        }
        if(summary.keyEvents?.some(event=>event.scoringPlay)){
         await overlay.locator('.match-detail-tab[data-pane="goals"]').click();
         await overlay.locator('.match-detail-pane[data-pane="goals"]').getByText("Gol",{exact:true}).first().waitFor();
        }
       }
       await overlay.locator(".match-detail-close").dispatchEvent("click");
       await overlay.waitFor({state:"hidden"});
       await card.waitFor({state:"visible"});
       if(mode==="finished"&&viewport.width===390){
        const summaryPath=publicSoccer+slug+"/summary?event="+event.id;
        await page.waitForFunction(path=>window.__mamEspnSummaryReads[path]>0,summaryPath);
        await page.waitForFunction(()=>document.querySelector(".match[data-mam-advanced-espn-loaded='true']"));
        const requestsBefore=await page.evaluate(path=>window.__mamEspnSummaryReads[path],summaryPath);
        await page.waitForFunction(()=>location.hash!=="#match-detail");
        await card.locator(".match-versus").click();
        await overlay.waitFor({state:"visible"});
        await page.waitForTimeout(50);
        const requestsAfter=await page.evaluate(path=>window.__mamEspnSummaryReads[path],summaryPath);
        assert.equal(requestsAfter,requestsBefore,"Reopening the same ESPN match must reuse its detail summary");
        await overlay.locator(".match-detail-close").dispatchEvent("click");
        await overlay.waitFor({state:"hidden"});
        await page.waitForFunction(()=>location.hash!=="#match-detail");
       }
       assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Horizontal overflow");
       if(mode==="today"){
        await context.setOffline(true);
        await page.waitForFunction(()=>!navigator.onLine);
        await card.waitFor({state:"visible"});
        await context.setOffline(false);
        await page.waitForFunction(()=>navigator.onLine);
       }
      }
      if(viewport.width===390){
       const favoriteId=`espn-${finished.slug}-${finished.event.id}`;
       const finalCard=page.locator("#matches article.match").filter({
        has:page.locator(`.lineupBtn[data-id="espn-${finished.slug}-${finished.event.id}"]`)
       });
       await finalCard.locator('[data-mam-star][data-type="match"]').click();
       await page.locator("#mamFavoriteBottom").click();
       await page.locator(`[data-fav-matches] [data-mam-remove-match="${favoriteId}"]`).waitFor();
       await page.reload();
       await page.locator("#mamAuthGate").waitFor({state:"detached"});
       await page.locator("#mamFavoriteBottom").click();
       await page.locator(`[data-fav-matches] [data-mam-remove-match="${favoriteId}"]`).waitFor();

       await page.locator("#mamSearchToggle").click();
       const search=page.locator("#mamTeamSearchInput");
       assert.equal(await page.locator("#mamTeamSearchResults button").count(),0);
       await search.pressSequentially("Ars");
       await page.locator('#mamTeamSearchResults [data-search-team="espn:eng.1:359"]').click();
       const profile=page.getByRole("dialog",{name:"Arsenal takım profili"});
       const pastEvent=pastArsenal.event;
       const fixtureName=[home(pastEvent),competitor(pastEvent,"away")].map(row=>row.team.displayName).join(" – ");
       await profile.locator("#mamHistoryPastView").getByText(fixtureName,{exact:true}).first().waitFor();
       await profile.locator('[data-history-view="upcoming"]').click();
       await profile.locator("#mamHistoryUpcomingView").getByText(opponent(futureArsenal),{exact:true}).first().waitFor();
       await profile.locator("#mamTeamHistoryBack").click();
       await profile.waitFor({state:"hidden"});
       console.log(name+" real ESPN team history and persisted match favorite passed");
      }
      console.log(name+" real ESPN fixtures "+viewport.width+"x"+viewport.height+" passed");
     }finally{await context.close();}
    }
   }finally{await browser.close();}
  }
 }finally{const done=once(server,"exit");server.kill();await done;}
});
