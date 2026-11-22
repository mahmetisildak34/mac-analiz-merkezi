'use strict';

if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('./service-worker.js', document.baseURI))
      .catch(error => console.warn('Çevrimdışı ekran etkinleştirilemedi.', error));
  }, { once: true });
}
