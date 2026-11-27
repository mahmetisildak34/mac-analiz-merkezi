import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {chromium,webkit} from "playwright";

const port=19180,origin="http://127.0.0.1:"+port;
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
 test(engineName+" bounds pending JSON bodies and SportScore team-history requests",async()=>{
  const server=await launchServer();
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
   page.setDefaultTimeout(8000);
   await page.route("**/*",route=>route.request().url().startsWith(origin+"/")?route.continue():route.abort());
   await page.addInitScript(()=>{
    localStorage.setItem("mam_session_token","local-browser-acceptance");
    const native=window.fetch.bind(window);
    window.fetch=(input,options)=>{
     const url=new URL(String(input),location.href);
     if(url.pathname==="/auth/check")return Promise.resolve(Response.json({ok:true}));
     if(url.origin===location.origin)return native(input,options);
     return Promise.reject(new TypeError("External network disabled in timeout regression"));
    };
   });
   await page.clock.install({time:new Date("2026-11-28T00:00:00Z")});
   await page.goto(origin+"/index.html");
   await page.locator("#mamAuthGate").waitFor({state:"detached"});

   await page.evaluate(()=>{
    const native=window.fetch.bind(window);
    window.testHoldMode="api-body";
    window.testRequestStarted=false;
    window.testApiError="";
    window.fetch=(input,options)=>{
     if(window.testHoldMode==="api-body"){
      window.testHoldMode="";window.testRequestStarted=true;
      const body=new ReadableStream({start(controller){
       controller.enqueue(new TextEncoder().encode("{"));
       options.signal.addEventListener("abort",()=>controller.error(new DOMException("aborted","AbortError")),{once:true});
      }});
      return Promise.resolve(new Response(body,{headers:{"Content-Type":"application/json"}}));
     }
     if(window.testHoldMode==="sportscore"){
      window.testHoldMode="";window.testRequestStarted=true;
      return new Promise((resolve,reject)=>{
       const abort=()=>reject(new DOMException("aborted","AbortError"));
       if(options.signal.aborted)abort();else options.signal.addEventListener("abort",abort,{once:true});
      });
     }
     return native(input,options);
    };
    window.api("espn/tur.1/scoreboard?dates=20991231&limit=500&mamTest=body-timeout").catch(error=>{window.testApiError=String(error?.message||error);});
   });
   await page.waitForFunction(()=>window.testRequestStarted===true);
   await page.clock.fastForward(15001);
   await page.waitForFunction(()=>window.testApiError!=="");
   assert.match(await page.evaluate(()=>window.testApiError),/15 saniyede yanıt vermedi/,"API timeout must remain active while response.json() reads a streamed body");

   await page.evaluate(()=>{
    window.testHoldMode="sportscore";window.testRequestStarted=false;window.testSportScoreError="";
    window.mamSportScoreTeamSchedule("Timeout-only Acceptance Team").catch(error=>{window.testSportScoreError=String(error?.message||error);});
   });
   await page.waitForFunction(()=>window.testRequestStarted===true);
   await page.clock.fastForward(15001);
   await page.waitForFunction(()=>window.testSportScoreError!=="");
   assert.match(await page.evaluate(()=>window.testSportScoreError),/SportScore takım fikstürü 15 saniyede yanıt vermedi/);
   console.log(engineName+" API body and team-history fallback deadlines passed");
   await page.close();
  }finally{
   await browser.close();
   const stopped=once(server,"exit");server.kill();await stopped;
  }
 });
}
