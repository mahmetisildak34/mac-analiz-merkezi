import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const html=readFileSync(new URL('../mobile/product-hub.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('product hub exposes seven feature areas and responsive navigation',()=>{
 for(const id of ['home','favorites','teams','leagues','search','settings','details'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/aria-label="Alt gezinme"/);assert.match(html,/env\(safe-area-inset-bottom\)/);
});
test('product hub uses local data only, not live APIs or notification permissions',()=>{
 assert.match(html,/type="file"/);assert.match(html,/localStorage/);
 assert.doesNotMatch(html,/fetch\s*\(|Notification\.requestPermission|navigator\.serviceWorker\.register/);
});
test('main app links to product hub without replacing existing rendering',()=>{
 assert.match(app,/href="\.\/mobile\/product-hub\.html"/);
 assert.match(app,/function renderMatches\(\)/);
});
test('product hub module script is syntactically valid',()=>{
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script,'module script present');
 const check=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});assert.equal(check.status,0,check.stderr);
});

test('main app shares already loaded matches and hub automatically consumes them',()=>{
 assert.match(app,/mam_product_hub_fixtures_v1/);
 assert.match(app,/safeRows\.length\) localStorage\.setItem/);
 assert.match(html,/function loadSharedFixtures\(\)/);
 assert.match(html,/loadSharedFixtures\(\);show\('home'\)/);
 assert.match(html,/24\*60\*60\*1000/);
});

test('search links teams to profile and team profile lists actual fixture cards',()=>{
 assert.match(html,/found\.teams\.map\(teamCard\)/);
 assert.match(html,/p\.past\.slice\(0,5\)\.map\(matchCard\)/);
 assert.match(html,/p\.future\.slice\(0,5\)\.map\(matchCard\)/);
});
test('in-app reminders are opt-in, deduplicated and do not request push permission',()=>{
 assert.match(html,/id="notifyCheck"/);
 assert.match(html,/SEEN_KEY/);
 assert.match(html,/seenAlerts\.includes\(x\.id\+'\\|'\+x\.kickoff\)/);
 assert.doesNotMatch(html,/Notification\.requestPermission/);
});

test('search team selection navigates to the visible profile view',()=>{assert.match(html,/if\(b\.dataset\.team\)\{show\('teams'\)/);});
test('partial standings include W D L and scored and conceded goals',()=>{assert.match(html,/r\.wins\+'G '/);assert.match(html,/r\.draws\+'B '/);assert.match(html,/r\.losses\+'M · '/);assert.match(html,/r\.goalsFor\+':'\+r\.goalsAgainst/);});

test('match detail displays available statistics values without claiming independent verification',()=>{
 assert.match(html,/function renderStatistics\(statistics\)/);
 assert.match(html,/renderStatistics\(d\.statistics\)/);
 assert.match(html,/Kaynaklar arası bağımsız doğrulama yok/);
 assert.match(html,/function renderStatValue\(value\)/);
});
test('mobile detail back navigation and accessibility affordances exist',()=>{
 assert.match(html,/id="detailsBack"/);
 assert.match(html,/detailsBack'\)\.addEventListener\('click'/);
 assert.match(html,/prefers-reduced-motion:reduce/);
 assert.match(html,/select:focus-visible,a:focus-visible/);
});

test('fixture cards format kickoff in Istanbul rather than raw UTC',()=>{
 assert.match(html,/timeZone:'Europe\/Istanbul'/);
 assert.match(html,/Number\.isFinite\(Date\.parse\(m\.kickoff\)\)/);
});
test('event detail supports API-Football nested elapsed minute, team and player',()=>{
 assert.match(html,/x\.time\?\.elapsed/);
 assert.match(html,/x\.team\?\.name/);
 assert.match(html,/x\.player\?\.name/);
});

test('bounded fixture snapshot retains matches across league groups',()=>{
 assert.match(app,/const groups=new Map\(\)/);
 assert.match(app,/match\?\.league\?\.id/);
 assert.match(app,/for\(const group of groups\.values\(\)\)/);
 assert.match(app,/selected\.length<1000/);
});

test('partial computed standings are not presented as official league standings',()=>{
 assert.match(html,/Resmî lig puan durumu değildir/);
 assert.match(html,/Yalnızca yüklenen maçlardan hesaplanan geçici tablo/);
});

test('ESPN team and boxscore statistics arrays are recognized in detail renderer',()=>{
 assert.match(html,/Array\.isArray\(statistics\.teams\)/);
 assert.match(html,/Array\.isArray\(statistics\.boxscore\?\.teams\)/);
 assert.match(html,/independentCrossSourceVerification/);
});

test('ESPN displayValue statistics are preserved in match detail rendering',()=>{
 assert.match(html,/stat\?\.value\?\?stat\?\.displayValue\?\?stat\?\.home/);
});

test('mobile match details preserve and render available lineup players without inventing squads',()=>{
 assert.match(html,/lineups:m\.lineups/);
 assert.match(html,/d\.lineups\.length/);
 assert.match(html,/lineup\.startXI/);
 assert.match(html,/lineup\.substitutes/);
 assert.match(html,/Kadro verisi yok/);
});

test('match detail supports wrapped event arrays without inventing events',()=>{
 const features=readFileSync(new URL('../mobile/product-features.mjs',import.meta.url),'utf8');
 assert.match(features,/Array\.isArray\(match\.events\?\.response\)/);
 assert.match(features,/Array\.isArray\(match\.events\?\.plays\)/);
 assert.match(features,/const events=\[\.\.\.sourceEvents\]\.sort/);
});
