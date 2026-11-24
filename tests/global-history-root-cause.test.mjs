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

test("Service Worker sürümü eski app-shell cache'ini geçersiz kılar", () => {
  assert.match(sw, /cachePrefix:'mam-main-shell-',version:'v3'/);
  assert.match(mobileSw, /cachePrefix:'mam-mobile-shell-',version:'v3'/);
  assert.match(source, /updateViaCache:"none"/);
  assert.match(source, /mam_sw_reloaded_v3/);
  assert.match(readFileSync(new URL("../mobile/shell-worker.js", import.meta.url), "utf8"), /key\.startsWith\(cachePrefix\)/);
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
