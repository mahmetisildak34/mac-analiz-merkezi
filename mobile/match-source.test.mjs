import assert from 'node:assert/strict';
import test from 'node:test';
import { istanbulMatchDate, matchApiBase } from './match-source.mjs';

test('native API configuration requires a credential-free HTTPS URL', () => {
  assert.equal(matchApiBase('https://preview.example.test/api/'), 'https://preview.example.test/api');
  for (const value of [undefined, 'http://example.test/api', 'https://u:p@example.test/api',
    'https://example.test/api?token=private', 'https://example.test/api#section', 'not-a-url']) {
    assert.equal(matchApiBase(value), null);
  }
});

test('Istanbul fixtures roll to the next day at local midnight', () => {
  assert.equal(istanbulMatchDate(new Date('2026-11-22T20:59:59Z')), '2026-11-22');
  assert.equal(istanbulMatchDate(new Date('2026-11-22T21:00:00Z')), '2026-11-23');
});
