self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('ean-finder-v3').then(cache => cache.addAll([
      './',
      './index.html',
      './style.css',
      './app.js',
      './manifest.json',
      './icons/icon-192.png',
      './icons/icon-512.png'
    ]))
  );
});
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((resp) => {
      return resp || fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open('ean-finder-v3').then((cache) => {
          cache.put(event.request, copy).catch(()=>{});
        });
        return response;
      }).catch(() => {
        return caches.match('./index.html');
      });
    })
  );
});
