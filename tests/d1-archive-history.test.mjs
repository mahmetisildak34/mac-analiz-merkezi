import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const helperStart = source.indexOf("const MAM_UEFA_TEAM_GROUPS=");
const helperEnd = source.indexOf("// D1 kalıcı maç arşivi", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart);
const helpers = vm.runInNewContext(`${source.slice(helperStart, helperEnd)};({mamUefaTeamMatch,mamCanonicalHistoryTeamKey,mamHistoryTeamSearchNames})`, {
  mamFixtureTeamKey(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]/g, "");
  },
  mamIstanbulDay(value) { return String(value || "").slice(0, 10); }
});

function archiveLoaderHarness(responseRows) {
  const start = source.indexOf("async function mamLoadD1LeagueArchive");
  const end = source.indexOf("\nconst MAM_LEAGUE_ARCHIVE_TTL", start);
  assert.ok(start >= 0 && end > start);
  const values = new Map();
  const apiCalls = [];
  const context = {
    ...helpers,
    mamD1ArchiveInFlight: new Map(),
    localStorage: {
      getItem(key) { return values.get(key) ?? null; },
      setItem(key, value) { values.set(key, String(value)); }
    },
    qs(query) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") params.set(key, value);
      }
      return params.toString();
    },
    async api(path) {
      apiCalls.push(path);
      return { response: responseRows };
    }
  };
  vm.runInNewContext(`${source.slice(start, end)};globalThis.load=mamLoadD1LeagueArchive`, context);
  return { load: context.load, apiCalls };
}

test("D1 archive request carries the target and verified aliases; same-team requests share one fetch", async () => {
  const fixture = {
    source: "ESPN",
    fixture: { id: "401900001", date: "2026-10-20T12:00:00Z", status: { short: "FT" } },
    league: { id: "39", name: "Premier League" },
    teams: { home: { id: "1", name: "Hoffenheim" }, away: { id: "2", name: "Liverpool" } },
    goals: { home: 2, away: 1 }
  };
  const harness = archiveLoaderHarness([fixture]);
  const accepted = ["tsg 1899 hoffenheim"];
  const [first, second] = await Promise.all([
    harness.load("39", "2026-11-25", "TSG 1899 Hoffenheim", "1", "espn", accepted),
    harness.load("39", "2026-11-25", "TSG 1899 Hoffenheim", "1", "espn", accepted)
  ]);
  assert.equal(harness.apiCalls.length, 1, "in-flight D1 reads for the same team should be shared");
  const requestUrl = new URL("https://worker.test/" + harness.apiCalls[0]);
  assert.equal(requestUrl.searchParams.get("limit"), "240");
  const requestedNames = requestUrl.searchParams.get("teamNames").split(",");
  assert.ok(requestedNames.includes("Hoffenheim"));
  assert.ok(requestedNames.includes("TSG 1899 Hoffenheim"));
  for (const rows of [first, second]) {
    assert.equal(rows.length, 1);
    assert.equal(rows[0].mamSource, "espn");
    assert.equal(rows[0].mamArchiveOnly, true);
  }
});

test("D1 archive-only rows cannot be POSTed back into the archive", async () => {
  const start = source.indexOf("async function mamSaveMatchesToD1");
  const end = source.indexOf("async function mamPersistLiveStatsToD1", start);
  assert.ok(start >= 0 && end > start);
  let fetchCalls = 0;
  const save = vm.runInNewContext(`${source.slice(start, end)};mamSaveMatchesToD1`, {
    fetch() { fetchCalls++; throw new Error("must not fetch for archive-only matches"); }
  });
  await save([{ mamArchiveOnly: true, fixture: { id: "existing" } }], "39");
  assert.equal(fetchCalls, 0);
});

test("10 D1 matches gate historical provider fallbacks and optional stats enrichment", () => {
  const start = source.indexOf("/* GEÇMİŞ MAÇLAR */");
  const end = source.indexOf("/* TAKIM İSTATİSTİKLERİ */", start);
  assert.ok(start >= 0 && end > start);
  const history = source.slice(start, end);
  assert.match(history, /if\(folder&&output\.length<10\)/);
  assert.match(history, /if\(!mamTeamHistoryCompetitionAllowed\(m,leagueId\)\|\|!mamHasCompletedScore\(m\)\)return/);
  assert.match(history, /if\(\["2","3","848"\]\.includes\(String\(leagueId\)\)&&output\.length<10\)/);
  assert.match(history, /if\(\["2","3"\]\.includes\(String\(leagueId\)\)&&output\.length<10\)/);
  assert.match(history, /const d1ArchiveMatchCount=output\.filter\(match=>match\?\.mamArchiveOnly===true\)\.length/);
  assert.match(history, /if\(d1ArchiveMatchCount<10\)await mamEnrichHistoricalStats\(result,leagueId\)/);
  assert.match(source, /const isFixtureDownload=id\.startsWith\("fd-uefa-"\)\|\|String\(match\.mamSource\|\|match\.source\|\|""\)\.toLowerCase\(\)==="fixture-download-uefa"/);
  assert.match(history, /mam_history_v79_/);
  assert.match(source, /mam_history_v79_/);
  assert.match(source, /mam_d1_archive_v4_/);
  assert.match(source, /poisson\(lh,h\)\*poisson\(la,a\)/i);
});
