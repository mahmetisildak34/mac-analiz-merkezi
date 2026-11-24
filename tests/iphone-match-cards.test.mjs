import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {setTimeout as delay} from "node:timers/promises";
import {chromium,webkit} from "playwright";

const port=19171, origin="http://127.0.0.1:"+port;
async function launchServer(serverPort=port){
 const serverOrigin="http://127.0.0.1:"+serverPort;
 const process=spawn("python3",["-m","http.server",String(serverPort),"--bind","127.0.0.1"],{stdio:"ignore"});
 for(let i=0;i<70;i++){
  if(process.exitCode!==null)throw new Error("Fixture HTTP server stopped");
  try{if((await fetch(serverOrigin+"/index.html")).ok)return process;}catch{}
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
   for(const viewport of [{width:375,height:812},{width:390,height:844},{width:393,height:852},{width:430,height:932}]){
    const page=await browser.newPage({viewport,isMobile:true,hasTouch:true});
    await page.route("**/*",route=>route.request().url().startsWith(origin+"/")?route.continue():route.abort());
    await page.addInitScript(()=>{
     localStorage.setItem("mam_session_token","local-browser-acceptance");
     const request=window.fetch.bind(window);
     window.__blockedExternalRequests=[];
     window.fetch=(input,options)=>{
      const url=new URL(String(input),location.href);
      if(url.pathname==="/auth/check")return Promise.resolve(new Response('{"ok":true}'));
      if(url.origin===location.origin)return request(input,options);
      window.__blockedExternalRequests.push(url.href);
      return Promise.reject(new TypeError("Network disabled in captured-data regression"));
     };
    });
    await page.goto(origin+"/index.html");
    await page.locator("#mamAuthGate").waitFor({state:"hidden"});
    const rows=await page.evaluate(()=>{
     const current=new Date(Date.now()+15*60000).toISOString();
     const later=new Date(Date.now()+8*86400000).toISOString();
     return {today:{fixture:{id:"iphone-today",date:current,status:{short:"NS"}},league:{id:"203",name:"Süper Lig",country:"Türkiye"},teams:{home:{id:1,name:"İstanbul Ev Sahibi"},away:{id:2,name:"Ankara Deplasman"}},goals:{home:null,away:null}},
      future:{fixture:{id:"iphone-future",date:later,status:{short:"NS"}},league:{id:"203",name:"Süper Lig",country:"Türkiye"},teams:{home:{id:3,name:"Internacional"},away:{id:4,name:"Geleceğin Deplasman"}},goals:{home:null,away:null}},
      finished:{fixture:{id:"espn-tur.1-401888243",date:"2026-11-22T10:30Z",status:{short:"FT"}},league:{id:"203",name:"Süper Lig",country:"Türkiye"},teams:{home:{id:19267,name:"Erzurum BB"},away:{id:789,name:"Goztepe"}},goals:{home:0,away:1}}};
    });
    for(const [mode,expected] of [["today","İstanbul Ev Sahibi"],["upcoming","Internacional"],["finished","Erzurum BB"]]){
     await page.evaluate(({mode,rows})=>{
      setMamScreen(mode);
      document.getElementById("league").value="all";
      const target=mode==="upcoming"?rows.future:mode==="finished"?rows.finished:rows.today;
      document.getElementById("date").value=mamIstanbulDay(target.fixture.date);
      if(mode==="today")document.getElementById("date").value=mamIstanbulDay(rows.today.fixture.date);
      allMatches=Object.values(rows);
      renderMatches();
     },{mode,rows});
     const card=page.locator("#matches article.match").filter({hasText:expected}).first();
     await card.waitFor({state:"visible",timeout:7000});
     assert.equal(await card.locator("[data-mam-star]:visible").count(),1);
     assert.equal(await card.evaluate(el=>{
      const cardBounds=el.getBoundingClientRect();
      const button=el.querySelector(".mam-match-open").getBoundingClientRect();
      return button.width>=44&&button.height>=44&&button.top>=cardBounds.top&&button.right<=cardBounds.right;
     }),true,"The full detail button must be inside the card");
     if(mode==="upcoming"){
      const kickoff=new Intl.DateTimeFormat("tr-TR",{timeZone:"Europe/Istanbul",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(rows.future.fixture.date));
      assert.equal((await card.innerText()).split(kickoff).length,2);
      const layout=await card.evaluate(el=>{
       const [home,away]=[...el.querySelectorAll(".team-block strong")].map(name=>name.getBoundingClientRect());
       const score=el.querySelector(".match-center").getBoundingClientRect();
       return {namesClear:home.right<=score.left+1&&away.left>=score.right-1,
        headerClear:document.querySelector(".mam-appbar").getBoundingClientRect().bottom<=document.querySelector(".mam-section-header").getBoundingClientRect().top};
      });
      assert.deepEqual(layout,{namesClear:true,headerClear:true});
      assert.equal(await card.evaluate(el=>{
       el.scrollIntoView({block:"end",behavior:"instant"});
       const nav=document.querySelector(".mam-bottom-nav");
       return el.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top;
      }),true,"The last card must clear the fixed menu");
     }
     await card.click();
     const overlay=page.locator(".match-detail-overlay:not([hidden])");
     await overlay.waitFor({state:"visible"});
     await page.waitForTimeout(50);
     assert.equal(await page.locator("#mamAuthGate").isVisible(),false,"Opening public match details must not invoke Premium analysis");
     assert.match(await overlay.innerText(),new RegExp(expected));
     if(mode==="upcoming"&&viewport.width===375){
      await overlay.locator('.match-detail-tab[data-pane="analysis"]').click();
      await page.locator("#mamAuthGate").waitFor({state:"visible"});
      assert.match(await page.locator("#mamAuthMessage").innerText(),/Premium analiz için giriş yapın/);
      await page.locator("#mamAuthClose").click();
      await page.locator("#mamAuthGate").waitFor({state:"hidden"});
     }
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
 test(engineName+" guest/FREE/PREMIUM match-detail authorization acceptance",async()=>{
  const server=await launchServer();
  const browser=await engine.launch();
  try{
   for(const state of ["GUEST","FREE","PREMIUM"]){
    const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    await page.route("**/*",route=>route.request().url().startsWith(origin+"/")?route.continue():route.abort());
    await page.addInitScript(role=>{
     const worker="https://odd-sunset-6c83.m-ahmetisildak34.workers.dev";
     if(role!=="GUEST")sessionStorage.setItem("mam_auth_refresh_v1","local-"+role.toLowerCase()+"-refresh");
     window.__mamMembershipCalls=[];
     const native=window.fetch.bind(window);
     const respond=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}}));
     window.fetch=(input,options)=>{
      const url=new URL(String(input),location.href);
      if(url.origin===worker){
       window.__mamMembershipCalls.push({path:url.pathname,method:options?.method||"GET"});
       if(url.pathname==="/membership/config")return respond({configured:false,turnstileSiteKey:null});
       if(url.pathname==="/membership/auth/refresh"&&role!=="GUEST")return respond({access_token:"local-"+role.toLowerCase()+"-access",refresh_token:"local-"+role.toLowerCase()+"-refresh"});
       if(url.pathname==="/membership/me"&&role!=="GUEST")return respond({role,quota:{used:0,limit:50,remaining:50}});
       if(url.pathname==="/membership/analysis"&&role==="PREMIUM")return respond({accepted:true,role});
       return respond({error:"Blocked by isolated membership fixture"},403);
      }
      if(url.origin===location.origin)return native(input,options);
      return Promise.reject(new TypeError("External requests disabled in role acceptance fixture"));
     };
    },state);
    await page.goto(origin+"/index.html");
    await page.waitForFunction(expected=>{
     const auth=window.mamAuth;
     return Boolean(auth)&&(expected==="GUEST"?!auth.token:auth.token&&auth.role===expected&&window.mamMembership?.role===expected);
    },state,{timeout:10000});
    const fixture=match("membership-"+state.toLowerCase(),new Date(Date.now()+3600000).toISOString(),"NS","Membership Home","Membership Away");
    await page.evaluate(fixture=>{
     setMamScreen("upcoming");
     document.getElementById("league").value="all";
     document.getElementById("date").value=mamIstanbulDay(fixture.fixture.date);
     allMatches=[fixture];
     renderMatches();
    },fixture);
    const card=page.locator("#matches article.match");
    await card.waitFor({state:"visible"});
    await card.locator(".mam-match-open").click();
    const overlay=page.locator(".match-detail-overlay:not([hidden])");
    await overlay.waitFor({state:"visible"});
    await page.waitForTimeout(50);
    assert.equal(await page.locator("#mamAuthGate").isVisible(),false,state+" detail open must not trigger a gate");
    if(state==="GUEST"||state==="FREE"){
     await overlay.locator('.match-detail-tab[data-pane="analysis"]').click();
     await page.locator("#mamAuthGate").waitFor({state:"visible"});
     const message=await page.locator("#mamAuthMessage").innerText();
     assert.match(message,state==="GUEST"?/Premium analiz için giriş yapın/:/Bu özellik Premium üyelik gerektirir/);
     assert.equal(await page.evaluate(()=>window.__mamMembershipCalls.some(x=>x.path==="/membership/analysis")),false,state+" must not reach the protected analysis API");
     await page.locator("#mamAuthClose").click();
     await page.locator("#mamAuthGate").waitFor({state:"hidden"});
    }else{
     const result=await page.evaluate(()=>window.mamAuth.analyze({fixtureId:"premium-role-test",modelInput:{}}));
     assert.deepEqual(result,{accepted:true,role:"PREMIUM"});
     assert.equal(await page.evaluate(()=>window.__mamMembershipCalls.some(x=>x.path==="/membership/analysis")),true,"PREMIUM should reach the isolated analysis endpoint");
    }
    await overlay.locator(".match-detail-close").click();
    await overlay.waitFor({state:"hidden"});
    await context.close();
   }
  }finally{
   await browser.close();
   const stopped=once(server,"exit");server.kill();await stopped;
  }
 });
}

for(const [engineName,engine] of [["Chromium",chromium],["WebKit",webkit]]){
 test(engineName+" isolated coupon flow and membership session acceptance",async()=>{
  const serverPort=port+1,serverOrigin="http://127.0.0.1:"+serverPort;
  const server=await launchServer(serverPort);
  const browser=await engine.launch({headless:true});
  try{
   for(const role of ["GUEST","FREE","PREMIUM","ADMIN"]){
    const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,serviceWorkers:"block"});
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    await page.route("**/*",route=>route.request().url().startsWith(serverOrigin+"/")?route.continue():route.abort());
    await page.addInitScript(role=>{
     const worker="https://odd-sunset-6c83.m-ahmetisildak34.workers.dev";
     const refreshKey="mam_auth_refresh_v1";
     if(role!=="GUEST"&&!sessionStorage.getItem(refreshKey))sessionStorage.setItem(refreshKey,"local-"+role.toLowerCase()+"-refresh");
     window.__mamMembershipCalls=[];
     const native=window.fetch.bind(window);
     const respond=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}}));
     const readMockCoupons=()=>{try{return JSON.parse(localStorage.getItem("mam_test_coupon_store")||"[]");}catch{return [];}};
     window.fetch=(input,options)=>{
      const url=new URL(String(input),location.href),method=String(options?.method||"GET").toUpperCase();
      if(url.origin===worker){
       let body=null;try{if(options?.body)body=JSON.parse(options.body);}catch{}
       window.__mamMembershipCalls.push({path:url.pathname,method,body});
       if(url.pathname==="/membership/config")return respond({configured:false,turnstileSiteKey:null});
       if(url.pathname==="/membership/auth/refresh"&&role!=="GUEST")return respond({access_token:"local-"+role.toLowerCase()+"-access",refresh_token:"local-"+role.toLowerCase()+"-rotated-refresh"});
       if(url.pathname==="/membership/auth/logout")return respond({ok:true});
       if(url.pathname==="/membership/me"&&role!=="GUEST")return respond({role,quota:{used:0,limit:50,remaining:50}});
       if(url.pathname==="/membership/coupon"){
        if(role!=="PREMIUM"&&role!=="ADMIN")return respond({error:"Premium required"},403);
        let items=readMockCoupons();
        if(method==="GET")return respond({items,role});
        if(method!=="POST"||!body)return respond({error:"Invalid coupon request"},400);
        if(body.action==="build")items=(body.candidates||[]).filter(item=>body.mode==="safe"?item.probability>=.65:item.probability>=.35&&item.probability<.65).slice(0,body.mode==="safe"?10:6).map(item=>({...item,odds:null}));
        else if(body.action==="set-odds"&&items[body.index])items[body.index]={...items[body.index],odds:body.odds};
        else if(body.action==="remove"&&Number.isInteger(body.index))items.splice(body.index,1);
        else if(body.action==="clear")items=[];
        else if(body.action==="add"&&body.item)items.push(body.item);
        else return respond({error:"Invalid coupon action"},400);
        localStorage.setItem("mam_test_coupon_store",JSON.stringify(items));
        return respond({items,role});
       }
       return respond({error:"Blocked by isolated Worker fixture"},403);
      }
      if(url.origin===location.origin)return native(input,options);
      return Promise.reject(new TypeError("External requests disabled in coupon acceptance fixture"));
     };
    },role);
    await page.goto(serverOrigin+"/index.html");
    await page.waitForFunction(expected=>{
     const auth=window.mamAuth;
     return Boolean(auth)&&(expected==="GUEST"?!auth.token:auth.token&&auth.role===expected);
    },role,{timeout:10000});
    if(role!=="GUEST"){
     assert.equal(await page.evaluate(()=>sessionStorage.getItem("mam_auth_refresh_v1")),"local-"+role.toLowerCase()+"-rotated-refresh");
     assert.equal(await page.evaluate(()=>window.__mamMembershipCalls.some(call=>call.path==="/membership/auth/refresh")),true);
    }
    // The current shell hides its coupon launch buttons; exercise the existing bound handler without changing the UI or accessing a live service.
    if(role==="GUEST"||role==="FREE"){
     await page.evaluate(()=>document.getElementById("couponToggle").click());
     await page.locator("#mamAuthGate").waitFor({state:"visible"});
     assert.match(await page.locator("#mamAuthMessage").innerText(),/Kupon oluşturucu Premium üyelik gerektirir/);
     assert.equal(await page.locator("#couponPanel").evaluate(el=>el.hidden),true);
     assert.equal(await page.evaluate(()=>window.__mamMembershipCalls.some(call=>call.path==="/membership/coupon")),false);
    }else{
     await page.evaluate(()=>recordCouponCandidates("coupon-fixture","İstanbul Home","Ankara Away","2026-11-26",[{name:"1X",probability:.8}]));
     await page.evaluate(()=>document.getElementById("couponToggle").click());
     await page.locator("#couponPanel").waitFor({state:"visible"});
     assert.equal(await page.evaluate(()=>window.__mamMembershipCalls.some(call=>call.path==="/membership/coupon"&&call.method==="GET")),true);
     await page.locator("#couponBuildSafe").click();
     await page.locator("#couponCount").getByText("1 seçim").waitFor();
     assert.match(await page.locator("#couponItems").innerText(),/İstanbul Home – Ankara Away/);
     const buildCall=await page.evaluate(()=>window.__mamMembershipCalls.filter(call=>call.path==="/membership/coupon"&&call.body?.action==="build").at(-1));
     assert.equal(buildCall.body.mode,"safe");
     assert.equal(buildCall.body.candidates.length,1);
     const odds=page.locator(".coupon-leg-odds").first();
     await odds.fill("1.75");await odds.press("Tab");
     await page.waitForFunction(()=>document.getElementById("couponTotalOdds").textContent==="1.75");
     assert.equal(await page.evaluate(()=>window.__mamMembershipCalls.some(call=>call.body?.action==="set-odds")),true);
     await page.reload();
     await page.waitForFunction(expected=>window.mamAuth?.token&&window.mamAuth.role===expected,role,{timeout:10000});
     assert.equal(await page.evaluate(()=>sessionStorage.getItem("mam_auth_refresh_v1")),"local-"+role.toLowerCase()+"-rotated-refresh");
     await page.evaluate(()=>document.getElementById("couponToggle").click());
     await page.locator("#couponPanel").waitFor({state:"visible"});
     await page.locator("#couponCount").getByText("1 seçim").waitFor();
     assert.equal(await page.locator(".coupon-leg-odds").first().inputValue(),"1.75");
     await page.locator(".coupon-remove").first().click();
     await page.locator("#couponCount").getByText("0 seçim").waitFor();
     assert.equal(await page.evaluate(()=>window.__mamMembershipCalls.some(call=>call.body?.action==="remove")),true);
     await page.locator("#couponBuildSafe").click();
     await page.locator("#couponCount").getByText("1 seçim").waitFor();
     await page.locator("#couponClear").click();
     await page.locator("#couponCount").getByText("0 seçim").waitFor();
     assert.equal(await page.evaluate(()=>window.__mamMembershipCalls.some(call=>call.body?.action==="clear")),true);
     await page.evaluate(()=>window.mamAuth.logout());
     await page.waitForFunction(()=>window.mamAuth.role==="FREE"&&!window.mamAuth.token&&!sessionStorage.getItem("mam_auth_refresh_v1"));
     assert.equal(await page.evaluate(()=>window.__mamMembershipCalls.some(call=>call.path==="/membership/auth/logout")),true);
     const couponCallsBeforeGate=await page.evaluate(()=>window.__mamMembershipCalls.filter(call=>call.path==="/membership/coupon").length);
     await page.evaluate(()=>document.getElementById("couponToggle").click());
     await page.locator("#mamAuthGate").waitFor({state:"visible"});
     assert.equal(await page.evaluate(()=>window.__mamMembershipCalls.filter(call=>call.path==="/membership/coupon").length),couponCallsBeforeGate);
    }
    await context.close();
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
    localStorage.removeItem("mam_session_token");
    sessionStorage.removeItem("mam_auth_refresh_v1");
    window.__mamSessionReady=false;
    document.addEventListener("mam:session-ready",()=>{window.__mamSessionReady=true;},{once:true});
    const native=window.fetch.bind(window);
    const current={id:"401888370",date:"2026-11-23T17:00:00Z",competitions:[{competitors:[
     {homeAway:"home",team:{id:"7914",displayName:"Başakşehir"},score:"0"},
     {homeAway:"away",team:{id:"21638",displayName:"Çorum FK"},score:"0"}
    ]}]};
    const midnightMatch={
     id:"401801111",date:"2026-11-22T21:30:00Z",
     status:{type:{name:"STATUS_FULL_TIME",state:"post",completed:true}},
     competitions:[{competitors:[
      {homeAway:"home",team:{id:"11",displayName:"Gece Yarısı Ev Sahibi"},score:"3"},
      {homeAway:"away",team:{id:"12",displayName:"Gece Yarısı Deplasman"},score:"0"}
     ]}]
    };
    window.testScoreboard={status:{displayClock:"",type:{name:"STATUS_SCHEDULED",state:"pre"}},goals:["0","0"]};
    window.fetch=(input,options)=>{
     const url=new URL(String(input),location.href);
     if(url.origin===location.origin)return native(input,options);
     if(url.pathname==="/membership/config")return Promise.resolve(Response.json({turnstileSiteKey:null}));
     if(window.testScoreboard.unavailable)return Promise.reject(new TypeError("Simulated provider failure"));
     if(url.pathname.includes("football-data/matches"))return Promise.resolve(Response.json({matches:[]}));
     if(url.pathname.includes("/summary"))return Promise.resolve(Response.json({keyEvents:window.testScoreboard.events||[]}));
     if(url.pathname.includes("/scoreboard")){
      const {status,goals}=window.testScoreboard;
      const row=structuredClone(current);
      row.status=status;
      row.competitions[0].competitors.forEach((team,i)=>{team.score=goals[i];});
      const date=url.searchParams.get("dates");
      const events=date==="20261122"?[midnightMatch]:[row];
      return Promise.resolve(Response.json({events:url.pathname.includes("/tur.1/")?events:[]}));
     }
     return Promise.resolve(Response.json({response:[]}));
    };
   });
   await page.goto(origin+"/index.html");
   await page.waitForFunction(()=>window.__mamSessionReady===true&&window.mamAuth?.role==="FREE");
   assert.equal(await page.evaluate(()=>window.mamAuth.token),"","fixture refresh acceptance must exercise the unauthenticated guest path");
   const card=page.locator("#matches article.match").filter({hasText:"Çorum FK"});
   await card.waitFor({state:"visible",timeout:6000});
   assert.match(await card.locator(".match-clock").innerText(),/20:00/);
   await page.locator('[data-match-mode="today"]').click();
   await page.locator("#status").getByText(/maç yüklendi/).waitFor({timeout:8000});
   const midnightCard=page.locator("#matches article.match").filter({hasText:"Gece Yarısı Ev Sahibi"});
   await midnightCard.locator(".match-clock").getByText("3 – 0",{exact:true}).waitFor();
   await page.evaluate(()=>{window.testScoreboard.unavailable=true;});
   await page.clock.fastForward(31_000);
   await page.locator("#mamSectionRefresh").click();
   await page.locator("#status").getByText(/Güncel veri alınamadı|Güncel fikstür şu an alınamadı/).waitFor({timeout:8000});
   await card.waitFor({state:"visible",timeout:5000});

   await page.context().setOffline(true);
   await page.waitForFunction(()=>!navigator.onLine);
   await card.waitFor({state:"visible",timeout:5000});
   await midnightCard.waitFor({state:"visible"});
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
   await page.locator('[data-match-mode="live"]').click();
   await card.locator(".match-clock").getByText("2 – 0",{exact:true}).waitFor();
   await page.evaluate(()=>{window.testScoreboard.unavailable=true;});
   await page.clock.fastForward(31_000);
   await page.locator("#status").getByText(/Son alınan skorlar gösteriliyor/).waitFor();
   await card.locator(".match-clock").getByText("2 – 0",{exact:true}).waitFor();
   await page.evaluate(()=>{window.testScoreboard.unavailable=false;});

   await page.locator('[data-match-mode="finished"]').click();
   await page.clock.fastForward(31_000);
   await page.waitForFunction(()=>document.getElementById("status").dataset.fixtureReady==="1");
   const finishedCards=await page.locator("#matches article.match").count();
   assert.equal(await page.locator("#status").innerText(),finishedCards?finishedCards+" maç yüklendi.":"Bu filtrede maç bulunamadı.");
   await card.waitFor({state:"hidden",timeout:5000});
   await page.evaluate(()=>{
    window.testScoreboard={status:{displayClock:"90'",type:{name:"STATUS_FULL_TIME",state:"post",completed:true}},goals:["2","1"]};
   });
   await page.clock.fastForward(31_000);
   await card.locator(".match-clock").getByText("2 – 1",{exact:true}).waitFor({timeout:8000});
   await page.locator('[data-match-mode="live"]').click();
   await page.locator("#status").getByText(/doğrulanmış canlı maç bulunamadı|Canlı veri doğrulanamadı|Canlı maç durumu şu anda doğrulanamadı/).waitFor();
   const liveState=await page.locator("#status").innerText();
   if(liveState.includes("doğrulanmış canlı maç bulunamadı")){
    await card.waitFor({state:"hidden"});
    assert.equal(await page.evaluate(()=>localStorage.getItem("mam_live_matches_cache_v1")),null);
   }else{
    // An uncertain provider response must never be mistaken for a verified empty result.
    assert.match(liveState,/Canlı veri doğrulanamadı|Canlı maç durumu şu anda doğrulanamadı/);
   }
   await page.locator('[data-match-mode="today"]').click();
   await page.waitForFunction(()=>!window.mamLoadMatchesBusy);
   await page.clock.setSystemTime(new Date("2026-11-23T21:01:00Z"));
   await page.evaluate(()=>document.dispatchEvent(new Event("visibilitychange")));
   await page.waitForFunction(()=>document.getElementById("date").value==="2026-11-24");
   await card.waitFor({state:"hidden"});
  }finally{
   await browser.close();
   const stopped=once(server,"exit");server.kill();await stopped;
  }
 });
}

for(const [engineName,engine] of [["Chromium",chromium],["WebKit",webkit]]){
 test(engineName+" does not refresh live statistics after details close",async()=>{
  const serverPort=port+3,serverOrigin="http://127.0.0.1:"+serverPort;
  const server=await launchServer(serverPort);
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:"block"});
   await page.route("**/*",route=>route.request().url().startsWith(serverOrigin+"/")?route.continue():route.abort());
   await page.addInitScript(()=>{
    localStorage.setItem("mam_session_token","local-browser-acceptance");
    const native=window.fetch.bind(window);
    window.__blockedExternalRequests=[];
    window.fetch=(input,options)=>{
     const url=new URL(String(input),location.href);
     if(url.pathname==="/auth/check")return Promise.resolve(new Response('{"ok":true}'));
     if(url.origin===location.origin)return native(input,options);
     window.__blockedExternalRequests.push(url.href);
     return Promise.reject(new TypeError("Network disabled in closed-detail regression"));
    };
   });
   await page.goto(serverOrigin+"/index.html");
   await page.locator("#mamAuthGate").waitFor({state:"hidden"});
   await page.evaluate(()=>clearInterval(window.mamLiveStatsTimer));
   const live=match("espn-tur.1-401888243",new Date(Date.now()+15*60000).toISOString(),"1H","Canlı Ev Sahibi","Canlı Deplasman",{home:1,away:0});
   live.fixture.status.elapsed=17;live.fixture.status.displayClock="17'";
   await page.evaluate(fixture=>{
    setMamScreen("live");
    document.getElementById("date").value=mamIstanbulDay(fixture.fixture.date);
    allMatches=[fixture];
    renderMatches();
   },live);
   const card=page.locator("#matches article.match").filter({hasText:"Canlı Ev Sahibi"});
   await card.waitFor({state:"visible"});
   await card.locator(".mam-match-open").click();
   const overlay=page.locator(".match-detail-overlay:not([hidden])");
   await overlay.waitFor({state:"visible"});
   const panel=overlay.locator(".liveStats");
   await panel.waitFor({state:"visible",timeout:8000});
   await overlay.locator(".match-detail-close").click();
   await overlay.waitFor({state:"hidden"});
   await page.waitForFunction(()=>location.hash!=="#match-detail");
   const before=await page.evaluate(()=>window.__blockedExternalRequests.length);
   const after=await page.evaluate(async()=>{
    const button=document.querySelector(".liveStatsBtn");
    button.dataset.statsLastRefresh="0";
    await refreshOpenLiveStats();
    return window.__blockedExternalRequests.length;
   });
   assert.equal(after,before,"A hidden match detail must not initiate another statistics request");
   console.log(engineName+" closed-detail polling: no additional blocked provider requests");
  }finally{
   await browser.close();
   const stopped=once(server,"exit");server.kill();await stopped;
  }
 });
}
