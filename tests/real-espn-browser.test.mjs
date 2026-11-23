import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {chromium,webkit} from "playwright";

const port=19172,origin="http://127.0.0.1:"+port;
const leagues=[["tur.1","203","Süper Lig","Türkiye"],["eng.1","39","Premier League","England"]];
const istanbulDay=date=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).format(date);
const shift=(date,days)=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);};
const dayCode=s=>s.replaceAll("-","");
async function events(league,date){
 const url="https://site.api.espn.com/apis/site/v2/sports/soccer/"+league+"/scoreboard?dates="+dayCode(date)+"&limit=500";
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
 assert.equal(response.ok,true,"Read-only ESPN scoreboard HTTP status: "+url+" "+response.status);
 const data=await response.json();
 assert.ok(Array.isArray(data.events),"ESPN must return a valid events array "+url);
 return data.events;
}
function fixture(event,league){
 const [slug,id,name,country]=league;
 const c=event.competitions?.[0]||{},status=event.status?.type||c.status?.type||{};
 const home=c.competitors?.find(x=>x.homeAway==="home"),away=c.competitors?.find(x=>x.homeAway==="away");
 if(!home?.team?.displayName||!away?.team?.displayName||!event.id||!event.date)return null;
 const state=String(status.state||"");
 const code=state==="post"||status.completed===true?"FT":state==="in"?"LIVE":"NS";
 const score=team=>{
  const raw=team?.score&&typeof team.score==="object"?team.score.value??team.score.displayValue:team?.score;
  return code==="NS"||raw==null||raw===""||!/^\\d+$/.test(String(raw))?null:Number(raw);
 };
 return {fixture:{id:"espn-"+slug+"-"+event.id,date:event.date,status:{short:code}},
  league:{id,name,country},teams:{home:{id:Number(home.team.id)||-1,name:home.team.displayName,logo:home.team.logo||""},away:{id:Number(away.team.id)||-1,name:away.team.displayName,logo:away.team.logo||""}},
  goals:{home:score(home),away:score(away)}};
}
async function serverStart(){
 const child=spawn("python3",["-m","http.server",String(port),"--bind","127.0.0.1"],{stdio:"ignore"});
 for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error("HTTP fixture host stopped");try{if((await fetch(origin+"/index.html")).ok)return child;}catch{}await delay(100);}
 throw Error("HTTP fixture host not ready");
}

test("Real ESPN read-only fixtures open and close in Chromium and WebKit",async()=>{
 const today=istanbulDay(new Date()),yesterday=shift(today,-1),future=shift(today,6);
 const result=await Promise.all(leagues.flatMap(league=>[today,yesterday,future].map(async day=>({league,day,events:await events(league[0],day)}))));
 const rows=result.flatMap(group=>group.events.map(event=>fixture(event,group.league)).filter(Boolean));
 const now=Date.now();
 const dayRows=rows.filter(m=>istanbulDay(new Date(m.fixture.date))===today);
 const todayMatch=dayRows[0];
 const futureMatch=rows.find(m=>Date.parse(m.fixture.date)>now+86400000&&m.fixture.status.short==="NS");
 const finishedMatch=rows.find(m=>m.fixture.status.short==="FT"&&Date.parse(m.fixture.date)<now);
 assert.ok(todayMatch,"Real ESPN data did not contain a match for today's Istanbul date; live acceptance is blocked");
 assert.ok(futureMatch,"Real ESPN upcoming fixture not found; live acceptance is blocked");
 assert.ok(finishedMatch,"Real ESPN completed fixture not found; live acceptance is blocked");
 console.log("Real ESPN read-only evidence:",JSON.stringify({today:todayMatch.fixture.id,upcoming:futureMatch.fixture.id,finished:finishedMatch.fixture.id,sources:result.map(x=>({league:x.league[0],date:x.day,events:x.events.length}))}));
 const server=await serverStart();
 try{
  for(const [name,engine] of [["Chromium",chromium],["WebKit",webkit]]){
   const browser=await engine.launch({headless:true});
   try{
    for(const viewport of [{width:390,height:844},{width:393,height:852},{width:430,height:932}]){
     const page=await browser.newPage({viewport,isMobile:true,hasTouch:true});
     await page.route("**/*",route=>route.request().url().startsWith(origin+"/")?route.continue():route.abort());
     await page.addInitScript(()=>{
      localStorage.setItem("mam_session_token","local-browser-acceptance");
      const native=window.fetch.bind(window);
      window.fetch=(input,options)=>String(input)==="https://odd-sunset-6c83.m-ahmetisildak34.workers.dev/auth/check"?Promise.resolve(new Response('{"ok":true}')):
       new URL(String(input),location.href).origin===location.origin?native(input,options):Promise.reject(new Error("No production API writes during browser acceptance"));
     });
     await page.goto(origin+"/index.html");
     await page.locator("#mamAuthGate").waitFor({state:"detached"});
     for(const [mode,selected] of [["today",todayMatch],["upcoming",futureMatch],["finished",finishedMatch]]){
      await page.evaluate(({mode,selected,today,all})=>{
       setMamScreen(mode);
       document.getElementById("league").value="all";
       document.getElementById("date").value=today;
       allMatches=all;renderMatches();
      },{mode,selected,today,all:rows});
      const card=page.locator("#matches article.match").filter({hasText:selected.teams.home.name}).first();
      await card.waitFor({state:"visible",timeout:10000});
      await card.click();
      const overlay=page.locator(".match-detail-overlay:not([hidden])");
      await overlay.waitFor({state:"visible"});
      assert.ok((await overlay.innerText()).includes(selected.teams.home.name),"Real match identity lost in "+mode);
      await overlay.locator(".match-detail-close").click();
      await overlay.waitFor({state:"hidden"});
      await card.waitFor({state:"visible"});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Horizontal overflow");
     }
     console.log(name+" real ESPN fixtures "+viewport.width+"x"+viewport.height+" passed");
     await page.close();
    }
   }finally{await browser.close();}
  }
 }finally{const done=once(server,"exit");server.kill();await done;}
});
