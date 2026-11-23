import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {chromium,webkit} from "playwright";

const port=19171, origin="http://127.0.0.1:"+port;
async function launchServer(){
 const process=spawn("python3",["-m","http.server",String(port),"--bind","127.0.0.1"],{stdio:"ignore"});
 for(let i=0;i<70;i++){
  if(process.exitCode!==null)throw new Error("Fixture HTTP server stopped");
  try{if((await fetch(origin+"/index.html")).ok)return process;}catch{}
  await delay(100);
 }
 throw new Error("Fixture HTTP server unavailable");
}
function match(id,date,status,home,away,goals={home:null,away:null}){
 return {fixture:{id,date,status:{short:status}},league:{id:"203",name:"Süper Lig",country:"Türkiye"},
 teams:{home:{id:19267,name:home},away:{id:789,name:away}},goals};
}
for(const [engineName,engine] of [["Chromium",chromium],["WebKit",webkit]]){
 test(engineName+" iPhone Today/Upcoming/Finished card and detail acceptance",async()=>{
  const server=await launchServer();
  const browser=await engine.launch({headless:true});
  try{
   for(const viewport of [{width:390,height:844},{width:393,height:852},{width:430,height:932}]){
    const page=await browser.newPage({viewport,isMobile:true,hasTouch:true});
    await page.route("**/*",route=>route.request().url().startsWith(origin+"/")?route.continue():route.abort());
    await page.addInitScript(()=>{
     localStorage.setItem("mam_session_token","local-browser-acceptance");
     const request=window.fetch.bind(window);
     window.fetch=(input,options)=>String(input)==="https://odd-sunset-6c83.m-ahmetisildak34.workers.dev/auth/check"
      ?Promise.resolve(new Response('{"ok":true}'))
      :new URL(String(input),location.href).origin===location.origin
       ?request(input,options):Promise.reject(new TypeError("Network disabled in captured-data regression"));
    });
    await page.goto(origin+"/index.html");
    await page.locator("#mamAuthGate").waitFor({state:"detached"});
    const rows=await page.evaluate(()=>{
     const current=new Date(Date.now()+15*60000).toISOString();
     const later=new Date(Date.now()+8*86400000).toISOString();
     return {today:{fixture:{id:"iphone-today",date:current,status:{short:"NS"}},league:{id:"203",name:"Süper Lig",country:"Türkiye"},teams:{home:{id:1,name:"İstanbul Ev Sahibi"},away:{id:2,name:"Ankara Deplasman"}},goals:{home:null,away:null}},
      future:{fixture:{id:"iphone-future",date:later,status:{short:"NS"}},league:{id:"203",name:"Süper Lig",country:"Türkiye"},teams:{home:{id:3,name:"Geleceğin Ev Sahibi"},away:{id:4,name:"Geleceğin Deplasman"}},goals:{home:null,away:null}},
      finished:{fixture:{id:"espn-tur.1-401888243",date:"2026-11-22T10:30Z",status:{short:"FT"}},league:{id:"203",name:"Süper Lig",country:"Türkiye"},teams:{home:{id:19267,name:"Erzurum BB"},away:{id:789,name:"Goztepe"}},goals:{home:0,away:1}}};
    });
    for(const [mode,expected] of [["today","İstanbul Ev Sahibi"],["upcoming","Geleceğin Ev Sahibi"],["finished","Erzurum BB"]]){
     await page.evaluate(({mode,rows})=>{
      setMamScreen(mode);
      document.getElementById("league").value="all";
      if(mode==="today")document.getElementById("date").value=mamIstanbulDay(rows.today.fixture.date);
      allMatches=Object.values(rows);
      renderMatches();
     },{mode,rows});
     const card=page.locator("#matches article.match").filter({hasText:expected}).first();
     await card.waitFor({state:"visible",timeout:7000});
     await card.click();
     const overlay=page.locator(".match-detail-overlay:not([hidden])");
     await overlay.waitFor({state:"visible"});
     assert.match(await overlay.innerText(),new RegExp(expected));
     await overlay.locator(".match-detail-close").click();
     await overlay.waitFor({state:"hidden"});
     await card.waitFor({state:"visible"});
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Horizontal overflow in "+mode+" on "+engineName+" "+viewport.width);
    }
    console.log(engineName+" iPhone "+viewport.width+"x"+viewport.height+": all 3 captured fixture tabs opened and closed");
    await page.close();
   }
  }finally{
   await browser.close();
   const stopped=once(server,"exit");server.kill();await stopped;
  }
 });
}

for(const [engineName,engine] of [["Chromium",chromium],["WebKit",webkit]]){
 test(engineName+" opens fixtures automatically and preserves them through failed refresh and reconnect",async()=>{
  const server=await launchServer();
  const browser=await engine.launch();
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
   page.setDefaultTimeout(10000);
   await page.clock.install({time:new Date("2026-11-23T16:58:00Z")});
   await page.route("**/*",route=>route.request().url().startsWith(origin+"/")?route.continue():route.abort());
   await page.addInitScript(()=>{
    localStorage.setItem("mam_session_token","local-browser-acceptance");
    const native=window.fetch.bind(window);
    const current={id:"401888370",date:"2026-11-23T17:00:00Z",competitions:[{competitors:[
     {homeAway:"home",team:{id:"7914",displayName:"Başakşehir"},score:"0"},
     {homeAway:"away",team:{id:"21638",displayName:"Çorum FK"},score:"0"}
    ]}]};
    window.testScoreboard={status:{displayClock:"",type:{name:"STATUS_SCHEDULED",state:"pre"}},goals:["0","0"]};
    window.fetch=(input,options)=>{
     const url=new URL(String(input),location.href);
     if(url.origin===location.origin)return native(input,options);
     if(url.pathname==="/auth/check")return Promise.resolve(new Response('{"ok":true}'));
     if(window.testScoreboard.unavailable)return Promise.reject(new TypeError("Simulated provider failure"));
     if(url.pathname.includes("/summary"))return Promise.resolve(Response.json({keyEvents:window.testScoreboard.events||[]}));
     if(url.pathname.includes("/scoreboard")){
      const {status,goals}=window.testScoreboard;
      const row=structuredClone(current);
      row.status=status;
      row.competitions[0].competitors.forEach((team,i)=>{team.score=goals[i];});
      return Promise.resolve(Response.json({events:url.pathname.includes("/tur.1/")?[row]:[]}));
     }
     return Promise.resolve(Response.json({response:[]}));
    };
   });
   await page.goto(origin+"/index.html");
   await page.locator("#mamAuthGate").waitFor({state:"detached"});
   const card=page.locator("#matches article.match").filter({hasText:"Çorum FK"});
   await card.waitFor({state:"visible",timeout:6000});
   assert.match(await card.locator(".match-clock").innerText(),/20:00/);
   await page.locator('[data-match-mode="today"]').click();
   await page.locator("#status").getByText(/maç yüklendi/).waitFor({timeout:8000});
   await page.evaluate(()=>{window.testScoreboard.unavailable=true;});
   await page.clock.fastForward(31_000);
   await page.locator("#mamSectionRefresh").click();
   await page.locator("#status").getByText(/Güncel veri alınamadı|Güncel fikstür şu an alınamadı/).waitFor({timeout:8000});
   await card.waitFor({state:"visible",timeout:5000});

   await page.context().setOffline(true);
   await page.waitForFunction(()=>!navigator.onLine);
   await card.waitFor({state:"visible",timeout:5000});
   await page.evaluate(()=>{
    window.testScoreboard={status:{displayClock:"17'",type:{name:"STATUS_IN_PROGRESS",state:"in"}},goals:["1","0"]};
   });
   await page.context().setOffline(false);
   await card.locator(".match-clock").getByText("1 – 0",{exact:true}).waitFor({timeout:8000});
   assert.match(await card.locator(".match-time").innerText(),/17'/);
   await card.locator(".match-versus").click();
   const detail=page.locator(".match-detail-overlay:not([hidden])");
   await detail.locator('[data-pane="goals"].match-detail-tab').click();
   const events=detail.locator('[data-pane="goals"].match-detail-pane');
   await events.getByText(/Sağlayıcı bu maç için/).waitFor();
   await page.evaluate(()=>{
    window.testScoreboard.status.displayClock="29'";
    window.testScoreboard.goals=["2","0"];
    window.testScoreboard.events=[{scoringPlay:true,clock:{displayValue:"29'"},athlete:{displayName:"Tarayıcı Test Oyuncusu"}}];
   });
   await page.clock.fastForward(31_000);
   await detail.locator(".match-clock").getByText("2 – 0",{exact:true}).waitFor();
   assert.match(await detail.locator(".match-time").innerText(),/29'/);
   await events.getByText("Tarayıcı Test Oyuncusu",{exact:true}).waitFor();
   await detail.locator(".match-detail-close").click();

   await page.locator('[data-match-mode="finished"]').click();
   await page.clock.fastForward(31_000);
   await page.locator("#status").getByText(/maç yüklendi/).waitFor({timeout:8000});
   await card.waitFor({state:"hidden",timeout:5000});
   await page.evaluate(()=>{
    window.testScoreboard={status:{displayClock:"90'",type:{name:"STATUS_FULL_TIME",state:"post",completed:true}},goals:["2","1"]};
   });
   await page.clock.fastForward(31_000);
   await card.locator(".match-clock").getByText("2 – 1",{exact:true}).waitFor({timeout:8000});
  }finally{
   await browser.close();
   const stopped=once(server,"exit");server.kill();await stopped;
  }
 });
}
