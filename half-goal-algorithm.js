/* Frozen calculation core for Maç Analiz Merkezi Yarı Gol Arşivi.
 * Keep scoring semantics unchanged; changes require fixture-based regression tests.
 */
(function(root){
 "use strict";
 function halfTeamKey(name){return String(name||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("tr-TR").replace(/ı/g,"i").replace(/[^a-z0-9]+/g," ").trim();}
 function halfTeamStats(rows){
  const map=new Map(),seenFixtures=new Set();
  const keyOf=halfTeamKey;
  const uniqueRows=[];
  for(const m of rows){
   const home=keyOf(m.home),away=keyOf(m.away),day=String(m.kickoff||"").slice(0,10),league=String(m.leagueId||"");
   if(!home||!away||!day)continue;
   const fixtureKey=[league,day,...[home,away].sort()].join("|");
   if(seenFixtures.has(fixtureKey))continue;
   seenFixtures.add(fixtureKey);uniqueRows.push(m);
  }
  for(const m of uniqueRows){
   const rawScores=[m.halftimeHome,m.halftimeAway,m.homeGoals,m.awayGoals];
   if(rawScores.some(value=>value==null||String(value).trim()===""))continue;
   const halfHome=Number(m.halftimeHome),halfAway=Number(m.halftimeAway),fullHome=Number(m.homeGoals),fullAway=Number(m.awayGoals);
   if(![halfHome,halfAway,fullHome,fullAway].every(Number.isFinite)||halfHome<0||halfAway<0||fullHome<halfHome||fullAway<halfAway)continue;
   const sides=[
    {name:m.home,firstScored:halfHome>0,firstConceded:halfAway>0,secondScored:(fullHome-halfHome)>0,secondConceded:(fullAway-halfAway)>0},
    {name:m.away,firstScored:halfAway>0,firstConceded:halfHome>0,secondScored:(fullAway-halfAway)>0,secondConceded:(fullHome-halfHome)>0}
   ];
   for(const side of sides){
    const key=String(m.leagueId||"")+"|"+keyOf(side.name);if(!key)continue;
    if(!map.has(key))map.set(key,{name:side.name,firstScored:[],firstConceded:[],secondScored:[],secondConceded:[],bothScored:[],recent:[],matches:0});
    const t=map.get(key);t.firstScored.push(side.firstScored);t.firstConceded.push(side.firstConceded);t.secondScored.push(side.secondScored);t.secondConceded.push(side.secondConceded);t.bothScored.push(side.firstScored&&side.secondScored);t.recent.push({kickoff:m.kickoff||"",firstScored:side.firstScored,firstConceded:side.firstConceded,secondScored:side.secondScored,secondConceded:side.secondConceded,bothScored:side.firstScored&&side.secondScored});t.matches++;
   }
  }
  return map;
 }
 function halfTeamKey(name){return String(name||"").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("tr-TR").replace(/ı/g,"i").replace(/[^a-z0-9]+/g," ").trim();}
 function halfRate(values){return values.length?Math.round(values.filter(Boolean).length/values.length*100):null;}
 function halfTeamMetrics(team){
  if(!team)return null;
  const recent=(team.recent||[]).slice().sort((a,b)=>String(b.kickoff).localeCompare(String(a.kickoff))).slice(0,5);
  return {firstScored:halfRate(team.firstScored),firstConceded:halfRate(team.firstConceded),secondScored:halfRate(team.secondScored),secondConceded:halfRate(team.secondConceded),bothScored:halfRate(team.bothScored),recent5:{firstScored:halfRate(recent.map(x=>x.firstScored)),firstConceded:halfRate(recent.map(x=>x.firstConceded)),secondScored:halfRate(recent.map(x=>x.secondScored)),secondConceded:halfRate(recent.map(x=>x.secondConceded)),bothScored:halfRate(recent.map(x=>x.bothScored)),samples:recent.length},samples:team.matches};
 }
 function halfPassesThreshold(metrics,filter,threshold){
  if(!metrics)return false;
  const values=filter==="first"?[metrics.firstScored]:filter==="second"?[metrics.secondScored]:filter==="both"?[metrics.bothScored]:[metrics.firstScored,metrics.secondScored,metrics.bothScored];
  return values.some(value=>value!==null&&value>=threshold);
 }
 function halfMatchQualification(home,away,eligibleThreshold=60,favoriteThreshold=70){
  if(!home||!away)return {eligible:false,favorite:false,rates:null};
  const rates={homeFirst:home.firstScored,homeSecond:home.secondScored,awayFirst:away.firstScored,awaySecond:away.secondScored};
  const values=Object.values(rates);
  const valid=values.every(value=>Number.isFinite(value));
  const eligible=valid&&values.every(value=>value>=eligibleThreshold);
  return {eligible,favorite:eligible&&values.every(value=>value>=favoriteThreshold),rates};
 }
 const api=Object.freeze({halfTeamKey,halfTeamStats,halfTeamMetrics,halfPassesThreshold,halfMatchQualification});
 if(typeof module!=="undefined"&&module.exports)module.exports=api;
 root.MamHalfGoalAlgorithm=api;
})(typeof globalThis!=="undefined"?globalThis:this);
