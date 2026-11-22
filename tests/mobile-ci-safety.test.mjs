// Independent, dependency-free audit of the isolated mobile acceptance workflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/isolated-mobile.yml',import.meta.url),'utf8');

test('mobile acceptance runs in both browser engines',()=>{
  assert.match(workflow,/engine:\s*\[chromium,\s*webkit\]/);
  assert.match(workflow,/playwright install --with-deps/);
  assert.match(workflow,/\[320,360,375,390,414,430\]/);
});

test('isolated browser cannot reach live endpoints',()=>{
  assert.match(workflow,/route\.abort\(\)/);
  assert.match(workflow,/route\.fulfill\(/);
  assert.match(workflow,/mam-test\.invalid/);
  assert.match(workflow,/serviceWorkers:\s*'block'/);
  assert.doesNotMatch(workflow,/route\.continue\(/);
  assert.doesNotMatch(workflow,/route\.fallback\(/);
});

test('browser tests retain real acceptance assertions and diagnostics',()=>{
  assert.match(workflow,/checks\.finishedDetail\s*=/);
  assert.match(workflow,/checks\.finishedProviderStats\s*=/);
  assert.match(workflow,/checks\.matchDetailBack\s*=/);
  assert.match(workflow,/Object\.values\(checks\)\.every\(Boolean\)/);
  assert.match(workflow,/results\.some\(r=>!r\.pass\)/);
  assert.match(workflow,/if:\s*always\(\)/);
  assert.match(workflow,/mobile-results\/results\.json/);
});

test('workflow has no deployment or production mutation permissions',()=>{
  assert.match(workflow,/permissions:\s*\n\s*contents:\s*read/);
  assert.doesNotMatch(workflow,/\bwrangler\s+(deploy|publish|d1\s+execute)\b/i);
  assert.doesNotMatch(workflow,/\b(api-football|x-apisports-key)\b/i);
});
