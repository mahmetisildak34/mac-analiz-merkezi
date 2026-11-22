const {istanbulDay,visibleMatches}=require("./match-rules");
const DEFAULT_API_BASE="https://odd-sunset-6c83.m-ahmetisildak34.workers.dev/api";

export async function fetchFixtures({
 tab,now=Date.now(),fetchImpl=globalThis.fetch,apiBase=DEFAULT_API_BASE,
 timeoutMs=8000,signal
}={}){
 if(!["live","today"].includes(tab))throw Object.assign(new RangeError("Invalid match tab"),{kind:"invalid_request"});
 if(typeof fetchImpl!=="function"||typeof apiBase!=="string"||!apiBase.trim()||
  !Number.isFinite(timeoutMs)||timeoutMs<1)throw Object.assign(new RangeError("Invalid API configuration"),{kind:"invalid_request"});
 const timestamp=now instanceof Date?now.getTime():Number(now);
 if(!Number.isFinite(timestamp))throw Object.assign(new RangeError("Invalid request time"),{kind:"invalid_request"});
 const endpoint=tab==="live"?"/fixtures?live=all&timezone=Europe%2FIstanbul":
  "/fixtures?date="+encodeURIComponent(istanbulDay(timestamp))+"&timezone=Europe%2FIstanbul";
 const controller=new AbortController();
 let timedOut=false,timer;
 const relay=()=>controller.abort(signal?.reason);
 if(signal?.aborted)throw signal.reason??Object.assign(new Error("Request cancelled"),{kind:"aborted"});
 signal?.addEventListener("abort",relay,{once:true});
 timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
 try{
  let response;
  try{response=await fetchImpl(apiBase.replace(/\/$/,"")+endpoint,{method:"GET",headers:{Accept:"application/json"},signal:controller.signal});}
  catch(error){
   if(signal?.aborted)throw signal.reason??Object.assign(new Error("Request cancelled"),{kind:"aborted"});
   if(timedOut)throw Object.assign(new Error("Maç verisi isteği zaman aşımına uğradı."),{kind:"timeout"});
   throw Object.assign(new Error("Maç servisine bağlanılamadı."),{kind:"network",cause:error});
  }
  let data;
  try{data=await response.json();}
  catch(error){throw Object.assign(new Error("Maç servisinden geçersiz JSON yanıtı alındı."),{kind:"invalid_json",cause:error});}
  const errors=data?.errors;
  if(!response.ok||errors&&Object.keys(errors).length){
   const rateLimited=Boolean(errors?.rateLimit||errors?.rate_limit||response.status===429);
   throw Object.assign(new Error(rateLimited?"API istek sınırına ulaşıldı. Biraz sonra tekrar dene.":"Maç verisi şu anda alınamadı."),{kind:rateLimited?"rate_limit":"http",status:response.status});
  }
  if(!Array.isArray(data?.response))throw Object.assign(new Error("Maç servisinin yanıt biçimi beklenenden farklı."),{kind:"invalid_payload"});
  return {matches:visibleMatches(data.response,tab,timestamp),updatedAt:Date.now(),source:"worker"};
 }finally{
  clearTimeout(timer);
  signal?.removeEventListener("abort",relay);
 }
}
