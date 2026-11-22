const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const root = 'https://example.test/mac-analiz-merkezi/';
const offline = root + 'pwa/offline.html';
const sw = fs.readFileSync('service-worker.js', 'utf8');

test('manifest resolves beneath the deployment directory and icons match their sizes', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  assert.equal(new URL(manifest.start_url, root).href, root);
  for (const icon of manifest.icons) {
    assert.ok(new URL(icon.src, root).href.startsWith(root));
    const buffer = fs.readFileSync(icon.src);
    assert.equal(buffer.subarray(1, 4).toString(), 'PNG');
    assert.equal(icon.sizes, buffer.readUInt32BE(16) + 'x' + buffer.readUInt32BE(20));
  }
});

test('offline cache contains one public page and exempts API and private requests', async () => {
  const listeners = new Map();
  const installed = [];
  const removed = [];
  const offlinePage = new Response('Bağlantı yok');
  let failNetwork = false;
  const cache = {
    add: async request => installed.push([request.url, request.credentials]),
    match: async url => url === offline ? offlinePage : undefined
  };
  vm.runInNewContext(sw, {
    URL, Request, Response,
    self: { registration: { scope: root }, addEventListener: (name, fn) => listeners.set(name, fn) },
    caches: {
      open: async () => cache,
      keys: async () => ['mam-offline:/mac-analiz-merkezi/:v0', 'mam-offline:/other/:v0'],
      delete: async key => removed.push(key)
    },
    fetch: async () => {
      if (failNetwork) throw new TypeError('Offline');
      return new Response('online');
    }
  });
  let promise;
  const waitUntil = value => { promise = value; };
  listeners.get('install')({ waitUntil });
  await promise;
  assert.deepEqual(installed, [[offline, 'omit']]);
  listeners.get('activate')({ waitUntil });
  await promise;
  assert.deepEqual(removed, ['mam-offline:/mac-analiz-merkezi/:v0']);

  function intercept(url, mode = 'navigate', method = 'GET') {
    let response;
    listeners.get('fetch')({ request: { url, mode, method }, respondWith: value => { response = value; } });
    return response;
  }
  assert.equal(await (await intercept(root)).text(), 'online');
  failNetwork = true;
  assert.equal(await intercept(root + 'index.html'), offlinePage);
  assert.equal(intercept(root + 'api/fixtures'), undefined);
  assert.equal(intercept('https://other.test/'), undefined);
  assert.equal(intercept(root, 'cors'), undefined);
  assert.equal(intercept(root, 'navigate', 'POST'), undefined);
});
