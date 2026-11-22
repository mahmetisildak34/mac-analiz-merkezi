// Safari 2 regression: static guard for the compact fixture card overrides.
// Run: node --test tests/safari2-mobile-card.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const safari2 = html.split('/* Safari 2: allow compact mobile match cards to grow for kickoff and team names. */')[1];
test('mobile card override exists', () => {
  assert.ok(safari2, 'Safari 2 mobile CSS block missing');
  assert.match(safari2, /@media\(max-width:600px\)/);
});
test('mobile fixture cards grow instead of clipping two-line team names', () => {
  assert.match(safari2, /\.match-modern:not\(\.in-detail\)\{height:auto!important;min-height:64px!important/);
  assert.match(safari2, /white-space:normal!important/);
  assert.match(safari2, /-webkit-line-clamp:2!important/);
});
test('kickoff rail uses tabular numbers and does not clip its container', () => {
  assert.match(safari2, /\.match-head\{overflow:visible!important\}/);
  assert.match(safari2, /font-variant-numeric:tabular-nums!important/);
});
test('existing Today screen isolation remains present', () => {
  assert.match(html, /main\.mam-screen-today #mamTodayTabs\{display:none!important\}/);
});
test('narrow-screen fixture and navigation guards remain present', () => {
  assert.match(safari2, /@media\(max-width:350px\)/);
  assert.match(safari2, /\.mam-bottom-nav button\{min-width:0!important;overflow:hidden!important\}/);
});
