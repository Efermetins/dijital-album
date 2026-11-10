/* =========================================================
   Dijital Albüm — Service Worker (çevrimdışı destek)
   - Uygulama kabuğu (HTML, CSS, JS, ikonlar, açılış sahnesi — hepsi bu dosyalarda):
     "önce önbellek, arkada güncelle". İnternet yokken uygulama normal açılır.
   - Fontlar (Google Fonts): önbellekten, arkada güncelle.
   - Fotoğraflar (Supabase imzalı linkleri): önbellek anahtarı LİNK DEĞİL, depodaki
     dosya yolu. İmzalı link saatte bir değişse de aynı fotoğraf önbellekten gelir.
     Videolar önbelleğe alınmaz (çok yer kaplar).
   - Sürüm: tools/build.mjs her yayında VERSION'ı değiştirir; yeni sürüm kurulunca
     eski kabuk önbelleği silinir, güncelleme kullanıcıya ulaşır.
   - Kapsam: sw.js, index.html ile aynı klasörde → GitHub Pages'te /dijital-album/.
   ========================================================= */
const VERSION = '40d91bfd2572';
const DEV = VERSION.indexOf('__') === 0;        // yerel sunucu (npm start): önce ağ
const SHELL = 'shell-' + (DEV ? 'dev' : VERSION);
const FONTS = 'fonts-v1';
const MEDIA = 'media-v1';
const MEDIA_MAX = 400;                            // en fazla bu kadar fotoğraf saklanır

const SHELL_FILES = [
  './', 'index.html', 'style.css', 'script.js', 'supabaseClient.js', 'config.js',
  'vendor/supabase.js', 'manifest.webmanifest',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/icon-192.png', 'icons/icon-512.png'
];

// Fotoğraf: .../storage/v1/object/sign/memory-photos/<yol>?token=...
const PHOTO_PATH = /\/storage\/v1\/object\/(?:sign|public|authenticated)\/memory-photos\//;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf('shell-') === 0 && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (PHOTO_PATH.test(url.pathname)) { event.respondWith(photo(req, url)); return; }
  if (/supabase\.co$/.test(url.hostname) || url.pathname.indexOf('/storage/v1/') >= 0 || url.pathname.indexOf('/rest/v1/') >= 0 || url.pathname.indexOf('/auth/v1/') >= 0) return; // veri, giriş, videolar: her zaman ağ
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { event.respondWith(staleWhileRevalidate(event, FONTS, req)); return; }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { event.respondWith(page(event, req)); return; }
  event.respondWith(staleWhileRevalidate(event, SHELL, req));
});

// Önce önbellek, arkada güncelle (yerelde önce ağ: geliştirirken değişiklikler hemen görünsün)
function staleWhileRevalidate(event, cacheName, req) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req, { ignoreSearch: cacheName === SHELL }).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (DEV) return network.then((res) => res || cached || Response.error());
      event.waitUntil(network);
      return cached || network.then((res) => res || Response.error());
    })
  );
}

// Sayfa: önbellekteki uygulama (index.html); arkada güncelle. İnternet yokken de açılır.
function page(event, req) {
  return caches.open(SHELL).then((cache) =>
    cache.match('index.html').then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put('index.html', res.clone());
        return res;
      }).catch(() => null);
      if (DEV) return network.then((res) => res || cached || Response.error());
      event.waitUntil(network);
      return cached || network.then((res) => res || Response.error());
    })
  );
}

// Fotoğraf: anahtar = dosya yolu (imza/token hariç). Dosya adları benzersiz → içerik değişmez.
function photo(req, url) {
  const key = url.origin + url.pathname.replace(/\/object\/(?:sign|public|authenticated)\//, '/object/');
  return caches.open(MEDIA).then((cache) =>
    cache.match(key).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(key, res.clone()).then(() => trim(cache));
        }
        return res;
      }).catch(() => Response.error());
    })
  );
}

function trim(cache) {
  return cache.keys().then((keys) => {
    if (keys.length <= MEDIA_MAX) return;
    return Promise.all(keys.slice(0, keys.length - MEDIA_MAX).map((k) => cache.delete(k)));
  });
}
