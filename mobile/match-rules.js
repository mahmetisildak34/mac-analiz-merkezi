/* Safari 2 mobile: deterministic, provider-independent fixture presentation.
 * These pure rules make the native screen testable without production requests.
 */
const LIVE = new Set(["1H","HT","2H","ET","BT","P","SUSP","INT","LIVE"]);
const FINAL = new Set(["FT","AET","PEN","AWD","WO"]);
const CLOSED = new Set(["CANC","PST","ABD"]);
const aliases = {FINISHED:"FT",COMPLETED:"FT",IN_PLAY:"LIVE",INPLAY:"LIVE",
 PAUSED:"HT",HALFTIME:"HT",FIRST_HALF:"1H",SECOND_HALF:"2H",
 POSTPONED:"PST",CANCELLED:"CANC",CANCELED:"CANC",ABANDONED:"ABD"};
function statusOf(match){
 const raw=String(match?.fixture?.status?.short||"").toUpperCase();
 return aliases[raw]||raw;
}
function istanbulDay(value){
 const stamp=Date.parse(value instanceof Date?value.toISOString():String(value||""));
 if(!Number.isFinite(stamp))return "";
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(stamp));
 const read=type=>parts.find(x=>x.type===type)?.value||"";
 return read("year")+"-"+read("month")+"-"+read("day");
}
function isCrediblyLive(match,now=Date.now()){
 const status=statusOf(match);
 if(!LIVE.has(status))return false;
 const kickoff=Date.parse(match?.fixture?.date||"");
 if(!Number.isFinite(kickoff)||kickoff>now)return false;
 const age=now-kickoff;
 if(age<=4*60*60*1000)return true;
 const updated=Date.parse(match?.fixture?.status?.updated||match?.fixture?.updated||"");
 return Number.isFinite(updated)&&updated<=now&&now-updated<=20*60*1000;
}
function isFutureUnplayed(match,now=Date.now()){
 const kickoff=Date.parse(match?.fixture?.date||"");
 return ["NS","TBD"].includes(statusOf(match))&&Number.isFinite(kickoff)&&kickoff>now;
}
function statusLabel(match){
 const status=statusOf(match),s=match?.fixture?.status;
 if(status==="CANC")return "İPTAL";
 if(status==="PST")return "ERTELENDİ";
 if(status==="ABD")return "YARIDA KALDI";
 if(FINAL.has(status))return status==="FT"?"MS":status;
 if(status==="HT")return "DEVRE ARASI";
 if(LIVE.has(status)){
  const elapsed=Number(s?.elapsed);
  return s?.elapsed!=null&&Number.isFinite(elapsed)&&elapsed>=0?elapsed+"'":"CANLI";
 }
 if(["NS","TBD"].includes(status))return "BAŞLAMADI";
 return s?.long||status||"DURUM YOK";
}
const nameKey=value=>String(value||"").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").replace(/\b(?:fc|fk|sk|spor|kulubu|kulübü)\b/g,"").replace(/[^a-z0-9]/g,"");
function sameFixture(a,b){
 const leagueA=String(a.league?.id??""),leagueB=String(b.league?.id??"");
 if(leagueA&&leagueB&&leagueA!==leagueB)return false;
 const idA=String(a.fixture?.id??"").trim(),idB=String(b.fixture?.id??"").trim();
 if(idA&&idB&&idA===idB)return true;
 if(!leagueA||!leagueB)return false;
 const ah=nameKey(a.teams?.home?.name),aa=nameKey(a.teams?.away?.name);
 const bh=nameKey(b.teams?.home?.name),ba=nameKey(b.teams?.away?.name);
 if(!ah||!aa||ah!==bh||aa!==ba)return false;
 const first=Date.parse(a.fixture?.date||""),second=Date.parse(b.fixture?.date||"");
 return Number.isFinite(first)&&Number.isFinite(second)&&Math.abs(first-second)<=10*60000;
}
function rank(match){
 const status=statusOf(match);
 if(FINAL.has(status)||CLOSED.has(status))return 3;
 if(LIVE.has(status))return 2;
 return 1;
}
function visibleMatches(rows,tab,now=Date.now()){
 const today=istanbulDay(new Date(now));
 const filtered=(Array.isArray(rows)?rows:[]).filter(match=>{
  if(!match?.fixture||!String(match.fixture.id??"").trim())return false;
  if(!match.teams?.home?.name||!match.teams?.away?.name)return false;
  if(tab==="live")return isCrediblyLive(match,now);
  return isFutureUnplayed(match,now)&&istanbulDay(match.fixture.date)===today;
 });
 const unique=[];
 for(const match of filtered){
  const index=unique.findIndex(existing=>sameFixture(existing,match));
  if(index<0)unique.push(match);
  else if(rank(match)>rank(unique[index]))unique[index]=match;
 }
 return unique.sort((a,b)=>Date.parse(a.fixture.date)-Date.parse(b.fixture.date));
}
module.exports={istanbulDay,statusOf,statusLabel,isCrediblyLive,isFutureUnplayed,visibleMatches};
