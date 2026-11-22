// Independent, framework-free product feature primitives. No network, storage or production writes.
export function toggleFavorite(ids,id){
 if(!Array.isArray(ids)||typeof id!=='string'||!id.trim())throw new TypeError('Invalid favorite');
 return ids.includes(id)?ids.filter(x=>x!==id):[...ids,id];
}
export function favoriteMatches(matches,ids){
 if(!Array.isArray(matches)||!Array.isArray(ids))throw new TypeError('Invalid favorites');
 const selected=new Set(ids);return matches.filter(m=>selected.has(String(m.id)));
}
export function favoriteTeams(teams,ids){
 if(!Array.isArray(teams)||!Array.isArray(ids))throw new TypeError('Invalid favorites');
 const selected=new Set(ids);return teams.filter(t=>selected.has(String(t.id)));
}
export function teamProfile(team,fixtures,{now=Date.now()}={}){
 if(!team?.id||!Array.isArray(fixtures)||!Number.isFinite(now))throw new TypeError('Invalid team profile');
 const id=String(team.id),games=fixtures.filter(m=>String(m.homeTeamId)===id||String(m.awayTeamId)===id);
 const past=games.filter(m=>['FT','AET','PEN'].includes(m.status)).sort((a,b)=>Date.parse(b.kickoff)-Date.parse(a.kickoff));
 const future=games.filter(m=>Number.isFinite(Date.parse(m.kickoff))&&Date.parse(m.kickoff)>now&&!['FT','AET','PEN'].includes(m.status)).sort((a,b)=>Date.parse(a.kickoff)-Date.parse(b.kickoff));
 const form=past.slice(0,5).map(m=>{const home=String(m.homeTeamId)===id;const a=m.homeGoals,b=m.awayGoals;if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b))return '?';return a===b?'D':(home?a>b:b>a)?'W':'L';});
 return {team,form,past,future};
}
export function matchDetails(match){
 if(!match?.id)throw new TypeError('Invalid match');
 const minute=e=>{const raw=e?.minute??e?.time?.elapsed??e?.clock?.displayValue??e?.clock;const n=typeof raw==='string'&&/^\d{1,3}:\d{2}$/.test(raw)?Number(raw.split(':')[0])+Number(raw.split(':')[1])/60:Number(raw);return raw===null||raw===undefined||raw===''||!Number.isFinite(n)?Infinity:n;};
 const sourceEvents=Array.isArray(match.events)?match.events:Array.isArray(match.events?.response)?match.events.response:Array.isArray(match.events?.plays)?match.events.plays:[];
 const events=[...sourceEvents].sort((a,b)=>minute(a)-minute(b));
 const lineups=Array.isArray(match.lineups)?match.lineups:Array.isArray(match.lineups?.response)?match.lineups.response:[];
 return {match,events,lineups,statistics:match.statistics??null,hasVerifiedStatistics:match.statistics?.independentCrossSourceVerification===true};
}
export function leagueStandings(fixtures,teams){
 if(!Array.isArray(fixtures)||!Array.isArray(teams))throw new TypeError('Invalid league');
 const table=new Map(teams.map(t=>[String(t.id),{team:t,played:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,points:0}]));
 for(const m of fixtures){
  if(!['FT','AET','PEN'].includes(m.status)||!Number.isSafeInteger(m.homeGoals)||!Number.isSafeInteger(m.awayGoals)||m.homeGoals<0||m.awayGoals<0)continue;
  const h=table.get(String(m.homeTeamId)),a=table.get(String(m.awayTeamId));if(!h||!a||h===a)continue;
  h.played++;a.played++;h.goalsFor+=m.homeGoals;h.goalsAgainst+=m.awayGoals;a.goalsFor+=m.awayGoals;a.goalsAgainst+=m.homeGoals;
  if(m.homeGoals===m.awayGoals){h.draws++;a.draws++;h.points++;a.points++;}
  else {const win=m.homeGoals>m.awayGoals?h:a,lose=win===h?a:h;win.wins++;win.points+=3;lose.losses++;}
 }
 return [...table.values()].sort((a,b)=>b.points-a.points||(b.goalsFor-b.goalsAgainst)-(a.goalsFor-a.goalsAgainst)||b.goalsFor-a.goalsFor||String(a.team.name).localeCompare(String(b.team.name),'tr'));
}
export function searchFootball({teams=[],leagues=[],matches=[]},query){
 if(typeof query!=='string')throw new TypeError('Invalid search');
 const q=query.trim().toLocaleLowerCase('tr');if(!q)return {teams:[],leagues:[],matches:[]};
 const matchesQuery=x=>String(x.name??x.title??((x.homeTeamName??'')+' '+(x.awayTeamName??''))).toLocaleLowerCase('tr').includes(q);
 return {teams:teams.filter(matchesQuery),leagues:leagues.filter(matchesQuery),matches:matches.filter(matchesQuery)};
}
export function notificationCandidates(fixtures,favoriteIds,{now=Date.now(),windowMs=600000}={}){
 if(!Array.isArray(fixtures)||!Array.isArray(favoriteIds)||!Number.isFinite(now)||!Number.isFinite(windowMs)||windowMs<0)throw new TypeError('Invalid notifications');
 const ids=new Set(favoriteIds);return fixtures.filter(m=>ids.has(String(m.id))&&Number.isFinite(Date.parse(m.kickoff))&&Date.parse(m.kickoff)>=now&&Date.parse(m.kickoff)<=now+windowMs).map(m=>({id:String(m.id),type:'kickoff_soon',kickoff:m.kickoff}));
}
export function mobileNavigation(active){
 const tabs=['home','live','favorites','leagues','search','settings'];return tabs.map(id=>({id,active:id===active,ariaCurrent:id===active?'page':undefined}));
}

/** Parse ESPN's published standings without recomputing ranks or inventing missing values. */
export function parseEspnStandings(payload){
 const groups=Array.isArray(payload?.children)?payload.children:Array.isArray(payload?.standings?.entries)?[{name:payload.name??'Lig',standings:payload.standings}]:Array.isArray(payload?.entries)?[{name:payload.name??'Lig',standings:{entries:payload.entries}}]:[];
 const stat=(stats,names)=>{const x=stats.find(x=>names.includes(x.name)||names.includes(x.type));const v=x?.value??x?.displayValue;return v===undefined||v===null||v===''?null:v;};
 return groups.map(group=>({name:String(group.name??'Lig'),season:payload?.season?.displayName??null,rows:(Array.isArray(group?.standings?.entries)?group.standings.entries:[]).filter(e=>e?.team?.id&&e?.team?.displayName).map(e=>{
  const stats=Array.isArray(e.stats)?e.stats:[];
  return {id:String(e.team.id),name:String(e.team.displayName),rank:stat(stats,['rank','playoffSeed']),played:stat(stats,['gamesPlayed','GP']),wins:stat(stats,['wins','W']),draws:stat(stats,['ties','draws','D']),losses:stat(stats,['losses','L']),points:stat(stats,['points','PTS']),goalDifference:stat(stats,['pointDifferential','goalDifference','GD'])};
 })})).filter(g=>g.rows.length);
}
