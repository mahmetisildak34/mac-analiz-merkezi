const keyOf = item => {
 const id = item?.fixture?.id;
 return id == null || String(id).trim() === "" ? null : String(id);
};
const teamKeyOf = team => {
 const id = team?.id;
 if (id != null && String(id).trim()) return "id:" + String(id);
 const name = String(team?.name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g,"");
 return name ? "name:" + name : null;
};

function normalizeFavorites(items) {
 if (!Array.isArray(items)) return [];
 const seen = new Set(), result = [];
 for (const item of items) {
  const key = keyOf(item);
  if (!key || !item?.teams?.home?.name || !item?.teams?.away?.name || seen.has(key)) continue;
  seen.add(key); result.push(item);
 }
 return result;
}
function toggleFavorite(items, match) {
 const current = normalizeFavorites(items), key = keyOf(match);
 if (!key || !match?.teams?.home?.name || !match?.teams?.away?.name) return {favorites:current,changed:false,added:false};
 const exists = current.some(item => keyOf(item) === key);
 return {favorites:exists?current.filter(item=>keyOf(item)!==key):[...current,match],changed:true,added:!exists};
}
function mergeFavoriteUpdates(favorites, updates) {
 const current = normalizeFavorites(favorites);
 if (!Array.isArray(updates) || !updates.length) return current;
 const byId = new Map(updates.map(item=>[keyOf(item),item]).filter(([key,item])=>key&&item?.teams?.home?.name&&item?.teams?.away?.name));
 return current.map(item=>byId.get(keyOf(item))||item);
}
function normalizeTeamFavorites(items) {
 if (!Array.isArray(items)) return [];
 const seen=new Set(),result=[];
 for(const team of items){const key=teamKeyOf(team);if(!key||seen.has(key))continue;seen.add(key);result.push(team);}
 return result;
}
function toggleTeamFavorite(items,team) {
 const current=normalizeTeamFavorites(items),key=teamKeyOf(team);
 if(!key||!team?.name)return {favorites:current,changed:false,added:false};
 const exists=current.some(item=>teamKeyOf(item)===key);
 return {favorites:exists?current.filter(item=>teamKeyOf(item)!==key):[...current,team],changed:true,added:!exists};
}
module.exports={normalizeFavorites,toggleFavorite,mergeFavoriteUpdates,normalizeTeamFavorites,toggleTeamFavorite};
