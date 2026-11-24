import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const mobileSw = readFileSync(new URL("../mobile/sw.js", import.meta.url), "utf8");

function helperApi() {
  const start = source.indexOf("const MAM_UEFA_TEAM_GROUPS=");
  const end = source.indexOf("// D1 kalıcı maç arşivi", start);
  assert.ok(start >= 0 && end > start);
  return vm.runInNewContext(`${source.slice(start, end)};({mamUefaTeamMatch,mamCanonicalHistoryTeamKey,mamHistoricalIdentity,mamDeduplicateHistoricalMatches})`, {
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
  assert.match(sw, /cachePrefix:'mam-main-shell-',version:'v3'/);
  assert.match(mobileSw, /cachePrefix:'mam-mobile-shell-',version:'v3'/);
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

test("İstanbul günü ve skor ile aynı gerçek maç duplicate olarak birleşir, ayrı maç korunur", () => {
  const api = helperApi();
  const row = (id, home, away, date, score = [2, 1]) => ({ fixture: { id, date }, teams: { home: { name: home }, away: { name: away } }, goals: { home: score[0], away: score[1] }, mamSource: id });
  const rows = [
    row("fd-uefa-1", "Hapoel Be'er", "Beşiktaş", "2026-09-25T01:00:00Z"),
    row("espn-401", "Hapoel Beer-Sheva", "Besiktas", "2026-09-25T00:00:00+03:00"),
    row("espn-402", "Hapoel Beer-Sheva", "Besiktas", "2026-09-25T00:00:00+03:00", [1, 0])
  ];
  const merged = api.mamDeduplicateHistoricalMatches(rows);
  assert.equal(merged.length, 2);
  assert.match(merged[0].mamSources.join(","), /fd-uefa-1/);
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
  assert.match(source, /mam_history_v77_/);
  assert.match(source, /day&&day<matchDate/);
  assert.match(source, /const uniqueOutput=mamDeduplicateHistoricalMatches\(output\)/);
});
