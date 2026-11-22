// Safari 2: evidence-only ESPN catalog/league candidate verification.
// GET public ESPN only; no Worker, API-Football, D1, writes, or app registry mutations.
import {mkdirSync,writeFileSync} from "node:fs";
const candidates=[
 ["den.1","Danish Superliga"],["nor.1","Norwegian Eliteserien"],["swe.1","Swedish Allsvenskan"],
 ["aut.1","Austrian Bundesliga"],["sui.1","Swiss Super League"],["pol.1","Polish Ekstraklasa"],
 ["gre.1","Greek Super League"],["usa.nwsl","NWSL"],["eng.w.1","Women's Super League"],
 ["uefa.wchampions","Women's Champions League"],["col.1","Colombian Primera A"],["chi.1","Chilean Primera"],
 ["uru.1","Uruguayan Primera"],["conmebol.libertadores","Copa Libertadores"],
 ["conmebol.sudamericana","Copa Sudamericana"],["fifa.wwc","Women's World Cup"]
];
const base="https://site.api.espn.com/apis/site/v2/sports/soccer";
const result=[];mkdirSync("safari2-espn-discovery-raw",{recursive:true});
async function http(url,filename){
 const response=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(15000)});
 const raw=await response.text();
 writeFileSync("safari2-espn-discovery-raw/"+filename+".json",raw);
 let data=null;try{data=JSON.parse(raw)}catch(_){}
 return {status:response.status,data,bytes:raw.length};
}
let catalog=null;
try{catalog=await http(base,"catalog");}catch(err){catalog={status:null,data:null,error:String(err)}}
const catalogText=JSON.stringify(catalog.data||{}).toLowerCase();
console.log("ESPN CATALOG HTTP",catalog.status,"bytes",catalog.bytes||0);
let cursor=0;const entries=new Array(candidates.length);
await Promise.all(Array.from({length:4},async()=>{
 while(cursor<candidates.length){
  const index=cursor++,[slug,expected]=candidates[index],out={slug,expected,http:null,events:0,verifiedEvents:0,metadata:[],catalogMention:false,confirmed:false,issues:[]};
  out.catalogMention=catalogText.includes('"'+slug+'"');
  try{
   const {status,data,bytes}=await http(base+"/"+encodeURIComponent(slug)+"/scoreboard?dates=20261122&limit=500",slug.replace(/[^a-z0-9._-]/gi,"_"));
   out.http=status;out.bytes=bytes;
   if(status!==200||!data||!Array.isArray(data.events)){out.issues.push("non-200, invalid JSON, or events missing");entries[index]=out;continue;}
   const leagues=Array.isArray(data.leagues)?data.leagues:[];
   out.metadata=leagues.map(x=>({id:x.id??null,slug:x.slug??null,name:x.name??null,abbreviation:x.abbreviation??null}));
   const leagueMatches=leagues.some(x=>String(x.slug||x.id||"").toLowerCase()===slug);
   out.events=data.events.length;
   for(const event of data.events){
    const competitors=event.competitions?.[0]?.competitors||[];
    const home=competitors.find(x=>x.homeAway==="home"),away=competitors.find(x=>x.homeAway==="away");
    if(event.id&&event.date&&Number.isFinite(Date.parse(event.date))&&home?.team?.id&&away?.team?.id)out.verifiedEvents++;
   }
   out.confirmed=out.catalogMention||leagueMatches||out.verifiedEvents>0;
   if(!out.confirmed)out.issues.push("HTTP success alone cannot establish real league identity");
  }catch(err){out.issues.push(String(err.message||err));}
  entries[index]=out;
  console.log(slug,"HTTP",out.http,"confirmed",out.confirmed,"events",out.verifiedEvents,"league",JSON.stringify(out.metadata));
 }
}));
const output={catalogHttp:catalog.status,candidates:entries,confirmed:entries.filter(x=>x.confirmed).length,unconfirmed:entries.filter(x=>!x.confirmed).length};
writeFileSync("safari2-espn-discovery.json",JSON.stringify(output,null,2));
console.log("DISCOVERY SUMMARY",JSON.stringify({confirmed:output.confirmed,unconfirmed:output.unconfirmed,catalogHttp:output.catalogHttp}));
if(process.env.GITHUB_STEP_SUMMARY){
 writeFileSync(process.env.GITHUB_STEP_SUMMARY,"## ESPN new-league candidates\nConfirmed: "+output.confirmed+" / "+candidates.length+"\nUnconfirmed: "+output.unconfirmed+"\nNo unverified candidates are added to the app.\n",{flag:"a"});
}
