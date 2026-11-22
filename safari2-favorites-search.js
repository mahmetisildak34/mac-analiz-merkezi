/* Safari 2: offline-first favorites and local search. No provider requests. */
(()=>{
 "use strict";
 const KEY="mam_safari2_favorites_v1";
 const $=id=>document.getElementById(id);
 const clean=value=>String(value??"").trim();
 const norm=value=>clean(value).toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i");
 const key=(kind,league,id)=>kind+":"+clean(league)+":"+clean(id);
 const valid=item=>item&&["team","match"].includes(item.kind)&&clean(item.id)&&clean(item.league)&&clean(item.name);
 function read(){
  try{const rows=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(rows)?Array.from(new Map(rows.filter(valid).map(item=>[key(item.kind,item.league,item.id),item])).values()).slice(0,300):[]}
  catch(_){return []}
 }
 let favorites=read();
 function save(){
  try{localStorage.setItem(KEY,JSON.stringify(favorites));return true}
  catch(_){return false}
 }
 const matchRows=()=>typeof allMatches!=="undefined"&&Array.isArray(allMatches)?allMatches:[];
 function matchKey(m){return key("match",m.league?.id,m.fixture?.id)}
 function teamKey(m,side){return key("team",m.league?.id,m.teams?.[side]?.id)}
 function itemFromMatch(m){return {kind:"match",league:clean(m.league?.id),id:clean(m.fixture?.id),name:clean(m.teams?.home?.name)+" – "+clean(m.teams?.away?.name),leagueName:clean(m.league?.name),date:clean(m.fixture?.date)}}
 function itemFromTeam(m,side){const t=m.teams?.[side]||{};return {kind:"team",league:clean(m.league?.id),id:clean(t.id),name:clean(t.name),leagueName:clean(m.league?.name),logo:clean(t.logo)}}
 function toggle(item){if(!valid(item))return false;const k=key(item.kind,item.league,item.id),idx=favorites.findIndex(x=>key(x.kind,x.league,x.id)===k);if(idx>=0)favorites.splice(idx,1);else favorites.push(item);save();render();return idx<0}
 const css=document.createElement("style");css.textContent=`
 #mamSafariTools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0;padding:9px;border:1px solid #35466c;border-radius:14px;background:#111e37}
 #mamSafariTools button,#mamSafariTools input{min-height:42px;border-radius:10px}
 #mamSafariTools button{border:1px solid #5669a0;background:#23385f;color:#f5f7ff;padding:8px 12px;cursor:pointer}
 #mamSafariTools input{min-width:0;flex:1 1 140px;padding:9px;background:#0c1629;border:1px solid #52618a;color:white}
 #mamSafariPanel{width:100%;color:#eef3ff}
 #mamSafariPanel[hidden]{display:none!important}
 #mamSafariPanel .mam-safari-row{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:10px 4px;border-bottom:1px solid #314263}
 #mamSafariPanel .mam-safari-row strong{min-width:0;overflow-wrap:anywhere;font-size:13px}
 #mamSafariPanel .mam-safari-row small{display:block;color:#aabbd9;margin-top:4px}
 #mamSafariPanel .mam-safari-row button{flex-shrink:0}
 #matches .mam-safari-save{min-height:36px;min-width:36px;padding:5px 9px!important;border:1px solid #52618a!important;border-radius:10px!important;background:#152743!important;color:#fff!important}
 #matches .mam-safari-save[aria-pressed="true"]{color:#f9cc6b!important}
 @media(max-width:350px){#mamSafariTools{padding:6px;gap:5px}#mamSafariTools button{padding:7px}#mamSafariPanel .mam-safari-row{flex-wrap:wrap}}
 `;document.head.appendChild(css);
 const bar=document.createElement("section");bar.id="mamSafariTools";bar.setAttribute("aria-label","Favoriler ve arama");
 bar.innerHTML='<button type="button" id="mamSafariFavorites" aria-expanded="false">☆ Favoriler</button><input id="mamSafariQuery" type="search" autocomplete="off" aria-label="Takım veya lig ara" placeholder="Takım veya lig ara…"><button type="button" id="mamSafariSearch">Ara</button><div id="mamSafariPanel" hidden role="region" aria-live="polite"></div>';
 const target=$("matches");if(!target)return;
 target.parentElement.insertBefore(bar,target);
 let mode="favorites",timer=null;
 const esc=value=>clean(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const findMatch=item=>matchRows().find(m=>item.kind==="match"?matchKey(m)===key(item.kind,item.league,item.id):teamKey(m,"home")===key(item.kind,item.league,item.id)||teamKey(m,"away")===key(item.kind,item.league,item.id));
 function showMatch(item){
  const m=findMatch(item);
  if(!m){$("mamSafariPanel").textContent="Bu kayıt mevcut yüklenen maçlarda bulunamadı. İlgili ligi ve tarihi seçip tekrar deneyin.";return}
  if(typeof setMamScreen==="function")setMamScreen("home");
  const select=$("league");if(select&&Array.from(select.options).some(o=>o.value===clean(m.league?.id))){select.value=clean(m.league.id);select.dispatchEvent(new Event("change"))}
  if(typeof renderMatches==="function")renderMatches();
  const btn=Array.from(document.querySelectorAll("#matches .predBtn")).find(b=>b.dataset.id===clean(m.fixture?.id));
  if(btn){btn.scrollIntoView({behavior:"smooth",block:"center"});btn.focus()}else{$("matches").scrollIntoView({behavior:"smooth"})}
 }
 function showTeam(item){
  const m=findMatch(item);
  if(!m){$("mamSafariPanel").textContent="Bu takım için yüklü maç bulunamadı. Lig verisini yenileyin.";return}
  const side=clean(m.teams?.home?.id)===item.id?"home":"away";
  const games=matchRows().filter(row=>clean(row.league?.id)===item.league&&[row.teams?.home,row.teams?.away].some(t=>clean(t?.id)===item.id));
  const upcoming=games.filter(row=>["NS","TBD"].includes(clean(row.fixture?.status?.short).toUpperCase())&&Date.parse(row.fixture?.date||"")>Date.now());
  const played=games.filter(row=>["FT","AET","PEN"].includes(clean(row.fixture?.status?.short).toUpperCase())&&row.goals?.home!=null&&row.goals?.away!=null);
  const fmt=row=>{const d=Date.parse(row.fixture?.date||"");return (Number.isFinite(d)?new Date(d).toLocaleString("tr-TR",{timeZone:"Europe/Istanbul",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"Saat bilinmiyor")+" · "+clean(row.teams?.home?.name)+" – "+clean(row.teams?.away?.name)+(row.goals?.home!=null&&row.goals?.away!=null?" ("+row.goals.home+"-"+row.goals.away+")":"")};
  const panel=$("mamSafariPanel");panel.hidden=false;
  panel.innerHTML='<h3>'+esc(item.name)+'</h3><p>'+esc(item.leagueName||m.league?.name||"Lig bilinmiyor")+' · Yalnızca yüklenen maç verileri</p><h4>Son maçlar</h4>'+(played.length?played.slice().sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date)).slice(0,10).map(row=>'<div class="mam-safari-row"><strong>'+esc(fmt(row))+'</strong></div>').join(""):'<p>Doğrulanmış geçmiş maç verisi bulunamadı.</p>')+'<h4>Yaklaşan maçlar</h4>'+(upcoming.length?upcoming.slice(0,5).map(row=>'<div class="mam-safari-row"><strong>'+esc(fmt(row))+'</strong></div>').join(""):'<p>Yüklü veride yaklaşan maç bulunamadı.</p>');
 }
 function render(){
  const panel=$("mamSafariPanel");if(!panel||panel.hidden)return;
  if(mode==="favorites"){
   panel.innerHTML=favorites.length?favorites.map((item,i)=>'<div class="mam-safari-row"><strong>'+esc(item.kind==="team"?"⚽ ":"☆ ")+esc(item.name)+'<small>'+esc(item.leagueName||item.league)+'</small></strong><button data-safari-open="'+i+'">Aç</button><button data-safari-remove="'+i+'" aria-label="'+esc(item.name)+' favorilerden çıkar">Kaldır</button></div>').join(""):'<p>Henüz favori yok. Maç kartındaki ☆ düğmesiyle takım veya maç ekleyin.</p>';
  }else{
   const query=norm($("mamSafariQuery").value);if(!query){panel.innerHTML='<p>Takım veya lig adı yazın. Arama yalnızca yüklenmiş maçlarda ve tanımlı liglerde yapılır.</p>';return}
   const teams=new Map();
   for(const m of matchRows())for(const side of ["home","away"]){const item=itemFromTeam(m,side);if(valid(item))teams.set(key(item.kind,item.league,item.id),item)}
   const leagues=typeof ESPN_LEAGUES!=="undefined"?Object.entries(ESPN_LEAGUES):[];
   const foundTeams=Array.from(teams.values()).filter(item=>norm(item.name).includes(query)).slice(0,30);
   const foundLeagues=leagues.filter(([,l])=>norm(l.name).includes(query)).slice(0,20);
   panel.innerHTML=foundLeagues.map(([id,l])=>'<div class="mam-safari-row"><strong>🏆 '+esc(l.name)+'</strong><button data-safari-league="'+esc(id)+'">Maçları aç</button></div>').join("")+foundTeams.map((item,i)=>'<div class="mam-safari-row"><strong>'+esc(item.name)+'<small>'+esc(item.leagueName)+'</small></strong><button data-safari-team="'+i+'">Takım</button></div>').join("")||'<p>Sonuç bulunamadı. Takım araması yalnızca yüklenen maçlarla sınırlıdır.</p>';
   panel.__teams=foundTeams;
  }
 }
 function decorate(){
  for(const article of document.querySelectorAll("#matches article.match-modern")){
   if(article.querySelector(".mam-safari-actions"))continue;
   const button=article.querySelector(".predBtn[data-id]");if(!button)continue;
   const m=matchRows().find(row=>clean(row.fixture?.id)===button.dataset.id);if(!m)continue;
   const wrap=document.createElement("div");wrap.className="mam-safari-actions";wrap.style.cssText="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px";
   for(const [item,label] of [[itemFromMatch(m),"☆ Maç"],[itemFromTeam(m,"home"),"☆ Ev"],[itemFromTeam(m,"away"),"☆ Dep"]]){
    if(!valid(item))continue;
    const el=document.createElement("button");el.type="button";el.className="mam-safari-save";el.textContent=label;el.setAttribute("aria-label",item.name+" favori");el.setAttribute("aria-pressed",String(favorites.some(x=>key(x.kind,x.league,x.id)===key(item.kind,item.league,item.id))));el.addEventListener("click",()=>{toggle(item);decorate();document.querySelectorAll(".mam-safari-save").forEach(b=>{if(b.__item&&key(b.__item.kind,b.__item.league,b.__item.id)===key(item.kind,item.league,item.id))b.setAttribute("aria-pressed",String(favorites.some(x=>key(x.kind,x.league,x.id)===key(item.kind,item.league,item.id))))})});el.__item=item;wrap.appendChild(el);
   }
   article.appendChild(wrap);
  }
 }
 $("mamSafariFavorites").addEventListener("click",()=>{mode="favorites";const panel=$("mamSafariPanel");panel.hidden=!panel.hidden;$("mamSafariFavorites").setAttribute("aria-expanded",String(!panel.hidden));render()});
 $("mamSafariSearch").addEventListener("click",()=>{mode="search";$("mamSafariPanel").hidden=false;render()});
 $("mamSafariQuery").addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>{mode="search";$("mamSafariPanel").hidden=false;render()},180)});
 $("mamSafariPanel").addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const panel=$("mamSafariPanel");if(b.dataset.safariRemove!=null){favorites.splice(Number(b.dataset.safariRemove),1);save();render();document.querySelectorAll(".mam-safari-save").forEach(el=>{if(el.__item)el.setAttribute("aria-pressed",String(favorites.some(x=>key(x.kind,x.league,x.id)===key(el.__item.kind,el.__item.league,el.__item.id))))})}else if(b.dataset.safariOpen!=null){const item=favorites[Number(b.dataset.safariOpen)];if(item)(item.kind==="team"?showTeam:showMatch)(item)}else if(b.dataset.safariTeam!=null){const item=panel.__teams?.[Number(b.dataset.safariTeam)];if(item)showTeam(item)}else if(b.dataset.safariLeague!=null){const select=$("league");if(select){select.value=b.dataset.safariLeague;select.dispatchEvent(new Event("change"));if(typeof setMamScreen==="function")setMamScreen("home");if(typeof renderMatches==="function")renderMatches();$("matches").scrollIntoView({behavior:"smooth"})}}});
 const observer=new MutationObserver(()=>{if(!document.hidden)decorate()});observer.observe(target,{childList:true,subtree:false});decorate();
 window.mamSafari2Favorites={read:()=>favorites.slice(),toggle,search:query=>{const q=norm(query);return matchRows().filter(m=>norm(m.teams?.home?.name).includes(q)||norm(m.teams?.away?.name).includes(q)||norm(m.league?.name).includes(q))}};
})();
