importScripts('./mobile/shell-worker.js');
installAppShell({
 cachePrefix:'mam-main-shell-',version:'v4',entry:'index.html',
 files:['index.html','team-identity-registry.js','half-goal-algorithm.js','manifest.webmanifest','mobile/main-favorites.mjs','mobile/product-features.mjs',
  'mobile/espn-standings.mjs','mobile/product-hub.html','mobile/manifest.webmanifest','mobile/icon-192.png','mobile/icon-512.png']
});
