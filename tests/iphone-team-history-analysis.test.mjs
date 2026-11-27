import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {chromium,webkit} from "playwright";

const port=19179,origin="http://127.0.0.1:"+port;
async function launchServer(){
 const process=spawn("python3",["-m","http.server",String(port),"--bind","127.0.0.1"],{stdio:"ignore"});
 for(let i=0;i<70;i++){
  if(process.exitCode!==null)throw new Error("Fixture HTTP server stopped");
  try{if((await fetch(origin+"/index.html")).ok)return process;}catch{}
  await delay(100);
 }
 throw new Error("Fixture HTTP server unavailable");
}

for(const [engineName,engine] of [["Chromium",chromium],["WebKit",webkit]]){
 test(engineName+" iPhone team fixture analysis, overlay and return acceptance",async()=>{
  const server=await launchServer();
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
   page.setDefaultTimeout(10000);
   await page.route("**/*",route=>route.request().url().startsWith(origin+"/")?route.continue():route.abort());
   await page.addInitScript(()=>{
    localStorage.setItem("mam_session_token","local-browser-acceptance");
    const native=window.fetch.bind(window);
    window.__blockedExternalRequests=[];
    window.__blockedWorkerWrites=[];
    window.fetch=(input,options)=>{
     const url=new URL(String(input),location.href);
     if(url.pathname==="/auth/check")return Promise.resolve(Response.json({ok:true}));
     if(url.origin===location.origin)return native(input,options);
     if(/\/api\/archive\/matches\/?$/i.test(url.pathname)&&String(options?.method||"GET").toUpperCase()==="POST")window.__blockedWorkerWrites.push(url.href);
     window.__blockedExternalRequests.push(url.href);
     return Promise.reject(new TypeError("External network disabled in team-history regression"));
    };
   });
   await page.goto(origin+"/index.html");
   await page.locator("#mamAuthGate").waitFor({state:"detached"});
   await page.evaluate(async()=>{
    const league="39",homeId=101,awayId=202,kickoff=new Date(Date.now()+86400000).toISOString();
    window.fixtureHistoryCount=10;
    window.getTeamFixtures=async teamId=>Array.from({length:window.fixtureHistoryCount},(_,index)=>({
     fixture:{id:"team-history-"+teamId+"-"+index,date:new Date(Date.now()-(index+2)*86400000).toISOString(),status:{short:"FT"}},
     league:{id:league,name:"Premier League"},
     teams:{home:{id:Number(teamId),name:Number(teamId)===homeId?"Home FC":"Away FC"},away:{id:9000+index,name:"Opponent "+index}},
     goals:{home:2,away:1}
    }));
    const upcoming={
     fixture:{id:"fd-PL-123",date:kickoff,status:{short:"NS"}},
     league:{id:league,name:"Premier League",country:"England"},
     teams:{home:{id:homeId,name:"Home FC"},away:{id:awayId,name:"Away FC"}},
     goals:{home:null,away:null}
    };
    localStorage.setItem("mam_epl_upcoming_2627_v4",JSON.stringify({time:Date.now(),matches:[upcoming]}));
    ensureMamDetailOverlay();
    const row=document.createElement("button");
    Object.assign(row.dataset,{standingTeam:"Home FC",standingTeamId:String(homeId),teamSource:"api-football",standingRank:"1",standingPoints:"30"});
    document.body.append(row);
    await window.mamOpenStandingTeamHistory(row,league);
   });

   const screen=page.locator("#mamTeamHistoryScreen");
   await screen.waitFor({state:"visible"});
   await page.locator("#mamHistoryPastView").waitFor({state:"visible"});
   assert.equal(await page.locator("#mamHistoryPastView article").count(),10,"past match rows must render rather than only report a count");
   assert.equal(await page.locator("#mamHistoryUpcomingView").evaluate(element=>element.hidden),true);
   await page.locator('[data-history-view="upcoming"]').tap();
   const card=page.locator("#mamHistoryUpcomingView .mam-upcoming-match");
   await card.waitFor({state:"visible"});
   assert.equal(await page.locator("#mamHistoryUpcomingView .mam-upcoming-match").count(),1,"the visible card count must match the upcoming count");
   const analysisButton=card.locator(".predBtn");
   await analysisButton.waitFor({state:"visible"});
   const fixtureId=await analysisButton.getAttribute("data-id");
   const result=page.locator("#pred-"+fixtureId);

   await analysisButton.tap();
   await page.waitForFunction(id=>document.getElementById("pred-"+id)?.dataset.analysisDone==="1",fixtureId);
   assert.match(await result.innerText(),/En olası 5 skor/,"10 verified matches per team should yield an analysis");

   await page.evaluate(()=>{window.fixtureHistoryCount=9;});
   await analysisButton.tap();
   await page.waitForFunction(id=>document.getElementById("pred-"+id)?.innerText.includes("Güvenilir analiz için geçmiş veri yetersiz"),fixtureId);
   assert.match(await result.innerText(),/10 doğrulanmış geçmiş maç/,"nine matches must show the minimum-history explanation, not a pending state");

   await card.locator(".match-versus").tap();
   const overlay=page.locator(".match-detail-overlay:not([hidden])");
   await overlay.waitFor({state:"visible"});
   await page.waitForFunction(id=>document.getElementById("pred-"+id)?.innerText.includes("Güvenilir analiz için geçmiş veri yetersiz"),fixtureId);
   const modalState=await overlay.evaluate(element=>{
    const close=element.querySelector(".match-detail-close"),rect=close.getBoundingClientRect();
    return {inert:element.inert,profileInert:document.getElementById("mamTeamHistoryScreen")?.inert,
     closeIsTopHit:document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===close};
   });
   assert.deepEqual(modalState,{inert:false,profileInert:true,closeIsTopHit:true},"the detail overlay must be visible and interactive above the team profile");
   await overlay.locator(".match-detail-close").tap();
   await overlay.waitFor({state:"hidden"});
   assert.equal(await screen.evaluate(element=>element.inert),false,"closing match detail must restore the team screen");
   assert.equal(await page.locator(".match-detail-overlay").evaluate(element=>element.inert),true,"the background detail layer must return to inert state");
   await page.locator('[data-history-view="past"]').tap();
   await page.locator("#mamHistoryPastView").waitFor({state:"visible"});
   await page.locator('[data-history-view="upcoming"]').tap();
   await card.waitFor({state:"visible"});
   await page.locator("#mamTeamHistoryBack").tap();
   await screen.waitFor({state:"detached"});
   await page.evaluate(()=>{
    window.fixtureHistoryCount=10;
    const kickoff=new Date(Date.now()+86400000).toISOString();
    setMamScreen("upcoming");
    document.getElementById("league").value="all";
    document.getElementById("date").value=mamIstanbulDay(kickoff);
    allMatches=[{fixture:{id:"shared-analysis-fixture",date:kickoff,status:{short:"NS"}},league:{id:"39",name:"Premier League",country:"England"},teams:{home:{id:101,name:"Home FC"},away:{id:202,name:"Away FC"}},goals:{home:null,away:null}}];
    renderMatches();
   });
   const mainButton=page.locator("#matches article.match .mam-match-open");
   await mainButton.waitFor({state:"visible"});
   await mainButton.tap();
   const mainOverlay=page.locator(".match-detail-overlay:not([hidden])");
   await mainOverlay.waitFor({state:"visible"});
   await page.waitForFunction(()=>document.getElementById("pred-shared-analysis-fixture")?.dataset.analysisDone==="1");
   assert.match(await page.locator("#pred-shared-analysis-fixture").innerText(),/En olası 5 skor/,"the shared main-list trigger must use the same working analysis engine");
   await mainOverlay.locator(".match-detail-close").tap();
   await mainOverlay.waitFor({state:"hidden"});
   assert.equal(await page.evaluate(()=>window.__blockedWorkerWrites.length),0,"the acceptance must not issue a Worker/D1 archive write");
   console.log(engineName+" iPhone team-history acceptance: visible action, 10/9 history, modal focus/z-order and one-tap back passed");
   await page.close();
  }finally{
   await browser.close();
   const stopped=once(server,"exit");server.kill();await stopped;
  }
 });
}
