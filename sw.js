importScripts('./mobile/shell-worker.js');
installAppShell({
 cachePrefix:'mam-main-shell-',version:'v1',entry:'index.html',
 files:['index.html','half-goal-algorithm.js','manifest.webmanifest','mobile/main-favorites.mjs','mobile/product-features.mjs',
  'mobile/espn-standings.mjs','mobile/icon-192.png','mobile/icon-512.png']
});
