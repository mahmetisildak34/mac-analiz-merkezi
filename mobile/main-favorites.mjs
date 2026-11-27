// Independent main-screen favorites integration. Reads existing fixture snapshot; never fetches.
const KEY='mam-product-hub-v1',SNAPSHOT='mam_product_hub_fixtures_v1',DETAILS='mam_favorite_labels_v1';
const activeLeagueScope=window.MAMActiveLeagueScope;
const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return {favoriteMatches:Array.isArray(x.favoriteMatches)?x.favoriteMatches.filter(y=>typeof y==='string'):[],favoriteTeams:Array.isArray(x.favoriteTeams)?x.favoriteTeams.filter(y=>typeof y==='string'):[],alerts:x.alerts===true};}catch{return {favoriteMatches:[],favoriteTeams:[],alerts:false};}};
let state=read();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch{announce('Yerel depolama kullanılamıyor; favoriler yalnızca bu oturumda saklanacak.');}};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayTeamName=name=>typeof window.mamDisplayTeamName==='function'?window.mamDisplayTeamName(name):String(name??'');
function displayMatchLabel(label){const raw=String(label??''),separator=' – ',split=raw.indexOf(separator);return split<0?raw:displayTeamName(raw.slice(0,split))+separator+displayTeamName(raw.slice(split+separator.length));}
function announce(message){const el=document.getElementById('mamFavoriteStatus');if(el)el.textContent=message;}
function toggle(type,id){if(!id)return;const key=type==='team'?'favoriteTeams':'favoriteMatches';state[key]=state[key].includes(id)?state[key].filter(x=>x!==id):[...state[key],id];save();refresh();}
function snapshot(){try{const s=JSON.parse(localStorage.getItem(SNAPSHOT)||'{}');return Array.isArray(s.matches)?s.matches:[];}catch{return [];}}
function favoriteLabels(){
 let saved={};
 try{saved=JSON.parse(localStorage.getItem(DETAILS)||'{}')??{};}catch{}
 const matches=new Map(),teams=new Map(),activeMatches=new Set(),activeTeams=new Set();
 const savedMatches={...(saved.matches??{})},savedTeams={...(saved.teams??{})};
 for(const [id,label] of Object.entries(saved.matches??{}))if(state.favoriteMatches.includes(id)&&typeof label==='string')matches.set(id,label);
 for(const [id,label] of Object.entries(saved.teams??{}))if(state.favoriteTeams.includes(id)&&typeof label==='string')teams.set(id,label);
 for(const match of snapshot()){
  if(!activeLeagueScope?.isActiveMatch(match))continue;
  const id=String(match?.fixture?.id??match?.id??'');
  const home=match?.teams?.home,away=match?.teams?.away;
  const homeName=home?.name??match?.homeTeamName,awayName=away?.name??match?.awayTeamName;
  if(id)activeMatches.add(id);
  if(state.favoriteMatches.includes(id)&&homeName&&awayName){const label=homeName+' – '+awayName;matches.set(id,label);savedMatches[id]=label;}
  for(const [teamId,name] of [[home?.id??match?.homeTeamId,homeName],[away?.id??match?.awayTeamId,awayName]]){
   if(name&&state.favoriteTeams.includes(String(teamId))){teams.set(String(teamId),name);activeTeams.add(String(teamId));savedTeams[String(teamId)]=name;}
  }
 }
 const labels=JSON.stringify({...saved,matches:savedMatches,teams:savedTeams});
 try{if(localStorage.getItem(DETAILS)!==labels)localStorage.setItem(DETAILS,labels);}catch{}
 return {matches,teams,activeMatches,activeTeams};
}
function renderFavorites(){
 const {matches,teams,activeMatches,activeTeams}=favoriteLabels();
 const panel=document.getElementById('mamFavoritePanel');
 if(!panel||panel.hidden)return;
 const visibleMatches=state.favoriteMatches.filter(id=>activeMatches.has(String(id)));
 const visibleTeams=state.favoriteTeams.filter(id=>activeTeams.has(String(id)));
 panel.querySelector('[data-fav-matches]').innerHTML=visibleMatches.map(id=>'<li>'+esc(displayMatchLabel(matches.get(id)??'Maç '+id))+' <button type="button" data-mam-remove-match="'+esc(id)+'">★ Çıkar</button></li>').join('')||'<li>Etkin liglerde favori maç yok.</li>';
 panel.querySelector('[data-fav-teams]').innerHTML=visibleTeams.map(id=>'<li>'+esc(displayTeamName(teams.get(id)??'Takım '+id))+' <button type="button" data-mam-remove-team="'+esc(id)+'">★ Çıkar</button></li>').join('')||'<li>Etkin liglerde favori takım yok.</li>';
 panel.querySelector('[data-fav-count]').textContent=state.favoriteMatches.length+' maç · '+state.favoriteTeams.length+' takım kaydedildi.';
 const hiddenCount=(state.favoriteMatches.length-visibleMatches.length)+(state.favoriteTeams.length-visibleTeams.length);
 const note=panel.querySelector('[data-fav-scope-note]');
 if(note)note.textContent=hiddenCount?hiddenCount+' pasif veya eşleşmeyen lig favorisi saklandı; kayıtlar korunuyor.':'';
}
function decorate(){const cards=document.querySelectorAll('#matches article.match, #matches article.mam-fixture-row, .match-detail-overlay article.match');for(const card of cards){const source=card.querySelector('button.predBtn[data-id], button.lineupBtn[data-id], button[data-id][data-home][data-away]');const id=source?.dataset.id;if(!id)continue;let actions=card.querySelector('.mam-independent-favorites');if(!actions){card.classList.add('mam-has-favorites');actions=document.createElement('div');actions.className='mam-independent-favorites';actions.style.cssText='display:flex;flex-wrap:wrap;gap:6px;margin:8px 0';card.append(actions);}const items=[['match',id,'Maçı'],['team',source.dataset.home,'Ev sahibini'],['team',source.dataset.away,'Deplasmanı']];for(let i=0;i<items.length;i++){const [type,value,label]=items[i];if(!value||type==='team'&&['-1','0'].includes(value)){actions.querySelector('[data-mam-star="'+i+'"]')?.remove();continue;}let button=actions.querySelector('[data-mam-star="'+i+'"]');if(!button){button=document.createElement('button');button.type='button';button.dataset.mamStar=String(i);button.dataset.type=type;button.className='secondary';button.style.cssText='font-size:12px;min-height:44px;padding:7px 9px';actions.append(button);}button.dataset.value=value;const on=state[type==='team'?'favoriteTeams':'favoriteMatches'].includes(value);const pressed=String(on),ariaLabel=label+(on?' favorilerden çıkar':' favorilere ekle');if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);if(button.getAttribute('aria-label')!==ariaLabel)button.setAttribute('aria-label',ariaLabel);const labelText=on?'★':'☆';let glyph=button.querySelector('.mam-star-glyph');if(!glyph){glyph=document.createElement('span');glyph.className='mam-star-glyph';glyph.setAttribute('aria-hidden','true');const caption=document.createElement('span');caption.className='mam-star-label';caption.textContent=' '+label;button.append(glyph,caption);}if(glyph.textContent!==labelText)glyph.textContent=labelText;}}}
function refresh(){decorate();renderFavorites();}
function mount(){const main=document.querySelector('main');if(!main||document.getElementById('mamFavoritePanel'))return;const bar=document.createElement('div');bar.className='mam-favorite-shortcuts';bar.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';const btn=document.createElement('button');btn.type='button';btn.id='mamFavoriteTab';btn.textContent='★ Favoriler';btn.setAttribute('aria-controls','mamFavoritePanel');btn.setAttribute('aria-expanded','false');const link=document.createElement('a');link.href='./mobile/product-hub.html';link.textContent='Takımlar · Ligler · Ara';link.style.cssText='padding:11px;color:#80e9d2';bar.append(btn,link);const panel=document.createElement('section');panel.id='mamFavoritePanel';panel.className='panel';panel.hidden=true;panel.innerHTML='<h2>Favoriler</h2><p data-fav-count></p><p data-fav-scope-note role="status"></p><h3>Maçlar</h3><ul data-fav-matches></ul><h3>Takımlar</h3><ul data-fav-teams></ul><p id="mamFavoriteStatus" role="status" aria-live="polite"></p>';main.insertBefore(panel,main.firstChild);main.insertBefore(bar,panel);const bottom=document.getElementById('mamFavoriteBottom');
 // Bottom Favorites is a dedicated screen action; prevent unrelated navigation from closing it.
 function setPanel(open){
  panel.hidden=!open;
  panel.style.display=open?'block':'none';
  if(open)panel.setAttribute('data-force-visible','');else panel.removeAttribute('data-force-visible');
  for(const control of [btn,bottom])control?.setAttribute('aria-expanded',String(open));
  bottom?.classList.toggle('active',open);
  if(open){renderFavorites();const heading=panel.querySelector('h2');heading.tabIndex=-1;heading.focus();panel.scrollIntoView({block:'start'});}
 }
 for(const control of [btn,bottom])control?.addEventListener('click',event=>{if(control===bottom)event.stopPropagation();setPanel(panel.hidden);});
 document.querySelector('.mam-bottom-nav')?.addEventListener('click',event=>{if(event.target.closest('[data-mam-bottom]'))setPanel(false);});
 function sync(){state=read();refresh();}
 window.addEventListener('pageshow',sync);
 window.addEventListener('mam-favorites-updated',sync);
 window.addEventListener('storage',event=>{if(event.key===KEY||event.key===SNAPSHOT)sync();});
 document.addEventListener('click',e=>{const star=e.target.closest('[data-mam-star]');if(star){toggle(star.dataset.type,star.dataset.value);return;}const m=e.target.closest('[data-mam-remove-match]');if(m){toggle('match',m.dataset.mamRemoveMatch);return;}const t=e.target.closest('[data-mam-remove-team]');if(t)toggle('team',t.dataset.mamRemoveTeam);});const target=document.getElementById('matches');if(target){let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;decorate();});});observer.observe(target,{childList:true,subtree:true});}refresh();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
