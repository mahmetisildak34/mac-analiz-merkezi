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
// Bounded tournament-specific dates supplement the league calendar, which ESPN
// sometimes omits on days without matches. A probe is evidence only if the
// provider actually returns a completed event.
const verifiedArchiveDates={
 'uefa.champions':['20261104'],
 'fifa.world':['20260719'],
 'uefa.euro':['20240714'],
 'esp.copa_del_rey':['20261028','20260114','20251203'],
 'uefa.europa':['20261105','20261022','20260520'],
 'uefa.europa.conf':['20261105','20261022','20260527'],
 'tur.2':['20261101-20261122','20260901-20261031','20250801-20260531','20261121','20261108','20260816'],
 'ger.dfb_pokal':['20261028','20260818','20260523'],
 'ita.coppa_italia':['20260924','20260422'],
 'fra.coupe_de_france':['20260101-20260331','20260401-20260531','20250101-20250531','20260114','20260523'],
 'caf.nations':['20260118','20251221'],
 'conmebol.america':['20240714'],
 'fifa.cwc':['20250713'],
 'fifa.u20.friendly':['20260101-20261122','20250101-20251231','20240101-20241231','20250320','20241114'],
 'concacaf.champions':['20260530','20260527'],
 'concacaf.gold':['20250706'],
 'conmebol.libertadores':['20261121','20261029','20251129'],
 'conmebol.sudamericana':['20261121','20251025']
};
function archiveDates(boards,league){
 if(verifiedArchiveDates[league])return verifiedArchiveDates[league];
 const calendar=boards.flatMap(board=>list(board.value?.leagues).flatMap(league=>list(league?.calendar)));
 const dates=[...new Set(calendar.filter(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)).map(value=>value.slice(0,10).replaceAll('-','')))];
 const earlier=dates.filter(day=>day<days[0]).sort().reverse();
 const published=[0,1,3,7,14,30,60].map(index=>earlier[index]).filter(Boolean);
 if(published.length)return published;
 // Bounded date probes when the current provider response omits a calendar.
 return [3,7,14,21,28,56,112].map(offset=>new Date(noon-offset*86400000).toISOString().slice(0,10).replaceAll('-',''));
}
async function audit([league,name]){
 const base=site+league;
 const boards=[];
 for(const day of days)boards.push(await read(base+'/scoreboard?dates='+day));
 const events=boards.flatMap(data=>list(data.value?.events));
 let sample=events.find(event=>matchState(event)==='live')??events.find(event=>matchState(event)==='finished');
 const archive={attempted:[],sampleDate:null};
 if(!sample&&process.argv.includes('--archive')){
  for(const day of archiveDates(boards,league)){
   const board=await read(base+'/scoreboard?dates='+day);
   archive.attempted.push({day,...dayResult(board)});
   sample=list(board.value?.events).find(event=>matchState(event)==='finished');
   if(sample){archive.sampleDate=day;break;}
  }
 }
 const scheduled=events.find(event=>matchState(event)==='scheduled');
 const scheduledSides=list(scheduled?.competitions?.[0]?.competitors);
 const scheduledHome=scheduledSides.find(row=>row?.homeAway==='home')?.team;
 const scheduledAway=scheduledSides.find(row=>row?.homeAway==='away')?.team;
 const upcomingBoardFixture=scheduled?{
  eventId:String(scheduled.id??''),date:scheduled.date??null,
  homeId:scheduledHome?.id==null?null:String(scheduledHome.id),
  awayId:scheduledAway?.id==null?null:String(scheduledAway.id),
  homeName:scheduledHome?.displayName??scheduledHome?.name??null,
  awayName:scheduledAway?.displayName??scheduledAway?.name??null,
  validTeamIdentity:!!scheduled.id&&!!scheduledHome?.id&&!!scheduledAway?.id&&String(scheduledHome.id)!==String(scheduledAway.id)
 }:null;
 const detail=sample?.id?await read(base+'/summary?event='+encodeURIComponent(sample.id)):null;
 // A provider-published team ID is required; never match teams by names.
 const competitors=list(sample?.competitions?.[0]?.competitors);
 const team=competitors.find(row=>row?.homeAway==='home'&&row.team?.id)?.team;
 const teamId=team?.id==null?null:String(team.id);
 const teamSchedule=teamId?await read(base+'/teams/'+encodeURIComponent(teamId)+'/schedule'):null;
 const scheduleEvents=list(teamSchedule?.value?.events);
 const scheduleStates={scheduled:0,finished:0,live:0,other:0,unknown:0};
 for(const event of scheduleEvents)scheduleStates[matchState(event)]++;
 const teamHistory=teamId?{
  teamId,teamName:team.displayName??team.name??null,
  error:teamSchedule?.error??null,events:scheduleEvents.length,
  states:scheduleStates,
  distinctIds:new Set(scheduleEvents.map(event=>String(event.id??'')).filter(Boolean)).size,
  matchedTeam:scheduleEvents.some(event=>list(event?.competitions?.[0]?.competitors).some(row=>String(row.team?.id??'')===teamId))
 }:null;
 // ESPN's default team schedule may contain only past events. Query explicit
 // seasons separately and report every negative/unsupported outcome honestly.
 const futureProbes=[];
 if(teamId){
  for(const query of ['dates=2026','dates=2027','season=2026','season=2027']){
   const response=await read(base+'/teams/'+encodeURIComponent(teamId)+'/schedule?'+query);
   const rows=list(response.value?.events);
   const states={scheduled:0,finished:0,live:0,other:0,unknown:0};
   for(const event of rows)states[matchState(event)]++;
   futureProbes.push({query,error:response.error??null,events:rows.length,states,
    matchedTeam:rows.some(event=>list(event?.competitions?.[0]?.competitors).some(row=>String(row.team?.id??'')===teamId))});
   if(states.scheduled>0)break;
  }
 }
 const teamFuture=teamId?{teamId,probes:futureProbes,
  hasUpcoming:futureProbes.some(probe=>probe.states.scheduled>0),
  unsupported:futureProbes.every(probe=>probe.error!==null||probe.events===0)}:null;
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
  detail:summarize(detail),teamHistory,teamFuture,upcomingBoardFixture,archive,standings:standingsResult,
  active:events.filter(event=>matchState(event)==='live').map(event=>({id:event.id,status:event.status?.type?.name,clock:event.status?.displayClock,scores:list(event.competitions?.[0]?.competitors).map(row=>[row.homeAway,row.score])}))
 };
}
const selectedLeagues=new Set(process.argv.filter(arg=>arg.startsWith('--league=')).map(arg=>arg.slice('--league='.length)));
const entries=[...espnCompetitions].filter(([league])=>!selectedLeagues.size||selectedLeagues.has(league));
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
