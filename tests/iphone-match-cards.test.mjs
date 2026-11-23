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
