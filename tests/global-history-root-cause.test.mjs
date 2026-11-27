import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const MAMTeamIdentity = require("../team-identity-registry.js");
const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const mobileSw = readFileSync(new URL("../mobile/sw.js", import.meta.url), "utf8");

function helperApi() {
  const competitionStart = source.indexOf("function mamCanonicalFixtureLeagueId(");
  const competitionEnd = source.indexOf("function mamFixtureCompetitionCompatible(", competitionStart);
  const start = source.indexOf("const MAM_UEFA_TEAM_GROUPS=");
  const end = source.indexOf("// D1 kalıcı maç arşivi", start);
  assert.ok(start >= 0 && end > start);
  assert.ok(competitionStart >= 0 && competitionEnd > competitionStart);
  return vm.runInNewContext(`${source.slice(competitionStart, competitionEnd)}\n${source.slice(start, end)};({mamUefaTeamMatch,mamCanonicalHistoryTeamKey,mamHistoryTeamSearchNames,mamHistoricalIdentity,mamDeduplicateHistoricalMatches,mamHistoryCompetitionAllowed,mamTeamHistoryCompetitionAllowed})`, {
    MAMTeamIdentity,
    mamFixtureTeamKey(value) {
      return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]/g, "");
    },
    mamIstanbulDay(value) { return String(value || "").slice(0, 10); }
  });
}

function serviceWorkerReloadHarness(storage, controlled = true) {
  const listeners = new Map();
  let reloads = 0;
  const serviceWorker = {
    controller: controlled ? {} : null,
    addEventListener(name, callback) { listeners.set(name, callback); },
    register() { return { catch() {} }; }
  };
  const sessionStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const start = source.indexOf('if("serviceWorker" in navigator){');
  const end = source.indexOf('window.addEventListener("offline"', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(source.slice(start, end), {
    navigator: { serviceWorker }, sessionStorage, location: { reload() { reloads++; } }
  });
  return { fireControllerChange() { listeners.get("controllerchange")?.(); }, get reloads() { return reloads; } };
}

test("Service Worker sürümü eski app-shell cache'ini geçersiz kılar", () => {
  assert.match(sw, /cachePrefix:'mam-main-shell-',version:'v4'/);
  assert.match(sw, /'team-identity-registry\.js'/, "offline shell must include the shared identity helper");
  assert.match(mobileSw, /cachePrefix:'mam-mobile-shell-',version:'v4'/);
  assert.match(mobileSw, /'\.\.\/active-league-scope\.js'/, "offline mobile shell must include the shared active league scope");
  assert.match(source, /updateViaCache:"none"/);
  assert.match(source, /mam_sw_reloaded_v3/);
  assert.match(readFileSync(new URL("../mobile/shell-worker.js", import.meta.url), "utf8"), /key\.startsWith\(cachePrefix\)/);
});

test("Service Worker her yeni controllerchange için sekme oturumunda yeniden yükler, ilk kurulumda döngü oluşturmaz", () => {
  const storage = new Map();
  const firstPage = serviceWorkerReloadHarness(storage, true);
  firstPage.fireControllerChange();
  assert.equal(firstPage.reloads, 1);

  const nextPage = serviceWorkerReloadHarness(storage, true);
  nextPage.fireControllerChange();
  assert.equal(nextPage.reloads, 1, "aynı sekmedeki sonraki worker güncellemesi de sayfayı yenilemeli");

  const firstInstall = serviceWorkerReloadHarness(new Map(), false);
  firstInstall.fireControllerChange();
  assert.equal(firstInstall.reloads, 0, "ilk controller edinimi sayfayı yeniden yüklememeli");
});

test("Kayıtlı lig restore olayı render ve ek yükleme yan etkilerini bastırır", () => {
  const handlerMatch = source.match(/\$\("league"\)\.addEventListener\("change",\(\)=>\{([\s\S]*?)\n\}\);/);
  assert.ok(handlerMatch, "lig change handler bulunmalı");
  const runHandler = restoring => {
    let saved = JSON.stringify({ mode: "upcoming" });
    let renders = 0, loads = 0;
    const context = {
      window: { mamRestoringViewState: restoring },
      localStorage: { getItem() { return saved; }, setItem(_key, value) { saved = value; } },
      $(selector) { assert.equal(selector, "league"); return { value: "39" }; },
      mamScreenMode: "upcoming", renderMatches() { renders++; }, loadMatches() { loads++; }
    };
    vm.runInNewContext(`(()=>{${handlerMatch[1]}})()`, context);
    return { renders, loads };
  };
  assert.deepEqual(runHandler(true), { renders: 0, loads: 0 });
  assert.deepEqual(runHandler(false), { renders: 1, loads: 1 });

  const restoreStart = source.indexOf('if(mode!=="today"&&saved.league&&$("league")){');
  const restoreEnd = source.indexOf('if(mode==="live")', restoreStart);
  assert.ok(restoreStart >= 0 && restoreEnd > restoreStart);
  const restoreCode = source.slice(restoreStart, restoreEnd);
  assert.match(restoreCode, /window\.mamRestoringViewState=true/);
  assert.match(restoreCode, /finally\s*\{window\.mamRestoringViewState=false;\}/);
});

test("Hapoel Be'er ve sağlayıcı kısa adları ortak takım kimliğine bağlanır", () => {
  const api = helperApi();
  assert.equal(api.mamUefaTeamMatch("Hapoel Be'er", "Hapoel Beer-Sheva"), true);
  assert.equal(api.mamCanonicalHistoryTeamKey("Hapoel Be'er"), api.mamCanonicalHistoryTeamKey("Hapoel Beer-Sheva"));
  assert.equal(api.mamCanonicalHistoryTeamKey("Hoffenheim"), api.mamCanonicalHistoryTeamKey("TSG 1899 Hoffenheim"));
  assert.equal(api.mamCanonicalHistoryTeamKey("Bodø/Glimt"), api.mamCanonicalHistoryTeamKey("FK Bodø/Glimt"));
});

test("UEFA takım analizi doğrulanmış farklı yerel lig geçmişini alır, lig kimliğiyle duplicate ayrımı korunur", () => {
  const api = helperApi();
  const domestic = { fixture: { id: "tur-1", date: "2026-09-20T17:00:00Z" }, league: { id: "203", name: "Süper Lig" }, teams: { home: { name: "Beşiktaş" }, away: { name: "Trabzonspor" } }, goals: { home: 2, away: 1 }, mamSource: "api-football" };
  const uefa = { ...domestic, fixture: { id: "uel-1", date: domestic.fixture.date }, league: { id: "3", name: "UEFA Europa League" } };
  assert.equal(api.mamHistoryCompetitionAllowed(domestic, "3"), false, "mevcut turnuva eşlemesi sıkı kalır");
  assert.equal(api.mamTeamHistoryCompetitionAllowed(domestic, "3"), true, "bilinen yerel lig kaydı UEFA takım örneklemine girer");
  assert.equal(api.mamTeamHistoryCompetitionAllowed({ ...domestic, league: {}, mamSource: "football-data-team" }, "3"), false, "turnuva bilgisi olmayan takım-API kaydı kabul edilmez");
  assert.equal(api.mamDeduplicateHistoricalMatches([domestic, uefa]).length, 2, "farklı lig kimlikleri ayrı gerçek maç olarak kalır");
  assert.equal(api.mamTeamHistoryCompetitionAllowed(domestic, "39"), false, "yerel lig örneklemi kendi lig filtresini korur");
});

test("aynı gerçek maçta skor güncellemesi duplicate oluşturmaz, ayrı maçlar korunur", () => {
  const api = helperApi();
  const row = (id, home, away, date, score = [2, 1], league = "UEFA Europa League") => ({ fixture: { id, date }, league: { name: league }, teams: { home: { name: home }, away: { name: away } }, goals: { home: score[0], away: score[1] }, mamSource: id });
  const rows = [
    row("fd-uefa-1", "Hapoel Be'er", "Beşiktaş", "2026-09-25T01:00:00Z"),
    row("espn-401", "Hapoel Beer-Sheva", "Besiktas", "2026-09-25T04:00:00+03:00"),
    row("espn-402", "Hapoel Beer-Sheva", "Besiktas", "2026-09-25T04:00:00+03:00", [1, 0]),
    row("espn-cup-403", "Hapoel Beer-Sheva", "Besiktas", "2026-09-25T04:00:00+03:00", [2, 1], "National Cup"),
    row("espn-late-404", "Hapoel Beer-Sheva", "Besiktas", "2026-09-25T04:30:00+03:00", [2, 1])
  ];
  const originalIds = rows.map(match => match.fixture.id);
  const merged = api.mamDeduplicateHistoricalMatches(rows);
  assert.equal(merged.length, 3, "score revisions merge, but another competition and kickoff stay distinct");
  assert.deepEqual([merged[0].goals.home, merged[0].goals.away], [1, 0], "the merged fixture retains the latest score");
  assert.deepEqual(Array.from(merged[0].mamSources), ["fd-uefa-1", "espn-401", "espn-402"]);
  assert.deepEqual(rows.map(match => match.fixture.id), originalIds, "presentation dedupe never deletes or mutates archived source rows");
});

test("conflicting completed D1 duplicates keep the first archive-preferred score for analysis", () => {
  const api = helperApi();
  const row = (source, score) => ({
    mamArchiveOnly: true,
    mamSource: source,
    fixture: { id: "espn-tur.1-401888370", date: "2026-11-23T17:00:00Z", status: { short: "FT" } },
    league: { id: "203", name: "Süper Lig" },
    teams: { home: { name: "Istanbul Basaksehir" }, away: { name: "Çorum FK" } },
    goals: { home: score[0], away: score[1] }
  });
  const merged = api.mamDeduplicateHistoricalMatches([row("app", [4, 2]), row("espn", [0, 0])]);
  assert.equal(merged.length, 1);
  assert.deepEqual([merged[0].goals.home, merged[0].goals.away], [4, 2]);
  assert.equal(merged[0].mamArchiveOnly, true);
  assert.deepEqual(Array.from(merged[0].mamSources), ["app", "espn"]);
});

test("Sabah FA/FK and Barcelona provider aliases merge across score updates without losing source matches", () => {
  const api = helperApi();
  const row = (id, home, away, date, score, source = id, league = "UEFA Europa League") => ({ fixture: { id, date }, league: { name: league }, teams: { home: { name: home }, away: { name: away } }, goals: { home: score[0], away: score[1] }, mamSource: source });
  const rows = [
    row("sabah-fa", "Sabah FA", "FC Barcelona", "2026-09-25T01:00:00Z", [0, 2]),
    row("sabah-fk", "Sabah FK", "Barcelona", "2026-09-25T04:00:00+03:00", [1, 2]),
    row("sabah-another-kickoff", "Sabah FK", "Barcelona", "2026-09-25T04:30:00+03:00", [0, 2]),
    row("sabah-another-competition", "Sabah FK", "Barcelona", "2026-09-25T04:00:00+03:00", [0, 2], "national-cup", "National Cup")
  ];
  const originalIds = rows.map(match => match.fixture.id);
  const merged = api.mamDeduplicateHistoricalMatches(rows);
  assert.equal(merged.length, 3, "Sabah aliases and Barcelona variants resolve one fixture; distinct kickoff/competition remain");
  assert.deepEqual([merged[0].goals.home, merged[0].goals.away], [1, 2], "score update is applied to the single merged fixture");
  assert.deepEqual(Array.from(merged[0].mamSources), ["sabah-fa", "sabah-fk"]);
  assert.deepEqual(rows.map(match => match.fixture.id), originalIds, "all original real-match source rows remain unchanged");
});

test("UEFA fixture-download kayıtları gerçek ESPN event eşlemesine ve şut alanlarına sahip", () => {
  assert.match(source, /id\.startsWith\("fd-uefa-"\)/);
  assert.match(source, /mamFindEspnHistoricalEvent\(match,leagueId\)/);
  assert.match(source, /getEspnMatchStats\(leagueId,providerId\)/);
  assert.match(source, /totalShots/);
  assert.match(source, /shotsOnTarget/);
  assert.match(source, /home_shots/);
  assert.match(source, /home_target/);
  assert.match(source, /value<sot\)value=null/);
});

test("Geçmiş cache anahtarı yenilenmiş sürümü kullanır ve kickoff sonrası maçları dışarıda bırakır", () => {
  assert.match(source, /mam_history_v79_/);
  assert.match(source, /day&&day<matchDate/);
  assert.match(source, /const uniqueOutput=mamDeduplicateHistoricalMatches\(output\)/);
});

test("D1 takım sorgusu doğrulanmış sağlayıcı alias grubunun tüm adlarını içerir", () => {
  const api = helperApi();
  const names = api.mamHistoryTeamSearchNames("TSG 1899 Hoffenheim", ["tsg 1899 hoffenheim"]);
  assert.ok(names.includes("TSG 1899 Hoffenheim"));
  assert.ok(names.includes("Hoffenheim"));
  assert.ok(names.includes("TSG Hoffenheim"));
  assert.equal(api.mamCanonicalHistoryTeamKey("Hoffenheim"), api.mamCanonicalHistoryTeamKey("TSG 1899 Hoffenheim"));
});
