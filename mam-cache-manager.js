(function (root, factory) {
  const manager = factory();
  if (typeof module === "object" && module.exports) module.exports = manager;
  if (root) root.MAMCacheManager = manager;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const CACHE_FAMILIES = Object.freeze({
    mam_history: 81,
    mam_d1_archive: 4,
    mam_fixture_cache: 3,
    mam_api_cache: 2
  });
  const PROTECTED_KEYS = Object.freeze([
    "mam-product-hub-v1",
    "mam_favorite_labels_v1",
    "mam_session_token",
    "mam_coupon_v1",
    "mam_coupon_candidates_v1",
    "mam_app_view_state"
  ]);
  const CACHE_KEY = /^mam_(history|d1_archive|league_csv|fixture_cache|api_cache)_v(\d+)_/;
  const LEGACY_CSV_KEY = /^mam_league_csv_v\d+_/;

  function sweep(storage) {
    let target = storage;
    const removed = [];
    const preserved = [];
    const failed = [];
    if (!target) {
      try { target = typeof localStorage !== "undefined" ? localStorage : null; }
      catch (_) { return { removed, preserved, failed: ["storage-unavailable"] }; }
    }
    if (!target) return { removed, preserved, failed: ["storage-unavailable"] };
    const keys = [];
    try {
      for (let i = 0; i < target.length; i++) keys.push(target.key(i));
    } catch (_) {
      return { removed, preserved, failed: ["storage-read-failed"] };
    }
    for (const key of keys) {
      if (!key) continue;
      if (PROTECTED_KEYS.includes(key)) {
        preserved.push(key);
        continue;
      }
      if (LEGACY_CSV_KEY.test(key)) {
        try { target.removeItem(key); removed.push(key); }
        catch (_) { failed.push(key); }
        continue;
      }
      const match = CACHE_KEY.exec(key);
      if (!match) continue;
      const family = `mam_${match[1]}`;
      const version = Number(match[2]);
      if (version < CACHE_FAMILIES[family]) {
        try { target.removeItem(key); removed.push(key); }
        catch (_) { failed.push(key); }
      }
    }
    return { removed, preserved, failed };
  }

  return Object.freeze({ CACHE_FAMILIES, PROTECTED_KEYS, sweep });
});
