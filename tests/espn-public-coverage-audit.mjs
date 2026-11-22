// Public ESPN GET requests only. No credentials, Worker, database, or paid provider.
import {espnCompetitions,parseEspnStandings} from '../mobile/product-features.mjs';

const site='https://site.api.espn.com/apis/site/v2/sports/soccer/';
const standingsSite='https://site.api.espn.com/apis/v2/sports/soccer/';
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',dateStyle:'short'}).formatToParts(new Date());
const part=type=>today.find(item=>item.type===type).value;
const noon=Date.parse([part('year'),part('month'),part('day')].join('-')+'T12:00:00Z');
const days=[-1,0,1].map(offset=>new Date(noon+offset*86400000).toISOString().slice(0,10).replaceAll('-',''));
const list=value=>Array.isArray(value)?value:[];
async function read(url){
 const start=performance.now();
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(8000),credentials:'omit',headers:{Accept:'application/json'}});
  if(!response.ok)return {error:'HTTP '+response.status};
  const value=await response.json();
  if(!value||typeof value!=="object"||Array.isArray(value))return {error:"Invalid ESPN payload"};
  return {value,ms:Math.round(performance.now()-start)};
 }catch(error){return {error:String(error.message)};}
}
function matchState(event){
 const type=event?.status?.type??event?.competitions?.[0]?.status?.type;
 const name=String(type?.name??'');
 if(/POSTPONED|CANCELL?ED|ABANDONED/.test(name))return 'other';
 if(type?.state==='in')return 'live';
 if(type?.state==='pre')return 'scheduled';
 if(type?.state==='post'||type?.completed===true)return 'finished';
 return 'unknown';
}
function dayResult(data){
 const events=list(data.value?.events);
 const counts={live:0,scheduled:0,finished:0,other:0,unknown:0};
 for(const event of events)counts[matchState(event)]++;
 return data.error?{error:data.error}:{...counts,ms:data.ms};
}
function summarize(data){
 if(!data)return null;
 if(data.error)return {error:data.error};
 const value=data.value,teams=list(value.boxscore?.teams),rosters=list(value.rosters);
 return {
  events:[value.keyEvents,value.plays,value.scoringPlays].some(rows=>list(rows).length>0),
  statistics:teams.some(team=>list(team?.statistics).length>0),
  lineups:rosters.some(team=>list(team?.roster).length>0),
  players:rosters.some(team=>list(team?.roster).some(entry=>list(entry?.stats).length>0))
 };
}
async function audit([league,name]){
 const base=site+league;
 const boards=[];
 for(const day of days)boards.push(await read(base+'/scoreboard?dates='+day));
 const events=boards.flatMap(data=>list(data.value?.events));
 const sample=events.find(event=>matchState(event)==='live')??events.find(event=>matchState(event)==='finished');
 const detail=sample?.id?await read(base+'/summary?event='+encodeURIComponent(sample.id)):null;
 const standings=await read(standingsSite+league+'/standings');
 let standingsResult;
 try{
  const groups=parseEspnStandings(standings.value);
  standingsResult=standings.error?{error:standings.error}:{rows:groups.reduce((n,group)=>n+group.rows.length,0),season:standings.value?.season?.displayName??null,ms:standings.ms};
 }catch(error){standingsResult={error:String(error.message)};}
 const year=Number(standings.value?.season?.year);
 if(standingsResult.rows>0&&Number.isInteger(year)){
  const selected=await read(standingsSite+league+'/standings?season='+year);
  try{
   standingsResult.selectedSeason=selected.error?{error:selected.error}:{
    year,confirmed:Number(selected.value?.season?.year)===year&&parseEspnStandings(selected.value).length>0
   };
  }catch(error){standingsResult.selectedSeason={error:String(error.message)};}
 }
 const withTeams=events.filter(event=>{
  const competitors=list(event.competitions?.[0]?.competitors);
  return ['home','away'].every(side=>competitors.some(row=>row?.homeAway===side&&(row.team?.displayName||row.team?.name)));
 });
 const withLogos=withTeams.filter(event=>list(event.competitions?.[0]?.competitors).every(row=>row.team?.logo||list(row.team?.logos).some(logo=>logo?.href)));
 return {
  league,name,days:Object.fromEntries(days.map((day,index)=>[day,dayResult(boards[index])])),
  teams:withTeams.length,logos:withLogos.length,eventId:sample?.id??null,
  detail:summarize(detail),standings:standingsResult,
  active:events.filter(event=>matchState(event)==='live').map(event=>({id:event.id,status:event.status?.type?.name,clock:event.status?.displayClock,scores:list(event.competitions?.[0]?.competitors).map(row=>[row.homeAway,row.score])}))
 };
}
const entries=[...espnCompetitions];
const results=new Array(entries.length);
let next=0;
// Limit concurrent network activity and keep output in catalog order.
await Promise.all(Array.from({length:8},async()=>{
 while(next<entries.length){
  const index=next++;
  results[index]=await audit(entries[index]);
 }
}));
for(const result of results)console.log(JSON.stringify(result));
