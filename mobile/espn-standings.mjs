import {espnCompetitions,parseEspnStandings} from './product-features.mjs';

const endpoint='https://odd-sunset-6c83.m-ahmetisildak34.workers.dev/api/espn/';
const freshMs=10*60*1000;
const retentionMs=7*24*60*60*1000;
const results=new Map(),requests=new Map();

export async function loadEspnStandings(slug,{season='',refresh=false}={}){
 season=String(season);
 if(!espnCompetitions.has(slug)||(season&&!/^\d{4}$/.test(season)))throw new Error('Geçersiz ESPN ligi veya sezonu.');
 const key='mam_espn_standings_v1_'+slug+(season?'_'+season:'');
 const now=Date.now();
 let saved=results.get(key);
 if(!saved){
  try{
   const record=JSON.parse(localStorage.getItem(key)??'null');
   if(record&&Number.isFinite(record.at)&&record.at<=now&&now-record.at<retentionMs){
    const groups=parseEspnStandings(record.payload);
    if(groups.length)saved={at:record.at,groups,name:record.payload.name};
   }
  }catch{}
 }
 if(!refresh&&saved&&now-saved.at<freshMs)return {...saved,stale:globalThis.navigator?.onLine===false};
 if(!requests.has(key)){
  const request=(async()=>{
   const url=endpoint+encodeURIComponent(slug)+'/standings'+(season?'?season='+season:'');
   const response=await fetch(url,{credentials:'omit',signal:AbortSignal.timeout(8000)});
   if(!response.ok&&response.status!==404)throw new Error('ESPN HTTP '+response.status);
   const payload=response.status===404?{}:await response.json();
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw new Error('Geçersiz ESPN yanıtı.');
   const groups=parseEspnStandings(payload);
   if(season&&groups.length&&String(payload.season?.year??'')!==season)throw new Error('ESPN seçilen sezonu doğrulamadı.');
   const result={at:Date.now(),groups,name:payload.name};
   results.set(key,result);
   try{
    if(groups.length)localStorage.setItem(key,JSON.stringify({at:result.at,payload}));
    else localStorage.removeItem(key);
   }catch{}
   return result;
  })().finally(()=>requests.delete(key));
  requests.set(key,request);
 }
 try{return await requests.get(key);}
 catch(error){
  if(saved?.groups.length&&now-saved.at<retentionMs)return {...saved,stale:true};
  throw error;
 }
}
