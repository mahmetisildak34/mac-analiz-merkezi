const {defineConfig} = require("@playwright/test");
module.exports=defineConfig({
 testDir:"./tests/browser",
 testMatch:"safari2-mobile.spec.cjs",
 timeout:30000,
 retries:0,
 reporter:[["list"],["html",{open:"never",outputFolder:"playwright-report/safari2"}]],
 use:{baseURL:"http://127.0.0.1:4173",headless:true,trace:"retain-on-failure",screenshot:"only-on-failure"},
 projects:[
  {name:"chromium",use:{browserName:"chromium",viewport:{width:390,height:844}}},
  {name:"webkit",use:{browserName:"webkit",viewport:{width:390,height:844}}}
 ],
 webServer:{command:"python3 -m http.server 4173 --bind 127.0.0.1",
  url:"http://127.0.0.1:4173/",reuseExistingServer:false,timeout:15000}
});
