// Regression guard: the bottom Favorites button must not bubble into the
// bottom-navigation handler that closes the panel immediately after opening.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../mobile/main-favorites.mjs', import.meta.url), 'utf8');

test('bottom Favorites click does not bubble to nav auto-close', () => {
  assert.match(source, /control===bottom\)event\.stopPropagation\(\)/);
  assert.match(source, /setPanel\(panel\.hidden\)/);
  assert.match(source, /event\.target\.closest\('\[data-mam-bottom\]'\)\)setPanel\(false\)/);
});

test('favorites still persist locally and update visible panel', () => {
  assert.match(source, /localStorage\.setItem\(KEY,JSON\.stringify\(state\)\)/);
  assert.match(source, /function renderFavorites\(\)/);
  assert.match(source, /panel\.hidden=!open/);
  assert.match(source, /panel\.style\.display=open\?'block':'none'/);
});

test('favorite match and team stars still toggle through delegated clicks', () => {
  assert.match(source, /toggle\(star\.dataset\.type,star\.dataset\.value\)/);
  assert.match(source, /toggle\('match',m\.dataset\.mamRemoveMatch\)/);
  assert.match(source, /toggle\('team',t\.dataset\.mamRemoveTeam\)/);
});
