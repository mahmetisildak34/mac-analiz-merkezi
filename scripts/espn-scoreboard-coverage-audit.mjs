// Read-only ESPN scoreboard coverage probe. Never calls Worker, D1 or API-Football.
// This compares raw ESPN event IDs with the application's actual ESPN fixture parser.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const html=fs.readFileSync('index.html','utf8');
const begin=html.indexOf('const ESPN_LEAGUES={');
const end=html.indexOf('const MAM_MATCH_STATS_TTL=',begin);
const loadStart=html.indexOf('async function espnFixtures(date,includeAllLeagues=false){');
const loadEnd=html.indexOf('async function loadMatches(){',loadStart);
const clockStart=html.indexOf('function mamEspnClock(event){');
const clockEnd=html.indexOf('async function mamFindEspnLiveEvent',clockStart);
if([begin,end,loadStart,loadEnd,clockStart,clockEnd].some(n=>n<0)||end<=begin||loadEnd<=loadStart||clockEnd<=clockStart)
 throw new Error('Application source anchors unavailable');
const leagues=vm.runInNewContext(html.slice(begin,end)+';ESPN_LEAGUES');
const unique=new Map();
for(const [id,value] of Object.entries(leagues))if(value?.slug&&!unique.has(value.slug))unique.set(value.slug,{id,name:value.name});
const date=process.argv[2]||'2026-11-22';
if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Use YYYY-MM-DD');
const dateCompact=date.replaceAll('-','');
const results=[];
let index=0;
async function check(slug,league){
 const url='https://site.api.espn.com/apis/site/v2/sports/soccer/'+encodeURIComponent(slug)+'/scoreboard?dates='+dateCompact+'&limit=500';
 const row={slug,leagueId:league.id,leagueName:league.name,date,source:'ESPN',result:'unverified'};
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{'accept':'application/json'}});
  row.httpStatus=response.status;
  if(!response.ok){row.result='request_failed';return row;}
  const payload=await response.json();
  if(!Array.isArray(payload.events)){row.result='invalid_payload';return row;}
  const rawIds=payload.events.map(e=>String(e?.id??''));
  row.espnEvents=payload.events.length;
  row.duplicateSourceIds=rawIds.length-new Set(rawIds).size;
  const context={
   ESPN_LEAGUES:{[league.id]:{slug,name:league.name,country:''}},
   $:()=>({value:String(league.id)}),localStorage:{getItem:()=>null,setItem(){}},
   qs:q=>new URLSearchParams(q).toString(),
   api:async()=>payload,
   console:{warn(){}},
  };
  const source=html.slice(clockStart,clockEnd)+';'+html.slice(loadStart,loadEnd)+';espnFixtures';
  const parse=vm.runInNewContext(source,context,{timeout:3000});
  const parsed=await parse(date);
  row.appParserEvents=parsed.length;
  const parsedIds=new Set(parsed.map(e=>String(e.fixture?.id||'').slice(('espn-'+slug+'-').length)));
  row.missingIds=[...new Set(rawIds)].filter(id=>!parsedIds.has(id));
  row.unknownStatus=parsed.filter(e=>e.fixture?.status?.short==='UNKNOWN').length;
  row.result=row.missingIds.length||row.duplicateSourceIds?'coverage_gap':'parsed';
 }catch(e){row.result='request_or_parse_error';row.error=String(e?.message||e).slice(0,300);}
 return row;
}
async function worker(){
 while(index<unique.size){
  const item=[...unique.entries()][index++];
  if(!item)return;
  results.push(await check(item[0],item[1]));
 }
}
await Promise.all(Array.from({length:3},worker));
results.sort((a,b)=>a.slug.localeCompare(b.slug));
const summary={date,configuredLeagueKeys:Object.keys(leagues).length,uniqueSlugs:unique.size,checked:results.length,
 verified:results.filter(x=>x.result==='parsed').length,
 gaps:results.filter(x=>x.result==='coverage_gap').length,
 failed:results.filter(x=>!['parsed','coverage_gap'].includes(x.result)).length,
 rawEvents:results.reduce((n,x)=>n+(x.espnEvents||0),0),
 appParserEvents:results.reduce((n,x)=>n+(x.appParserEvents||0),0)};
const report={summary,results,limitations:['Compares ESPN scoreboard responses with app parser; does not verify authenticated browser display','Only one calendar date is checked','Network errors never count as empty league results']};
fs.mkdirSync('audit',{recursive:true});
const filename=path.join('audit','espn-coverage-'+date+'.json');
fs.writeFileSync(filename,JSON.stringify(report,null,2)+'\n');
for(const r of results)console.log([r.slug,r.result,'ESPN='+String(r.espnEvents??'N/A'),'app='+String(r.appParserEvents??'N/A'),'missing='+String(r.missingIds?.length??'N/A'),'HTTP='+String(r.httpStatus??'N/A')].join(' | '));
console.log('SUMMARY',JSON.stringify(summary),'EVIDENCE',filename);
if(summary.failed||summary.gaps)process.exitCode=1;
