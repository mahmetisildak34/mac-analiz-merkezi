// Safari 2 ESPN live acceptance: read-only public scoreboard requests.
// Never calls the production Worker, D1 or API-Football.
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
mkdirSync("safari2-espn-acceptance-raw",{recursive:true});
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const index=html.indexOf("const ESPN_LEAGUES=");
const end=html.indexOf("};",index);
if(index<0||end<=index)throw Error("ESPN registry missing");
const registered=Array.from(html.slice(index,end).matchAll(/"([^"]+)":\{slug:"([^"]+)",name:"([^"]+)",country:"([^"]+)"\}/g),
 ([,id,slug,name,country])=>({id,slug,name,country}));
const unique=new Map();
for(const entry of registered){
 if(!unique.has(entry.slug))unique.set(entry.slug,entry); // Alias keys share the same ESPN URL.
}
const entries=[...unique.values()];
if(entries.length<49)throw Error("ESPN registry missing supported slugs: "+entries.length+" unique, expected at least 49");
console.log("ESPN REGISTRY",registered.length,"registered keys,",entries.length,"unique slugs (includes textual aliases)");
const currentDay=()=>{
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const get=k=>parts.find(x=>x.type===k)?.value||"";
 return get("year")+"-"+get("month")+"-"+get("day");
};
const day=process.env.ESPN_ACCEPT_DATE||currentDay();
if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error("Invalid ESPN_ACCEPT_DATE");
const isId=x=>(typeof x==="string"&&/^[a-z0-9._-]+$/i.test(x.trim())&&!/^(?:null|undefined|nan)$/i.test(x.trim()))||(typeof x==="number"&&Number.isFinite(x)&&x>0);
async function check({id,slug,name,country}){
 const url="https://site.api.espn.com/apis/site/v2/sports/soccer/"+encodeURIComponent(slug)+"/scoreboard?dates="+day.replace(/-/g,"")+"&limit=500";
 const record={leagueId:id,slug,name,country,date:day,url,http:null,jsonValid:false,events:0,checked:0,outcome:"failed",issues:[],rawSha256:null,rawBytes:0,leagueMetadata:[]};
 try{
  const response=await fetch(url,{method:"GET",headers:{accept:"application/json"},signal:AbortSignal.timeout(15000)});
  record.http=response.status;
  const raw=await response.text();
  writeFileSync("safari2-espn-acceptance-raw/"+slug+".json",raw);
  record.rawBytes=Buffer.byteLength(raw);
  record.rawSha256=createHash("sha256").update(raw).digest("hex");
  if(!response.ok){record.issues.push("HTTP "+response.status);return record;}
  let data;
  try{data=JSON.parse(raw);record.jsonValid=true;}catch(err){record.issues.push("Invalid JSON: "+String(err.message||err));return record;}
  record.leagueMetadata=Array.isArray(data?.leagues)?data.leagues.map(x=>({id:x.id??null,slug:x.slug??null,name:x.name??null})):[];

  if(!data||!Array.isArray(data.events)){record.issues.push("Missing events array");return record;}
  record.events=data.events.length;
  if(!data.events.length){record.outcome="empty";return record;}
  for(const event of data.events){
   const competition=event?.competitions?.[0];
   const teams=Array.isArray(competition?.competitors)?competition.competitors:[];
   const home=teams.find(x=>x?.homeAway==="home"),away=teams.find(x=>x?.homeAway==="away");
   const eventStatus=event?.status?.type||competition?.status?.type;
   const issues=[];
   if(!isId(event?.id))issues.push("missing/invalid id");
   if(!home?.team?.id||!away?.team?.id||!String(home.team.displayName||home.team.name||"").trim()||!String(away.team.displayName||away.team.name||"").trim())issues.push("missing teams");
   if(!event?.date||!Number.isFinite(Date.parse(event.date)))issues.push("invalid kickoff");
   if(!eventStatus||!String(eventStatus.state||eventStatus.name||eventStatus.detail||"").trim())issues.push("missing status");
   if(issues.length)record.issues.push(String(event?.id??"unknown")+": "+issues.join(", "));
   else record.checked++;
  }
  record.outcome=record.issues.length?"invalid":"verified";
 }catch(err){record.issues.push(String(err.name||"Error")+": "+String(err.message||err));}
 return record;
}
const records=new Array(entries.length);
let cursor=0;
await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{
 while(cursor<entries.length){
  const index=cursor++;
  records[index]=await check(entries[index]);
  console.log(records[index].slug+" => "+records[index].outcome+" (HTTP "+records[index].http+", events "+records[index].events+", valid "+records[index].checked+")");
 }
}));
const summary={date:day,configured:entries.length,verified:records.filter(x=>x.outcome==="verified").length,empty:records.filter(x=>x.outcome==="empty").length,invalid:records.filter(x=>x.outcome==="invalid").length,failed:records.filter(x=>x.outcome==="failed").length,checkedEvents:records.reduce((n,x)=>n+x.checked,0)};
const output={summary,records};
writeFileSync("safari2-espn-acceptance.json",JSON.stringify(output,null,2)+"\n");
console.log("ESPN ACCEPTANCE SUMMARY",JSON.stringify(summary));
console.log("Empty does NOT count as verified and HTTP errors do NOT count as passes.");
if(process.env.GITHUB_STEP_SUMMARY){
 const lines=["## Safari 2 ESPN read-only acceptance","Date: "+day,"Configured unique endpoints: "+summary.configured,"Verified with events: "+summary.verified,"Empty (not event-verified): "+summary.empty,"Invalid payload: "+summary.invalid,"Failed HTTP/JSON/network: "+summary.failed,"Fully checked events: "+summary.checkedEvents,"","Only defined ESPN registry slugs are requested; no production Worker, D1 or API-Football calls."];
 writeFileSync(process.env.GITHUB_STEP_SUMMARY,lines.join("\n")+"\n",{flag:"a"});
}
if(summary.invalid||summary.failed)process.exitCode=1;
