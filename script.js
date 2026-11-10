(function () {
  'use strict';

  /* =========================================================
     0. Ayarlar ve yardımcılar
     ========================================================= */
  // Bu tarihi kendi başlangıç tarihinizle değiştirin
  var START_DATE = new Date('2026-08-01T00:00:00');

  var MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  var MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';        // ease-out (Apple tarzı)
  var EASE_IN_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';
  var FLIP_MS = 320;   // önizlemeden büyüme / küçülme
  var FADE_MS = 200;   // "hareketi azalt" açıkken sadece yumuşak solma
  var HEART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">' +
    '<path d="M12 21s-7.5-4.6-10-9.3C.3 8.1 2 4.5 5.4 4c2-.3 3.8.7 4.6 2.3C10.8 4.7 12.6 3.7 14.6 4c3.4.5 5.1 4.1 3.4 7.7C15.5 16.4 12 21 12 21z"/></svg>';
  // Kalp pullu mektup ikonu: "Notu Gör" butonlarında (galeri penceresi + zaman çizelgesi)
  var LETTER_SVG = '<svg class="letter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M13.6 6.5H4a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5.2"/><path d="m2.6 8.2 7.9 5.3a1.8 1.8 0 0 0 2 0l1.6-1.1"/>' +
    '<rect x="15.2" y="2.6" width="6.8" height="7.4" rx="1" stroke-dasharray="1.1 0.9"/>' +
    '<path d="M18.6 8.3s-2.1-1.2-2.1-2.7c0-.7.5-1.1 1-1.1.5 0 .9.3 1.1.7.2-.4.6-.7 1.1-.7.5 0 1 .4 1 1.1 0 1.5-2.1 2.7-2.1 2.7z" class="stamp-heart" fill="currentColor" stroke="none"/></svg>';
  var PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  // iOS Safari, sayfada bir dokunma dinleyicisi yoksa :active durumunu göstermez.
  // Bu boş dinleyici sayesinde "dokununca hafif büyüme" efekti iPhone'da da çalışır.
  document.addEventListener('touchstart', function () {}, { passive: true });

  // Çevrimdışı destek: uygulama dosyaları ve görüntülenen fotoğraflar önbelleğe alınır (sw.js)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      var hadController = !!navigator.serviceWorker.controller;
      var swReloaded = false;
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        // Uygulama her öne geldiğinde yeni sürüm var mı diye bak
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') reg.update().catch(function () {});
        });
      }).catch(function () { /* desteklenmiyorsa uygulama yine çalışır */ });
      // Yeni sürüm devreye girdi: sayfayı bir kez yenile (anı eklerken araya girme)
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController || swReloaded) { hadController = true; return; }
        var busy = function () { var m = document.getElementById('addModal'); return m && !m.hidden; };
        var doReload = function () { if (swReloaded) return; swReloaded = true; location.reload(); };
        if (!busy()) { doReload(); return; }
        var wait = setInterval(function () { if (!busy()) { clearInterval(wait); doReload(); } }, 1500);
      });
    });
  }

  /* ---- Uygulama hissi: sayfa zoom'u yok ----
     iOS Safari, viewport'taki user-scalable=no'yu görmezden gelir. Bu yüzden:
       - iki parmak hareketleri (gesture*) ve iki parmakla sürükleme engellenir,
       - tıklanabilir olmayan yerlerde hızlı çift dokunma sayfayı büyütmez.
     Fotoğraf görüntüleyici (#lightbox) hariç: oradaki pinch ve çift dokunma
     yakınlaştırması kendi JS jestleriyle çalışmaya devam eder. */
  var ZOOM_FREE = '#lightbox';
  var TAP_TARGETS = 'a, button, input, textarea, select, label, summary, [role="button"], [contenteditable="true"], .gallery-item, .gallery-add, .timeline-card, .counter-card, #lightbox';
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
    document.addEventListener(type, function (e) { e.preventDefault(); }, { passive: false });
  });
  document.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1 && !(e.target.closest && e.target.closest(ZOOM_FREE))) e.preventDefault();
  }, { passive: false });
  var lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    var onTarget = e.target.closest && e.target.closest(TAP_TARGETS);
    if (!onTarget && now - lastTouchEnd < 320 && e.cancelable) e.preventDefault(); // çift dokunma zoom'u yok
    lastTouchEnd = now;
  }, { passive: false });

  /* ---- Dokunma geri bildirimi: parmak/fare değdiği AN öğe büyüsün ----
     Bazı telefonlar :active'i ~100 ms geciktirir; bu sınıf anında eklenir.
     Kaydırma başlarsa (pointercancel) ya da parmak çekilince kaldırılır. */
  // Form etiketleri (label) dahil DEĞİL: içindeki metin alanına dokununca alan büyüyüp kayarsa
  // imleç dokunulan yere oturmaz (not düzenlerken metnin ortasına tıklanamıyordu).
  var PRESSABLE = 'a[href], button, [role="button"], summary, .gallery-item, .timeline-card';
  var TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]';
  var pressedEls = [];

  function releasePress() {
    pressedEls.forEach(function (el) { el.classList.remove('is-pressed'); });
    pressedEls = [];
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    releasePress();
    if (e.target.closest && e.target.closest(TEXT_ENTRY)) return; // yazı alanında: hiçbir şey büyümesin
    var el = e.target.closest && e.target.closest(PRESSABLE);
    // Kartın içindeki butona basınca hem buton hem kart tepki versin
    while (el) {
      if (!el.disabled && !el.classList.contains('timeline-media')) { el.classList.add('is-pressed'); pressedEls.push(el); }
      el = el.parentElement && el.parentElement.closest(PRESSABLE);
    }
  }, { passive: true });
  ['pointerup', 'pointercancel', 'dragstart'].forEach(function (t) { document.addEventListener(t, releasePress, { passive: true }); });
  window.addEventListener('scroll', releasePress, { passive: true, capture: true });
  window.addEventListener('blur', releasePress);

  function reduced() { return motionQuery.matches; }
  // "Hareketi azalt" açıksa animasyon süresi 0 olur; jestler yine çalışır
  function dur(ms) { return reduced() ? 0 : ms; }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function toArray(list) { return Array.prototype.slice.call(list); }
  function noop() {}
  function pad(n) { return String(n).padStart(2, '0'); }

  function formatDate(value) {
    if (!value) return 'Tarih belirtilmedi';
    var parts = value.split('-');
    return parseInt(parts[2], 10) + ' ' + MONTHS[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
  }

  function escapeAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // Bir öğenin transform'unu (isteğe bağlı animasyonla) ayarlar
  function animateTransform(el, value, ms, done) {
    if (el._animTimer) { clearTimeout(el._animTimer); el._animTimer = null; }
    if (!ms) {
      el.style.transition = 'none';
      el.style.transform = value;
      if (done) done();
      return;
    }
    void el.offsetWidth; // başlangıç değerini sabitle
    el.style.transition = 'transform ' + ms + 'ms ' + EASE;
    el.style.transform = value;
    el._animTimer = setTimeout(function () {
      el._animTimer = null;
      el.style.transition = 'none';
      if (done) done();
    }, ms + 40);
  }

  /* ---- Web Animations yardımcıları (açılış/kapanış geçişleri) ---- */

  // Animasyonu bir sahibe (pencereye) kaydeder; pencere yeniden açılırsa iptal edilebilsin
  function anim(owner, el, keyframes, options) {
    if (!el || typeof el.animate !== 'function') return null;
    var a = el.animate(keyframes, options);
    (owner._anims = owner._anims || []).push(a);
    return a;
  }

  function cancelAnims(owner) {
    (owner._anims || []).forEach(function (a) { a.cancel(); });
    owner._anims = [];
    showThumb(owner);
  }

  function onAllFinished(anims, cb) {
    anims = anims.filter(Boolean);
    if (!anims.length) { cb(); return; }
    var left = anims.length;
    anims.forEach(function (a) {
      a.addEventListener('finish', function () { if (--left === 0) cb(); });
    });
  }

  // Önizleme büyürken/küçülürken asıl küçük resmi gizle (iOS'taki gibi).
  // visibility yerine opacity: gizlenen öğe odağını kaybetmesin (pencere kapanınca odak ona döner)
  function hideThumb(owner, el) {
    showThumb(owner);
    owner._hiddenThumb = el;
    el.style.transition = 'none'; // .reveal'in solma geçişi araya girmesin: anında gizle
    el.style.opacity = '0';
  }

  function showThumb(owner) {
    var el = owner._hiddenThumb;
    owner._hiddenThumb = null;
    if (!el) return;
    el.style.opacity = '';
    void el.offsetWidth;          // anında görünür olsun, sonra geçişi geri ver
    el.style.transition = '';
  }

  // Ekranda görünen bir öğenin dikdörtgeni (görünmüyorsa null)
  function visibleRect(el) {
    if (!el || !el.isConnected) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return null;
    return r;
  }

  // w×h kutusu içinde, verilen en/boy oranında ortalanmış "kaplayan" bölge
  function coverRegion(x, y, w, h, aspect) {
    var rw = w, rh = h;
    if (w / h > aspect) rw = h * aspect; else rh = w / aspect;
    return { x: x + (w - rw) / 2, y: y + (h - rh) / 2, w: rw, h: rh };
  }

  // FLIP: öğe, "from" dikdörtgeninden (küçük önizleme) kendi yerine büyür.
  // region: öğenin içinde başlangıçta görünecek kısım (öğe koordinatlarında).
  function flipFrames(el, from, fromRadius, toRadius, region) {
    var to = el.getBoundingClientRect();
    var W = to.width, H = to.height;
    var R = region || coverRegion(0, 0, W, H, from.width / from.height);
    var s = from.width / R.w;
    var tx = (from.left + from.width / 2) - to.left - W / 2 - s * (R.x + R.w / 2 - W / 2);
    var ty = (from.top + from.height / 2) - to.top - H / 2 - s * (R.y + R.h / 2 - H / 2);
    var inset = R.y + 'px ' + (W - R.x - R.w) + 'px ' + (H - R.y - R.h) + 'px ' + R.x + 'px';
    return [
      { transform: 'translate(' + tx + 'px, ' + ty + 'px) scale(' + s + ')', clipPath: 'inset(' + inset + ' round ' + (fromRadius / s) + 'px)' },
      { transform: 'translate(0px, 0px) scale(1)', clipPath: 'inset(0px 0px 0px 0px round ' + (toRadius || '0px') + ')' }
    ];
  }

  function radiusOf(el) {
    var r = parseFloat(getComputedStyle(el).borderTopLeftRadius);
    return isFinite(r) ? r : 0;
  }

  // Resim/video boyutları belli olana kadar bekle (en fazla ~300 ms)
  function whenMediaReady(el, cb) {
    var called = false;
    function go() { if (!called) { called = true; cb(); } }
    if (!el) { go(); return; }
    if (el.tagName === 'IMG') {
      if (el.complete && el.naturalWidth) { go(); return; }
      el.addEventListener('load', go, { once: true });
      el.addEventListener('error', go, { once: true });
    } else if (el.tagName === 'VIDEO') {
      if (el.readyState >= 1) { go(); return; }
      el.addEventListener('loadedmetadata', go, { once: true });
      el.addEventListener('error', go, { once: true });
    } else {
      go();
      return;
    }
    setTimeout(go, 300);
  }

  /* =========================================================
     1. "Birlikte geçen zaman" sayacı
     ========================================================= */
  var elDays = document.getElementById('countDays');
  var elHours = document.getElementById('countHours');
  var elMinutes = document.getElementById('countMinutes');
  var elSeconds = document.getElementById('countSeconds');
  var elSince = document.getElementById('countSince');

  function updateCounter() {
    var diff = Math.max(0, new Date() - START_DATE);
    var totalSeconds = Math.floor(diff / 1000);

    elDays.textContent = Math.floor(totalSeconds / 86400);
    elHours.textContent = pad(Math.floor((totalSeconds % 86400) / 3600));
    elMinutes.textContent = pad(Math.floor((totalSeconds % 3600) / 60));
    elSeconds.textContent = pad(totalSeconds % 60);
  }

  if (elDays) {
    updateCounter();
    setInterval(updateCounter, 1000);
  }

  if (elSince) {
    elSince.textContent = 'başlangıç: ' + START_DATE.getDate() + ' ' + MONTHS[START_DATE.getMonth()] + ' ' + START_DATE.getFullYear();
  }

  /* ---- Sayaca dokununca: hafif büyüme + sözlükten bir kelime ve kalpler süzülür ----
     Her dokunuşta sözlükten rastgele bir kelime (Sözlük sayfası) ve 1-2 küçük kalp
     sayacın üstünden yukarı süzülüp kaybolur. Sözlük boşsa sadece kalpler.
     Art arda dokunulabilir; aynı anda en fazla FLOAT_MAX öğe tutulur.
     Hareketi azalt: kayma ve büyüme yok, sadece yerinde belirip solar. */
  var counterEl = document.getElementById('counter');
  var FLOAT_MAX = 24;
  var FLOAT_HEART = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.5s-7.6-4.7-9.6-9.4C.9 7.4 3 4.2 6.2 4c2.1-.1 3.7 1 4.6 2.6l1.2 1.6 1.2-1.6C14.1 5 15.7 3.9 17.8 4c3.2.2 5.3 3.4 3.8 7.1-2 4.7-9.6 9.4-9.6 9.4z"/></svg>';
  var floatLayer = null;

  function ensureFloatLayer() {
    if (floatLayer) return floatLayer;
    floatLayer = document.createElement('div');
    floatLayer.className = 'counter-floats';
    floatLayer.setAttribute('aria-hidden', 'true');
    counterEl.parentNode.insertBefore(floatLayer, counterEl);
    return floatLayer;
  }

  // Tek bir süzülen öğe: (x, y) katman içindeki başlangıç noktası
  function floatUp(el, x, y, opts) {
    var layer = ensureFloatLayer();
    while (layer.childElementCount >= FLOAT_MAX) layer.removeChild(layer.firstChild);
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    layer.appendChild(el);
    var drift = opts.drift || 0;
    var frames = reduced()
      ? [{ opacity: 0, transform: 'translate(-50%, -50%)' }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 0, transform: 'translate(-50%, -50%)' }]
      : [
        { opacity: 0, transform: 'translate(-50%, -50%) translateY(10px) scale(0.85)' },
        { opacity: 1, offset: 0.18, transform: 'translate(-50%, -50%) translateY(-' + (opts.rise * 0.18) + 'px) scale(1)' },
        { opacity: 1, offset: 0.6 },
        { opacity: 0, transform: 'translate(calc(-50% + ' + drift + 'px), -50%) translateY(-' + opts.rise + 'px) scale(' + (opts.endScale || 1) + ')' }
      ];
    if (!el.animate) { setTimeout(function () { el.remove(); }, 800); return; }
    var a = el.animate(frames, { duration: opts.duration, delay: opts.delay || 0, easing: 'cubic-bezier(0.25, 0.8, 0.35, 1)', fill: 'both' });
    a.onfinish = a.oncancel = function () { el.remove(); };
  }

  function counterTap(clientX) {
    if (!counterEl) return;
    // 1) sayaç hafifçe büyüyüp yaylanarak döner
    if (!reduced() && counterEl.animate) {
      counterEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.045)' }, { transform: 'scale(1)' }],
        { duration: 360, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    }
    var layer = ensureFloatLayer();
    var lr = layer.getBoundingClientRect();
    var cr = counterEl.getBoundingClientRect();
    // dokunulan yatay konum (klavyeyle tetiklenince ortası), kenarlara taşmasın
    var cx = (typeof clientX === 'number' ? clientX : cr.left + cr.width / 2) - lr.left;
    cx = clamp(cx, cr.left - lr.left + 50, cr.right - lr.left - 50);
    var startY = cr.top - lr.top + cr.height * 0.32;

    // 2) sözlükten rastgele kelime
    var w = randomWord();
    if (w) {
      var word = document.createElement('span');
      word.className = 'float-word';
      word.textContent = w.word;
      floatUp(word, cx, startY, { rise: 150, duration: 2100, drift: (Math.random() - 0.5) * 30 });
    }
    // 3) 1-2 küçük kalp
    var hearts = 1 + Math.round(Math.random());
    for (var i = 0; i < hearts; i++) {
      var h = document.createElement('span');
      h.className = 'float-heart';
      h.innerHTML = FLOAT_HEART;
      var size = 13 + Math.round(Math.random() * 8);
      h.style.width = h.style.height = size + 'px';
      var side = (i % 2 ? 1 : -1) * (w ? 34 + Math.random() * 30 : Math.random() * 40);
      floatUp(h, cx + side, startY + 18, { rise: 110 + Math.random() * 50, duration: 1600 + Math.random() * 500, delay: w ? 120 + i * 160 : i * 140, drift: (Math.random() - 0.5) * 40, endScale: 1.15 });
    }
  }

  if (counterEl) {
    counterEl.addEventListener('click', function (e) { counterTap(e.detail === 0 ? null : e.clientX); });
    counterEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); counterTap(null); }
    });
  }

  /* =========================================================
     2. Scroll ile belirme animasyonu
     ========================================================= */
  var revealEls = document.querySelectorAll('.reveal');

  if (!reduced() && 'IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* =========================================================
     3. Sayfalar: her bölüm kendi tam sayfası
        Ana Sayfa · Anı Cetveli · Galeri · Sözlük · Ayarlar. Aynı anda sadece biri
        görünür; alt sekme / menü ile geçilir. Geçiş: sekme yönüne göre hafifçe
        kayarak belirir (hareketi azalt: sadece solma). Adres çubuğunda #sayfa,
        telefonun "geri" hareketi önceki sayfaya döner. Her sayfa kendi kaydırma
        konumunu hatırlar; aynı sekmeye tekrar basınca sayfanın başına kayar.
     ========================================================= */
  var PAGES = ['anasayfa', 'ani-cetveli', 'galeri', 'sozluk', 'ayarlar'];
  var PAGE_TITLES = { 'anasayfa': 'Dijital Albüm', 'ani-cetveli': 'Anı Cetveli', 'galeri': 'Galeri', 'sozluk': 'Sözlük', 'ayarlar': 'Ayarlar' };
  var navLinks = document.querySelectorAll('[data-nav-link]');
  var currentPage = null;
  var pageScroll = {};          // sayfa → son kaydırma konumu
  var pageShownHooks = [];      // sayfa görününce çalışacaklar (ör. cetvel çubuğunu ölç)

  function setActive(id) {
    navLinks.forEach(function (link) {
      var on = link.dataset.target === id;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
  }

  function pageFromHash() {
    var id = (location.hash || '').slice(1);
    return PAGES.indexOf(id) >= 0 ? id : 'anasayfa';
  }

  // Her sayfa kendi içinde kayar (body kaymaz)
  function pageEl(id) { return id ? document.getElementById(id) : null; }

  function jumpScroll(y) {
    var s = pageEl(currentPage);
    if (s) s.scrollTop = y;
  }

  function showPage(id, opts) {
    opts = opts || {};
    if (PAGES.indexOf(id) < 0) id = 'anasayfa';
    var prev = currentPage;
    if (prev === id) {
      // aynı sekmeye tekrar basıldı: sayfanın başına yumuşakça
      var same = pageEl(id);
      if (!opts.silent && same) {
        try { same.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); } catch (err) { same.scrollTop = 0; }
      }
      return;
    }
    if (prev && pageEl(prev)) pageScroll[prev] = pageEl(prev).scrollTop;
    currentPage = id;
    document.documentElement.setAttribute('data-page', id);
    PAGES.forEach(function (p) {
      var el = document.getElementById(p);
      if (el) el.classList.toggle('is-active', p === id);
    });
    setActive(id);
    document.title = id === 'anasayfa' ? 'Dijital Albüm' : PAGE_TITLES[id] + ' · Dijital Albüm';
    jumpScroll(pageScroll[id] || 0);

    var el = document.getElementById(id);
    if (prev && el && el.animate && !opts.instant) {
      var dir = PAGES.indexOf(id) > PAGES.indexOf(prev) ? 1 : -1;
      el.animate(reduced()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: 'translateX(' + (dir * 28) + 'px)' }, { opacity: 1, transform: 'none' }],
        { duration: reduced() ? 160 : 340, easing: EASE });
    }
    pageShownHooks.forEach(function (fn) { fn(id); });
  }

  function goToPage(id) {
    if (activeDialog) closeDialog(true);
    if (id !== currentPage && history.pushState) history.pushState({ page: id }, '', '#' + id);
    showPage(id);
  }

  toArray(document.querySelectorAll('a[data-nav-link], a.brand')).forEach(function (link) {
    link.addEventListener('click', function (e) {
      var id = link.dataset.target || (link.getAttribute('href') || '').slice(1);
      if (PAGES.indexOf(id) < 0) return;
      e.preventDefault();
      goToPage(id);
    });
  });

  // Telefonun / tarayıcının geri-ileri hareketi
  window.addEventListener('popstate', function () {
    if (activeDialog) closeDialog(true);
    showPage(pageFromHash());
  });

  /* =========================================================
     4. Video önizlemeleri (sessiz, döngülü, kontrolsüz)
        Sadece ekranda görünenler oynar; pencere açıkken durur.
     ========================================================= */
  var activeDialog = null;

  var previewObserver = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      en.target._inView = en.isIntersecting;
      syncPreview(en.target);
    });
  }, { threshold: 0.2 }) : null;

  function syncPreview(v) {
    if (v._inView && !reduced() && !activeDialog) {
      var p = v.play();
      if (p && p.catch) p.catch(noop);
    } else {
      v.pause();
    }
  }

  function observePreviews(root) {
    toArray(root.querySelectorAll('video.media-preview')).forEach(function (v) {
      if (v._observed) return;
      v._observed = true;
      v.muted = true;
      v.defaultMuted = true;
      v.loop = true;
      if (previewObserver) previewObserver.observe(v);
      else { v._inView = true; syncPreview(v); }
    });
  }

  function unobservePreviews(root) {
    toArray(root.querySelectorAll('video.media-preview')).forEach(function (v) {
      if (previewObserver) previewObserver.unobserve(v);
      v.pause();
    });
  }

  function pausePreviews() {
    toArray(document.querySelectorAll('video.media-preview')).forEach(function (v) { v.pause(); });
  }

  function resumePreviews() {
    toArray(document.querySelectorAll('video.media-preview')).forEach(syncPreview);
  }

  if (motionQuery.addEventListener) motionQuery.addEventListener('change', resumePreviews);
  else if (motionQuery.addListener) motionQuery.addListener(resumePreviews);

  // Küçük önizleme içeriği: fotoğraf, sessiz video ya da kalp
  function thumbHTML(media) {
    if (!media || !media.src) return HEART_SVG;
    var src = escapeAttr(media.src);
    if (media.type === 'video') {
      // #t=0.1: otomatik oynatma kapalıyken de ilk kare görünsün
      return '<video class="media-preview' + (media.mirror ? ' is-mirrored' : '') + '" src="' + src + '#t=0.1" muted loop playsinline preload="metadata" disablepictureinpicture tabindex="-1" aria-hidden="true"></video>' +
        '<span class="media-badge">' + PLAY_SVG + '</span>';
    }
    return '<img src="' + src + '" alt="" decoding="async">';
  }

  /* =========================================================
     5. Ortak pencere yöneticisi
        Esc, odak tuzağı, sayfa kaydırma kilidi, odağın geri dönmesi ve
        açılış/kapanış animasyonları her iki pencere için burada.
     ========================================================= */
  var FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])';

  function focusablesIn(el) {
    return toArray(el.querySelectorAll(FOCUSABLE)).filter(function (node) {
      return node.getClientRects().length > 0;
    });
  }

  function openDialog(el, opener, opts) {
    opts = opts || {};
    if (activeDialog) closeDialog(true);
    clearTimeout(el._closeTimer);
    cancelAnims(el);

    activeDialog = { el: el, opener: opener || document.activeElement, onClose: opts.onClose, animateClose: opts.animateClose };
    el.hidden = false;
    void el.offsetWidth; // açılış geçişinin çalışması için
    el.classList.add('is-open');
    document.documentElement.classList.add('is-locked');
    pausePreviews();

    if (opts.animateOpen) opts.animateOpen();

    var target = opts.initialFocus || focusablesIn(el)[0];
    if (target) target.focus({ preventScroll: true });
  }

  function closeDialog(immediate) {
    if (!activeDialog) return;
    var d = activeDialog;
    activeDialog = null;

    if (d.onClose) d.onClose();
    d.el.classList.remove('is-open');
    document.documentElement.classList.remove('is-locked');
    clearTimeout(d.el._closeTimer);

    function finish() {
      d.el.hidden = true;
      cancelAnims(d.el);
      d.el.style.opacity = '';
      resumePreviews();
    }

    // Odağı geri ver (kapanış animasyonu önizlemeyi gizlemeden önce; gizli öğe odak alamaz)
    if (d.opener && d.opener.focus) d.opener.focus({ preventScroll: true });

    if (immediate === true) {
      finish();
    } else if (d.animateClose) {
      d.animateClose(finish);
    } else {
      var ms = dur(280);
      if (ms) d.el._closeTimer = setTimeout(finish, ms); else finish();
    }
  }

  function trapFocus(e) {
    var items = focusablesIn(activeDialog.el);
    e.preventDefault();
    if (!items.length) return;
    var idx = items.indexOf(document.activeElement);
    var next = e.shiftKey
      ? (idx <= 0 ? items.length - 1 : idx - 1)
      : (idx + 1) % items.length;
    items[next].focus();
  }

  /* ---- Küçük bildirim (ör. "Anı silindi.") ---- */
  var toastEl = null;
  var toastTimer = null;

  // opts: { heart: true } → başında küçük kalp, { ms } → görünme süresi
  function toast(message, opts) {
    opts = opts || {};
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    if (opts.heart) {
      var h = document.createElement('span');
      h.className = 'toast-heart';
      h.setAttribute('aria-hidden', 'true');
      h.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.5s-7.6-4.7-9.6-9.4C.9 7.4 3 4.2 6.2 4c2.1-.1 3.7 1 4.6 2.6l1.2 1.6 1.2-1.6C14.1 5 15.7 3.9 17.8 4c3.2.2 5.3 3.4 3.8 7.1-2 4.7-9.6 9.4-9.6 9.4z"/></svg>';
      toastEl.insertBefore(h, toastEl.firstChild);
    }
    void toastEl.offsetWidth;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, opts.ms || 3200);
  }

  /* ---- Anı ayrıntısı: görüntüle / düzenle / sil ----
     Aynı bileşen hem fotoğraf penceresinin not panelinde hem de
     zaman çizelgesinin anı penceresinde kullanılır. */
  function createDetail(root, hooks) {
    root.appendChild(document.getElementById('memoryDetailTpl').content.cloneNode(true));
    function q(sel) { return root.querySelector(sel); }

    var view = q('.md-view'), dateEl = q('.md-date'), titleEl = q('.md-title'), noteEl = q('.md-note');
    var actions = q('.md-actions'), editBtn = q('.md-edit'), deleteBtn = q('.md-delete');
    var formEl = q('.md-form'), inTitle = q('.md-in-title'), inDate = q('.md-in-date'), inNote = q('.md-in-note');
    var saveBtn = q('.md-save'), cancelBtn = q('.md-cancel');
    var confirmEl = q('.md-confirm'), yesBtn = q('.md-confirm-yes'), noBtn = q('.md-confirm-no');
    var statusEl = q('.md-status');
    var entry = null;
    var mode = 'view'; // 'view' | 'edit' | 'confirm'

    function canEdit() { return !!(entry && entry.memoryId && currentUser); }

    function setMode(m) {
      mode = m;
      view.hidden = m === 'edit';
      formEl.hidden = m !== 'edit';
      confirmEl.hidden = m !== 'confirm';
      // Düzenle / Sil sadece giriş yapmış kullanıcıya ve gerçek (Supabase) anılarda
      actions.hidden = m !== 'view' || !canEdit();
    }

    function render() {
      dateEl.textContent = entry ? (entry.dateText || '') : '';
      dateEl.hidden = !dateEl.textContent;
      titleEl.textContent = entry ? entry.title : '';
      var note = entry ? entry.desc : '';
      noteEl.textContent = note || (hooks.emptyNote || '');
      noteEl.classList.toggle('is-muted', !note);
      noteEl.hidden = !noteEl.textContent;
    }

    editBtn.addEventListener('click', function () {
      inTitle.value = entry.title;
      inDate.value = entry.dateValue || '';
      inNote.value = entry.desc || '';
      statusEl.textContent = '';
      setMode('edit');
      // Formun tamamı (Kaydet butonu dahil) görünür alana gelsin
      formEl.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      inTitle.focus({ preventScroll: true });
    });

    cancelBtn.addEventListener('click', function () {
      statusEl.textContent = '';
      setMode('view');
      editBtn.focus();
    });

    formEl.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!requireOnline()) return;
      var title = inTitle.value.trim();
      if (!title) { statusEl.textContent = 'Başlık boş olamaz.'; inTitle.focus(); return; }
      saveBtn.disabled = cancelBtn.disabled = true;
      statusEl.textContent = 'Kaydediliyor...';
      updateMemory(entry, { title: title, date: inDate.value || null, note: inNote.value.trim() || null })
        .then(function () {
          render();
          setMode('view');
          statusEl.textContent = 'Değişiklikler kaydedildi.';
          if (hooks.onSaved) hooks.onSaved(entry);
          editBtn.focus();
        }, function (err) {
          statusEl.textContent = friendlyError(err);
        })
        .then(function () { saveBtn.disabled = cancelBtn.disabled = false; });
    });

    deleteBtn.addEventListener('click', function () {
      statusEl.textContent = '';
      setMode('confirm');
      noBtn.focus();
    });

    noBtn.addEventListener('click', function () {
      setMode('view');
      deleteBtn.focus();
    });

    yesBtn.addEventListener('click', function () {
      if (!requireOnline()) return;
      yesBtn.disabled = noBtn.disabled = true;
      statusEl.textContent = 'Siliniyor...';
      deleteMemory(entry)
        .then(function () {
          statusEl.textContent = '';
          setMode('view');
          if (hooks.onDeleted) hooks.onDeleted(entry);
        }, function (err) {
          statusEl.textContent = friendlyError(err);
        })
        .then(function () { yesBtn.disabled = noBtn.disabled = false; });
    });

    return {
      show: function (e) { entry = e; statusEl.textContent = ''; render(); setMode('view'); },
      reset: function () { statusEl.textContent = ''; if (entry) setMode('view'); },
      isBusy: function () { return mode !== 'view'; },
      canEdit: canEdit,
      // Doğrudan silme onayına geç (lightbox'taki çöp kutusu butonu)
      askDelete: function () { if (!canEdit()) return false; statusEl.textContent = ''; setMode('confirm'); noBtn.focus({ preventScroll: true }); return true; },
      cancel: function () { var was = mode; statusEl.textContent = ''; setMode('view'); (was === 'confirm' ? deleteBtn : editBtn).focus(); }
    };
  }

  function isTyping(el) {
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  document.addEventListener('keydown', function (e) {
    if (!activeDialog) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      // Önce açık olan iç adımı kapat: düzenleme/silme onayı → not paneli → pencere
      var det = detailFor(activeDialog.el);
      if (det && det.isBusy()) { det.cancel(); return; }
      if (activeDialog.el === lightbox && sheetOpen) { setSheet(false, true); lbNotesBtn.focus(); return; }
      closeDialog();
      return;
    }
    if (e.key === 'Tab') { trapFocus(e); return; }
    if (activeDialog.el === lightbox && !isTyping(e.target)) handleLightboxKey(e);
  });

  /* =========================================================
     6. Galeri + fotoğraf/video penceresi (lightbox) — polaroid kartları
        - her anı bir polaroid: çerçeve, fotoğrafın kendi en-boy oranına göre boyutlanır
        - sağ üstte tarih etiketi, alttaki beyaz şeritte el yazısıyla sadece başlık
        - Tinder tarzı geçiş: kart parmağı takip ederek döner, ekrandan atılır,
          alttaki kart öne gelir (oklar / ok tuşları da aynı animasyonu kullanır)
        - iki parmakla yakınlaştırma (pinch), yakınken sürükleme (pan)
        - çift dokunma / çift tıklama ile hızlı yakınlaşma
        - fare: sürükleme, tekerlek veya Ctrl+tekerlek ile zoom
        - videolar sesli ve kontrol çubuklu oynar (videoda zoom yok)
     ========================================================= */
  var lightbox = document.getElementById('lightbox');
  var lightboxBg = lightbox.querySelector('.lightbox-bg');
  var lightboxTopbar = lightbox.querySelector('.lightbox-topbar');
  var viewport = document.getElementById('lightboxViewport');
  var track = document.getElementById('lightboxTrack');
  var lightboxLive = document.getElementById('lightboxLive');
  var lightboxCount = document.getElementById('lightboxCount');
  var lightboxClose = document.getElementById('lightboxClose');
  var lightboxPrev = document.getElementById('lightboxPrev');
  var lightboxNext = document.getElementById('lightboxNext');
  var galleryGrid = document.getElementById('galleryGrid');
  var galleryCount = document.getElementById('galleryCount');
  var lbSheet = document.getElementById('lbSheet');
  var lbSheetScroll = document.getElementById('lbSheetScroll');
  var lbSheetHandle = document.getElementById('lbSheetHandle');
  var lbNotesBtn = document.getElementById('lbNotesBtn');
  var lbNotesLabel = document.getElementById('lbNotesLabel');
  var lbDeleteBtn = document.getElementById('lbDeleteBtn');
  var sheetOpen = false;   // not paneli açık mı
  var sheetP = 0;          // panelin açıklık oranı (0 kapalı, 1 açık)

  // Not panelindeki anı ayrıntısı (düzenle / sil dahil)
  var lbDetail = createDetail(document.getElementById('lbDetail'), {
    emptyNote: 'Bu anıya not eklenmemiş.',
    onSaved: function (entry) {
      afterMemoryChanged(entry);
      if (lightboxOpen) fillPolaroidText(slides.cur); // karttaki tarih ve başlık da güncellensin
    },
    onDeleted: function (entry) {
      closeDialog(true);
      removeMemoryFromUI(entry);
    }
  });

  var SWIPE_ROT = 14;      // kart ekran genişliği kadar kaydırılınca kaç derece döner
  var SWIPE_COMMIT = 0.22; // geçiş için gereken kaydırma (ekran genişliğinin oranı)
  var BEHIND_SCALE = 0.92; // alttaki kartın bekleme ölçeği
  var FLY_EASE = 'cubic-bezier(0.2, 0.7, 0.3, 1)';
  var MAX_SCALE = 4;
  var TAP_ZOOM = 2.5;      // çift dokununca yakınlaşma oranı
  var SLOP = 8;            // jestin "hareket" sayılması için gereken mesafe (px)
  // Videolar kontrolsüz, sessiz ve döngüde oynar; sadece küçük bir ses aç/kapa ikonu var.
  // Ses tercihi pencere açık kaldıkça (ve sonraki videolarda) hatırlanır.
  var lbMuted = true;
  var SOUND_OFF_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>';
  var SOUND_ON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';

  var galleryItems = [];   // galerideki kareler
  // Lightbox'ın gezdiği liste: galeri kareleri ya da zaman çizelgesi anıları.
  // Her öğede dataset (mediaType, mediaSrc, caption, memoryId) ve thumb() vardır.
  var lbItems = [];
  var lbMode = 'gallery';  // 'gallery' | 'timeline' (küçük görsel farklar için)
  var currentIndex = 0;
  var slides = { prev: null, cur: null, next: null }; // DOM'daki üç kart
  var previewDir = 0;      // kaydırırken tarih etiketi hangi komşuyu gösteriyor (-1, 0, 1)
  var lightboxOpen = false;
  var trackBusy = false;   // geçiş animasyonu sürerken yeni jest başlamasın
  var zoom = { s: 1, x: 0, y: 0 };
  var focal = { x: 0, y: 0 };
  var gesture = null;
  var videoTouch = false;
  var lastTouchTime = 0;
  var lastTap = { t: 0, x: 0, y: 0 };
  var pendingClose = null;
  var suppressClick = false;

  function refreshGalleryItems() {
    galleryItems = toArray(galleryGrid.querySelectorAll('.gallery-item'));
    var videos = 0;
    galleryItems.forEach(function (item) {
      var isVideo = item.dataset.mediaType === 'video';
      if (isVideo) videos++;
      item.type = 'button';
      item.setAttribute('aria-label', (item.dataset.caption || (isVideo ? 'Video' : 'Fotoğraf')) + (isVideo ? ' — videoyu oynat' : ' — büyüt'));
    });
    if (galleryCount) {
      var photos = galleryItems.length - videos;
      galleryCount.textContent = galleryItems.length ? photos + ' fotoğraf' + (videos ? ', ' + videos + ' video' : '') : '';
    }
    var galleryEmpty = document.getElementById('galleryEmpty');
    if (galleryEmpty) galleryEmpty.hidden = galleryItems.length > 0;
    observePreviews(galleryGrid);
  }

  /* ---- Polaroid kartı ---- */

  // "2026-11-03" → "3 Kas 2026"
  function shortDate(value) {
    if (!value) return '';
    var p = String(value).split('-');
    return parseInt(p[2], 10) + ' ' + MONTHS_SHORT[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  // Kartta görünecek tarih ve başlık (not metni kartta gösterilmez; "Notu Gör" ile açılır)
  function polaroidInfo(index) {
    var item = lbItems[index];
    var entry = entryForGalleryItem(item);
    return {
      date: shortDate(entry.dateValue),
      title: entry.title || (item && item.dataset.caption) || ''
    };
  }

  function fillPolaroidText(slide) {
    if (!slide) return;
    var info = polaroidInfo(slide._index);
    var tag = slide.querySelector('.polaroid-date');
    tag.textContent = info.date;
    tag.hidden = !info.date;
    tag.classList.remove('is-preview');
    slide.querySelector('.polaroid-note span').textContent = info.title;
  }

  function buildSlide(index) {
    var item = lbItems[index];
    var type = item.dataset.mediaType;
    var src = item.dataset.mediaSrc;
    var caption = item.dataset.caption || (type === 'video' ? 'Video' : 'Fotoğraf');

    var slide = document.createElement('div');
    slide.className = 'lb-slide';
    slide._index = index;
    slide.style.setProperty('--tilt', (index % 2 ? 1.3 : -1.1) + 'deg'); // çizelge görünümünde fotoğraf yığını hissi
    slide._aspect = 0;

    var card = document.createElement('figure');
    card.className = 'lb-media polaroid';
    var photo = document.createElement('div');
    photo.className = 'polaroid-photo';
    var el;

    if (type === 'video' && src) {
      card.dataset.kind = 'video';
      el = document.createElement('video');
      el.className = 'lb-video' + (item.dataset.mediaMirror === '1' ? ' is-mirrored' : '');
      el.src = src;
      el.controls = false;          // oynat/duraklat, ilerleme çubuğu yok
      el.loop = true;               // bitince başa sarıp devam eder
      el.muted = lbMuted;
      el.defaultMuted = true;
      el.setAttribute('muted', '');
      el.disablePictureInPicture = true;
      el.setAttribute('disablepictureinpicture', '');
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.preload = 'metadata';
      el.setAttribute('aria-label', caption);
      el.addEventListener('loadedmetadata', function () {
        if (el.videoWidth && el.videoHeight) { slide._aspect = el.videoWidth / el.videoHeight; fitPolaroid(slide); }
      });
    } else if (type === 'photo' && src) {
      card.dataset.kind = 'photo';
      el = document.createElement('img');
      el.src = src;
      el.alt = caption;
      el.draggable = false;
      el.decoding = 'async';
      if (el.complete && el.naturalWidth) {
        slide._aspect = el.naturalWidth / el.naturalHeight; // önbellekte: oran hemen belli
      } else {
        el.addEventListener('load', function () {
          if (el.naturalWidth && el.naturalHeight) { slide._aspect = el.naturalWidth / el.naturalHeight; fitPolaroid(slide); }
        });
      }
    } else {
      card.dataset.kind = 'empty';
      slide._aspect = 1;
      el = document.createElement('div');
      el.className = 'polaroid-empty';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', caption);
      el.innerHTML = HEART_SVG;
    }
    photo.appendChild(el);
    if (card.dataset.kind === 'video') {
      var mute = document.createElement('button');
      mute.type = 'button';
      mute.className = 'lb-mute';
      photo.appendChild(mute);
      syncMuteButton(mute);
    }

    var tag = document.createElement('span');
    tag.className = 'polaroid-date';
    var note = document.createElement('figcaption');
    note.className = 'polaroid-note';
    note.appendChild(document.createElement('span'));

    card.appendChild(photo);
    card.appendChild(tag);
    card.appendChild(note);
    slide.appendChild(card);
    fillPolaroidText(slide);
    return slide; // boyut, sayfaya eklendikten sonra fitPolaroid ile hesaplanır
  }

  // Çerçeveyi fotoğrafın gerçek oranına göre boyutlandır: ekrana sığan en büyük boyut.
  // Oran henüz belli değilse (yükleniyor) 3:4 varsayılır, yüklenince yeniden hesaplanır.
  function fitPolaroid(slide) {
    if (!slide || !slide.isConnected) return;
    var card = slide.firstChild;
    var photo = card.firstChild;
    var cs = getComputedStyle(slide);
    var availW = document.documentElement.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    var availH = (slide.clientHeight || window.innerHeight) - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (availW < 60 || availH < 60) return;
    var a = slide._aspect || 0.75;
    var p = clamp(Math.round(Math.min(availW, availH * a) * 0.045), 10, 20); // kenar çerçevesi
    var b = clamp(Math.round(p * 4.2), 58, 86);                               // alt yazı şeridi
    var w = Math.floor(Math.min(availW - 2 * p, (availH - p - b) * a));
    w = Math.max(40, w);
    card.style.setProperty('--pp', p + 'px');
    card.style.setProperty('--pb', b + 'px');
    card.style.width = (w + 2 * p) + 'px'; // uzun not kartı genişletmesin, satır kırsın
    photo.style.width = w + 'px';
    photo.style.height = Math.round(w / a) + 'px';
  }

  function eachSlide(fn) {
    [slides.prev, slides.next, slides.cur].forEach(function (s) { if (s) fn(s); });
  }

  // Kartın konumunu / dönüşünü / saydamlığını ayarla (isteğe bağlı animasyonla)
  function animateSlide(el, transform, opacity, ms, easing, done) {
    if (el._animTimer) { clearTimeout(el._animTimer); el._animTimer = null; }
    if (ms && reduced() && el.animate) {
      // "Hareketi azalt": CSS geçişleri kapalı (style.css), basit solmayı Web Animations ile yap
      var from = getComputedStyle(el).opacity;
      el.style.transition = 'none';
      el.style.transform = transform;
      el.style.opacity = String(opacity);
      el.animate([{ opacity: from }, { opacity: opacity }], { duration: ms, easing: easing || 'ease-out' });
      el._animTimer = setTimeout(function () { el._animTimer = null; if (done) done(); }, ms + 40);
      return;
    }
    if (ms) void el.offsetWidth; // başlangıç değerini sabitle
    el.style.transition = ms ? 'transform ' + ms + 'ms ' + (easing || EASE) + ', opacity ' + ms + 'ms ' + (easing || EASE) : 'none';
    el.style.transform = transform;
    el.style.opacity = String(opacity);
    if (!ms) { if (done) done(); return; }
    el._animTimer = setTimeout(function () {
      el._animTimer = null;
      el.style.transition = 'none';
      if (done) done();
    }, ms + 40);
  }

  // Dinlenme hâli: mevcut kart önde, komşular arkada küçük ve görünmez
  function layoutSlides() {
    ['prev', 'next', 'cur'].forEach(function (k) {
      var s = slides[k];
      if (!s) return;
      var isCur = k === 'cur';
      if (isCur) { s.setAttribute('data-current', ''); s.removeAttribute('aria-hidden'); }
      else { s.removeAttribute('data-current'); s.setAttribute('aria-hidden', 'true'); }
      s.inert = !isCur;             // arkadaki kartlar odak / dokunuş almasın
      s.style.zIndex = isCur ? '2' : '1';
      s.style.transformOrigin = '';
      animateSlide(s, isCur ? 'none' : 'scale(' + BEHIND_SCALE + ')', isCur ? 1 : 0, 0);
    });
    previewDir = 0;
  }

  function updateLightboxMeta() {
    var info = polaroidInfo(currentIndex);
    lightboxCount.textContent = (currentIndex + 1) + ' / ' + lbItems.length;
    lightboxLive.textContent = info.title + (info.date ? ', ' + info.date : '');
    lbDetail.show(entryForGalleryItem(lbItems[currentIndex])); // ayrıntı paneli o anki anıyı göstersin
    lbDeleteBtn.hidden = !lbDetail.canEdit(); // sadece gerçek (Supabase) anılarda
  }

  // Sadece önceki / mevcut / sonraki kart DOM'da tutulur
  function renderSlides() {
    var n = lbItems.length;
    pauseLightboxVideos();
    eachSlide(function (s) { clearTimeout(s._animTimer); });
    track.innerHTML = '';
    slides = { prev: null, cur: buildSlide(currentIndex), next: null };
    if (n > 1) {
      slides.prev = buildSlide((currentIndex - 1 + n) % n);
      slides.next = buildSlide((currentIndex + 1) % n);
    }
    eachSlide(function (s) { track.appendChild(s); fitPolaroid(s); });
    layoutSlides();

    zoom = { s: 1, x: 0, y: 0 };
    setZoomedClass(false);
    updateLightboxMeta();
  }

  function currentMedia() { return slides.cur ? slides.cur.querySelector('.lb-media') : null; }

  function canZoom() {
    var m = currentMedia();
    return !!m && m.dataset.kind !== 'video';
  }

  function pauseLightboxVideos() {
    exitFullscreenWithin(track);
    toArray(track.querySelectorAll('video')).forEach(function (v) { v.pause(); });
  }

  // Video kendi tam ekran modundaysa (ör. çift tıklama), pencereyle birlikte çık
  function exitFullscreenWithin(root) {
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (!fs || !root.contains(fs)) return;
    var exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) { var p = exit.call(document); if (p && p.catch) p.catch(noop); }
  }

  function playCurrentVideo() {
    var m = currentMedia();
    var v = m && m.querySelector('video');
    if (lightboxOpen && v) {
      v.muted = lbMuted;
      var p = v.play();
      if (p && p.catch) p.catch(function () {
        // Tarayıcı sesli otomatik oynatmaya izin vermediyse sessiz oynat
        if (!v.muted) { v.muted = true; syncMuteButton(m.querySelector('.lb-mute'), true); var p2 = v.play(); if (p2 && p2.catch) p2.catch(noop); }
      });
    }
  }

  function syncMuteButton(btn, forceMuted) {
    if (!btn) return;
    var muted = forceMuted || lbMuted;
    btn.innerHTML = muted ? SOUND_OFF_SVG : SOUND_ON_SVG;
    btn.setAttribute('aria-label', muted ? 'Sesi aç' : 'Sesi kapat');
    btn.setAttribute('aria-pressed', String(!muted));
  }

  // Ses aç/kapa: dokunuş anında (kullanıcı etkileşimi) uygulanır; tarayıcı sesli oynatmaya izin verir
  track.addEventListener('click', function (e) {
    var btn = e.target.closest('.lb-mute');
    if (!btn) return;
    e.stopPropagation();
    lbMuted = !lbMuted;
    var v = btn.parentElement.querySelector('video');
    if (v) {
      v.muted = lbMuted;
      if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(noop); }
    }
    toArray(track.querySelectorAll('.lb-mute')).forEach(function (b) { syncMuteButton(b); });
  });

  function setZoomedClass(on) {
    viewport.classList.toggle('is-zoomed', on);
    lightbox.classList.toggle('is-zoomed', on);
  }

  /* ---- Zoom matematiği ----
     Fotoğraf merkezinden ölçülen bir p noktası ekranda: merkez + (x, y) + s·p
     Bir odak noktasını (parmaklar / imleç) yerinde tutarak ölçek değiştirilir. */

  function mediaCenter() {
    var m = currentMedia();
    var r = viewport.getBoundingClientRect();
    return { x: r.left + m.offsetLeft + m.offsetWidth / 2, y: r.top + m.offsetTop + m.offsetHeight / 2 };
  }

  function panBounds(s) {
    var m = currentMedia();
    var vw = viewport.clientWidth, vh = viewport.clientHeight;
    var cx = m.offsetLeft + m.offsetWidth / 2, cy = m.offsetTop + m.offsetHeight / 2;
    var w = m.offsetWidth * s, h = m.offsetHeight * s;
    return {
      minX: w > vw ? vw - cx - w / 2 : 0,
      maxX: w > vw ? w / 2 - cx : 0,
      minY: h > vh ? vh - cy - h / 2 : 0,
      maxY: h > vh ? h / 2 - cy : 0
    };
  }

  function clampPan() {
    var b = panBounds(zoom.s);
    zoom.x = clamp(zoom.x, b.minX, b.maxX);
    zoom.y = clamp(zoom.y, b.minY, b.maxY);
  }

  // Kenardan taşınca lastik gibi direnç
  function rubber(v, min, max) {
    if (v < min) return min + (v - min) * 0.35;
    if (v > max) return max + (v - max) * 0.35;
    return v;
  }

  function applyZoom(animate) {
    var m = currentMedia();
    if (!m) return;
    setZoomedClass(zoom.s > 1.01);
    animateTransform(m, 'translate3d(' + zoom.x + 'px,' + zoom.y + 'px,0) scale(' + zoom.s + ')', animate ? dur(300) : 0);
  }

  function resetZoom(animate) {
    zoom = { s: 1, x: 0, y: 0 };
    applyZoom(animate);
  }

  function zoomAround(newScale, clientX, clientY) {
    var c = mediaCenter();
    var fx = clientX - c.x, fy = clientY - c.y;
    newScale = clamp(newScale, 1, MAX_SCALE);
    if (newScale <= 1.001) { zoom = { s: 1, x: 0, y: 0 }; return; }
    zoom.x = fx - (fx - zoom.x) * newScale / zoom.s;
    zoom.y = fy - (fy - zoom.y) * newScale / zoom.s;
    zoom.s = newScale;
    clampPan();
  }

  function viewportCenter() {
    var r = viewport.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function toggleZoomAt(clientX, clientY) {
    if (!canZoom()) return;
    if (zoom.s > 1.01) zoom = { s: 1, x: 0, y: 0 };
    else zoomAround(TAP_ZOOM, clientX, clientY);
    applyZoom(true);
  }

  // Parmaklar kalkınca ölçeği sınırlara oturt
  function settleZoom() {
    if (!canZoom()) return;
    var target = clamp(zoom.s, 1, MAX_SCALE);
    if (target <= 1.01) {
      zoom = { s: 1, x: 0, y: 0 };
    } else if (target !== zoom.s) {
      zoom.x = focal.x - (focal.x - zoom.x) * target / zoom.s;
      zoom.y = focal.y - (focal.y - zoom.y) * target / zoom.s;
      zoom.s = target;
    }
    clampPan();
    applyZoom(true);
  }

  /* ---- Anılar arası geçiş (Tinder tarzı kart) ----
     dir = 1: sonraki (kart sola atılır), dir = -1: önceki (kart sağa atılır) */

  function neighborSlide(dir) { return dir > 0 ? slides.next : slides.prev; }

  // Sağ üstteki tarih etiketi, kaydırırken gidilecek anının tarihini gösterir
  function previewDate(dir) {
    if (previewDir === dir || !slides.cur) return;
    previewDir = dir;
    var n = lbItems.length;
    var tag = slides.cur.querySelector('.polaroid-date');
    var text = polaroidInfo(dir ? (currentIndex + dir + n) % n : currentIndex).date;
    tag.textContent = text;
    tag.hidden = !text;
    tag.classList.toggle('is-preview', dir !== 0);
    if (text && !reduced() && tag.animate) {
      tag.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 160, easing: EASE });
    }
  }

  // Parmak/fare ile sürüklerken: üstteki kart döner ve kayar, alttaki belirir
  function dragSwipe(dx) {
    var cur = slides.cur;
    var W = viewport.clientWidth || 1;
    if (lbItems.length < 2) { animateSlide(cur, 'translate3d(' + (dx * 0.3) + 'px,0,0)', 1, 0); return; }
    var dir = dx < 0 ? 1 : -1;
    var target = neighborSlide(dir);
    var other = neighborSlide(-dir);
    var p = clamp(Math.abs(dx) / (W * 0.5), 0, 1);

    if (other !== target) animateSlide(other, 'scale(' + BEHIND_SCALE + ')', 0, 0);
    if (reduced()) {
      // Hareketi azalt: kayma/dönme yok, sadece solarak değişim
      animateSlide(cur, 'none', 1 - p * 0.7, 0);
      animateSlide(target, 'none', p, 0);
    } else {
      cur.style.transformOrigin = '50% 100%';
      animateSlide(cur, 'translate3d(' + dx + 'px,0,0) rotate(' + (dx / W * SWIPE_ROT) + 'deg)', 1, 0);
      animateSlide(target, 'scale(' + (BEHIND_SCALE + (1 - BEHIND_SCALE) * p) + ')', Math.min(1, p * 1.6), 0);
    }
    previewDate(Math.abs(dx) > W * SWIPE_COMMIT ? dir : 0);
  }

  // Yetmediyse kart yerine yumuşakça döner
  function swipeBack() {
    var ms = reduced() ? FADE_MS : 320;
    if (slides.cur) animateSlide(slides.cur, 'none', 1, ms);
    [slides.prev, slides.next].forEach(function (s) {
      if (s) animateSlide(s, 'scale(' + BEHIND_SCALE + ')', 0, ms);
    });
    previewDate(0);
  }

  function commit(dir) {
    var n = lbItems.length;
    if (n < 2) { swipeBack(); return; }
    trackBusy = true;
    pauseLightboxVideos();
    var cur = slides.cur;
    var target = neighborSlide(dir);
    var other = neighborSlide(-dir);
    var W = viewport.clientWidth || 1;
    var done = function () { finishCommit(dir); };

    previewDate(dir);
    if (other !== target) animateSlide(other, 'scale(' + BEHIND_SCALE + ')', 0, 0);
    target.style.zIndex = '1';
    cur.style.zIndex = '2';

    if (reduced()) {
      animateSlide(cur, 'none', 0, FADE_MS, 'ease-out');
      animateSlide(target, 'none', 1, FADE_MS, 'ease-out', done);
    } else {
      cur.style.transformOrigin = '50% 100%';
      animateSlide(cur, 'translate3d(' + (-dir * W * 1.3) + 'px,' + (W * 0.06) + 'px,0) rotate(' + (-dir * SWIPE_ROT * 1.7) + 'deg)', 1, 360, FLY_EASE);
      animateSlide(target, 'none', 1, 360, EASE, done);
    }
  }

  // Atılan kart arkaya alınır (yeni komşu olur), öne gelen kart mevcut olur,
  // öbür tarafa yeni bir komşu kart eklenir.
  function finishCommit(dir) {
    if (!lightboxOpen) return;
    var n = lbItems.length;
    var old = slides.cur;
    var target = neighborSlide(dir);
    var other = neighborSlide(-dir);
    currentIndex = (currentIndex + dir + n) % n;

    if (other && other !== target) other.remove();
    var oldCard = old.querySelector('.lb-media');
    if (oldCard) { oldCard.style.transition = 'none'; oldCard.style.transform = ''; }
    fillPolaroidText(old);

    var fresh = buildSlide(dir > 0 ? (currentIndex + 1) % n : (currentIndex - 1 + n) % n);
    track.insertBefore(fresh, track.firstChild);
    fitPolaroid(fresh);
    if (dir > 0) slides = { prev: old, cur: target, next: fresh };
    else slides = { prev: fresh, cur: target, next: old };

    layoutSlides();
    fillPolaroidText(slides.cur);
    zoom = { s: 1, x: 0, y: 0 };
    setZoomedClass(false);
    updateLightboxMeta();
    trackBusy = false;
    playCurrentVideo();
  }

  function navigate(dir) {
    if (!lightboxOpen || trackBusy || lbItems.length < 2 || lbDetail.isBusy()) return;
    resetZoom(false);
    commit(dir);
  }

  /* ---- Tek parmak / fare sürükleme ---- */

  function beginDrag(x, y) {
    gesture = {
      mode: 'pending', sx: x, sy: y, lx: x, ly: y,
      ox: zoom.x, oy: zoom.y,
      px: x, py: y, pt: performance.now(), vx: 0, vy: 0, moved: false
    };
  }

  function moveDrag(x, y) {
    var g = gesture;
    if (!g) return;
    var now = performance.now();
    var dx = x - g.sx, dy = y - g.sy;

    if (now > g.pt) {
      g.vx = 0.8 * ((x - g.px) / (now - g.pt)) + 0.2 * g.vx;
      g.vy = 0.8 * ((y - g.py) / (now - g.pt)) + 0.2 * g.vy;
      g.px = x;
      g.py = y;
      g.pt = now;
    }
    g.lx = x;
    g.ly = y;

    if (g.mode === 'pending') {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      g.moved = true;
      if (zoom.s > 1.01) g.mode = 'pan';
      else if (Math.abs(dx) > Math.abs(dy)) g.mode = lbDetail.isBusy() ? 'idle' : 'swipe';
      else if (lbDetail.isBusy()) g.mode = 'idle';
      else {
        // Dikey kaydırma: yukarı → not paneli açılır, aşağı → kapanır (parmağı takip eder)
        g.mode = 'vswipe';
        g.sheetFrom = sheetOpen ? 1 : 0;
        g.sheetH = prepareSheet();
      }
    }

    if (g.mode === 'vswipe') {
      setSheetProgress(clamp(g.sheetFrom - dy / g.sheetH, 0, 1));
      return;
    }

    if (g.mode === 'pan') {
      var b = panBounds(zoom.s);
      zoom.x = rubber(g.ox + dx, b.minX, b.maxX);
      zoom.y = rubber(g.oy + dy, b.minY, b.maxY);
      applyZoom(false);
    } else if (g.mode === 'swipe') {
      dragSwipe(dx); // kart parmağı 1:1 takip eder (tek öğe varsa dirençli)
    }
  }

  function endDrag(kind, target) {
    var g = gesture;
    gesture = null;
    if (!g) return;

    if (g.mode === 'vswipe') {
      var vy = performance.now() - g.pt > 100 ? 0 : g.vy;
      var open = vy < -0.4 ? true : vy > 0.4 ? false : sheetP > (g.sheetFrom ? 0.65 : 0.35);
      setSheet(open, true);
    } else if (g.mode === 'pan') {
      clampPan();
      applyZoom(true);
    } else if (g.mode === 'swipe') {
      var dx = g.lx - g.sx;
      var vx = performance.now() - g.pt > 100 ? 0 : g.vx; // parmak durduysa hız sıfır
      var width = viewport.clientWidth;
      var flick = Math.abs(vx) > 0.45 && (vx < 0) === (dx < 0) && Math.abs(dx) > 24;
      if (lbItems.length > 1 && (Math.abs(dx) > width * SWIPE_COMMIT || flick)) {
        commit(dx < 0 ? 1 : -1);
      } else {
        swipeBack(); // yetmediyse yerine yumuşakça dön
      }
    } else if (g.mode === 'pending' && kind === 'touch') {
      handleTap(g.lx, g.ly, target);
    }
  }

  function closeLightboxIfOpen() {
    if (activeDialog && activeDialog.el === lightbox) closeDialog();
  }

  // Dokunma: tek dokunuş boş alanda kapatır, çift dokunuş yakınlaştırır
  function handleTap(x, y, target) {
    var now = Date.now();
    if (sheetOpen && !lbDetail.isBusy()) { setSheet(false, true); return; } // not açıksa önce onu kapat
    if (now - lastTap.t < 320 && Math.hypot(x - lastTap.x, y - lastTap.y) < 40) {
      lastTap.t = 0;
      clearTimeout(pendingClose);
      toggleZoomAt(x, y);
      return;
    }
    lastTap = { t: now, x: x, y: y };
    if (zoom.s <= 1.01 && target && !target.closest('.lb-media')) {
      clearTimeout(pendingClose);
      pendingClose = setTimeout(closeLightboxIfOpen, 320); // çift dokunuşa fırsat ver
    }
  }

  function videoAt(target) {
    return target && target.closest ? target.closest('.lb-video') : null;
  }

  // Dokunuş ses aç/kapa ikonunda mı? (orada kaydırma/kapatma jesti başlamasın)
  function onMuteButton(target) {
    return !!(target && target.closest && target.closest('.lb-mute'));
  }

  /* ---- İki parmak (pinch) ---- */

  function touchDistance(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

  function startPinch(a, b) {
    clearTimeout(pendingClose);
    if (gesture && gesture.mode === 'swipe') swipeBack();
    if (!canZoom()) { gesture = { mode: 'idle', moved: true }; return; }
    var c = mediaCenter();
    var mx = (a.clientX + b.clientX) / 2 - c.x;
    var my = (a.clientY + b.clientY) / 2 - c.y;
    gesture = {
      mode: 'pinch', moved: true,
      d0: Math.max(touchDistance(a, b), 1), s0: zoom.s, x0: zoom.x, y0: zoom.y,
      m0x: mx, m0y: my, cx: c.x, cy: c.y
    };
    focal.x = mx;
    focal.y = my;
  }

  function movePinch(a, b) {
    var g = gesture;
    var mx = (a.clientX + b.clientX) / 2 - g.cx;
    var my = (a.clientY + b.clientY) / 2 - g.cy;
    var s = clamp(g.s0 * touchDistance(a, b) / g.d0, 0.5, MAX_SCALE * 1.5);
    // Parmakların arasındaki nokta parmakları takip etsin
    zoom.x = mx - (g.m0x - g.x0) * s / g.s0;
    zoom.y = my - (g.m0y - g.y0) * s / g.s0;
    zoom.s = s;
    focal.x = mx;
    focal.y = my;
    applyZoom(false);
  }

  /* ---- Dokunmatik olaylar ---- */

  viewport.addEventListener('touchstart', function (e) {
    lastTouchTime = Date.now();
    if (trackBusy) return;
    clearTimeout(pendingClose);
    if (e.touches.length === 1 && onMuteButton(e.target)) {
      // Ses ikonuna dokunuluyor: butonun kendi tıklamasına bırak
      videoTouch = true;
      gesture = null;
      return;
    }
    videoTouch = false;
    if (e.touches.length >= 2) {
      startPinch(e.touches[0], e.touches[1]);
    } else if (e.touches.length === 1) {
      beginDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  viewport.addEventListener('touchmove', function (e) {
    lastTouchTime = Date.now();
    if (videoTouch) return;
    e.preventDefault(); // sayfanın kaymasını / tarayıcı zoom'unu engelle
    if (!gesture) return;
    if (gesture.mode === 'pinch') {
      if (e.touches.length >= 2) movePinch(e.touches[0], e.touches[1]);
    } else if (e.touches.length === 1) {
      moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: false });

  viewport.addEventListener('touchend', function (e) {
    lastTouchTime = Date.now();
    if (videoTouch) {
      if (e.touches.length === 0) videoTouch = false;
      return;
    }
    if (!gesture) return;

    if (gesture.mode === 'pinch') {
      if (e.touches.length >= 2) { startPinch(e.touches[0], e.touches[1]); return; }
      if (e.touches.length === 1) {
        // Bir parmak kaldıysa sürüklemeye devam
        if (zoom.s < 1 || zoom.s > MAX_SCALE) settleZoom();
        var t = e.touches[0];
        beginDrag(t.clientX, t.clientY);
        gesture.mode = zoom.s > 1.01 ? 'pan' : 'idle';
        gesture.moved = true;
        return;
      }
      gesture = null;
      settleZoom();
      return;
    }

    if (e.touches.length > 0) return;
    var touch = e.changedTouches[0];
    var target = touch && touch.target;

    if (e.cancelable) e.preventDefault(); // dokunuştan sonra sahte "click" üretilmesin
    endDrag('touch', target);
  }, { passive: false });

  viewport.addEventListener('touchcancel', function () {
    var g = gesture;
    gesture = null;
    videoTouch = false;
    if (!g) return;
    if (g.mode === 'swipe') swipeBack();
    else settleZoom();
  });

  /* ---- Fare ---- */

  function isFromTouch() { return Date.now() - lastTouchTime < 800; }

  function onMouseMove(e) { moveDrag(e.clientX, e.clientY); }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    viewport.classList.remove('is-dragging');
    if (gesture && gesture.moved) suppressClick = true;
    endDrag('mouse');
  }

  viewport.addEventListener('mousedown', function (e) {
    if (e.button !== 0 || isFromTouch() || trackBusy) return;
    if (onMuteButton(e.target)) return; // ses ikonu: normal tıklama
    e.preventDefault(); // metin seçimi / resim sürükleme olmasın
    suppressClick = false;
    beginDrag(e.clientX, e.clientY);
    viewport.classList.add('is-dragging');
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });

  // Boş alana tek tıklama kapatır (çift tıklamaya fırsat vermek için kısa gecikmeyle)
  viewport.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }
    if (isFromTouch() || e.detail > 1) return;
    if (sheetOpen) { if (!lbDetail.isBusy()) setSheet(false, true); return; }
    if (zoom.s <= 1.01 && !e.target.closest('.lb-media')) {
      clearTimeout(pendingClose);
      pendingClose = setTimeout(closeLightboxIfOpen, 250);
    }
  });

  viewport.addEventListener('dblclick', function (e) {
    if (isFromTouch() || videoAt(e.target)) return;
    e.preventDefault();
    clearTimeout(pendingClose);
    toggleZoomAt(e.clientX, e.clientY);
  });

  // Tekerlek veya Ctrl+tekerlek (dokunmatik yüzey pinch'i) ile zoom
  viewport.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (trackBusy || !canZoom()) return;
    var delta = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientHeight : 1);
    var factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.002));
    zoomAround(zoom.s * factor, e.clientX, e.clientY);
    applyZoom(false);
  }, { passive: false });

  // macOS Safari dokunmatik yüzey pinch'i (iOS'ta touch olayları zaten yönetiyor)
  var gestureStartScale = 1;
  lightbox.addEventListener('gesturestart', function (e) {
    e.preventDefault();
    gestureStartScale = zoom.s;
  });
  lightbox.addEventListener('gesturechange', function (e) {
    e.preventDefault();
    if (isFromTouch() || !canZoom()) return;
    var c = viewportCenter();
    var x = isFinite(e.clientX) ? e.clientX : c.x;
    var y = isFinite(e.clientY) ? e.clientY : c.y;
    zoomAround(gestureStartScale * e.scale, x, y);
    applyZoom(false);
  });
  lightbox.addEventListener('gestureend', function (e) { e.preventDefault(); });

  /* ---- Klavye ---- */

  function handleLightboxKey(e) {
    var c;
    // Odak videodaysa oklar videoda ileri/geri sarar
    if (document.activeElement && document.activeElement.tagName === 'VIDEO' && /^Arrow/.test(e.key)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); navigate(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); navigate(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSheet(true, true); }      // notu göster
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSheet(false, true); }   // sade görünüme dön
    else if (!canZoom()) return;
    else if (e.key === '+' || e.key === '=') {
      c = viewportCenter(); zoomAround(zoom.s * 1.5, c.x, c.y); applyZoom(true);
    } else if (e.key === '-' || e.key === '_') {
      c = viewportCenter(); zoomAround(zoom.s / 1.5, c.x, c.y); applyZoom(true);
    } else if (e.key === '0') {
      resetZoom(true);
    }
  }

  /* ---- Açılış / kapanış animasyonu (önizlemeden büyüme) ---- */

  function lightboxChrome() {
    return [lightboxBg, lightboxTopbar, lightboxPrev, lightboxNext, lbSheet];
  }

  function lightboxAnimateOpen(thumbEl) {
    var media = currentMedia();
    lightbox.style.opacity = '0'; // fotoğrafın oranı (çerçeve boyutu) belli olana kadar
    whenMediaReady(media && media.querySelector('img, video'), function () {
      lightbox.style.opacity = '';
      if (!lightboxOpen) return;

      if (reduced()) {
        anim(lightbox, lightbox, [{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
        return;
      }

      lightboxChrome().forEach(function (el) {
        anim(lightbox, el, [{ opacity: 0 }, { opacity: 1 }], { duration: FLIP_MS, easing: EASE });
      });

      if (lbMode === 'timeline') {
        // Çizelge: polaroid yukarıdan hafifçe dönerek masaya düşer (galeride küçük resimden büyür)
        anim(lightbox, media, [
          { opacity: 0, transform: 'translateY(-70px) rotate(-7deg) scale(0.94)' },
          { opacity: 1, offset: 0.55 },
          { opacity: 1, transform: 'translateY(0) rotate(0deg) scale(1)' }
        ], { duration: 520, easing: 'cubic-bezier(0.34, 1.35, 0.64, 1)' });
        return;
      }

      var from = visibleRect(thumbEl);
      if (from && media.getBoundingClientRect().width > 0) {
        hideThumb(lightbox, thumbEl);
        var a = anim(lightbox, media, flipFrames(media, from, radiusOf(thumbEl), radiusOf(media) + 'px'), { duration: FLIP_MS, easing: EASE });
        onAllFinished([a], function () { showThumb(lightbox); });
      } else {
        anim(lightbox, media, [{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'scale(1)' }], { duration: FLIP_MS, easing: EASE });
      }
    });
  }

  function lightboxAnimateClose(done) {
    var media = currentMedia();
    lightbox.style.opacity = '';

    if (reduced() || !media) {
      onAllFinished([anim(lightbox, lightbox, [{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' })], done);
      return;
    }

    // Zoom ve kaydırmayı anında sıfırla, sonra o anki öğenin önizlemesine küçül
    media.style.transition = 'none';
    media.style.transform = '';
    layoutSlides();

    var thumbEl = thumbOf(lbItems[currentIndex]);
    var to = lbMode === 'timeline' ? null : visibleRect(thumbEl); // çizelgede küçülmek yerine aşağı kayıp solar
    var opts = { duration: FLIP_MS, easing: EASE_IN_OUT, fill: 'forwards' };
    var anims = lightboxChrome().map(function (el) {
      return anim(lightbox, el, [{ opacity: 1 }, { opacity: 0 }], opts);
    });

    if (to && media.getBoundingClientRect().width > 0) {
      hideThumb(lightbox, thumbEl);
      anims.push(anim(lightbox, media, flipFrames(media, to, radiusOf(thumbEl), radiusOf(media) + 'px').reverse(), opts));
    } else {
      anims.push(anim(lightbox, media, lbMode === 'timeline'
        ? [{ opacity: 1, transform: 'translateY(0) rotate(0deg)' }, { opacity: 0, transform: 'translateY(60px) rotate(4deg) scale(0.96)' }]
        : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.92)' }], opts));
    }
    onAllFinished(anims, done);
  }

  /* ---- Not paneli (yukarı kaydır / "Notu Gör"): tam not + düzenle / sil ---- */

  // Galeri öğesine karşılık gelen anı (örnek fotoğraflarda sadece başlık var)
  function entryForGalleryItem(item) {
    var id = item && item.dataset.memoryId;
    var entry = id ? findEntry('m-' + id) : null;
    return entry || { key: 'gallery-sample', memoryId: null, title: (item && item.dataset.caption) || '', desc: '', dateText: '' };
  }

  // Panel kapalıyken ne kadar aşağıda duruyor (kendi yüksekliği + alt boşluk)
  function sheetDistance() {
    var bottom = parseFloat(getComputedStyle(lbSheet).bottom) || 0;
    return lbSheet.offsetHeight + bottom + 12;
  }

  // Sürükleme başlarken paneli görünür yap (kapalı konumda) ve mesafeyi döndür
  function prepareSheet() {
    if (lbSheet.hidden) {
      lbSheet.hidden = false;
      animateTransform(lbSheet, 'translate3d(0,' + sheetDistance() + 'px,0)', 0);
    }
    return sheetDistance();
  }

  function setSheetProgress(p) {
    sheetP = p;
    animateTransform(lbSheet, 'translate3d(0,' + ((1 - p) * sheetDistance()) + 'px,0)', 0);
  }

  function setSheet(open, animate, force) {
    if (!open && lbDetail.isBusy() && !force) return; // düzenlerken kayarak kapanmasın
    prepareSheet();
    sheetOpen = open;
    sheetP = open ? 1 : 0;
    lightbox.classList.toggle('sheet-open', open);
    lbNotesBtn.setAttribute('aria-expanded', String(open));
    lbNotesLabel.textContent = open ? 'Notu Kapat' : 'Notu Gör';
    if (!open && lbSheet.contains(document.activeElement)) lbNotesBtn.focus();
    animateTransform(lbSheet, 'translate3d(0,' + (open ? 0 : sheetDistance()) + 'px,0)', animate ? dur(320) : 0, function () {
      if (!sheetOpen) lbSheet.hidden = true; // kapalıyken odak sırasından çıksın
    });
  }

  lbNotesBtn.addEventListener('click', function () { setSheet(!sheetOpen, true); });
  // Çöp kutusu: ayrıntı panelini doğrudan silme onayıyla aç
  lbDeleteBtn.addEventListener('click', function () {
    if (lbDetail.askDelete()) setSheet(true, true);
  });
  lbSheetHandle.addEventListener('click', function () { setSheet(false, true); });

  // Panelin üstünden aşağı çekince kapanır (içerik en üstteyse)
  var sheetTouch = null;
  lbSheet.addEventListener('touchstart', function (e) {
    sheetTouch = (e.touches.length === 1 && !isTyping(e.target) && !lbDetail.isBusy())
      ? { y: e.touches[0].clientY, h: sheetDistance(), active: false } : null;
  }, { passive: true });
  lbSheet.addEventListener('touchmove', function (e) {
    var st = sheetTouch;
    if (!st) return;
    var dy = e.touches[0].clientY - st.y;
    if (!st.active) {
      if (dy > 6 && lbSheetScroll.scrollTop <= 0) st.active = true;
      else if (Math.abs(dy) > 6) { sheetTouch = null; return; } // normal kaydırma
      else return;
    }
    if (e.cancelable) e.preventDefault();
    setSheetProgress(clamp(1 - dy / st.h, 0, 1));
  }, { passive: false });
  lbSheet.addEventListener('touchend', function () {
    var st = sheetTouch;
    sheetTouch = null;
    if (st && st.active) setSheet(sheetP > 0.6, true);
  });

  /* ---- Aç / kapat ---- */

  // Lightbox öğesinin sayfadaki küçük resmi (galeri karesi ya da çizelge etiketinin fotoğrafı)
  function thumbOf(item) {
    if (!item) return null;
    return typeof item.thumb === 'function' ? item.thumb() : item;
  }

  function openLightbox(index, opener, mode) {
    if (index < 0 || !lbItems.length) return;
    lbMode = mode === 'timeline' ? 'timeline' : 'gallery';
    lightbox.classList.toggle('lb--journal', lbMode === 'timeline');
    currentIndex = index;
    lightboxOpen = true;
    trackBusy = false;
    lbDetail.reset();
    setSheet(false, false, true); // her açılışta sade görünümle başla
    renderSlides();
    openDialog(lightbox, opener, {
      initialFocus: lightboxClose,
      animateOpen: function () { lightboxAnimateOpen(opener); },
      animateClose: lightboxAnimateClose,
      onClose: function () {
        // Kapatınca her şey temiz şekilde sıfırlansın
        lightboxOpen = false;
        gesture = null;
        videoTouch = false;
        trackBusy = false;
        suppressClick = false;
        clearTimeout(pendingClose);
        eachSlide(function (s) { clearTimeout(s._animTimer); s._animTimer = null; });
        zoom = { s: 1, x: 0, y: 0 };
        setZoomedClass(false);
        viewport.classList.remove('is-dragging');
        pauseLightboxVideos();
      }
    });
    playCurrentVideo(); // dokunma/tıklama anında başlat (sesli oynatma izni için)
  }

  galleryGrid.addEventListener('click', function (e) {
    var item = e.target.closest('.gallery-item');
    if (!item) return;
    refreshGalleryItems();
    lbItems = galleryItems;
    openLightbox(galleryItems.indexOf(item), item, 'gallery');
  });

  lightboxClose.addEventListener('click', function () { closeDialog(); });
  lightboxPrev.addEventListener('click', function () { navigate(-1); });
  lightboxNext.addEventListener('click', function () { navigate(1); });

  window.addEventListener('resize', function () {
    if (!lightboxOpen) return;
    eachSlide(fitPolaroid); // ekran döndü / boyut değişti: çerçeveleri yeniden sığdır
    resetZoom(false);
  });

  refreshGalleryItems();

  /* =========================================================
     7. Zaman çizelgesi — anı penceresi
     ========================================================= */
  var timelineList = document.getElementById('timelineList');
  var memoryModal = document.getElementById('memoryModal');
  var memoryBackdrop = memoryModal.querySelector('.memory-backdrop');
  var memorySheet = memoryModal.querySelector('.memory-sheet');
  var memoryClose = document.getElementById('memoryModalClose');
  var memoryScroll = document.getElementById('memoryModalScroll');
  var memoryMedia = document.getElementById('memoryModalMedia');

  function memoryAnimateOpen(thumbEl) {
    if (reduced()) {
      anim(memoryModal, memoryModal, [{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
      return;
    }
    anim(memoryModal, memoryBackdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: FLIP_MS, easing: EASE });

    var from = visibleRect(thumbEl);
    if (from) {
      // Önizleme, pencerenin üstündeki fotoğraf alanına büyür; kart da onunla açılır
      var sr = memorySheet.getBoundingClientRect();
      var mr = memoryMedia.getBoundingClientRect();
      var region = coverRegion(mr.left - sr.left, mr.top - sr.top, mr.width, mr.height, from.width / from.height);
      hideThumb(memoryModal, thumbEl);
      var a = anim(memoryModal, memorySheet,
        flipFrames(memorySheet, from, radiusOf(thumbEl), getComputedStyle(memorySheet).borderRadius, region),
        { duration: FLIP_MS + 20, easing: EASE });
      onAllFinished([a], function () { showThumb(memoryModal); });
    } else {
      anim(memoryModal, memorySheet, [{ opacity: 0, transform: 'translateY(32px)' }, { opacity: 1, transform: 'none' }], { duration: FLIP_MS, easing: EASE });
    }
  }

  function memoryAnimateClose(thumbEl, done) {
    if (reduced()) {
      onAllFinished([anim(memoryModal, memoryModal, [{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' })], done);
      return;
    }
    var opts = { duration: FLIP_MS, easing: EASE_IN_OUT, fill: 'forwards' };
    var anims = [anim(memoryModal, memoryBackdrop, [{ opacity: 1 }, { opacity: 0 }], opts)];
    var to = visibleRect(thumbEl);
    if (to) {
      memoryScroll.scrollTop = 0;
      var sr = memorySheet.getBoundingClientRect();
      var mr = memoryMedia.getBoundingClientRect();
      var region = coverRegion(mr.left - sr.left, mr.top - sr.top, mr.width, mr.height, to.width / to.height);
      hideThumb(memoryModal, thumbEl);
      anims.push(anim(memoryModal, memorySheet,
        flipFrames(memorySheet, to, radiusOf(thumbEl), getComputedStyle(memorySheet).borderRadius, region).reverse(), opts));
    } else {
      anims.push(anim(memoryModal, memorySheet, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(32px)' }], opts));
    }
    onAllFinished(anims, done);
  }

  function openMemory(entry, opener, opts) {
    opts = opts || {};
    var media = entry.media;
    memoryMedia.innerHTML = '';
    memoryMedia.classList.toggle('has-media', !!(media && media.src));

    if (media && media.src && media.type === 'video') {
      var v = document.createElement('video');
      v.src = media.src;
      v.controls = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.preload = 'metadata';
      v.setAttribute('aria-label', entry.title);
      memoryMedia.appendChild(v);
    } else if (media && media.src) {
      var big = document.createElement('img');
      big.src = media.src;
      big.alt = entry.title;
      memoryMedia.appendChild(big);
    } else {
      memoryMedia.innerHTML = HEART_SVG;
    }

    memDetail.show(entry);
    memoryScroll.scrollTop = 0;

    openDialog(memoryModal, opener, {
      initialFocus: memoryClose,
      animateOpen: function () { memoryAnimateOpen(opener); },
      animateClose: function (done) { memoryAnimateClose(opener, done); },
      onClose: function () {
        exitFullscreenWithin(memoryMedia);
        toArray(memoryMedia.querySelectorAll('video')).forEach(function (vid) { vid.pause(); });
        memDetail.reset();
        // Düzenleme dönemi değiştirdiyse çizelgeyi kapanış animasyonundan sonra yenile
        if (timelineDirty) setTimeout(flushTimeline, dur(FLIP_MS) + 80);
      }
    });

    var vid = memoryMedia.querySelector('video');
    if (vid) { var p = vid.play(); if (p && p.catch) p.catch(noop); }

    // "Notu Gör": açılış animasyonu bitince not kısmına yumuşakça kaydır
    if (opts.toNote) {
      setTimeout(function () {
        if (!activeDialog || activeDialog.el !== memoryModal) return;
        var top = memoryScroll.scrollTop + document.getElementById('memoryDetail').getBoundingClientRect().top - memoryScroll.getBoundingClientRect().top;
        if (memoryScroll.scrollTo) memoryScroll.scrollTo({ top: top, behavior: reduced() ? 'auto' : 'smooth' });
        else memoryScroll.scrollTop = top;
      }, dur(FLIP_MS) + 60);
    }
  }

  // Anı penceresindeki ayrıntı (düzenle / sil dahil)
  var memDetail = createDetail(document.getElementById('memoryDetail'), {
    onSaved: afterMemoryChanged,
    onDeleted: function (entry) {
      closeDialog(true);
      removeMemoryFromUI(entry);
    }
  });

  function detailFor(el) {
    return el === lightbox ? lbDetail : el === memoryModal ? memDetail : null;
  }

  memoryClose.addEventListener('click', function () { closeDialog(); });

  // Kartın dışına tıklayınca kapat
  memoryModal.addEventListener('click', function (e) {
    if (e.target === memoryModal || e.target === memoryBackdrop) closeDialog();
  });

  /* =========================================================
     8. Zaman çizelgesi — kesintisiz akış (Haftalık / Aylık / Yıllık)
        - Tüm dönemler tek listede, en yeniden en eskiye; serbestçe kaydırılır
          (otomatik dönem atlama yok)
        - Normal sayfa kaydırması (iç kaydırma kutusu ve kenar tarih çubuğu yok);
          üstte sabit duran başlık, kaydırdıkça o an bakılan dönemi gösterir
        - Boş dönemler gösterilmez (bulunduğumuz dönem hariç)
     ========================================================= */
  var siteHeaderEl = document.getElementById('siteHeader');
  var timelineEmpty = document.getElementById('timelineEmpty');
  var periodLabelEl = document.getElementById('periodLabel');
  var periodCountEl = document.getElementById('periodCount');
  var modeButtons = toArray(document.querySelectorAll('.segmented-btn[data-mode]'));

  var tlPendingKey = null; // cetvel sayfası kapalıyken gidilmesi istenen dönem (sayfa açılınca)

  var tlEntries = [];     // tüm anılar (örnekler + Supabase)
  var tlMode = 'month';
  var tlKey = null;       // şu an bakılan dönem
  var tlPeriods = [];     // listedeki dönemler (yeniden eskiye)
  var periodEls = {};     // dönem anahtarı → listedeki bölüm
  var entryOrder = 0;

  /* ---- Tarih / dönem hesapları ---- */

  function parseDateValue(v) {
    if (!v) return null;
    var p = String(v).split('-').map(Number);
    if (!p[0]) return null;
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }

  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function weekStart(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // pazartesi
    return x;
  }

  function periodKeyOf(d, mode) {
    if (mode === 'year') return String(d.getFullYear());
    if (mode === 'month') return d.getFullYear() + '-' + pad(d.getMonth() + 1);
    return ymd(weekStart(d));
  }

  function periodLabel(key, mode) {
    var d = parseDateValue(key);
    if (mode === 'year') return String(d.getFullYear());
    if (mode === 'month') return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
    var e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 6);
    if (d.getFullYear() !== e.getFullYear()) {
      return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' ' + d.getFullYear() + ' – ' + e.getDate() + ' ' + MONTHS_SHORT[e.getMonth()] + ' ' + e.getFullYear();
    }
    if (d.getMonth() !== e.getMonth()) {
      return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()] + ' – ' + e.getDate() + ' ' + MONTHS_SHORT[e.getMonth()] + ' ' + e.getFullYear();
    }
    return d.getDate() + '–' + e.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + e.getFullYear();
  }

  function currentKey() { return periodKeyOf(new Date(), tlMode); }

  function computePeriods() {
    var set = {};
    set[currentKey()] = true;
    tlEntries.forEach(function (e) {
      if (!e.isEnd && e.date) set[periodKeyOf(e.date, tlMode)] = true;
    });
    tlPeriods = Object.keys(set).sort().reverse();
  }

  function entriesIn(key) {
    return tlEntries
      .filter(function (e) { return !e.isEnd && e.date && periodKeyOf(e.date, tlMode) === key; })
      .sort(function (a, b) { return (b.date - a.date) || (b.order - a.order); });
  }

  /* ---- Veriler ---- */

  function parseSeed() {
    var tpl = document.getElementById('timelineSeed');
    if (!tpl) return;
    toArray(tpl.content.querySelectorAll('.timeline-item')).forEach(function (li, i) {
      tlEntries.push({
        key: 'seed-' + i,
        memoryId: null,
        title: li.querySelector('.timeline-title').textContent.trim(),
        desc: li.querySelector('.timeline-desc').textContent.trim(),
        dateText: li.querySelector('.timeline-date').textContent.trim(),
        date: parseDateValue(li.dataset.date),
        isEnd: li.hasAttribute('data-timeline-end'),
        media: null,
        order: entryOrder++
      });
    });
  }

  // Supabase satırından zaman çizelgesi kaydı
  function entryFromRow(row) {
    var created = row.created_at ? new Date(row.created_at) : new Date();
    var createdDay = new Date(created.getFullYear(), created.getMonth(), created.getDate());
    return {
      key: 'm-' + row.id,
      memoryId: row.id,
      title: row.title,
      desc: row.note || '',
      dateValue: row.date || null,   // düzenleme formu için ham tarih (YYYY-AA-GG)
      dateText: formatDate(row.date),
      // Tarihi girilmemiş anı, eklendiği güne göre sıralanır
      date: parseDateValue(row.date) || createdDay,
      createdDay: createdDay,
      isEnd: false,
      media: row.media || null,
      photoPath: row.photo_url || null,  // silerken Storage'dan da kaldırmak için
      videoPath: row.video_url || null,
      order: entryOrder++
    };
  }

  function findEntry(key) {
    for (var i = 0; i < tlEntries.length; i++) if (tlEntries[i].key === key) return tlEntries[i];
    return null;
  }

  /* ---- Çizim ---- */

  function buildTimelineItem(entry) {
    var li = document.createElement('li');
    li.className = 'timeline-item';
    li.dataset.entryKey = entry.key;
    if (entry.memoryId) li.dataset.memoryId = entry.memoryId;
    if (entry.isEnd) li.setAttribute('data-timeline-end', '');
    // Minimal etiket: küçük fotoğraf + başlık + tarih (not metni gösterilmez).
    // Dokununca polaroid tam ekran görünümü açılır.
    li.innerHTML =
      '<div class="timeline-dot"></div>' +
      '<button type="button" class="timeline-card tl-tag">' +
        '<span class="timeline-media">' + thumbHTML(entry.media) + '</span>' +
        '<span class="tl-text"><span class="timeline-title"></span><span class="timeline-date"></span></span>' +
        '<svg class="tl-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>' +
      '</button>';
    li.querySelector('.timeline-date').textContent = entry.dateText;
    li.querySelector('.timeline-title').textContent = entry.title;
    var isVideo = entry.media && entry.media.type === 'video';
    li.querySelector('.tl-tag').setAttribute('aria-label', entry.title + ', ' + entry.dateText + (isVideo ? ' — videoyu aç' : ' — anıyı aç'));
    return li;
  }

  function buildList(items) {
    var ol = document.createElement('ol');
    ol.className = 'timeline';
    items.forEach(function (e) { ol.appendChild(buildTimelineItem(e)); });
    return ol;
  }

  // Bir dönemin bölümü: başlık (ör. "Ekim 2026 · 3 anı") + anılar
  function buildPeriod(key, items, endEntry) {
    var wrap = document.createElement('div');
    wrap.className = 'timeline-period';
    wrap.dataset.period = key;

    var head = document.createElement('p');
    head.className = 'timeline-period-title';
    head.setAttribute('role', 'heading');
    head.setAttribute('aria-level', '3');
    var name = document.createElement('span');
    name.textContent = periodLabel(key, tlMode);
    head.appendChild(name);
    if (items.length) {
      var count = document.createElement('span');
      count.className = 'timeline-period-count';
      count.textContent = items.length + ' anı';
      head.appendChild(count);
    }
    wrap.appendChild(head);

    if (tlMode === 'year') {
      // Yıllıkta aylara bölünür (en yeni ay üstte)
      var byMonth = {}, months = [];
      items.forEach(function (e) {
        var m = e.date.getMonth();
        if (!byMonth[m]) { byMonth[m] = []; months.push(m); }
        byMonth[m].push(e);
      });
      if (endEntry) {
        var nowMonth = new Date().getMonth();
        if (!byMonth[nowMonth]) { byMonth[nowMonth] = []; months.push(nowMonth); }
        byMonth[nowMonth].unshift(endEntry);
      }
      months.sort(function (a, b) { return b - a; }).forEach(function (m) {
        var sub = document.createElement('p');
        sub.className = 'timeline-month';
        sub.textContent = MONTHS[m];
        wrap.appendChild(sub);
        wrap.appendChild(buildList(byMonth[m]));
      });
    } else {
      wrap.appendChild(buildList((endEntry ? [endEntry] : []).concat(items)));
    }
    return wrap;
  }

  function renderTimeline() {
    computePeriods();
    var nowKey = currentKey();
    var endEntry = null;
    tlEntries.forEach(function (e) { if (e.isEnd) endEntry = e; });

    unobservePreviews(timelineList);
    timelineList.innerHTML = '';
    periodEls = {};
    headingKey = null; // başlık yeniden yazılsın (görünüm ya da anı sayısı değişmiş olabilir)
    tlPeriods = tlPeriods.filter(function (key) {
      var items = entriesIn(key);
      var end = key === nowKey ? endEntry : null;
      if (!items.length && !end) return false;
      periodEls[key] = buildPeriod(key, items, end);
      timelineList.appendChild(periodEls[key]);
      return true;
    });
    timelineEmpty.hidden = tlPeriods.length > 0;

    if (tlPeriods.indexOf(tlKey) === -1) tlKey = tlPeriods[0] || null;
    syncToScroll();
    observePreviews(timelineList);
  }

  /* ---- Kaydırma: o an bakılan dönemi bul (normal sayfa kaydırması) ---- */

  function timelineVisible() { return currentPage === 'ani-cetveli'; }
  var tlScroller = document.getElementById('ani-cetveli');   // cetvel sayfası kendi içinde kayar

  // Üstte sabit duran başlık + araç çubuğunun alt kenarı (ekran koordinatı)
  function stickyBottom() {
    var bar = document.querySelector('.timeline-toolbar');
    return bar ? bar.getBoundingClientRect().bottom : 0;
  }

  // Bakılan dönem: başlığı, sabit araç çubuğunun biraz altındaki "okuma çizgisini" geçmiş son dönem
  function scrollPosition() {
    var n = tlPeriods.length;
    if (!n) return 0;
    var s = tlScroller;
    var nearBottom = s.clientHeight + s.scrollTop >= s.scrollHeight - 4;
    if (nearBottom && s.scrollTop > 0) return n - 1;
    var line = stickyBottom() + 60;
    var idx = 0;
    for (var i = 0; i < n; i++) {
      if (periodEls[tlPeriods[i]].getBoundingClientRect().top <= line) idx = i; else break;
    }
    return idx;
  }

  var headingKey = null;   // başlıkta şu an yazan dönem (görünüm değişince sıfırlanır)

  function showPeriodHeading(key) {
    headingKey = key;
    periodLabelEl.textContent = key ? periodLabel(key, tlMode) : '';
    var count = key ? entriesIn(key).length : 0;
    periodCountEl.textContent = count ? count + ' anı' : '';
  }

  // Başlığı kaydırma konumuna eşitle (sayfa kapalıyken en yeni dönem)
  function syncToScroll() {
    var idx = timelineVisible() ? scrollPosition() : 0;
    tlKey = tlPeriods[idx] || null;
    if (tlKey !== headingKey) showPeriodHeading(tlKey);
  }

  var scrollRaf = 0;
  tlScroller.addEventListener('scroll', function () {
    if (scrollRaf || !timelineVisible()) return;
    scrollRaf = requestAnimationFrame(function () { scrollRaf = 0; syncToScroll(); });
  }, { passive: true });

  // Bir dönemin başına git (sabit başlığın altına gelecek şekilde).
  // Cetvel sayfası kapalıysa, sayfa açılınca gidilir.
  function scrollToPeriod(key, smooth) {
    if (!timelineVisible()) { tlPendingKey = key; return; }
    var el = periodEls[key];
    if (!el) return;
    var top = tlScroller.scrollTop + el.getBoundingClientRect().top - stickyBottom() - 10;
    tlScroller.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduced() ? 'smooth' : 'instant' });
  }

  function scrollTimelineToTop() {
    if (!timelineVisible()) { tlPendingKey = null; return; }
    var panel = document.getElementById('timelinePanel');
    var top = tlScroller.scrollTop + panel.getBoundingClientRect().top - (siteHeaderEl ? siteHeaderEl.offsetHeight : 0) - 12;
    if (tlScroller.scrollTop > top) tlScroller.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
  }

  // Bakılan tarih: dönemin en yeni anısı (yoksa dönemin kendisi)
  function anchorDate() {
    if (!tlKey) return new Date();
    var shown = entriesIn(tlKey);
    if (shown.length) return shown[0].date;
    return tlKey === currentKey() ? new Date() : parseDateValue(tlKey);
  }

  /* ---- Haftalık / Aylık / Yıllık ---- */

  function setMode(mode) {
    if (mode === tlMode) return;
    // Şu an bakılan yeri koru (Aylık → Yıllık → Haftalık geçişlerinde aynı tarih)
    var anchor = anchorDate();
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });

    tlMode = mode;
    renderTimeline();
    var key = periodKeyOf(anchor, mode);
    if (!periodEls[key]) key = tlPeriods.filter(function (k) { return k <= key; })[0] || tlPeriods[tlPeriods.length - 1];
    if (key === tlPeriods[0]) scrollTimelineToTop(); else scrollToPeriod(key, false);
    syncToScroll();
    if (!reduced() && timelineList.animate) {
      timelineList.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    }
  }

  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });

  /* ---- Anı penceresini aç ---- */

  // Çizelgedeki anılar, lightbox'ın gezebileceği listeye (çizelgedeki sırayla)
  function timelineLbItems() {
    return toArray(timelineList.querySelectorAll('.timeline-item[data-entry-key]')).map(function (li) {
      var key = li.dataset.entryKey;
      var en = findEntry(key) || {};
      var media = en.media && en.media.src ? en.media : null;
      return {
        key: key,
        dataset: { mediaType: media ? media.type : '', mediaSrc: media ? media.src : '', mediaMirror: media && media.mirror ? '1' : '', caption: en.title || '', memoryId: en.memoryId || '' },
        // Kapanış animasyonu için etiketin küçük fotoğrafı (liste yeniden çizilmiş olabilir)
        thumb: function () { return timelineList.querySelector('.timeline-item[data-entry-key="' + key + '"] .timeline-media'); }
      };
    });
  }

  // Etikete dokununca: polaroid tam ekran görünümü (çizelgeye özgü "günlük" farklarıyla)
  timelineList.addEventListener('click', function (e) {
    var card = e.target.closest('.timeline-card');
    if (!card) return;
    var key = card.closest('.timeline-item').dataset.entryKey;
    lbItems = timelineLbItems();
    var index = -1;
    lbItems.forEach(function (it, i) { if (it.key === key) index = i; });
    openLightbox(index, card.querySelector('.timeline-media'), 'timeline');
  });

  // Listeyi yeniden çiz; kullanıcının baktığı yer (dönem + kaydırma payı) korunsun
  function rerenderKeepingPlace() {
    if (!timelineVisible()) { renderTimeline(); return; }
    var key = tlKey;
    var el = key && periodEls[key];
    var offset = el ? el.getBoundingClientRect().top : 0;
    renderTimeline();
    if (periodEls[key]) tlScroller.scrollBy({ top: periodEls[key].getBoundingClientRect().top - offset, behavior: 'instant' });
    syncToScroll();
  }

  // Bir anının dönemine kaydır (yeni eklenen / tarihi değişen anı görünsün)
  function revealEntryPeriod(entry) {
    var key = periodKeyOf(entry.date, tlMode);
    if (key === tlPeriods[0]) scrollTimelineToTop(); else scrollToPeriod(key, false);
    syncToScroll();
  }

  // Supabase anılarını zaman çizelgesine koy (örnekler kalır)
  function setTimelineMemories(rows) {
    tlEntries = tlEntries.filter(function (e) { return !e.memoryId; });
    rows.forEach(function (row) { tlEntries.push(entryFromRow(row)); });
    rerenderKeepingPlace();
  }

  function addTimelineMemory(row) {
    var entry = entryFromRow(row);
    tlEntries.push(entry);
    renderTimeline();
    revealEntryPeriod(entry); // yeni anının dönemine git
  }

  // Bir anı düzenlenince: galeri başlığı ve çizelgedeki kart güncellensin
  var timelineDirty = null;   // pencere kapanınca gösterilecek anı (tarihi değiştiyse)

  function flushTimeline() {
    if (!timelineDirty) return;
    var entry = timelineDirty;
    timelineDirty = null;
    renderTimeline();
    revealEntryPeriod(entry);
  }

  function afterMemoryChanged(entry) {
    var item = galleryGrid.querySelector('.gallery-item[data-memory-id="' + entry.memoryId + '"]');
    if (item) item.dataset.caption = entry.title;
    refreshGalleryItems();

    // Çizelgedeki kartı yerinde güncelle
    var li = timelineList.querySelector('.timeline-item[data-entry-key="' + entry.key + '"]');
    if (li) {
      li.querySelector('.timeline-title').textContent = entry.title;
      li.querySelector('.timeline-date').textContent = entry.dateText;
      li.querySelector('.tl-tag').setAttribute('aria-label', entry.title + ', ' + entry.dateText + ' — anıyı aç');
    }

    // Tarih başka döneme taşındıysa anı yeni yerine geçsin, liste oraya kaysın
    var period = li && li.closest('.timeline-period');
    if (!li || !period || period.dataset.period !== periodKeyOf(entry.date, tlMode)) {
      // Anı penceresi çizelgeden açıldıysa, kapanış animasyonu bitince yenile
      if (activeDialog && activeDialog.el === memoryModal) timelineDirty = entry;
      else { renderTimeline(); revealEntryPeriod(entry); }
    }
  }

  function removeMemoryFromUI(entry) {
    tlEntries = tlEntries.filter(function (e) { return e !== entry; });
    var item = galleryGrid.querySelector('.gallery-item[data-memory-id="' + entry.memoryId + '"]');
    if (item) { unobservePreviews(item); item.remove(); }
    refreshGalleryItems();
    rerenderKeepingPlace();
    toast(entry.fileRemoveFailed
      ? 'Anı silindi, ama fotoğrafı/videosu depodan silinemedi. supabase/fix-delete.sql dosyasını Supabase\'de bir kez çalıştır.'
      : 'Anı silindi.');
  }

  parseSeed();
  renderTimeline();

  // Cetvel sayfası görünür olunca tarih çubuğunu ölç ve kaydırma konumuna eşitle
  // Cetvel sayfası açılınca: bekleyen döneme git, başlığı kaydırma konumuna eşitle
  pageShownHooks.push(function (id) {
    if (id !== 'ani-cetveli') return;
    if (tlPendingKey) { var k = tlPendingKey; tlPendingKey = null; scrollToPeriod(k, false); }
    syncToScroll();
  });
  showPage(pageFromHash(), { instant: true });

  /* =========================================================
     9. Supabase — giriş (magic link) ve oturum
        Giriş yapılmadan uygulama içeriği gösterilmez. Asıl koruma
        Supabase'deki RLS kurallarıdır (supabase/schema.sql).
     ========================================================= */
  var sb = window.aniSupabase;
  var PHOTO_BUCKET = 'memory-photos';
  var VIDEO_BUCKET = 'memory-videos';
  var SIGNED_URL_TTL = 60 * 60;            // imzalı linkler 1 saat geçerli
  var MAX_PHOTO_BYTES = 15 * 1024 * 1024;  // bucket sınırlarıyla aynı
  var MAX_VIDEO_BYTES = 100 * 1024 * 1024;
  var MEMORY_COLUMNS = 'id, title, date, note, photo_url, video_url, created_at';
  var LEGACY_COLUMNS = 'id, title, date, note, photo_url, created_at';
  var videoColumnMissing = false;          // schema.sql henüz güncellenmediyse

  var rootEl = document.documentElement;
  var authForm = document.getElementById('authForm');
  var authEmail = document.getElementById('authEmail');
  var authPassword = document.getElementById('authPassword');
  var authSubmit = document.getElementById('authSubmit');
  var authLede = document.getElementById('authLede');
  var authModeSwitch = document.getElementById('authModeSwitch');
  var authStatus = document.getElementById('authStatus');
  var MIN_PASSWORD = 6;
  var authMode = 'signin'; // 'signin' (giriş) ya da 'signup' (ilk kez hesap oluşturma)
  var signOutBtn = document.getElementById('signOutBtn');

  var form = document.getElementById('memoryForm');
  var formStatus = document.getElementById('formStatus');

  var currentUser = null;
  var checkingUserId = null;
  var pendingAuthMessage = '';
  var loadToken = 0;
  var lastLoadedAt = 0;

  function setAuthState(state) { rootEl.setAttribute('data-auth', state); }

  /* ---- Açılış sahnesi (pixel art) ----
     Uygulama her açıldığında oynar; bu sırada oturum kontrol edilir, anılar çekilir
     ve fotoğraflar arka planda tamamen yüklenir (decode). Sahne:
       1) Zeynep durakta oturuyor  2) Efe yürüyerek gelir, Zeynep kalkar
       3) Efe sırtında sakladığı pembe laleyi uzatır
       4) Zeynep alır: yanaklar pembe, başının üstünde atan kalp
       5) Birlikte yürüyüp uzaklaşırlar  6) Kamera gökyüzüne kayar,
          "Dijital Albümüne Hoş Geldin"  7) İçerik hazırsa uygulama açılır
     Atlanamaz: dokunma ya da tuş sahneyi kesmez, kendi akışıyla oynayıp biter
     (yanlışlıkla dokunulunca kesilmesin). Hareketi azalt: sadece "Hoş Geldin" yazısı solarak belirir.
     Sahne 160×128'lik (ekran oranına göre genişleyen) küçük bir tuvale çizilir,
     CSS ile keskin pikselli büyütülür: hafif ve hızlı. */
  var splash = document.getElementById('splash');
  var introCanvas = document.getElementById('introCanvas');
  var introCtx = introCanvas && introCanvas.getContext ? introCanvas.getContext('2d') : null;
  var SPLASH_MAX_MS = 12000;   // içerik en fazla bu kadar beklenir (yavaş ağ)
  var INTRO_TITLE_AT = 7.0;    // saniye: "Hoş Geldin" belirir
  var INTRO_END = 7.6;         // saniye: sahne biter
  var INTRO_HOLD = 0.9;        // yazı en az bu kadar görünsün
  var SCENE_W = 160, SCENE_H = 128;
  var iW = SCENE_W, iH = SCENE_H, iOX = 0, iOY = 0;
  var introRaf = 0, introStart = 0, introTimer = null, introToken = 0;
  var introAnimDone = true, introContentReady = true, introVisible = false;

  var PAL = {
    skyTop: '#EFD3DA', skyMid: '#E6E1EF', sky: '#DCE6EE', cloud: '#F7F4F6', sparkle: '#FFFFFF',
    walk: '#D8D4CC', walkLine: '#C7C2B8', curb: '#B3AEA5', road: '#8F9399', roadLine: '#E9E4D8',
    roof: '#4F5761', frame: '#6B737D', glass: 'rgba(214, 228, 236, 0.78)', bench: '#7A5C44', signBlue: '#3E78AD', white: '#FFFFFF',
    wallA: '#EADFC9', wallB: '#E3C6C0', wallC: '#D6D3CD', trim: '#B9AE9C', roofLine: '#8C7F6E', win: '#A7BBC6', winFrame: '#F6F2EA', door: '#5B4636',
    awningA: '#F4EEE6', awningB: '#D99AA6', cafeSign: '#6E5444', cup: '#F6F2EA',
    atm: '#8C949C', atmDark: '#5E666E', atmScreen: '#7FB6DE', bankBand: '#3E5E86',
    cartRed: '#C2554A', cartDark: '#8E3B33', cartGlass: 'rgba(240, 240, 236, 0.85)', simit: '#B5793F', wheel: '#3A3A3A',
    crate: '#9C7652', bucket: '#9AA3AB', leaf: '#5C9E57', fl1: '#EE8FB0', fl2: '#F2C94C', fl3: '#E2574C', fl4: '#FFFFFF',
    sea: '#A9C2CE', seaHi: '#C9DAE2', shore: '#BAC4CC', ferry: '#F2F0EA', ferryDark: '#5A6470', gull: '#6D6D6D', stone: '#BDB5A6',
    skin: '#F1C7A5', eye: '#2B2B2B', blush: '#F29BAA', mouth: '#B85A6A',
    tulip: '#EE8FB0', tulipDark: '#D46A92', stem: '#5C9E57', heart: '#E57A95'
  };
  var EFE = { legH: 11, torsoH: 10, hair: '#8A5A3B', hairLong: false, top: '#1E1E1E', topDark: '#3B3B3B', sleeve: 3, pants: '#3D5F95', shoes: '#FFFFFF', shoeEdge: '#C9C9C9' };
  var ZEYNEP = { legH: 8, torsoH: 7, hair: '#E8C872', hairLong: true, top: '#EFE3CC', topDark: '#DDCDAF', pants: '#222226', shoes: '#FFFFFF', shoeEdge: '#C9C9C9', eye: '#1F2E22' };
  var HEART_PX = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

  function cpx(x, y, w, h, col) { introCtx.fillStyle = col; introCtx.fillRect(Math.round(x), Math.round(y), w, h); }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }
  function easeInOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function lerp(a, b, p) { return a + (b - a) * p; }

  function drawPattern(rows, x, y, col) {
    introCtx.fillStyle = col;
    rows.forEach(function (row, j) {
      for (var i = 0; i < row.length; i++) if (row[i] === 'X') introCtx.fillRect(Math.round(x + i), Math.round(y + j), 1, 1);
    });
  }

  // Lale: sap normalden uzun (elde tutulduğu için); (x, y) sapın alt ucu
  function drawTulip(x, y) {
    x = Math.round(x); y = Math.round(y);
    cpx(x, y - 11, 1, 11, PAL.stem);
    cpx(x + 1, y - 6, 2, 1, PAL.stem);
    cpx(x + 2, y - 7, 1, 1, PAL.stem);
    cpx(x - 1, y - 15, 4, 3, PAL.tulip);
    cpx(x - 1, y - 15, 1, 3, PAL.tulipDark);
    cpx(x - 1, y - 16, 1, 1, PAL.tulip);
    cpx(x + 2, y - 16, 1, 1, PAL.tulip);
    cpx(x, y - 12, 2, 1, PAL.tulipDark);
  }

  // Önden görünüşlü sevimli karakter. pose: { walk: 0|1|2, sit, look (-1|0|1), arm ('down'|'fwd'|'hidden'), dir (1 sağ, -1 sol), blush, smile }
  // Ölçüler karaktere göre: bodyW (gövde genişliği, vars. 8), headS (kafa, vars. 8), legW (bacak kalınlığı, vars. 3).
  // Efe varsayılan ölçülerle çizilir; Zeynep her yönden orantılı olarak daha küçük.
  function drawPerson(P, x, fy, pose) {
    x = Math.round(x); fy = Math.round(fy);
    var bw = P.bodyW || 8, hs = P.headS || 8, lw = P.legW || 3;
    var rightLeg = x + bw - lw;
    var top, hipY;
    if (pose.sit) {
      hipY = 94;
      cpx(x, hipY - 1, bw, 3, P.pants);
      cpx(x, hipY + 2, lw, fy - hipY - 4, P.pants);
      cpx(rightLeg, hipY + 2, lw, fy - hipY - 4, P.pants);
      cpx(x, fy - 2, lw, 2, P.shoes); cpx(rightLeg, fy - 2, lw, 2, P.shoes);
      cpx(x, fy - 1, lw, 1, P.shoeEdge); cpx(rightLeg, fy - 1, lw, 1, P.shoeEdge);
    } else {
      hipY = fy - P.legH;
      var l = pose.walk === 1 ? 1 : 0, r = pose.walk === 2 ? 1 : 0;
      cpx(x, hipY, lw, P.legH - 2 - l, P.pants);
      cpx(rightLeg, hipY, lw, P.legH - 2 - r, P.pants);
      cpx(x - l, fy - 2 - l, lw, 2, P.shoes); cpx(rightLeg + r, fy - 2 - r, lw, 2, P.shoes);
      cpx(x - l, fy - 1 - l, lw, 1, P.shoeEdge); cpx(rightLeg + r, fy - 1 - r, lw, 1, P.shoeEdge);
      cpx(x + lw, hipY, bw - 2 * lw, 2, P.pants);
    }
    top = hipY - P.torsoH;
    cpx(x - 1, top, bw + 2, P.torsoH, P.top);
    if (P === EFE) { cpx(x + 2, top, 2, 1, P.topDark); cpx(x + 4, top, 2, 1, P.topDark); cpx(x + 4, top + 1, 1, 3, P.topDark); } // polo yaka
    else { cpx(x - 1, hipY - 1, bw + 2, 1, P.topDark); }                                                                     // kazak lastiği
    var d = pose.dir || 1;
    var fwdSide = d > 0 ? x + bw + 1 : x - 3;
    var backSide = d > 0 ? x - 3 : x + bw + 1;
    // Aşağı sarkan kol: uzun kolluysa bileğe kadar giysi + el; kısa kolluysa (P.sleeve) omuzda giysi, gerisi ten
    function armDown(ax) {
      if (P.sleeve) { cpx(ax, top + 1, 2, P.torsoH, PAL.skin); cpx(ax, top + 1, 2, P.sleeve, P.top); }
      else { cpx(ax, top + 1, 2, P.torsoH - 2, P.top); cpx(ax, top + P.torsoH - 1, 2, 2, PAL.skin); }
    }
    armDown(backSide + (d > 0 ? 1 : 0));
    if (pose.arm === 'fwd') {
      // öne uzatılmış kol (lale verirken)
      if (P.sleeve) {
        cpx(d > 0 ? x + bw + 1 : x - 7, top + 3, 7, 2, PAL.skin);
        cpx(d > 0 ? x + bw + 1 : x - 2, top + 3, 2, 2, P.top);
      } else {
        cpx(d > 0 ? x + bw + 1 : x - 5, top + 3, 5, 2, P.top);
        cpx(d > 0 ? x + bw + 6 : x - 7, top + 3, 2, 2, PAL.skin);
      }
    } else if (pose.arm !== 'hidden') {
      armDown(fwdSide + (d > 0 ? 0 : 1));
    }
    // Kafa: gövdenin ortasında
    var hx = x + Math.round((bw - hs) / 2);
    var hy = top - hs;
    cpx(hx, hy, hs, hs, PAL.skin);
    cpx(hx - 1, hy - 1, hs + 2, 3, P.hair);
    if (P.hairLong) { cpx(hx - 1, hy + 2, 2, hs + 1, P.hair); cpx(hx + hs - 1, hy + 2, 2, hs + 1, P.hair); }
    else { cpx(hx - 1, hy + 2, 1, 2, P.hair); cpx(hx + hs, hy + 2, 1, 2, P.hair); cpx(hx + 1, hy + 2, 2, 1, P.hair); }
    var lk = pose.look || 0;
    var e1, e2, ey;
    if (hs >= 8) { e1 = hx + 2 + lk; e2 = hx + 5 + lk; ey = hy + 4; }
    else {
      // küçük kafa: gözler yüzün içinde kalsın, arada en az bir piksel olsun
      e1 = hx + 1 + (lk > 0 ? 1 : 0);
      e2 = hx + hs - 2 + (lk < 0 ? -1 : 0);
      ey = hy + Math.floor(hs / 2);
    }
    cpx(e1, ey, 1, 1, P.eye || PAL.eye);
    cpx(e2, ey, 1, 1, P.eye || PAL.eye);
    if (pose.blush) {
      if (hs >= 8) { cpx(hx + 1, hy + 5, 1, 1, PAL.blush); cpx(hx + 6, hy + 5, 1, 1, PAL.blush); }
      else { cpx(e1, ey + 1, 1, 1, PAL.blush); cpx(e2, ey + 1, 1, 1, PAL.blush); }
    }
    if (pose.smile) { cpx(hx + hs / 2 - 1, hs >= 8 ? hy + 6 : ey + 2, 2, 1, PAL.mouth); }
    // El: uzatılmışsa önde, değilse yanda (lale vücudun yanında, yüzü kapatmadan tutulur)
    var sideX = fwdSide + (d > 0 ? 0 : 1);
    return { hand: pose.arm === 'fwd' ? { x: d > 0 ? x + bw + 7 : x - 6, y: top + 3 } : { x: sideX + (d > 0 ? 1 : 0), y: top + P.torsoH - 1 }, headTop: hy - 1, cx: hx + hs / 2 };
  }

  // Bir-iki katlı eski tip bina cephesi (x'ten itibaren w genişlik, üst kenarı top)
  function drawBuilding(x, w, top, wall) {
    cpx(x, top, w, 100 - top, wall);
    cpx(x - 1, top - 2, w + 2, 2, PAL.roofLine);           // saçak
    cpx(x, top + 2, w, 1, PAL.trim);                        // korniş
    var floors = top < 60 ? 2 : 1;
    for (var f = 0; f < floors; f++) {
      var wy = top + 6 + f * 18;
      for (var wx = x + 4; wx + 6 <= x + w - 2; wx += 11) {
        cpx(wx - 1, wy - 1, 7, 10, PAL.winFrame);
        cpx(wx, wy, 5, 8, PAL.win);
        cpx(wx + 2, wy, 1, 8, PAL.winFrame);                // pencere kayıtı
      }
    }
  }

  // 3×5 piksel font: "BEŞİKTAŞ MEYDANI" tabelası için. Ş'nin çengeli bir alt,
  // İ'nin noktası bir üst satıra çizilir.
  var PIXEL_FONT = {
    B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'], E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'], S: ['.XX', 'X..', '.X.', '..X', 'XX.'],
    I: ['XXX', '.X.', '.X.', '.X.', 'XXX'], K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'], T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
    A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'], M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'], Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'],
    D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'], N: ['XX.', 'X.X', 'X.X', 'X.X', 'X.X']
  };

  function glyphOf(ch) { return PIXEL_FONT[ch === 'Ş' ? 'S' : ch === 'İ' ? 'I' : ch]; }

  function pixelTextWidth(text) {
    var w = 0;
    for (var i = 0; i < text.length; i++) { var g = glyphOf(text[i]); w += (g ? g[0].length : 3) + 1; }
    return w - 1;
  }

  function drawPixelText(text, x, y, col) {
    var cx = x;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], g = glyphOf(ch);
      if (g) drawPattern(g, cx, y, col);
      if (ch === 'Ş') cpx(cx + 1, y + 5, 1, 1, col);   // çengel
      if (ch === 'İ') cpx(cx + 1, y - 2, 1, 1, col);   // nokta
      cx += (g ? g[0].length : 3) + 1;
    }
  }

  // Durak çatısındaki isim levhası: "BEŞİKTAŞ / MEYDANI" (küçük, mavi zemin, beyaz yazı)
  function drawStopSign(cx, roofY) {
    var l1 = 'BEŞİKTAŞ', l2 = 'MEYDANI';
    var w = Math.max(pixelTextWidth(l1), pixelTextWidth(l2)) + 4, h = 16, x = cx - Math.floor(w / 2), y = roofY - h - 2;
    cpx(x + 3, y + h, 1, 2, PAL.frame); cpx(x + w - 4, y + h, 1, 2, PAL.frame);   // ayaklar
    cpx(x, y, w, h, '#4D6C93');                                                    // yumuşak mavi levha
    cpx(x, y + h - 1, w, 1, '#3B5577');
    drawPixelText(l1, x + Math.round((w - pixelTextWidth(l1)) / 2), y + 3, PAL.white);
    drawPixelText(l2, x + Math.round((w - pixelTextWidth(l2)) / 2), y + 10, PAL.white);
  }

  // Sahne yerleşimi (soldan sağa, 160 piksellik sahne genişliğinde):
  //   deniz + vapur + martılar (sol kenar) · kafe binası (önünde çiçekçi ve simitçi) ·
  //   bankamatikler · otobüs durağı (çatısında "Beşiktaş Meydanı" levhası) · binalar.
  //   Tek kaldırım (durağın olduğu taraf), altında sadece cadde.
  var SEA_END = 36;            // deniz bu x'e kadar (geniş ekranda sola doğru uzar)

  function drawBackground(t) {
    var skyTopY = -(iH + 150) - 10;
    var g = introCtx.createLinearGradient(0, skyTopY, 0, 66);
    g.addColorStop(0, PAL.skyTop); g.addColorStop(0.55, PAL.skyMid); g.addColorStop(1, PAL.sky);
    introCtx.fillStyle = g;
    introCtx.fillRect(-iOX, skyTopY, iW, 66 - skyTopY);
    // bulutlar ve parıltılar (kamera yukarı kayınca görünür; dikey ekranda sokağın üstünü de süsler)
    var span = iW + 40;
    [[0.1, 0.12, 20], [0.6, 0.28, 28], [0.3, 0.45, 16], [0.8, 0.6, 22], [0.15, 0.74, 18], [0.55, 0.88, 24], [0.9, 0.95, 14]].forEach(function (c, i) {
      var x = -iOX + ((c[0] * iW + t * (2 + i % 3)) % span) - 20;
      var y = skyTopY + c[1] * (40 - skyTopY);
      if (titleRows) {
        var endRow = y + iH + 150;                         // kamera gökyüzüne kaydıktan sonraki tuval satırı
        if (endRow > titleRows[0] - 3 && endRow < titleRows[1] + 2) {
          y += (endRow - titleRows[0] < titleRows[1] - endRow) ? titleRows[0] - 3 - endRow : titleRows[1] + 2 - endRow;
        }
      }
      cpx(x, y, c[2], 3, PAL.cloud); cpx(x + 4, y - 2, c[2] - 10, 2, PAL.cloud);
    });
    for (var s = 0; s < 18; s++) {
      if (Math.sin(t * 3 + s * 1.7) > 0.25) cpx(-iOX + (s * 41) % iW, skyTopY + 6 + (s * 29) % Math.max(20, iH + 100), 1, 1, PAL.sparkle);
    }

    // ---- deniz (sol): karşı kıyı, su, dalgalar, vapur, rıhtım ----
    var seaL = -iOX, seaW = SEA_END - seaL;
    for (var hx = seaL; hx < SEA_END; hx += 3) cpx(hx, 64 + Math.round(2 * Math.sin(hx / 9)), 3, 6, PAL.shore);
    cpx(seaL, 70, seaW, 30, PAL.sea);
    for (var wv = 0; wv < 8; wv++) {
      var wx = seaL + ((wv * 17 + t * (4 + wv % 3)) % Math.max(seaW, 10));
      cpx(wx, 73 + (wv % 4) * 6, 4, 1, PAL.seaHi);
    }
    // uzaktaki vapur: basit siluet, yavaşça süzülür
    var fRange = Math.max(seaW - 14, 4);
    var fx = seaL + 3 + (fRange / 2) * (1 + Math.sin(t * 0.3));
    cpx(fx, 74, 10, 1, PAL.ferryDark); cpx(fx + 1, 72, 8, 2, PAL.ferry); cpx(fx + 3, 71, 4, 1, PAL.ferry);
    cpx(fx + 5, 69, 1, 2, PAL.ferryDark);
    // martılar: denizin üstünde ve biraz da binaların üstünde
    [[0.2, 46, 0], [0.6, 40, 1.5], [0.9, 52, 3]].forEach(function (b, i) {
      var bx = seaL + ((b[0] * (seaW + 50) + t * (6 + i * 2)) % (seaW + 50)) - 6;
      var by = b[1] + Math.round(Math.sin(t * 3 + b[2]) * 1.5);
      var flap = Math.floor(t * 4 + i) % 2;
      cpx(bx, by + flap, 2, 1, PAL.gull); cpx(bx + 2, by + 1, 1, 1, PAL.gull); cpx(bx + 3, by + flap, 2, 1, PAL.gull);
    });
    // rıhtım kenarı + korkuluk
    cpx(seaL, 97, seaW, 3, PAL.stone);
    cpx(seaL, 91, seaW, 1, PAL.frame);
    for (var px = Math.ceil(seaL / 6) * 6; px < SEA_END; px += 6) cpx(px, 91, 1, 6, PAL.frame);

    // ---- binalar ----
    // durağın arkası ve sağı (geniş ekranda sağa doğru tekrarlanır)
    var walls = [PAL.wallC, PAL.wallB, PAL.wallA];
    var tops = [52, 40, 56];
    for (var bx2 = 106, k = 0; bx2 < iW - iOX; bx2 += 40, k++) drawBuilding(bx2, 40, tops[k % 3], walls[k % 3]);
    // kafe binası (iki katlı, zemin katta kafe)
    drawBuilding(SEA_END, 50, 38, PAL.wallA);
    var cx0 = SEA_END;
    cpx(cx0, 74, 50, 26, PAL.wallB);
    for (var a = 0; a < 50; a += 6) { cpx(cx0 + a, 70, 3, 5, PAL.awningA); cpx(cx0 + a + 3, 70, 3, 5, PAL.awningB); } // çizgili tente
    for (var a2 = 0; a2 < 50; a2 += 3) cpx(cx0 + a2, 75, 2, 1, PAL.awningB);
    cpx(cx0 + 4, 79, 16, 14, PAL.win); cpx(cx0 + 4, 79, 16, 1, PAL.winFrame); cpx(cx0 + 12, 79, 1, 14, PAL.winFrame);
    cpx(cx0 + 23, 80, 9, 20, PAL.door); cpx(cx0 + 30, 90, 1, 1, PAL.cup);
    cpx(cx0 + 33, 79, 14, 14, PAL.win); cpx(cx0 + 33, 79, 14, 1, PAL.winFrame); cpx(cx0 + 40, 79, 1, 14, PAL.winFrame);
    cpx(cx0 + 14, 62, 22, 6, PAL.cafeSign); cpx(cx0 + 23, 63, 4, 3, PAL.cup); cpx(cx0 + 27, 64, 1, 1, PAL.cup); // tabelada fincan
    // banka: iki bankamatik (durağın solunda)
    cpx(86, 70, 20, 30, PAL.wallC);
    cpx(86, 70, 20, 4, PAL.bankBand); cpx(89, 71, 14, 1, PAL.white);
    [88, 97].forEach(function (ax) {
      cpx(ax, 79, 7, 21, PAL.atm); cpx(ax, 79, 7, 1, PAL.atmDark);
      cpx(ax + 1, 81, 5, 4, PAL.atmScreen);
      cpx(ax + 1, 87, 5, 3, PAL.atmDark);
      cpx(ax + 2, 92, 3, 1, PAL.atmDark);
    });
    // otobüs durağı gölgeliği
    cpx(108, 60, 50, 4, PAL.roof);
    cpx(110, 64, 46, 30, PAL.glass);
    cpx(110, 64, 1, 36, PAL.frame); cpx(155, 64, 1, 36, PAL.frame); cpx(110, 64, 46, 1, PAL.frame);
    cpx(114, 92, 38, 2, PAL.bench); cpx(116, 94, 2, 6, PAL.bench); cpx(148, 94, 2, 6, PAL.bench);
    drawStopSign(133, 60);

    // ---- tek kaldırım + cadde (dikey ekranda geniş bir bulvar gibi aşağı uzar) ----
    var bottom = (iHD || iH) - iOY + 4;
    cpx(-iOX, 100, iW, 9, PAL.walk);
    for (var w = Math.floor(-iOX / 16) * 16; w < iW - iOX; w += 16) cpx(w, 100, 1, 9, PAL.walkLine);
    cpx(-iOX, 109, iW, 2, PAL.curb);
    cpx(-iOX, 111, iW, Math.max(17, bottom - 111), PAL.road);
    for (var ly = 123; ly < bottom - 4; ly += 22) {
      for (var m = Math.floor(-iOX / 24) * 24; m < iW - iOX; m += 24) cpx(m + 4, ly, 12, 1, PAL.roadLine);
    }

    // ---- çiçekçi (kafenin önünde, solda) ----
    cpx(38, 93, 17, 8, PAL.crate); cpx(38, 96, 17, 1, PAL.door);
    [[40, PAL.fl1], [44, PAL.fl2], [48, PAL.fl3], [52, PAL.fl4]].forEach(function (f, i) {
      cpx(f[0] - 1, 88, 4, 5, PAL.bucket);
      cpx(f[0], 84, 1, 4, PAL.leaf); cpx(f[0] + 2, 85, 1, 3, PAL.leaf);
      cpx(f[0] - 1, 82 + (i % 2), 2, 2, f[1]); cpx(f[0] + 1, 83 - (i % 2), 2, 2, f[1]);
    });
    // ---- simitçi arabası (kafenin önünde, sağda) ----
    var sx = 59;
    cpx(sx, 90, 22, 8, PAL.cartRed); cpx(sx, 97, 22, 1, PAL.cartDark);
    cpx(sx + 2, 80, 18, 10, PAL.cartGlass); cpx(sx + 2, 80, 18, 1, PAL.cartDark); cpx(sx + 2, 80, 1, 10, PAL.cartDark); cpx(sx + 19, 80, 1, 10, PAL.cartDark);
    [[4, 83], [9, 83], [14, 83], [6, 86], [11, 86]].forEach(function (p) {     // simitler (halka)
      var x = sx + p[0], y = p[1];
      cpx(x, y, 3, 1, PAL.simit); cpx(x, y + 2, 3, 1, PAL.simit); cpx(x, y + 1, 1, 1, PAL.simit); cpx(x + 2, y + 1, 1, 1, PAL.simit);
    });
    cpx(sx + 22, 88, 4, 1, PAL.cartDark);
    cpx(sx + 5, 98, 4, 4, PAL.wheel); cpx(sx + 15, 98, 4, 4, PAL.wheel);
  }

  /* ---- Çentik / durum çubuğu bölgesi: tuvalin üst kenarındaki gökyüzü rengiyle doldurulur.
     Aynı renk html/body zeminine ve theme-color'a da verilir (Safari üst çubuğu, beyaz yanıp sönme yok). */
  var themeMetas = Array.prototype.slice.call(document.querySelectorAll('meta[name="theme-color"]'));
  // data-orig: <head>'deki betik açılışta gökyüzü rengine çevirdiyse asıl değer orada
  var themeOriginal = themeMetas.map(function (m) { return m.getAttribute('data-orig') || m.getAttribute('content'); });
  var skyEdgeColor = '';

  function hexMix(a, b, k) {
    var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), out = '#';
    [16, 8, 0].forEach(function (s) {
      var v = Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * k);
      out += (v < 16 ? '0' : '') + v.toString(16);
    });
    return out;
  }

  // drawBackground'daki gökyüzü degradesinin verilen sahne y'sindeki rengi
  function skyColorAt(y) {
    var top = -(iH + 150) - 10;
    var k = Math.max(0, Math.min(1, (y - top) / (66 - top)));
    return k < 0.55 ? hexMix(PAL.skyTop, PAL.skyMid, k / 0.55) : hexMix(PAL.skyMid, PAL.sky, (k - 0.55) / 0.45);
  }

  function setSkyEdge(col) {
    if (col === skyEdgeColor) return;
    skyEdgeColor = col;
    splash.style.backgroundColor = col;
    document.documentElement.style.backgroundColor = col;
    document.body.style.backgroundColor = col;
    themeMetas.forEach(function (m) { m.setAttribute('content', col); });
  }

  function paintSkyEdge(sceneY) { setSkyEdge(skyColorAt(sceneY)); }

  function clearSkyEdge() {
    skyEdgeColor = '';
    splash.style.backgroundColor = '';
    document.documentElement.style.backgroundColor = '';
    document.body.style.backgroundColor = '';
    themeMetas.forEach(function (m, i) { m.setAttribute('content', themeOriginal[i]); });
  }

  function drawIntro(t) {
    var c = introCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, iW, iHD || iH);
    var cam = (iH - iOY + 150) * easeInOut(seg(t, 6.0, 7.4)); // kamera gökyüzüne kayar (sokak tamamen aşağıda kalır)
    c.translate(iOX, iOY + Math.round(cam));
    drawBackground(t);
    paintSkyEdge(-(iOY + Math.round(cam)));

    var FOOT = 104, ZX = 128, EX = 111;
    var outDist = iW - iOX - EX + 24;                       // ekranın sağından çıkana kadar
    var together = seg(t, 5.0, 6.8);
    var efeX = lerp(-iOX - 16, EX, easeOut(seg(t, 0.4, 2.4))) + together * outDist;
    var zX = ZX + together * outDist;
    var walking = (t > 0.4 && t < 2.3) || (t > 5.0 && t < 6.8);
    var stepFrame = walking ? 1 + (Math.floor(t * 7) % 2) : 0;
    var hasTulip = t >= 3.7, offering = t >= 2.9 && t < 3.7, happy = t >= 3.7;

    var zPose = {
      sit: t < 2.0, look: t > 0.8 && t < 5.0 ? -1 : (t >= 5.0 ? 1 : 0), dir: t >= 5.0 ? 1 : -1,
      walk: (t > 5.0 && t < 6.8) ? 1 + ((Math.floor(t * 7) + 1) % 2) : 0,
      arm: t >= 3.3 && t < 3.7 ? 'fwd' : 'down', blush: happy, smile: happy
    };
    var z = drawPerson(ZEYNEP, zX, FOOT, zPose);

    if (t < 2.9) drawTulip(efeX - 1, FOOT - EFE.legH + 3);  // sırtında saklı: sadece ucu görünür
    var e = drawPerson(EFE, efeX, FOOT, { walk: stepFrame, look: 1, dir: 1, arm: offering ? 'fwd' : (t < 2.9 ? 'hidden' : 'down') });

    if (offering) {
      var p = easeInOut(seg(t, 3.3, 3.7));
      drawTulip(lerp(e.hand.x, z.hand.x, p), lerp(e.hand.y, z.hand.y, p) + 1);
    } else if (hasTulip) {
      drawTulip(z.hand.x, z.hand.y + 1);
    }

    var heartIn = seg(t, 3.75, 4.1), heartOut = 1 - seg(t, 5.6, 6.2);
    if (heartIn > 0 && heartOut > 0) {
      var s = (1 + 0.25 * Math.max(0, Math.sin((t - 3.75) * 7))) * heartIn * heartOut;
      c.save();
      c.translate(z.cx, z.headTop - 6);
      c.scale(s, s);
      drawPattern(HEART_PX, -3.5, -3, PAL.heart);
      c.restore();
    }
  }

  // Tuvali ekran oranına göre boyutlandır: dikeyde üstte daha çok gökyüzü,
  // yatayda iki yana uzayan sokak. Sahne her zaman alt-ortada durur.
  var introSizedW = 0;   // sahne en son hangi ekran genişliğine göre boyutlandı
  var iHD = 0;           // tuvalin çizilen yüksekliği (iH + ekran uzarsa görünecek pay)
  var titleRows = null;  // yazının tuvaldeki satır aralığı
  function sizeIntro() {
    if (!introCtx) return;
    // yükseklik: çentiğin altındaki alan (sahne, durum çubuğu ayarından bağımsız aynı kalır)
    introCanvas.style.height = '';
    var w = window.innerWidth || 390, h = introCanvas.clientHeight || window.innerHeight || 844;
    introSizedW = w;
    var aspect = w / h;
    if (aspect < SCENE_W / SCENE_H) { iW = SCENE_W; iH = Math.min(420, Math.round(SCENE_W / aspect)); }
    else { iH = SCENE_H; iW = Math.min(480, Math.round(SCENE_H * aspect)); }
    iOX = Math.round((iW - SCENE_W) / 2);
    iOY = Math.round((iH - SCENE_H) * 0.72);               // dikeyde sokak alt kısımda, altında sadece cadde
    // Ekranın olabilecek en uzun hâli kadar tuval: fazlası aşağıda kalır (cadde)
    var sy = h / iH;
    var tallest = Math.max(h, (window.screen && Math.max(screen.height, screen.width)) || 0, window.innerHeight || 0, splash.clientHeight || 0);
    var extra = Math.ceil((tallest + 160 - h) / sy);   // +160: ekran beklenenden de uzarsa pay
    iHD = iH + extra;
    introCanvas.width = iW;
    introCanvas.height = iHD;
    introCanvas.style.height = Math.round(iHD * sy) + 'px';
    introCtx.imageSmoothingEnabled = false;

    // "Hoş Geldin" yazısının sahne sonunda kapladığı satırlar (bulutlar oraya düşmesin)
    var kick = splash.querySelector('.intro-kicker'), head = splash.querySelector('.intro-heading');
    var top0 = introCanvas.getBoundingClientRect().top;
    if (kick && head) {
      var a = kick.getBoundingClientRect().top - 12 - 16, b = head.getBoundingClientRect().bottom - 12 + 16; // -12: yazının giriş kayması
      titleRows = [(a - top0) / sy, (b - top0) / sy];
    } else titleRows = null;
  }

  function introFrame(now) {
    if (!introVisible) return;
    var t = (now - introStart) / 1000;
    drawIntro(Math.min(t, INTRO_END));
    if (t >= INTRO_TITLE_AT) splash.classList.add('show-title');
    if (t >= INTRO_END + INTRO_HOLD && !introAnimDone) { introAnimDone = true; maybeFinishIntro(); }
    if (t > INTRO_END + 30) introStart = now - INTRO_END * 1000; // sonda gökyüzü yaşamaya devam etsin
    introRaf = requestAnimationFrame(introFrame);
  }

  // Sahne bitti ve içerik hazırsa uygulamaya geç; içerik hâlâ yükleniyorsa
  // "Hoş Geldin" ekranında küçük bir "hazırlanıyor" notuyla bekle
  function maybeFinishIntro() {
    if (!introVisible) return;
    splash.classList.toggle('is-waiting', introAnimDone && !introContentReady);
    if (introAnimDone && introContentReady) finishIntro();
  }

  function finishIntro() {
    var token = introToken;
    var fonts = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    Promise.race([fonts, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
      if (token !== introToken || !introVisible) return;
      introVisible = false;
      clearTimeout(introTimer);
      if (reduced() && splash.animate) {
        // CSS geçişleri "hareketi azalt"ta kapalı: kısa solmayı burada yap
        splash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: 'ease-out' });
        setTimeout(function () { if (token === introToken) { splash.classList.add('is-hidden'); cancelAnimationFrame(introRaf); } }, 340);
      } else {
        splash.classList.add('is-hidden');
        setTimeout(function () { if (token === introToken) cancelAnimationFrame(introRaf); }, 600);
      }
      // sayfa zemini hemen normale dönsün (splash solarken arkada uygulama görünür)
      document.documentElement.classList.remove('intro-boot');
      document.documentElement.style.backgroundColor = '';
      document.body.style.backgroundColor = '';
      themeMetas.forEach(function (m, i) { m.setAttribute('content', themeOriginal[i]); });
      setTimeout(function () { if (token === introToken && !introVisible) clearSkyEdge(); }, 650);
    });
  }

  // Sahneyi başlatır. Sahne ZATEN oynuyorsa baştan başlatmaz, sadece içeriğin hazır
  // olmasını bekler. (Hata: açılışta oturum kontrolü bitince — ağ hızına göre 0,5–2 sn
  // sonra — "giriş yapıldı" için tekrar çağrılıyor ve oynayan sahneyi başa sarıyordu.)
  function showSplash() {
    if (!splash) return;
    if (introVisible) { introContentReady = false; return; }
    introToken++;
    splash.dataset.runs = String((+splash.dataset.runs || 0) + 1); // kaç kez başlatıldı (test/teşhis)
    introVisible = true;
    introAnimDone = false;
    introContentReady = false;
    cancelAnimationFrame(introRaf);
    splash.classList.remove('is-hidden', 'show-title', 'is-waiting', 'is-reduced', 'is-pending');
    clearTimeout(introTimer);
    introTimer = setTimeout(function () { introContentReady = true; maybeFinishIntro(); }, SPLASH_MAX_MS);

    if (reduced() || !introCtx) {
      // Hareketi azalt: hareketli sahne yok, "Hoş Geldin" kısa bir solmayla belirir
      splash.classList.add('is-reduced', 'show-title');
      var title = splash.querySelector('.intro-title');
      if (title && title.animate) title.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 700, easing: 'ease-out' });
      var token = introToken;
      setTimeout(function () { if (token === introToken) { introAnimDone = true; maybeFinishIntro(); } }, 1400);
      return;
    }
    sizeIntro();
    introStart = performance.now();
    introRaf = requestAnimationFrame(introFrame);
  }

  // İçerik hazır (anılar + fotoğraflar yüklendi, ya da giriş ekranı gösterilecek)
  function hideSplash(now) {
    if (!splash) return;
    if (now === true && introVisible) { introAnimDone = true; introContentReady = true; finishIntro(); return; }
    if (!introVisible) {
      // Sahne başlamadı (oturum yok): bekleme zeminini kısa bir solmayla kaldır → giriş ekranı
      document.documentElement.classList.remove('intro-boot');
      if (splash.classList.contains('is-hidden')) return;
      if (reduced() && splash.animate) splash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out' });
      splash.classList.add('is-hidden');
      return;
    }
    introContentReady = true;
    maybeFinishIntro();
  }

  if (splash) {
    window.addEventListener('resize', function () {
      if (!introVisible || splash.classList.contains('is-reduced')) return;
      if (Math.abs((window.innerWidth || 0) - introSizedW) > 1) sizeIntro();
    });
  }

  // Bir fotoğraf indirilip çözülene ya da videonun ilk bilgileri gelene kadar bekle
  function mediaReady(el) {
    return new Promise(function (resolve) {
      var isImg = el.tagName === 'IMG';
      if (isImg ? el.complete : el.readyState >= 1) { resolve(); return; }
      var done = function () { resolve(); };
      el.addEventListener(isImg ? 'load' : 'loadedmetadata', done, { once: true });
      el.addEventListener('error', done, { once: true });
    }).then(function () {
      // decode: fotoğraf ekrana çizilmeye hazır olsun (önbellekte, çözülmüş)
      if (el.tagName === 'IMG' && el.naturalWidth && el.decode) return el.decode().catch(noop);
    });
  }

  // Galeri ve zaman çizelgesindeki tüm fotoğraf/videoların hazır olmasını bekle
  function waitForMedia(maxMs) {
    var els = toArray(document.querySelectorAll('#galleryGrid img, #timelineList img, #galleryGrid video, #timelineList video'));
    return Promise.race([
      Promise.all(els.map(mediaReady)),
      new Promise(function (r) { setTimeout(r, maxMs); })
    ]);
  }

  // Açılışta sahne hemen BAŞLAMAZ: sade zemin (is-pending) görünürken oturum kontrol edilir.
  //  - oturum varsa  → handleSession sahneyi başlatır, içerik hazır olunca uygulama açılır
  //  - oturum yoksa → showLogin bekleme zeminini kaldırır, giriş ekranı açılır;
  //                   giriş yapılınca handleSession sahneyi başlatır

  function columns() { return videoColumnMissing ? LEGACY_COLUMNS : MEMORY_COLUMNS; }

  function isMissingVideoColumn(err) {
    var msg = (err && (err.message || '')) + ' ' + (err && err.code || '');
    return /video_url/i.test(msg) && /(42703|PGRST204|does not exist|could not find)/i.test(msg);
  }

  function friendlyError(err, kind) {
    var msg = (err && (err.message || err.error_description || err.msg || err.error)) || String(err || '');
    var code = (err && (err.code || err.statusCode)) || '';
    if (/PGRST205|PGRST202|PGRST204|schema cache|Bucket not found|is_member|video_url/i.test(msg + ' ' + code)) {
      return 'Supabase kurulumu güncel değil: supabase/schema.sql dosyasını Supabase SQL Editor\'de (tekrar) çalıştır.';
    }
    if (msg === 'no-permission-update' || msg === 'no-permission-delete') {
      return msg === 'no-permission-delete'
        ? 'Supabase bu anıyı silmeye izin vermedi (veritabanında eski kurallar kalmış). supabase/fix-delete.sql dosyasını Supabase SQL Editor\'de bir kez çalıştır, sonra tekrar dene.'
        : 'Bu anıyı düzenleme izni yok. supabase/schema.sql dosyasını Supabase SQL Editor\'de tekrar çalıştır.';
    }
    // Giriş / hesap oluşturma hataları
    if (/invalid login credentials|invalid_credentials/i.test(msg + ' ' + code)) return 'E-posta ya da şifre hatalı.';
    if (/email not confirmed|email_not_confirmed/i.test(msg + ' ' + code)) {
      return 'Bu hesabın e-postası doğrulanmamış görünüyor. Supabase\'de "Confirm email" ayarını kapat; hesap bu ayar açıkken oluşturulduysa Authentication → Users\'tan silip yeniden oluştur.';
    }
    if (/already (been )?registered|user_already_exists/i.test(msg + ' ' + code)) return 'Bu e-posta ile zaten bir hesap var. "Giriş yap"ı kullan.';
    if (/weak_password|password should be|at least 6/i.test(msg + ' ' + code)) return 'Şifre en az ' + MIN_PASSWORD + ' karakter olmalı.';
    if (/signups? not allowed|signup_disabled/i.test(msg + ' ' + code)) return 'Yeni hesap açma kapalı. Hesabın varsa "Giriş yap"ı kullan.';
    if (/row-level security|violates|permission denied|unauthorized|403/i.test(msg)) return 'Bu hesabın bu işlem için izni yok.';
    var wait = msg.match(/after (\d+) seconds?/i);
    if (wait) return wait[1] + ' saniye bekleyip tekrar dene.';
    if (/rate limit|too many|security purposes/i.test(msg)) return 'Çok sık deneme yapıldı. Biraz bekleyip tekrar dene.';
    if (/failed to fetch|networkerror|network request|load failed/i.test(msg)) return 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.';
    if (/payload too large|exceeded the maximum|too large|413/i.test(msg + ' ' + code)) {
      return kind === 'video'
        ? 'Video çok büyük: Supabase projendeki dosya boyutu sınırı bu videoyu kabul etmiyor (ücretsiz planda en fazla 50 MB).'
        : 'Fotoğraf çok büyük (en fazla 15 MB).';
    }
    if (/mime|content type/i.test(msg)) {
      return kind === 'video'
        ? 'Bu video türü desteklenmiyor. MP4, MOV veya WEBM seç.'
        : 'Bu dosya türü desteklenmiyor. JPG, PNG, WEBP veya HEIC seç.';
    }
    return 'Bir sorun oldu: ' + msg;
  }

  // Giriş ↔ hesap oluşturma arasında geçiş (aynı alanlar, farklı metin)
  function setAuthMode(mode) {
    authMode = mode;
    var signup = mode === 'signup';
    authSubmit.textContent = signup ? 'Hesap oluştur' : 'Giriş yap';
    authLede.textContent = signup
      ? 'İlk kez giriyorsan e-postanı ve kendine bir şifre belirle; hesabın hemen açılır.'
      : 'Devam etmek için e-posta adresin ve şifrenle giriş yap.';
    authModeSwitch.textContent = signup ? 'Zaten hesabın var mı? Giriş yap' : 'İlk kez mi giriyorsun? Hesap oluştur';
    authPassword.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  }

  function resetAuthForm() {
    authPassword.value = '';
    setAuthMode('signin');
  }

  function showLogin(message) {
    currentUser = null;
    loadToken++;
    hideSplash(true);
    closeDialog(true);
    clearRenderedMemories();
    clearWords();
    if (form) form.reset();
    if (formStatus) formStatus.textContent = '';
    setAuthState('out');
    // Mesaj yoksa ekrandakini silme (çıkış olayı birden fazla kez gelebilir)
    var text = message || pendingAuthMessage;
    if (text) authStatus.textContent = text;
    pendingAuthMessage = '';
  }

  /* ---- Çevrimdışı: son çekilen veriler cihazda saklanır ----
     Anılar ve sözlük, her başarılı yüklemede localStorage'a yazılır (kullanıcıya bağlı).
     İnternet yokken bu son liste gösterilir; fotoğraflar sw.js önbelleğinden gelir,
     videolar yer tutucuyla gösterilir. Çıkış yapınca bu kayıtlar silinir. */
  var OFFLINE_PREFIX = 'dijital-album:offline:v1:';

  function isOffline() { return navigator.onLine === false; }

  function isNetworkError(err) {
    var msg = (err && (err.message || err.name || '')) + ' ' + String(err || '');
    return isOffline() || /failed to fetch|networkerror|network request|load failed|fetch failed|err_internet|offline/i.test(msg);
  }

  function saveOffline(name, data) {
    if (!currentUser) return;
    try { localStorage.setItem(OFFLINE_PREFIX + name, JSON.stringify({ uid: currentUser.id, at: Date.now(), data: data })); } catch (e) { /* yer yoksa sorun değil */ }
  }

  function loadOffline(name, uid) {
    try {
      var v = JSON.parse(localStorage.getItem(OFFLINE_PREFIX + name) || 'null');
      return v && v.uid === uid ? v.data : null;
    } catch (e) { return null; }
  }

  // Bu cihazda daha önce üyeliği doğrulanmış kullanıcı: internet yokken giriş ekranına atılmaz
  function rememberMember(uid) { try { localStorage.setItem(OFFLINE_PREFIX + 'member', uid); } catch (e) {} }
  function isRememberedMember(uid) { try { return localStorage.getItem(OFFLINE_PREFIX + 'member') === uid; } catch (e) { return false; } }

  function forgetOffline() {
    try {
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf(OFFLINE_PREFIX) === 0) localStorage.removeItem(k); });
    } catch (e) {}
  }

  /* ---- Bağlantı bildirimi ---- */
  // İki bildirim: bağlantı durumu SADECE ana sayfada, sayfa akışında (netInline);
  // internet gerektiren işlem uyarısı ise hangi sayfadaysa üstten kısa süreli (netBanner).
  var netBanner = document.getElementById('netBanner');
  var netText = document.getElementById('netText');
  var netInline = document.getElementById('netInline');
  var netInlineText = document.getElementById('netInlineText');
  var netTimer = null;
  var netInlineTimer = null;
  var NET_TEXT = {
    offline: 'Bağlantını kontrol et — kayıtlı anıların görüntüleniyor',
    action: 'İnternet yok — bu işlem için bağlantı gerekiyor, bağlanınca tekrar dene',
    online: 'Tekrar bağlandın'
  };

  function showNet(kind) {
    if (kind === 'action') {
      // işlem uyarısı: bulunduğu sayfada, üstten kısa süreli
      if (!netBanner) return;
      clearTimeout(netTimer);
      netBanner.dataset.kind = kind;
      netText.textContent = NET_TEXT[kind];
      netBanner.hidden = false;
      void netBanner.offsetWidth;
      netBanner.classList.add('is-shown');
      netTimer = setTimeout(hideNet, 3200);
      return;
    }
    // bağlantı durumu (offline / online): ana sayfanın en üstünde
    if (!netInline) return;
    clearTimeout(netInlineTimer);
    netInline.dataset.kind = kind;
    netInlineText.textContent = NET_TEXT[kind];
    netInline.hidden = false;
    void netInline.offsetWidth;
    netInline.classList.add('is-shown');
    if (kind === 'online') netInlineTimer = setTimeout(hideNetInline, 2200);
  }

  function hideNetInline() {
    if (!netInline) return;
    clearTimeout(netInlineTimer);
    netInline.classList.remove('is-shown');
    netInlineTimer = setTimeout(function () { netInline.hidden = true; }, 600);
  }

  function hideNet() {
    if (!netBanner) return;
    clearTimeout(netTimer);
    netBanner.classList.remove('is-shown');
    netTimer = setTimeout(function () { netBanner.hidden = true; }, 600);
  }

  // İnternet gerektiren işlemden önce: çevrimdışıysa nazik uyarı, işlem yapılmaz
  function requireOnline() {
    if (!isOffline()) return true;
    showNet('action');
    return false;
  }

  window.addEventListener('offline', function () { showNet('offline'); });
  window.addEventListener('online', function () {
    showNet('online');
    // veriler sessizce yenilensin (açılış ekranı olmadan)
    if (currentUser) { refreshMemories(); loadWords(); }
  });
  if (isOffline()) showNet('offline');

  // Önbellekte olmayan fotoğraf (çevrimdışı): kırık resim yerine yer tutucu
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    if (!img.closest('.gallery-media, .timeline-media, .polaroid-photo')) return;
    var ph = document.createElement('span');
    ph.className = 'media-missing';
    ph.innerHTML = HEART_SVG;
    img.replaceWith(ph);
  }, true);

  // Oturum değişince (açılış, giriş, çıkış, token yenileme) çağrılır
  function handleSession(session) {
    var user = session && session.user;
    if (!user) {
      // Zaten giriş ekranındaysak ekrandaki mesajı silme
      if (currentUser || rootEl.getAttribute('data-auth') !== 'out') showLogin();
      return;
    }
    if ((currentUser && currentUser.id === user.id) || checkingUserId === user.id) return;

    checkingUserId = user.id;
    showSplash(); // giriş yapıldı: anılar ve fotoğraflar hazır olana kadar yükleme ekranı
    sb.rpc('is_member').then(null, function (err) { return { data: null, error: err }; }).then(function (res) {
      checkingUserId = null;
      // İnternet yok ama bu cihazda daha önce doğrulanmış üye: giriş ekranına atma
      var offlineOk = !!res.error && isNetworkError(res.error) && isRememberedMember(user.id);
      if (!offlineOk && (res.error || res.data !== true)) {
        pendingAuthMessage = res.error
          ? friendlyError(res.error)
          : (user.email + ' adresinin Dijital Albüm\'e erişim izni yok.');
        return sb.auth.signOut({ scope: 'local' }).then(function () { showLogin(); });
      }
      currentUser = user;
      if (!offlineOk) rememberMember(user.id);
      signOutBtn.title = user.email + ' olarak giriş yapıldı';
      settingsEmail.textContent = user.email;
      authStatus.textContent = '';
      resetAuthForm();
      setAuthState('in');
      loadWords();
      refreshMemories()
        .then(function () { return waitForMedia(SPLASH_MAX_MS); })
        .then(hideSplash, hideSplash);
    });
  }

  if (!sb) {
    hideSplash();
    setAuthState('out');
    authStatus.textContent = 'Uygulama yapılandırılamadı. Sunucuyu "npm start" ile başlatıp http://localhost:8080 adresinden aç.';
    authSubmit.disabled = true;
  } else {
    // Supabase, bu dinleyicinin içinden başka Supabase çağrısı yapılmamasını önerir;
    // bu yüzden işi bir sonraki adıma erteliyoruz.
    if (window.__introBoot) showSplash();
    sb.auth.onAuthStateChange(function (event, session) {
      setTimeout(function () { handleSession(session); }, 0);
    });
  }

  authForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = authEmail.value.trim().toLowerCase();
    var password = authPassword.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      authStatus.textContent = 'Geçerli bir e-posta adresi yaz.';
      authEmail.focus();
      return;
    }
    if (password.length < MIN_PASSWORD) {
      authStatus.textContent = 'Şifre en az ' + MIN_PASSWORD + ' karakter olmalı.';
      authPassword.focus();
      return;
    }

    var signup = authMode === 'signup';
    authSubmit.disabled = true;
    authStatus.textContent = signup ? 'Hesap oluşturuluyor...' : 'Giriş yapılıyor...';

    var request = signup
      ? sb.auth.signUp({ email: email, password: password })
      : sb.auth.signInWithPassword({ email: email, password: password });

    request.then(function (res) {
      authSubmit.disabled = false;
      if (res.error) { authStatus.textContent = friendlyError(res.error); return; }
      if (signup && !(res.data && res.data.session)) {
        // Oturum gelmediyse Supabase hâlâ e-posta doğrulaması istiyor
        var identities = res.data && res.data.user && res.data.user.identities;
        authStatus.textContent = (identities && identities.length === 0)
          ? 'Bu e-posta ile zaten bir hesap var. "Giriş yap"ı kullan.'
          : 'Hesap oluşturuldu ama Supabase e-posta doğrulaması bekliyor. Panelde "Confirm email" ayarını kapat, sonra bu hesabı Authentication → Users\'tan silip yeniden oluştur.';
        return;
      }
      // Başarılı: oturum dinleyicisi uygulamayı açar
      authStatus.textContent = '';
    }, function (err) {
      authSubmit.disabled = false;
      authStatus.textContent = friendlyError(err);
    });
  });

  authModeSwitch.addEventListener('click', function () {
    setAuthMode(authMode === 'signin' ? 'signup' : 'signin');
    authStatus.textContent = '';
    (authEmail.value ? authPassword : authEmail).focus();
  });

  /* ---- Ayarlar (Çıkış Yap buraya taşındı) ---- */
  var settingsEmail = document.getElementById('settingsEmail');

  /* ---- Alttan açılan pencereler (Ayarlar, Yeni Anı): yumuşak açılış / kapanış ----
     Telefonda alttan kayarak gelir, masaüstünde hafifçe büyüyerek belirir;
     arka plan solar. "Hareketi azalt" açıksa sadece solma. */
  function sheetMotion(modal) {
    var backdrop = modal.querySelector('.settings-backdrop');
    var sheet = modal.querySelector('.settings-sheet');
    function hiddenFrame() {
      return window.matchMedia('(min-width: 700px)').matches
        ? { opacity: 0, transform: 'translateY(16px) scale(0.96)' }
        : { opacity: 1, transform: 'translateY(100%)' };
    }
    return {
      animateOpen: function () {
        if (reduced()) { anim(modal, modal, [{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' }); return; }
        anim(modal, backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'ease-out' });
        anim(modal, sheet, [hiddenFrame(), { opacity: 1, transform: 'none' }], { duration: 440, easing: EASE });
      },
      animateClose: function (done) {
        if (reduced()) {
          onAllFinished([anim(modal, modal, [{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-in', fill: 'forwards' })], done);
          return;
        }
        var opts = { duration: 320, easing: EASE_IN_OUT, fill: 'forwards' };
        onAllFinished([
          anim(modal, backdrop, [{ opacity: 1 }, { opacity: 0 }], opts),
          anim(modal, sheet, [{ opacity: 1, transform: 'none' }, hiddenFrame()], opts)
        ], done);
      }
    };
  }

  function openSheetDialog(modal, opener, focusEl) {
    var m = sheetMotion(modal);
    openDialog(modal, opener, { initialFocus: focusEl, animateOpen: m.animateOpen, animateClose: m.animateClose });
  }

  // Ayarlar sayfası görününce hesap bilgisini yaz
  pageShownHooks.push(function (id) {
    if (id === 'ayarlar') settingsEmail.textContent = currentUser ? currentUser.email : '';
  });

  signOutBtn.addEventListener('click', function () {
    signOutBtn.disabled = true;
    sb.auth.signOut().then(function () {
      signOutBtn.disabled = false;
      forgetOffline();
      showLogin('Çıkış yaptın. Görüşmek üzere 🤍');
    });
  });

  /* =========================================================
     10. Anıları Supabase'den çekip sayfaya yerleştirme
     ========================================================= */

  // Gizli bucket'taki dosyalar için süreli imzalı linkler üret
  function signPaths(bucket, paths) {
    if (!paths.length) return Promise.resolve({});
    return sb.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL).then(function (res) {
      if (res.error) throw res.error;
      var byPath = {};
      (res.data || []).forEach(function (item) {
        if (item.signedUrl) byPath[item.path] = item.signedUrl;
      });
      return byPath;
    });
  }

  // "Çevir" ile kaydedilen videolar: dosya adı "-mirror" ile biter (veritabanında ek alan gerekmez)
  function isMirroredPath(path) { return /-mirror\.[a-z0-9]+$/i.test(path || ''); }

  function attachMediaUrls(rows) {
    var photos = rows.map(function (r) { return r.photo_url; }).filter(Boolean);
    var videos = rows.map(function (r) { return r.video_url; }).filter(Boolean);
    return Promise.all([signPaths(PHOTO_BUCKET, photos), signPaths(VIDEO_BUCKET, videos)]).then(function (maps) {
      rows.forEach(function (r) {
        if (r.video_url && maps[1][r.video_url]) r.media = { type: 'video', src: maps[1][r.video_url], mirror: isMirroredPath(r.video_url) };
        else if (r.photo_url && maps[0][r.photo_url]) r.media = { type: 'photo', src: maps[0][r.photo_url] };
        else r.media = null;
      });
      return rows;
    });
  }

  function selectMemories() {
    return sb.from('memories').select(columns()).order('created_at', { ascending: true }).then(function (res) {
      // Video alanı henüz eklenmemişse eski sütunlarla devam et
      if (res.error && !videoColumnMissing && isMissingVideoColumn(res.error)) {
        videoColumnMissing = true;
        return selectMemories();
      }
      return res;
    });
  }

  function refreshMemories() {
    var token = ++loadToken;
    return selectMemories()
      .then(function (res) {
        if (res.error) throw res.error;
        return attachMediaUrls(res.data || []);
      })
      .then(function (rows) {
        if (token !== loadToken || !currentUser) return;
        renderMemoryRows(rows);
        lastLoadedAt = Date.now();
        saveOffline('memories', rows.map(function (r) {
          return { id: r.id, title: r.title, date: r.date, note: r.note, photo_url: r.photo_url || null, video_url: r.video_url || null, created_at: r.created_at, media: r.media || null };
        }));
      })
      .catch(function (err) {
        if (token !== loadToken) return;
        // İnternet yok: bu cihazdaki son anı listesini göster
        var cached = currentUser && isNetworkError(err) ? loadOffline('memories', currentUser.id) : null;
        if (cached) {
          renderMemoryRows(cached.map(function (r) {
            // videolar önbelleğe alınmaz: çevrimdışında yer tutucu
            if (r.video_url || (r.media && r.media.type === 'video')) r.media = null;
            return r;
          }));
          if (isOffline()) showNet('offline');
          return;
        }
        if (formStatus) formStatus.textContent = 'Anılar yüklenemedi. ' + friendlyError(err);
      });
  }

  function renderMemoryRows(rows) {
    clearGalleryMemories();
    rows.forEach(function (row) { if (row.media) addToGallery(row.id, row.title, row.media); });
    setTimelineMemories(rows);
    refreshGalleryItems();
  }

  // Sayfa uzun süre açık kaldıysa (imzalı linkler eskidiyse) geri gelince yenile
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && currentUser && !activeDialog &&
        Date.now() - lastLoadedAt > (SIGNED_URL_TTL - 10 * 60) * 1000) {
      refreshMemories();
    }
  });

  /* ---- Anı düzenleme / silme (Supabase) ---- */

  function updateMemory(entry, fields) {
    return sb.from('memories')
      .update({ title: fields.title, date: fields.date, note: fields.note })
      .eq('id', entry.memoryId)
      .select(columns())
      .then(function (res) {
        if (res.error) throw res.error;
        // RLS izin vermediyse hata değil, boş sonuç döner
        if (!res.data || !res.data.length) throw { message: 'no-permission-update' };
        var row = res.data[0];
        entry.title = row.title;
        entry.desc = row.note || '';
        entry.dateValue = row.date || null;
        entry.dateText = formatDate(row.date);
        entry.date = parseDateValue(row.date) || entry.createdDay || entry.date;
        return entry;
      });
  }

  function deleteMemory(entry) {
    return sb.from('memories')
      .delete()
      .eq('id', entry.memoryId)
      .select('id')
      .then(function (res) {
        if (res.error) throw res.error;
        if (!res.data || !res.data.length) throw { message: 'no-permission-delete' };
        // Kayıt silindi; şimdi fotoğrafı/videoyu da depodan kaldır
        var jobs = [];
        if (entry.photoPath) jobs.push(sb.storage.from(PHOTO_BUCKET).remove([entry.photoPath]));
        if (entry.videoPath) jobs.push(sb.storage.from(VIDEO_BUCKET).remove([entry.videoPath]));
        return Promise.all(jobs.map(function (p) { return p.then(function (r) { return r; }, function () { return null; }); }))
          .then(function (results) {
            entry.fileRemoveFailed = results.some(function (r) { return !r || r.error || (r.data && r.data.length === 0); });
            return entry;
          });
      });
  }

  function clearGalleryMemories() {
    toArray(galleryGrid.querySelectorAll('[data-memory-id]')).forEach(function (el) {
      unobservePreviews(el);
      el.remove();
    });
  }

  function clearRenderedMemories() {
    clearGalleryMemories();
    setTimelineMemories([]);
    refreshGalleryItems();
  }

  function addToGallery(id, title, media) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gallery-item reveal is-visible';
    btn.dataset.memoryId = id;
    btn.dataset.caption = title;
    if (media && media.src) {
      btn.dataset.mediaType = media.type;
      btn.dataset.mediaSrc = media.src;
      if (media.mirror) btn.dataset.mediaMirror = '1';
    }
    btn.innerHTML = '<div class="gallery-media">' + thumbHTML(media) + '</div>';
    // En yeni anı en başta, ama "Anı ekle" kalp kartının hemen arkasında
    var addCard = document.getElementById('galleryAdd');
    galleryGrid.insertBefore(btn, addCard ? addCard.nextSibling : galleryGrid.firstChild);
  }

  /* =========================================================
     10b. Özel sözlük (Sözlük sayfası)
          Supabase'deki "dictionary_words" tablosu (supabase/dictionary.sql).
          Kelime + isteğe bağlı anlam; ekle / düzenle / sil (onaylı).
          Tablo henüz kurulmadıysa sayfa ne yapılacağını söyler, uygulama bozulmaz.
          Ana sayfadaki sayaca dokununca buradan rastgele bir kelime süzülür.
     ========================================================= */
  var DICT_COLUMNS = 'id, word, meaning, created_at';
  var dictForm = document.getElementById('dictForm');
  var dictWord = document.getElementById('dictWord');
  var dictMeaning = document.getElementById('dictMeaning');
  var dictAdd = document.getElementById('dictAdd');
  var dictStatus = document.getElementById('dictStatus');
  var dictList = document.getElementById('dictList');
  var dictEmpty = document.getElementById('dictEmpty');
  var dictWords = [];
  var dictMissing = false;     // tablo kurulmamış
  var dictToken = 0;
  var EDIT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
  var TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

  function isMissingDictTable(err) {
    var msg = (err && (err.message || '')) + ' ' + (err && err.code || '');
    return /dictionary_words/i.test(msg) && /(PGRST205|42P01|does not exist|schema cache|could not find)/i.test(msg);
  }

  function dictError(err) {
    if (isMissingDictTable(err)) {
      dictMissing = true;
      return 'Sözlük henüz kurulmamış: supabase/dictionary.sql dosyasını Supabase SQL Editor\'de bir kez çalıştır.';
    }
    if (err && err.message === 'no-permission') return 'Bu işlem için izin yok (supabase/dictionary.sql\'i tekrar çalıştır).';
    return friendlyError(err);
  }

  function sortWords() {
    dictWords.sort(function (a, b) { return a.word.localeCompare(b.word, 'tr', { sensitivity: 'base' }); });
  }

  function sameWord(a, b) { return a.trim().toLocaleLowerCase('tr') === b.trim().toLocaleLowerCase('tr'); }

  function setDictEnabled(on) {
    dictWord.disabled = dictMeaning.disabled = dictAdd.disabled = !on;
  }

  function renderDict() {
    dictList.innerHTML = '';
    dictWords.forEach(function (w) { dictList.appendChild(buildDictItem(w)); });
    dictEmpty.hidden = dictWords.length > 0 || dictMissing;
  }

  function buildDictItem(w) {
    var li = document.createElement('li');
    li.className = 'dict-item';
    li.dataset.id = w.id;
    li.innerHTML =
      '<div class="dict-view">' +
        '<span class="dict-word"></span><span class="dict-meaning"></span>' +
        '<span class="dict-actions">' +
          '<button type="button" class="dict-btn dict-edit">' + EDIT_SVG + '</button>' +
          '<button type="button" class="dict-btn dict-btn--danger dict-del">' + TRASH_SVG + '</button>' +
        '</span>' +
      '</div>';
    li.querySelector('.dict-word').textContent = w.word;
    li.querySelector('.dict-meaning').textContent = w.meaning || '';
    li.querySelector('.dict-edit').setAttribute('aria-label', 'Düzenle: ' + w.word);
    li.querySelector('.dict-del').setAttribute('aria-label', 'Sil: ' + w.word);
    return li;
  }

  function findWord(id) {
    for (var i = 0; i < dictWords.length; i++) if (String(dictWords[i].id) === String(id)) return dictWords[i];
    return null;
  }

  // Satırı düzenleme / silme onayı moduna al
  function openDictEditor(li, w) {
    li.innerHTML =
      '<form class="dict-edit-form" novalidate>' +
        '<input type="text" class="dict-input dict-input--word" maxlength="80" aria-label="Kelime" required>' +
        '<input type="text" class="dict-input dict-input--meaning" maxlength="300" aria-label="Anlamı" placeholder="anlamı (isteğe bağlı)">' +
        '<button type="button" class="dict-row-btn dict-cancel">Vazgeç</button>' +
        '<button type="submit" class="dict-row-btn dict-row-btn--primary">Kaydet</button>' +
      '</form>';
    var inputs = li.querySelectorAll('input');
    inputs[0].value = w.word;
    inputs[1].value = w.meaning || '';
    inputs[0].focus();
  }

  function openDictConfirm(li, w) {
    li.innerHTML =
      '<div class="dict-confirm" role="alertdialog">' +
        '<p></p>' +
        '<button type="button" class="dict-row-btn dict-cancel">Vazgeç</button>' +
        '<button type="button" class="dict-row-btn dict-row-btn--danger dict-confirm-yes">Evet, sil</button>' +
      '</div>';
    li.querySelector('p').textContent = '“' + w.word + '” sözlükten silinsin mi?';
    li.querySelector('.dict-cancel').focus();
  }

  function loadWords() {
    var token = ++dictToken;
    return sb.from('dictionary_words').select(DICT_COLUMNS).then(function (res) {
      if (token !== dictToken || !currentUser) return;
      if (res.error) throw res.error;
      dictMissing = false;
      dictWords = res.data || [];
      saveOffline('words', dictWords);
      sortWords();
      setDictEnabled(true);
      dictStatus.textContent = '';
      renderDict();
    }).catch(function (err) {
      if (token !== dictToken) return;
      var cachedWords = currentUser && isNetworkError(err) ? loadOffline('words', currentUser.id) : null;
      if (cachedWords) {
        dictMissing = false;
        dictWords = cachedWords;
        sortWords();
        setDictEnabled(true);
        dictStatus.textContent = '';
        renderDict();
        return;
      }
      dictStatus.textContent = dictError(err);
      setDictEnabled(!dictMissing);
      dictWords = [];
      renderDict();
    });
  }

  function clearWords() {
    dictToken++;
    dictWords = [];
    dictMissing = false;
    dictStatus.textContent = '';
    if (dictList) renderDict();
  }

  // Sayaç animasyonu için rastgele bir kelime (art arda aynısı gelmesin)
  var lastRandomWord = null;
  function randomWord() {
    if (!dictWords.length) return null;
    if (dictWords.length === 1) return dictWords[0];
    var w;
    do { w = dictWords[Math.floor(Math.random() * dictWords.length)]; } while (w === lastRandomWord);
    lastRandomWord = w;
    return w;
  }

  if (dictForm) {
    dictForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!currentUser || dictMissing) return;
      if (!requireOnline()) return;
      var word = dictWord.value.trim();
      var meaning = dictMeaning.value.trim();
      if (!word) { dictStatus.textContent = 'Önce bir kelime yaz.'; dictWord.focus(); return; }
      if (dictWords.some(function (w) { return sameWord(w.word, word); })) {
        dictStatus.textContent = '“' + word + '” zaten sözlükte.';
        return;
      }
      dictAdd.disabled = true;
      dictStatus.textContent = 'Ekleniyor...';
      sb.from('dictionary_words').insert({ word: word, meaning: meaning || null }).select(DICT_COLUMNS).single()
        .then(function (res) {
          if (res.error) throw res.error;
          dictWords.push(res.data);
          sortWords();
          renderDict();
          dictForm.reset();
          dictStatus.textContent = '';
          toast('Sözlüğe eklendi', { heart: true, ms: 1600 });
          dictWord.focus();
        })
        .catch(function (err) { dictStatus.textContent = dictError(err); })
        .then(function () { dictAdd.disabled = dictMissing; });
    });

    dictList.addEventListener('click', function (e) {
      var li = e.target.closest('.dict-item');
      if (!li) return;
      var w = findWord(li.dataset.id);
      if (!w) return;
      if (e.target.closest('.dict-edit')) { dictStatus.textContent = ''; openDictEditor(li, w); return; }
      if (e.target.closest('.dict-del')) { dictStatus.textContent = ''; openDictConfirm(li, w); return; }
      if (e.target.closest('.dict-cancel')) { li.replaceWith(buildDictItem(w)); return; }
      var yes = e.target.closest('.dict-confirm-yes');
      if (yes) {
        if (!requireOnline()) return;
        yes.disabled = true;
        sb.from('dictionary_words').delete().eq('id', w.id).select('id').then(function (res) {
          if (res.error) throw res.error;
          if (!res.data || !res.data.length) throw { message: 'no-permission' };
          dictWords = dictWords.filter(function (x) { return x !== w; });
          renderDict();
          toast('Kelime silindi', { ms: 1600 });
        }).catch(function (err) {
          dictStatus.textContent = dictError(err);
          yes.disabled = false;
        });
      }
    });

    dictList.addEventListener('submit', function (e) {
      e.preventDefault();
      var li = e.target.closest('.dict-item');
      var w = li && findWord(li.dataset.id);
      if (!w) return;
      var inputs = li.querySelectorAll('input');
      var word = inputs[0].value.trim();
      var meaning = inputs[1].value.trim();
      if (!word) { dictStatus.textContent = 'Kelime boş olamaz.'; inputs[0].focus(); return; }
      if (dictWords.some(function (x) { return x !== w && sameWord(x.word, word); })) {
        dictStatus.textContent = '“' + word + '” zaten sözlükte.';
        return;
      }
      if (!requireOnline()) return;
      var save = li.querySelector('[type="submit"]');
      save.disabled = true;
      sb.from('dictionary_words').update({ word: word, meaning: meaning || null }).eq('id', w.id).select(DICT_COLUMNS)
        .then(function (res) {
          if (res.error) throw res.error;
          if (!res.data || !res.data.length) throw { message: 'no-permission' };
          w.word = res.data[0].word;
          w.meaning = res.data[0].meaning;
          sortWords();
          renderDict();
          dictStatus.textContent = '';
        })
        .catch(function (err) { dictStatus.textContent = dictError(err); save.disabled = false; });
    });

    // Esc: düzenleme / silme onayından çık
    dictList.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var li = e.target.closest('.dict-item');
      var w = li && findWord(li.dataset.id);
      if (w && !li.querySelector('.dict-view')) { e.preventDefault(); li.replaceWith(buildDictItem(w)); }
    });
  }

  /* =========================================================
     11. "Anı Ekle" formu — fotoğraf/videoyu Storage'a, anıyı tabloya kaydeder
     ========================================================= */
  var VIDEO_EXT = { mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', '3gp': 'video/3gpp' };
  var PHOTO_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif' };

  function uniqueId() {
    // crypto.randomUUID sadece https'de var; yerel ağda (http) yedek kullan
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function extOf(file) {
    return ((file.name.match(/\.([a-z0-9]{1,5})$/i) || [])[1] || '').toLowerCase();
  }

  function mediaKind(file) {
    if (/^video\//.test(file.type)) return 'video';
    if (/^image\//.test(file.type)) return 'photo';
    var ext = extOf(file);
    if (VIDEO_EXT[ext]) return 'video';
    if (PHOTO_EXT[ext]) return 'photo';
    return null;
  }

  function contentTypeOf(file, kind) {
    if (file.type) return file.type;
    var ext = extOf(file);
    return (kind === 'video' ? VIDEO_EXT[ext] : PHOTO_EXT[ext]) || undefined;
  }

  function fileExtension(file, kind) {
    var ext = extOf(file);
    if (ext) return '.' + ext;
    var fromType = (file.type.split('/')[1] || (kind === 'video' ? 'mp4' : 'jpg')).replace('jpeg', 'jpg').replace('quicktime', 'mov');
    return '.' + fromType.replace(/[^a-z0-9]/gi, '').slice(0, 5);
  }

  function formatSize(bytes) {
    var mb = bytes / (1024 * 1024);
    return (mb < 10 ? mb.toFixed(1) : Math.round(mb)) + ' MB';
  }

  // Tarih alanı form açıldığında bugünle dolu gelsin (kullanıcı değiştirebilir).
  // defaultValue sayesinde form temizlenince (kayıttan sonra) yine bugüne döner.
  var memDateInput = document.getElementById('memDate');

  function fillTodayDate() {
    if (!memDateInput) return;
    var today = ymd(new Date());
    var untouched = !memDateInput.value || memDateInput.value === memDateInput.defaultValue;
    memDateInput.defaultValue = today;
    if (untouched) memDateInput.value = today;
  }

  fillTodayDate();
  // Gece yarısını geçmişse güncelle: forma gidilince ve sayfaya geri dönülünce
  /* ---- "Yeni Bir Anı" penceresi: galerideki kalpli karttan açılır ---- */
  var addModal = document.getElementById('addModal');
  var addClose = document.getElementById('addClose');
  var galleryAdd = document.getElementById('galleryAdd');

  function openAddMemory(opener) {
    fillTodayDate();
    openSheetDialog(addModal, opener, addClose);
  }

  if (galleryAdd) galleryAdd.addEventListener('click', function () { openAddMemory(galleryAdd); });
  addClose.addEventListener('click', function () { closeDialog(); });
  addModal.addEventListener('click', function (e) {
    if (e.target === addModal || e.target.classList.contains('settings-backdrop')) closeDialog();
  });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') fillTodayDate(); });

  /* ---- Seçilen fotoğraf / video: önizleme ve "Çevir" (yatay aynalama) ----
     iPhone'da uygulama içinden açılan ön kamera "Ön Kamerayı Aynala" ayarını uygulamaz;
     selfie, çekerken görünenin tersi kaydedilir. "Çevir" ile düzeltilir:
       - fotoğraf: pikseller canvas ile gerçekten çevrilir (EXIF yönü korunarak), JPEG yüklenir
       - video: dosya adına "-mirror" eklenir, uygulama her yerde aynalanmış gösterir */
  var memPhoto = document.getElementById('memPhoto');
  var mediaPick = document.getElementById('mediaPick');
  var mediaPickFrame = document.getElementById('mediaPickFrame');
  var mediaFlip = document.getElementById('mediaFlip');
  var pickFlip = false;
  var pickUrl = null;
  var MAX_CANVAS_PIXELS = 16000000;   // iPhone tuval sınırının altında kal

  function setPickFlip(on) {
    pickFlip = on;
    mediaFlip.setAttribute('aria-pressed', String(on));
    mediaPickFrame.classList.toggle('is-flipped', on);
  }

  function clearPick() {
    if (pickUrl) URL.revokeObjectURL(pickUrl);
    pickUrl = null;
    mediaPickFrame.innerHTML = '';
    mediaPick.hidden = true;
    setPickFlip(false);
    if (mediaFlipHint) mediaFlipHint.textContent = FLIP_HINT;
  }

  var mediaFlipHint = document.getElementById('mediaFlipHint');
  var FLIP_HINT = 'Ön kamerayla çektiğin görüntü ters göründüyse dokun.';
  var FLIP_HINT_AUTO = 'Ön kamerayla çekildi; çekerken gördüğün gibi kaydedilecek. İstemezsen dokun.';
  var FRESH_MS = 15 * 60 * 1000;   // "şimdi çekildi" sayılan süre

  // Dosyanın baş (ve videoda son) kısmında ön kamera izi ve çekim zamanı ara.
  // iPhone fotoğrafın EXIF'ine LensModel olarak "iPhone 15 front camera ..." yazar;
  // videoda da benzer bir metin (lens_model) bulunur.
  function readText(blob) {
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () {
        var b = new Uint8Array(fr.result), s = '';
        for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i] >= 32 && b[i] < 127 ? b[i] : 32);
        resolve(s);
      };
      fr.onerror = function () { resolve(''); };
      fr.readAsArrayBuffer(blob);
    });
  }

  function shotTime(text) {
    var m = text.match(/(20\d\d)[:-](\d\d)[:-](\d\d)[ T](\d\d):(\d\d):(\d\d)/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  }

  function detectFrontCamera(file, kind) {
    var head = file.slice(0, kind === 'video' ? 1024 * 1024 : 256 * 1024);
    var parts = [readText(head)];
    if (kind === 'video' && file.size > 1024 * 1024) parts.push(readText(file.slice(Math.max(1024 * 1024, file.size - 1024 * 1024))));
    return Promise.all(parts).then(function (texts) {
      var text = texts.join(' ');
      if (!/front( truedepth)? camera|frontcamera|camera\.lens_model[^]{0,80}front/i.test(text)) return false;
      // Galeriden seçilen eski selfie'ler iPhone Kamera'da zaten senin ayarınla kaydedilmiştir: dokunma
      var t = shotTime(text);
      if (t === null) return true;
      return Math.abs(Date.now() - t) < FRESH_MS;
    }).catch(function () { return false; });
  }

  function showPick() {
    clearPick();
    var file = memPhoto.files && memPhoto.files[0];
    var kind = file ? mediaKind(file) : null;
    if (!kind) return;
    detectFrontCamera(file, kind).then(function (front) {
      if (!front || !memPhoto.files || memPhoto.files[0] !== file) return;
      setPickFlip(true);
      if (mediaFlipHint) mediaFlipHint.textContent = FLIP_HINT_AUTO;
    });
    pickUrl = URL.createObjectURL(file);
    var el = document.createElement(kind === 'video' ? 'video' : 'img');
    el.src = pickUrl;
    if (kind === 'video') { el.muted = true; el.loop = true; el.autoplay = true; el.playsInline = true; el.setAttribute('playsinline', ''); }
    else el.alt = '';
    mediaPickFrame.appendChild(el);
    mediaPick.hidden = false;
  }

  if (memPhoto && mediaPick) {
    memPhoto.addEventListener('change', showPick);
    mediaFlip.addEventListener('click', function () { setPickFlip(!pickFlip); });
  }

  // Fotoğrafı yatay çevir: <img> EXIF yönünü uygular, canvas'a aynalanmış çizilir
  function flipImageFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, Math.sqrt(MAX_CANVAS_PIXELS / (w * h)));
        w = Math.round(w * k); h = Math.round(h * k);
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var g = c.getContext('2d');
        g.translate(w, 0);
        g.scale(-1, 1);
        g.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (blob) {
          if (!blob) { reject(new Error('Fotoğraf çevrilemedi.')); return; }
          var base = (file.name || 'foto').replace(/\.[^.]+$/, '');
          resolve(new File([blob], base + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Fotoğraf okunamadı.')); };
      img.src = url;
    });
  }

  if (form) {
    form.addEventListener('reset', function () { setTimeout(clearPick, 0); });
    var submitBtn = form.querySelector('[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!currentUser) return;
      if (!requireOnline()) return;

      var title = document.getElementById('memTitle').value.trim();
      var dateValue = document.getElementById('memDate').value;
      var note = document.getElementById('memDesc').value.trim();
      var fileInput = document.getElementById('memPhoto');
      var file = (fileInput.files && fileInput.files[0]) || null;
      var kind = file ? mediaKind(file) : null;

      if (!title) {
        formStatus.textContent = 'Lütfen bir başlık yaz.';
        return;
      }
      if (file && !kind) {
        formStatus.textContent = 'Bu dosya türü desteklenmiyor. Bir fotoğraf ya da MP4, MOV, WEBM video seç.';
        return;
      }
      if (kind === 'photo' && file.size > MAX_PHOTO_BYTES) {
        formStatus.textContent = 'Fotoğraf çok büyük: en fazla 15 MB olabilir, seçtiğin dosya ' + formatSize(file.size) + '.';
        return;
      }
      if (kind === 'video' && file.size > MAX_VIDEO_BYTES) {
        formStatus.textContent = 'Video çok büyük: en fazla 100 MB olabilir, seçtiğin dosya ' + formatSize(file.size) + '.';
        return;
      }
      if (kind === 'video' && videoColumnMissing) {
        formStatus.textContent = 'Video yüklemek için önce supabase/schema.sql dosyasını Supabase SQL Editor\'de tekrar çalıştır.';
        return;
      }

      var bucket = kind === 'video' ? VIDEO_BUCKET : PHOTO_BUCKET;
      var flip = !!file && pickFlip;
      var mirrorVideo = kind === 'video' && flip;
      var path = null;
      submitBtn.disabled = true;
      formStatus.textContent = kind === 'video' ? 'Video yükleniyor… (büyük dosyalarda biraz sürebilir)'
        : kind === 'photo' ? (flip ? 'Fotoğraf çevriliyor...' : 'Fotoğraf yükleniyor...') : 'Kaydediliyor...';

      // "Çevir" seçildiyse: fotoğrafın pikselleri çevrilir; videonun dosya adı işaretlenir
      var prepared = kind === 'photo' && flip ? flipImageFile(file) : Promise.resolve(file);

      prepared
        .then(function (f) {
          file = f;
          if (!file) return { error: null };
          if (kind === 'photo' && file.size > MAX_PHOTO_BYTES) throw { message: 'too large' };
          path = currentUser.id + '/' + uniqueId() + (mirrorVideo ? '-mirror' : '') + fileExtension(file, kind);
          if (kind === 'photo') formStatus.textContent = 'Fotoğraf yükleniyor...';
          return sb.storage.from(bucket).upload(path, file, { contentType: contentTypeOf(file, kind), upsert: false });
        })
        .then(function (res) {
          if (res.error) throw res.error;
          formStatus.textContent = 'Kaydediliyor...';
          var row = { title: title, date: dateValue || null, note: note || null, photo_url: kind === 'photo' ? path : null };
          if (!videoColumnMissing) row.video_url = kind === 'video' ? path : null;
          return sb.from('memories').insert(row).select(columns()).single();
        })
        .then(function (res) {
          if (res.error) throw res.error;
          var row = res.data;
          // Yeni dosyayı hemen göster; sonraki açılışlarda imzalı link kullanılır
          row.media = file ? { type: kind, src: URL.createObjectURL(file), mirror: mirrorVideo } : null;
          // Galeri bir fotoğraf/video arşivi: sadece medyası olan anılar girer
          if (row.media) addToGallery(row.id, row.title, row.media);
          addTimelineMemory(row);
          refreshGalleryItems();
          form.reset();
          formStatus.textContent = '';
          // Pencereyi kapat, kısa ve sade bir onay göster
          if (activeDialog && activeDialog.el === addModal) closeDialog();
          toast('Anı kaydedildi', { heart: true, ms: 1800 });
        })
        .catch(function (err) {
          // Anı kaydedilemediyse yüklenen dosya boşta kalmasın
          if (path) sb.storage.from(bucket).remove([path]).catch(noop);
          formStatus.textContent = friendlyError(err, kind);
        })
        .then(function () {
          submitBtn.disabled = false;
        });
    });
  }

})();
