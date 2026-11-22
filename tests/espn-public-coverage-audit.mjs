// Read-only public ESPN coverage audit. Never contacts Worker, D1 or API-Football.
const leagues=['tur.1','eng.1','esp.1','ger.1','ita.1','fra.1','uefa.champions','uefa.europa','ned.1','por.1','uefa.euro','uefa.nations'];
const day=new Date().toISOString().slice(0,10).replaceAll('-','');
for(const league of leagues){
 const url='https://site.api.espn.com/apis/site/v2/sports/soccer/'+league+'/scoreboard?dates='+day;
 try{
  const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('HTTP '+response.status);
  const body=await response.json();
  const events=Array.isArray(body.events)?body.events:[];
  const statuses={live:0,scheduled:0,finished:0,other:0};
  for(const event of events){
   const state=String(event.status?.type?.state??'').toLowerCase();
   if(state==='in')statuses.live++;else if(state==='pre')statuses.scheduled++;else if(state==='post')statuses.finished++;else statuses.other++;
  }
  // Sample one actual match summary per league; zero-match days remain explicitly unknown.
  let detail={sampled:0,events:'not audited',statistics:'not audited',lineups:'not audited'};
  const sample=events.find(event=>String(event.status?.type?.state).toLowerCase()!=='pre')??events[0];
  if(sample?.id){
   try{
    const summary=await fetch('https://site.api.espn.com/apis/site/v2/sports/soccer/'+league+'/summary?event='+encodeURIComponent(sample.id),{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
    if(!summary.ok)throw Error('HTTP '+summary.status);
    const payload=await summary.json();
    const competition=payload.header?.competitions?.[0];
    const competitors=competition?.competitors??[];
    const hasStats=competitors.some(c=>Array.isArray(c.statistics)&&c.statistics.length>0)||Array.isArray(payload.boxscore?.teams)&&payload.boxscore.teams.some(team=>Array.isArray(team?.statistics)&&team.statistics.length>0);
    const hasLineups=Array.isArray(payload.rosters)&&payload.rosters.length>0||competitors.some(c=>Array.isArray(c.roster)&&c.roster.length>0);
    const hasEvents=Array.isArray(payload.keyEvents)&&payload.keyEvents.length>0||Array.isArray(payload.plays)&&payload.plays.length>0||Array.isArray(payload.scoringPlays)&&payload.scoringPlays.length>0;
    detail={sampled:1,eventId:String(sample.id),events:hasEvents?'present':'not observed',statistics:hasStats?'present':'not observed',lineups:hasLineups?'present':'not observed'};
   }catch(error){detail={sampled:1,eventId:String(sample.id),events:'unavailable',statistics:'unavailable',lineups:'unavailable',error:String(error.message)};}
  }
  console.log(JSON.stringify({league,date:day,scoreboard:'accessible',matches:events.length,statuses,detail,standingsCoverage:'not audited'}));
 }catch(error){console.log(JSON.stringify({league,date:day,scoreboard:'unavailable',error:String(error.message),eventsCoverage:'not audited',statisticsCoverage:'not audited',standingsCoverage:'not audited'}));}
}
