const keyOf = item => {
 const id = item?.fixture?.id;
 return id == null || String(id).trim() === "" ? null : String(id);
};

export function normalizeFavorites(items) {
 if (!Array.isArray(items)) return [];
 const seen = new Set(), result = [];
 for (const item of items) {
  const key = keyOf(item);
  if (!key || !item?.teams?.home?.name || !item?.teams?.away?.name || seen.has(key)) continue;
  seen.add(key); result.push(item);
 }
 return result;
}

export function toggleFavorite(items, match) {
 const current = normalizeFavorites(items), key = keyOf(match);
 if (!key || !match?.teams?.home?.name || !match?.teams?.away?.name) {
  return {favorites: current, changed: false, added: false};
 }
 const exists = current.some(item => keyOf(item) === key);
 return {
  favorites: exists ? current.filter(item => keyOf(item) !== key) : [...current, match],
  changed: true,
  added: !exists
 };
}

export function mergeFavoriteUpdates(favorites, updates) {
 const current = normalizeFavorites(favorites);
 if (!Array.isArray(updates) || !updates.length) return current;
 const byId = new Map(updates.map(item => [keyOf(item), item]).filter(([key, item]) => key && item?.teams?.home?.name && item?.teams?.away?.name));
 return current.map(item => byId.get(keyOf(item)) || item);
}
