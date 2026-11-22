const {chromium,webkit,devices}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const css=fs.readFileSync('premium-dark-red.css','utf8');
(async()=>{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({...devices['iPhone 13'],viewport:{width:390,height:844}});
   await page.route('**/*',route=>route.abort());
   await page.setContent('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main><nav class="mam-bottom-nav"><button class="active">Ana Sayfa</button></nav><article class="match match-modern"><div class="match-versus"><div class="team-block"><img class="team-logo" alt="Takım logosu"><strong>Takım</strong></div><div class="match-center"><span class="match-clock">20:00</span></div><div class="team-block"><strong>Rakip</strong></div></div></article></main><section id="mamTeamSearch" hidden></section><section id="mamFavoritePanel"></section><section id="mamStandingsScreen"></section><section id="couponPanel"></section></body></html>');
   await page.addStyleTag({content:css});
   const values=await page.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,logo:document.querySelector('.team-logo').getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth,nav:getComputedStyle(document.querySelector('.mam-bottom-nav')).backgroundColor}));
   assert.match(values.bg,/rgb\(8, 11, 17\)/);
   assert.ok(values.logo>0&&values.logo<=40,'logo should be compact (max 40 CSS px)');
   assert.equal(values.overflow,false,'horizontal overflow');
   console.log(name,values);
  }finally{await browser.close()}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
