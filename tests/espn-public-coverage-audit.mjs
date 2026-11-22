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
  console.log(JSON.stringify({league,date:day,scoreboard:'accessible',matches:events.length,statuses,eventsCoverage:'not audited',statisticsCoverage:'not audited',standingsCoverage:'not audited'}));
 }catch(error){console.log(JSON.stringify({league,date:day,scoreboard:'unavailable',error:String(error.message),eventsCoverage:'not audited',statisticsCoverage:'not audited',standingsCoverage:'not audited'}));}
}
