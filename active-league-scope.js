/*
 * Reversible front-end league visibility policy.
 * All provider/source definitions remain intact; this module only answers what
 * may be shown in the UI. Historical match bundles are never filtered here.
 */
(function attachActiveLeagueScope(root) {
  "use strict";

  const ACTIVE_LEAGUES = Object.freeze({
    "203": Object.freeze({ name: "Türkiye Süper Lig", slugs: ["tur.1"], aliases: ["süper lig", "super lig", "trendyol süper lig", "trendyol super lig", "turkish super league", "turkey super league", "turkiye super ligi"] }),
    "204": Object.freeze({ name: "Türkiye 1. Lig", slugs: ["tur.2"], aliases: ["türkiye 1. lig", "turkiye 1 lig", "trendyol 1. lig", "trendyol 1 lig", "tff 1. lig", "tff 1 lig", "turkish first league", "turkey 1. lig"] }),
    "39": Object.freeze({ name: "İngiltere Premier Lig", slugs: ["eng.1"], aliases: ["premier league", "english premier league", "england premier league"] }),
    "40": Object.freeze({ name: "İngiltere Championship", slugs: ["eng.2"], aliases: ["championship", "efl championship", "english championship"] }),
    "140": Object.freeze({ name: "İspanya La Liga", slugs: ["esp.1"], aliases: ["la liga", "laliga", "spanish la liga", "primera division"] }),
    "78": Object.freeze({ name: "Almanya Bundesliga", slugs: ["ger.1"], aliases: ["bundesliga", "german bundesliga"] }),
    "135": Object.freeze({ name: "İtalya Serie A", slugs: ["ita.1"], aliases: ["serie a", "italian serie a", "serie a italy"] }),
    "61": Object.freeze({ name: "Fransa Ligue 1", slugs: ["fra.1"], aliases: ["ligue 1", "ligue 1 uber eats", "french ligue 1"] }),
    "88": Object.freeze({ name: "Hollanda Eredivisie", slugs: ["ned.1"], aliases: ["eredivisie", "dutch eredivisie"] }),
    "94": Object.freeze({ name: "Portekiz Primeira Liga", slugs: ["por.1"], aliases: ["primeira liga", "liga portugal", "portuguese primeira liga"] }),
    "2": Object.freeze({ name: "UEFA Şampiyonlar Ligi", slugs: ["uefa.champions"], aliases: ["uefa champions league", "champions league", "şampiyonlar ligi", "sampiyonlar ligi"] }),
    "3": Object.freeze({ name: "UEFA Avrupa Ligi", slugs: ["uefa.europa"], aliases: ["uefa europa league", "europa league", "avrupa ligi"] }),
    "848": Object.freeze({ name: "UEFA Konferans Ligi", slugs: ["uefa.europa.conf"], aliases: ["uefa conference league", "conference league", "konferans ligi"] }),
    "1": Object.freeze({ name: "FIFA Dünya Kupası", slugs: ["fifa.world"], aliases: ["fifa world cup", "world cup", "dünya kupası", "dunya kupasi"] }),
    "4": Object.freeze({ name: "UEFA Avrupa Şampiyonası", slugs: ["uefa.euro"], aliases: ["uefa european championship", "uefa euro", "euro 2028", "european championship", "avrupa şampiyonası", "avrupa sampiyonasi"] }),
    "5": Object.freeze({ name: "UEFA Uluslar Ligi", slugs: ["uefa.nations"], aliases: ["uefa nations league", "nations league", "uluslar ligi"] })
  });

  const ACTIVE_IDS = new Set(Object.keys(ACTIVE_LEAGUES));
  const SLUG_TO_ID = new Map();
  const NAME_TO_ID = new Map();
  const normalize = value => String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  for (const [id, league] of Object.entries(ACTIVE_LEAGUES)) {
    SLUG_TO_ID.set(normalize(id), id);
    for (const slug of league.slugs) SLUG_TO_ID.set(normalize(slug), id);
    NAME_TO_ID.set(normalize(league.name), id);
    for (const alias of league.aliases) NAME_TO_ID.set(normalize(alias), id);
  }

  function activeLeagueId(value) {
    const key = normalize(value);
    if (ACTIVE_IDS.has(String(value ?? "").trim())) return String(value).trim();
    return SLUG_TO_ID.get(key) || null;
  }

  function isActiveLeagueId(value) {
    return activeLeagueId(value) !== null;
  }

  function leagueIdFor(match) {
    const league = match?.league || match?.competition || {};
    const explicit = league.id ?? match?.leagueId ?? match?.competitionId;
    if (explicit != null && String(explicit).trim()) {
      const activeId = activeLeagueId(explicit);
      if (activeId) return activeId;
      if (/^\d+$/.test(String(explicit).trim())) return null;
    }
    const fixtureId = String(match?.fixture?.id ?? match?.id ?? "");
    const espnSlug = fixtureId.match(/^espn-(.+)-\d+$/)?.[1];
    const slugId = activeLeagueId(league.slug ?? league.code ?? match?.leagueSlug ?? espnSlug);
    if (slugId) return slugId;
    const nameId = NAME_TO_ID.get(normalize(league.name ?? match?.leagueName ?? match?.competitionName));
    if (!nameId) return null;
    const country = normalize(league.country?.name ?? league.country ?? match?.country);
    const countryById = {
      "203": ["turkey", "turkiye"], "204": ["turkey", "turkiye"],
      "39": ["england"], "40": ["england"], "140": ["spain"], "78": ["germany"],
      "135": ["italy"], "61": ["france"], "88": ["netherlands"], "94": ["portugal"],
      "2": ["europe", "world"], "3": ["europe", "world"], "848": ["europe", "world"],
      "1": ["world"], "4": ["europe", "world"], "5": ["world", "europe"]
    }[nameId];
    if (country && countryById && !countryById.includes(country)) return null;
    return nameId;
  }

  function isActiveMatch(match) {
    return leagueIdFor(match) !== null;
  }

  function isActiveTeam(team, rows) {
    const teamId = String(team?.id ?? team?.teamId ?? "");
    const teamName = normalize(team?.name ?? team?.teamName);
    return (Array.isArray(rows) ? rows : []).some(match => {
      if (!isActiveMatch(match)) return false;
      return [match?.teams?.home, match?.teams?.away].some(side =>
        (teamId && String(side?.id ?? "") === teamId) || (teamName && normalize(side?.name) === teamName)
      );
    });
  }

  function applyLeagueControls(rootNode) {
    const doc = rootNode?.querySelectorAll ? rootNode : root.document;
    if (!doc) return;
    const selects = [];
    if (doc.matches?.("select#league")) selects.push(doc);
    selects.push(...doc.querySelectorAll("select#league"));
    for (const select of selects) {
      for (const option of select.options) {
        option.hidden = option.value !== "all" && !isActiveLeagueId(option.value);
      }
      if (select.value !== "all" && !isActiveLeagueId(select.value)) {
        const fallback = Array.from(select.options).find(option => option.value === "all")
          || Array.from(select.options).find(option => isActiveLeagueId(option.value));
        if (fallback && select.value !== fallback.value) {
          select.value = fallback.value;
          select.dispatchEvent?.(new Event("change", { bubbles: true }));
        }
      }
    }
    const controls = doc.querySelectorAll("[data-league-value], [data-standing-league], [data-mam-league], [data-league-id]");
    for (const control of controls) {
      const value = control.dataset.leagueValue ?? control.dataset.standingLeague ?? control.dataset.mamLeague ?? control.dataset.leagueId;
      control.hidden = String(value ?? "") !== "all" && !isActiveLeagueId(value);
    }
    const loadAll = doc.querySelector?.("#mamLoadAllLeagues");
    if (loadAll) loadAll.hidden = true;
  }

  const scope = Object.freeze({
    activeLeagues: ACTIVE_LEAGUES,
    activeIds: Object.freeze([...ACTIVE_IDS]),
    normalize,
    activeLeagueId,
    isActiveLeagueId,
    leagueIdFor,
    isActiveMatch,
    isActiveTeam,
    applyLeagueControls
  });
  root.MAMActiveLeagueScope = scope;
  if (typeof module !== "undefined" && module.exports) module.exports = scope;
  if (root.document) {
    const start = () => {
      applyLeagueControls(root.document);
      if (typeof MutationObserver !== "undefined") {
        new MutationObserver(() => applyLeagueControls(root.document)).observe(root.document.documentElement, { childList: true, subtree: true });
      }
    };
    if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
  }
})(typeof window !== "undefined" ? window : globalThis);
