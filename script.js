(function () {
  'use strict';

  /* =========================================================
     0. Ayarlar ve yardımcılar
     ========================================================= */
  // Bu tarihi kendi başlangıç tarihinizle değiştirin
  var START_DATE = new Date('2026-09-13T00:00:00');

  var MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  var MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';        // ease-out (Apple tarzı)
  var EASE_IN_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)';
  var FLIP_MS = 320;   // önizlemeden büyüme / küçülme
  var FADE_MS = 200;   // "hareketi azalt" açıkken sadece yumuşak solma
  var HEART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">' +
    '<path d="M12 21s-7.5-4.6-10-9.3C.3 8.1 2 4.5 5.4 4c2-.3 3.8.7 4.6 2.3C10.8 4.7 12.6 3.7 14.6 4c3.4.5 5.1 4.1 3.4 7.7C15.5 16.4 12 21 12 21z"/></svg>';
  var PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>';

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

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
     3. Aktif bölüme göre menü vurgusu
     ========================================================= */
  var sections = ['anasayfa', 'zaman-cizelgesi', 'galeri', 'ani-ekle']
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);

  var navLinks = document.querySelectorAll('[data-nav-link]');

  function setActive(id) {
    navLinks.forEach(function (link) {
      link.classList.toggle('is-active', link.dataset.target === id);
    });
  }

  if ('IntersectionObserver' in window && sections.length) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

    sections.forEach(function (section) { navObserver.observe(section); });
  }

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
      return '<video class="media-preview" src="' + src + '#t=0.1" muted loop playsinline preload="metadata" disablepictureinpicture tabindex="-1" aria-hidden="true"></video>' +
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

  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    void toastEl.offsetWidth;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 3200);
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
     6. Galeri + fotoğraf/video penceresi (lightbox)
        - parmakla 1:1 kaydırma (swipe), yeterliyse sonraki/önceki
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
  var lightboxCaption = document.getElementById('lightboxCaption');
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
  var sheetOpen = false;   // not paneli açık mı
  var sheetP = 0;          // panelin açıklık oranı (0 kapalı, 1 açık)

  // Not panelindeki anı ayrıntısı (düzenle / sil dahil)
  var lbDetail = createDetail(document.getElementById('lbDetail'), {
    emptyNote: 'Bu anıya not eklenmemiş.',
    onSaved: function (entry) {
      if (lightboxOpen) lightboxCaption.textContent = entry.title;
      afterMemoryChanged(entry);
    },
    onDeleted: function (entry) {
      closeDialog(true);
      removeMemoryFromUI(entry);
    }
  });

  var GAP = 20;            // fotoğraflar arası boşluk (px)
  var MAX_SCALE = 4;
  var TAP_ZOOM = 2.5;      // çift dokununca yakınlaşma oranı
  var SLOP = 8;            // jestin "hareket" sayılması için gereken mesafe (px)
  var VIDEO_CONTROLS_ZONE = 64; // videonun alt kısmı: oynatıcı kontrolleri, jest başlatmaz

  var galleryItems = [];
  var currentIndex = 0;
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
      galleryCount.textContent = photos + ' fotoğraf' + (videos ? ', ' + videos + ' video' : '');
    }
    observePreviews(galleryGrid);
  }

  function buildSlideMedia(index) {
    var item = galleryItems[index];
    var type = item.dataset.mediaType;
    var src = item.dataset.mediaSrc;
    var caption = item.dataset.caption || (type === 'video' ? 'Video' : 'Fotoğraf');
    var el;

    if (type === 'video' && src) {
      el = document.createElement('video');
      el.className = 'lb-media lb-video';
      el.src = src;
      el.controls = true;
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.preload = 'metadata';
      el.setAttribute('aria-label', caption);
    } else if (type === 'photo' && src) {
      el = document.createElement('img');
      el.src = src;
      el.alt = caption;
      el.draggable = false;
      el.decoding = 'async';
      el.className = 'lb-media';
    } else {
      el = document.createElement('div');
      el.className = 'lb-media lb-placeholder';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', caption);
      el.innerHTML = HEART_SVG;
    }
    return el;
  }

  // Sadece önceki / mevcut / sonraki öğe DOM'da tutulur
  function renderSlides() {
    var n = galleryItems.length;
    pauseLightboxVideos();
    track.innerHTML = '';
    animateTransform(track, 'translate3d(0,0,0)', 0);

    (n > 1 ? [-1, 0, 1] : [0]).forEach(function (k) {
      var slide = document.createElement('div');
      slide.className = 'lb-slide';
      slide.style.transform = 'translate3d(calc(' + k + ' * (100% + ' + GAP + 'px)), 0, 0)';
      if (k === 0) slide.setAttribute('data-current', '');
      else slide.setAttribute('aria-hidden', 'true');
      slide.appendChild(buildSlideMedia((currentIndex + k + n) % n));
      track.appendChild(slide);
    });

    zoom = { s: 1, x: 0, y: 0 };
    setZoomedClass(false);

    lightboxCaption.textContent = galleryItems[currentIndex].dataset.caption || '';
    lightboxCount.textContent = (currentIndex + 1) + ' / ' + n;
    lbDetail.show(entryForGalleryItem(galleryItems[currentIndex])); // not paneli o anki anıyı göstersin
  }

  function currentMedia() { return track.querySelector('[data-current] .lb-media'); }

  function canZoom() {
    var m = currentMedia();
    return !!m && m.tagName !== 'VIDEO';
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
    if (lightboxOpen && m && m.tagName === 'VIDEO') {
      var p = m.play();
      if (p && p.catch) p.catch(noop);
    }
  }

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

  /* ---- Öğeler arası geçiş ---- */

  function setTrack(px, ms, done) {
    animateTransform(track, 'translate3d(' + px + 'px,0,0)', ms, done);
  }

  function commit(dir) {
    var n = galleryItems.length;
    if (n < 2) { setTrack(0, dur(300)); return; }
    trackBusy = true;
    pauseLightboxVideos();
    setTrack(-dir * (viewport.clientWidth + GAP), dur(300), function () {
      currentIndex = (currentIndex + dir + n) % n;
      renderSlides();
      trackBusy = false;
      playCurrentVideo();
    });
  }

  function navigate(dir) {
    if (!lightboxOpen || trackBusy || galleryItems.length < 2 || lbDetail.isBusy()) return;
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
      // Parmağı 1:1 takip et (tek öğe varsa dirençli)
      setTrack(galleryItems.length > 1 ? dx : dx * 0.3, 0);
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
      if (galleryItems.length > 1 && (Math.abs(dx) > width * 0.22 || flick)) {
        commit(dx < 0 ? 1 : -1);
      } else {
        setTrack(0, dur(320)); // yetmediyse yerine yumuşakça dön
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

  // Dokunuş, videonun oynatıcı kontrollerinin olduğu alt şeritte mi?
  function inVideoControls(target, clientY) {
    var v = videoAt(target);
    if (!v) return false;
    return clientY > v.getBoundingClientRect().bottom - VIDEO_CONTROLS_ZONE;
  }

  /* ---- İki parmak (pinch) ---- */

  function touchDistance(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }

  function startPinch(a, b) {
    clearTimeout(pendingClose);
    if (gesture && gesture.mode === 'swipe') setTrack(0, dur(200));
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
    if (e.touches.length === 1 && inVideoControls(e.target, e.touches[0].clientY)) {
      // Oynatıcı kontrollerine dokunuluyor: tarayıcıya bırak
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

    // Videoya kısa dokunuş: tarayıcının kendi davranışı (kontrolleri göster/oynat)
    if (gesture.mode === 'pending' && videoAt(target)) { gesture = null; return; }

    if (e.cancelable) e.preventDefault(); // dokunuştan sonra sahte "click" üretilmesin
    endDrag('touch', target);
  }, { passive: false });

  viewport.addEventListener('touchcancel', function () {
    var g = gesture;
    gesture = null;
    videoTouch = false;
    if (!g) return;
    if (g.mode === 'swipe') setTrack(0, dur(320));
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
    if (videoAt(e.target)) return; // videoda fare, oynatıcıyı kullanır
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
    return [lightboxBg, lightboxTopbar, lightboxPrev, lightboxNext, lightboxCaption, lbSheet];
  }

  function lightboxAnimateOpen(thumbEl) {
    var media = currentMedia();
    lightbox.style.opacity = '0'; // medyanın boyutu belli olana kadar
    whenMediaReady(media, function () {
      lightbox.style.opacity = '';
      if (!lightboxOpen) return;

      if (reduced()) {
        anim(lightbox, lightbox, [{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
        return;
      }

      lightboxChrome().forEach(function (el) {
        anim(lightbox, el, [{ opacity: 0 }, { opacity: 1 }], { duration: FLIP_MS, easing: EASE });
      });

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
    animateTransform(track, 'translate3d(0,0,0)', 0);

    var thumbEl = galleryItems[currentIndex];
    var to = visibleRect(thumbEl);
    var opts = { duration: FLIP_MS, easing: EASE_IN_OUT, fill: 'forwards' };
    var anims = lightboxChrome().map(function (el) {
      return anim(lightbox, el, [{ opacity: 1 }, { opacity: 0 }], opts);
    });

    if (to && media.getBoundingClientRect().width > 0) {
      hideThumb(lightbox, thumbEl);
      anims.push(anim(lightbox, media, flipFrames(media, to, radiusOf(thumbEl), radiusOf(media) + 'px').reverse(), opts));
    } else {
      anims.push(anim(lightbox, media, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.92)' }], opts));
    }
    onAllFinished(anims, done);
  }

  /* ---- Not paneli (yukarı kaydır / "Notu Gör") ---- */

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
    lbNotesLabel.textContent = open ? 'Notu Gizle' : 'Notu Gör';
    if (!open && lbSheet.contains(document.activeElement)) lbNotesBtn.focus();
    animateTransform(lbSheet, 'translate3d(0,' + (open ? 0 : sheetDistance()) + 'px,0)', animate ? dur(320) : 0, function () {
      if (!sheetOpen) lbSheet.hidden = true; // kapalıyken odak sırasından çıksın
    });
  }

  lbNotesBtn.addEventListener('click', function () { setSheet(!sheetOpen, true); });
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

  function openLightbox(index, opener) {
    if (index < 0 || !galleryItems.length) return;
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
        clearTimeout(track._animTimer);
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
    openLightbox(galleryItems.indexOf(item), item);
  });

  lightboxClose.addEventListener('click', function () { closeDialog(); });
  lightboxPrev.addEventListener('click', function () { navigate(-1); });
  lightboxNext.addEventListener('click', function () { navigate(1); });

  window.addEventListener('resize', function () {
    if (lightboxOpen) resetZoom(false);
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

  function openMemory(entry, opener) {
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
     8. Zaman çizelgesi — dönem görünümü (Haftalık / Aylık / Yıllık)
        - Sadece seçili dönemin anıları gösterilir (en yeniden eskiye)
        - Dönemin sonunda kaydırmaya devam → bir önceki (daha eski) dönem,
          başında yukarı → bir sonraki (daha yeni) dönem
        - Kenardaki tarih çubuğu sürüklenerek döneme atlanır
        - Boş dönemler atlanır (bulunduğumuz dönem hariç)
     ========================================================= */
  var timelineScroller = document.getElementById('timelineScroller');
  var timelineEmpty = document.getElementById('timelineEmpty');
  var periodLabelEl = document.getElementById('periodLabel');
  var periodCountEl = document.getElementById('periodCount');
  var pullOlder = document.getElementById('pullOlder');
  var pullNewer = document.getElementById('pullNewer');
  var pullOlderLabel = document.getElementById('pullOlderLabel');
  var pullNewerLabel = document.getElementById('pullNewerLabel');
  var dateRail = document.getElementById('dateRail');
  var railTicks = document.getElementById('dateRailTicks');
  var railThumb = document.getElementById('dateRailThumb');
  var railBubble = document.getElementById('dateRailBubble');
  var modeButtons = toArray(document.querySelectorAll('.segmented-btn[data-mode]'));

  var PERIOD_NOUN = { week: 'hafta', month: 'ay', year: 'yıl' };
  var PULL_WHEEL = 220;   // tekerlekle geçiş için gereken "fazla kaydırma"
  var PULL_TOUCH = 90;    // parmakla geçiş için gereken çekme mesafesi (px)
  var RAIL_PAD = 22;

  var tlEntries = [];     // tüm anılar (örnekler + Supabase)
  var tlMode = 'month';
  var tlKey = null;       // seçili dönem
  var tlPeriods = [];     // gezilebilir dönemler (yeniden eskiye)
  var tlBusy = false;
  var tlCooldownUntil = 0;
  var tlAnchor = null;    // bakılan tarih: görünüm değişince bu tarihin dönemine gidilir
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

  function neighbor(dir) {
    var i = tlPeriods.indexOf(tlKey);
    return dir === 'older' ? tlPeriods[i + 1] : tlPeriods[i - 1];
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
    li.innerHTML =
      '<div class="timeline-dot"></div>' +
      '<div class="timeline-card">' +
        '<button type="button" class="timeline-media">' + thumbHTML(entry.media) + '</button>' +
        '<div class="timeline-text">' +
          '<span class="timeline-date"></span>' +
          '<h3 class="timeline-title"></h3>' +
          '<p class="timeline-desc"></p>' +
        '</div>' +
      '</div>';
    li.querySelector('.timeline-date').textContent = entry.dateText;
    li.querySelector('.timeline-title').textContent = entry.title;
    li.querySelector('.timeline-desc').textContent = entry.desc || '';
    var isVideo = entry.media && entry.media.type === 'video';
    li.querySelector('.timeline-media').setAttribute('aria-label', entry.title + (isVideo ? ' — videoyu aç' : ' — anıyı aç'));
    return li;
  }

  function renderTimeline() {
    computePeriods();
    if (tlPeriods.indexOf(tlKey) === -1) tlKey = currentKey();

    var items = entriesIn(tlKey);
    var isCurrent = tlKey === currentKey();
    var endEntry = null;
    tlEntries.forEach(function (e) { if (e.isEnd) endEntry = e; });

    // Gruplar: yıllıkta aylara bölünür, diğerlerinde tek grup
    var groups = [];
    if (tlMode === 'year') {
      var byMonth = {};
      items.forEach(function (e) {
        var m = e.date.getMonth();
        if (!byMonth[m]) { byMonth[m] = { title: MONTHS[m], month: m, items: [] }; groups.push(byMonth[m]); }
        byMonth[m].items.push(e);
      });
      if (isCurrent && endEntry) {
        var nowMonth = new Date().getMonth();
        if (!byMonth[nowMonth]) { byMonth[nowMonth] = { title: MONTHS[nowMonth], month: nowMonth, items: [] }; groups.unshift(byMonth[nowMonth]); }
        byMonth[nowMonth].items.unshift(endEntry);
      }
      groups.sort(function (a, b) { return b.month - a.month; });
    } else {
      groups.push({ title: null, items: (isCurrent && endEntry ? [endEntry] : []).concat(items) });
    }

    unobservePreviews(timelineList);
    timelineList.innerHTML = '';
    groups.forEach(function (g) {
      if (!g.items.length) return;
      var wrap = document.createElement('div');
      wrap.className = 'timeline-group';
      if (g.title) {
        var h = document.createElement('p');
        h.className = 'timeline-group-title';
        h.setAttribute('role', 'heading');
        h.setAttribute('aria-level', '3');
        h.textContent = g.title;
        wrap.appendChild(h);
      }
      var ol = document.createElement('ol');
      ol.className = 'timeline';
      g.items.forEach(function (e) { ol.appendChild(buildTimelineItem(e)); });
      wrap.appendChild(ol);
      timelineList.appendChild(wrap);
    });

    var older = neighbor('older');
    var newer = neighbor('newer');

    timelineEmpty.hidden = items.length > 0;
    timelineEmpty.textContent = 'Bu ' + PERIOD_NOUN[tlMode] + ' henüz anı yok.' + (older ? ' Daha eski anılar için aşağı kaydır.' : '');

    periodLabelEl.textContent = periodLabel(tlKey, tlMode);
    periodCountEl.textContent = items.length ? items.length + ' anı' : '';

    pullOlder.hidden = !older;
    pullNewer.hidden = !newer;
    if (older) pullOlderLabel.textContent = periodLabel(older, tlMode);
    if (newer) pullNewerLabel.textContent = periodLabel(newer, tlMode);

    resetPull();
    updateRail();
    observePreviews(timelineList);
  }

  function applyScroll(where) {
    timelineScroller.scrollTop = where === 'bottom' ? timelineScroller.scrollHeight : 0;
  }

  // Dönem değiştir (yumuşak geçişle; "hareketi azalt" açıksa anında)
  function goToPeriod(key, opts) {
    opts = opts || {};
    if (!key || tlBusy) return;
    if (key === tlKey) { resetPull(); updateRail(); return; }

    var dir = opts.direction || (tlPeriods.indexOf(key) > tlPeriods.indexOf(tlKey) ? 'older' : 'newer');
    var scrollTo = opts.scroll || 'top';
    tlCooldownUntil = Date.now() + 700;

    swapTimeline(dir, function () {
      tlKey = key;
      tlAnchor = null;
      renderTimeline();
      applyScroll(scrollTo);
    });
  }

  // Bakılan tarih: hatırlanan tarih bu dönemdeyse o, değilse dönemin en yeni anısı
  function anchorDate() {
    if (tlAnchor && periodKeyOf(tlAnchor, tlMode) === tlKey) return tlAnchor;
    var shown = entriesIn(tlKey);
    if (shown.length) return shown[0].date;
    return tlKey === currentKey() ? new Date() : parseDateValue(tlKey);
  }

  // İçeriği değiştir: eskisi kayarak/solarak çıkar, yenisi girer
  function swapTimeline(dir, change) {
    if (reduced() || typeof timelineList.animate !== 'function') { change(); return; }
    tlBusy = true;
    var shift = dir === 'older' ? -24 : dir === 'newer' ? 24 : 0;
    var start = timelineList.style.transform || 'translateY(0px)';
    timelineList.style.transform = '';
    var out = timelineList.animate(
      [{ opacity: 1, transform: start }, { opacity: 0, transform: 'translateY(' + shift + 'px)' }],
      { duration: 150, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' });
    out.onfinish = function () {
      change();
      out.cancel();
      var inn = timelineList.animate(
        [{ opacity: 0, transform: 'translateY(' + (-shift) + 'px)' }, { opacity: 1, transform: 'translateY(0px)' }],
        { duration: 280, easing: EASE });
      inn.onfinish = inn.oncancel = function () { tlBusy = false; };
    };
    out.oncancel = function () { tlBusy = false; };
  }

  /* ---- Dönem sonunda kaydırmaya devam → önceki/sonraki dönem ---- */

  function atBottom() { return timelineScroller.scrollTop + timelineScroller.clientHeight >= timelineScroller.scrollHeight - 2; }
  function atTop() { return timelineScroller.scrollTop <= 1; }

  function setPull(dir, p) {
    [[pullOlder, 'older'], [pullNewer, 'newer']].forEach(function (pair) {
      var active = pair[1] === dir;
      pair[0].style.setProperty('--pull', active ? p : 0);
      pair[0].classList.toggle('is-ready', active && p >= 1);
    });
    // Hafif "lastik" geri bildirimi
    timelineList.style.transform = (dir && !reduced()) ? 'translateY(' + ((dir === 'older' ? -1 : 1) * p * 18) + 'px)' : '';
  }

  var wheelPull = { dir: null, amount: 0, timer: null };

  function resetPull() {
    clearTimeout(wheelPull.timer);
    wheelPull.dir = null;
    wheelPull.amount = 0;
    setPull(null, 0);
  }

  function triggerPull(dir) {
    var key = neighbor(dir);
    if (!key) { resetPull(); return; }
    goToPeriod(key, { direction: dir, scroll: dir === 'older' ? 'top' : 'bottom' });
  }

  timelineScroller.addEventListener('wheel', function (e) {
    if (e.ctrlKey) return;
    if (tlBusy) { e.preventDefault(); return; }
    var dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? timelineScroller.clientHeight : 1);
    var dir = (dy > 0 && atBottom() && neighbor('older')) ? 'older'
      : (dy < 0 && atTop() && neighbor('newer')) ? 'newer' : null;
    if (!dir) { if (wheelPull.dir) resetPull(); return; }

    e.preventDefault(); // sayfa kaymasın, dönem değişsin
    if (Date.now() < tlCooldownUntil) return; // ivmeli kaydırma birden çok dönem atlamasın
    if (wheelPull.dir !== dir) { wheelPull.dir = dir; wheelPull.amount = 0; }
    wheelPull.amount += Math.abs(dy);
    var p = Math.min(1, wheelPull.amount / PULL_WHEEL);
    setPull(dir, p);
    clearTimeout(wheelPull.timer);
    if (p >= 1) { triggerPull(dir); return; }
    wheelPull.timer = setTimeout(resetPull, 450);
  }, { passive: false });

  var touchPull = null;

  timelineScroller.addEventListener('touchstart', function (e) {
    touchPull = e.touches.length === 1 ? { y: e.touches[0].clientY, dir: null, startY: 0, amount: 0 } : null;
  }, { passive: true });

  timelineScroller.addEventListener('touchmove', function (e) {
    var tp = touchPull;
    if (!tp || tlBusy || e.touches.length !== 1) return;
    var y = e.touches[0].clientY;
    if (!tp.dir) {
      if (y < tp.y - 2 && atBottom() && neighbor('older')) { tp.dir = 'older'; tp.startY = y; }
      else if (y > tp.y + 2 && atTop() && neighbor('newer')) { tp.dir = 'newer'; tp.startY = y; }
      else { tp.y = y; return; }
    }
    var amount = tp.dir === 'older' ? tp.startY - y : y - tp.startY;
    if (amount < 0) { tp.dir = null; tp.y = y; resetPull(); return; }
    if (e.cancelable) e.preventDefault();
    tp.amount = amount;
    setPull(tp.dir, Math.min(1, amount / PULL_TOUCH));
  }, { passive: false });

  timelineScroller.addEventListener('touchend', function () {
    var tp = touchPull;
    touchPull = null;
    if (!tp || !tp.dir) return;
    if (tp.amount >= PULL_TOUCH && Date.now() >= tlCooldownUntil) triggerPull(tp.dir);
    else resetPull();
  });

  timelineScroller.addEventListener('touchcancel', function () { touchPull = null; resetPull(); });

  pullOlder.addEventListener('click', function () { triggerPull('older'); });
  pullNewer.addEventListener('click', function () { triggerPull('newer'); });

  /* ---- Kenar tarih çubuğu ---- */

  function railY(i, n) {
    var h = dateRail.clientHeight - 2 * RAIL_PAD;
    return RAIL_PAD + (n <= 1 ? 0 : h * i / (n - 1));
  }

  function railIndexAt(clientY) {
    var n = tlPeriods.length;
    if (n <= 1) return 0;
    var r = dateRail.getBoundingClientRect();
    var t = (clientY - r.top - RAIL_PAD) / (r.height - 2 * RAIL_PAD);
    return clamp(Math.round(t * (n - 1)), 0, n - 1);
  }

  function setRailThumb(i) {
    railThumb.style.transform = 'translateY(' + railY(i, tlPeriods.length) + 'px)';
  }

  function updateRail() {
    var n = tlPeriods.length;
    var idx = Math.max(0, tlPeriods.indexOf(tlKey));
    var html = '';
    var lastYear = null;
    tlPeriods.forEach(function (k, i) {
      var y = railY(i, n);
      if (n <= 80) html += '<span class="date-rail-tick" style="top:' + y + 'px"></span>';
      var year = k.slice(0, 4);
      if (year !== lastYear && (tlMode !== 'year' || n <= 12)) {
        html += '<span class="date-rail-year" style="top:' + y + 'px">' + year + '</span>';
      }
      lastYear = year;
    });
    railTicks.innerHTML = html;
    setRailThumb(idx);

    dateRail.setAttribute('aria-valuemin', '0');
    dateRail.setAttribute('aria-valuemax', String(Math.max(0, n - 1)));
    dateRail.setAttribute('aria-valuenow', String(idx));
    dateRail.setAttribute('aria-valuetext', periodLabel(tlKey, tlMode));
    dateRail.classList.toggle('is-disabled', n <= 1);
  }

  var railDrag = null;

  function railPreview(clientY) {
    var i = railIndexAt(clientY);
    railDrag.index = i;
    setRailThumb(i);
    railBubble.textContent = periodLabel(tlPeriods[i], tlMode);
    railBubble.style.transform = 'translateY(' + railY(i, tlPeriods.length) + 'px)';
    railBubble.hidden = false;
  }

  function endRailDrag(e, commitJump) {
    if (!railDrag || e.pointerId !== railDrag.id) return;
    var idx = railDrag.index;
    railDrag = null;
    dateRail.classList.remove('is-dragging');
    railBubble.hidden = true;
    if (commitJump) goToPeriod(tlPeriods[idx], { scroll: 'top' });
    else updateRail();
  }

  dateRail.addEventListener('pointerdown', function (e) {
    if (tlPeriods.length <= 1 || tlBusy) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { dateRail.setPointerCapture(e.pointerId); } catch (err) { /* desteklenmiyorsa sorun değil */ }
    railDrag = { id: e.pointerId, index: tlPeriods.indexOf(tlKey) };
    dateRail.classList.add('is-dragging');
    dateRail.focus({ preventScroll: true });
    railPreview(e.clientY);
  });

  dateRail.addEventListener('pointermove', function (e) {
    if (railDrag && e.pointerId === railDrag.id) railPreview(e.clientY);
  });

  dateRail.addEventListener('pointerup', function (e) { endRailDrag(e, true); });
  dateRail.addEventListener('pointercancel', function (e) { endRailDrag(e, false); });

  // Klavye: ↑/↓ bir dönem, Home/End en yeni/en eski
  dateRail.addEventListener('keydown', function (e) {
    var i = tlPeriods.indexOf(tlKey), n = tlPeriods.length, t;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') t = i + 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') t = i - 1;
    else if (e.key === 'Home') t = 0;
    else if (e.key === 'End') t = n - 1;
    else return;
    e.preventDefault();
    t = clamp(t, 0, n - 1);
    if (t !== i) goToPeriod(tlPeriods[t], { scroll: 'top' });
  });

  window.addEventListener('resize', updateRail);

  /* ---- Haftalık / Aylık / Yıllık ---- */

  function setMode(mode) {
    if (mode === tlMode || tlBusy) return;
    // Şu an bakılan yeri koru (Aylık → Yıllık → Haftalık geçişlerinde aynı tarih)
    var anchor = anchorDate();

    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });

    swapTimeline(null, function () {
      tlMode = mode;
      computePeriods();
      var key = periodKeyOf(anchor, mode);
      if (tlPeriods.indexOf(key) === -1) {
        // O dönemde anı yoksa en yakın eski döneme git
        key = tlPeriods.filter(function (k) { return k <= key; })[0] || tlPeriods[tlPeriods.length - 1];
      }
      tlKey = key;
      tlAnchor = periodKeyOf(anchor, mode) === key ? anchor : null;
      renderTimeline();
      applyScroll('top');
    });
  }

  modeButtons.forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); });
  });

  /* ---- Anı penceresini aç ---- */

  // Karta (fotoğrafa ya da metne) dokununca tam not anı penceresinde açılır
  timelineList.addEventListener('click', function (e) {
    var card = e.target.closest('.timeline-card');
    if (!card) return;
    var btn = card.querySelector('.timeline-media'); // büyüme animasyonu fotoğraftan başlar
    var entry = findEntry(card.closest('.timeline-item').dataset.entryKey);
    if (entry) openMemory(entry, btn);
  });

  // Supabase anılarını zaman çizelgesine koy (örnekler kalır)
  function setTimelineMemories(rows) {
    tlEntries = tlEntries.filter(function (e) { return !e.memoryId; });
    rows.forEach(function (row) { tlEntries.push(entryFromRow(row)); });
    renderTimeline();
  }

  function addTimelineMemory(row) {
    var entry = entryFromRow(row);
    tlEntries.push(entry);
    tlKey = periodKeyOf(entry.date, tlMode); // yeni anının dönemine geç
    tlAnchor = entry.date;
    renderTimeline();
  }

  // Bir anı düzenlenince: galeri başlığı ve çizelgedeki kart güncellensin
  var timelineDirty = false;

  function flushTimeline() {
    if (!timelineDirty) return;
    timelineDirty = false;
    renderTimeline();
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
      li.querySelector('.timeline-desc').textContent = entry.desc || '';
    }

    // Tarih başka döneme taşındıysa çizelge o döneme geçsin
    var key = periodKeyOf(entry.date, tlMode);
    if (key !== tlKey || !li) {
      tlKey = key;
      tlAnchor = entry.date;
      // Anı penceresi çizelgeden açıldıysa, kapanış animasyonu bitince yenile
      if (activeDialog && activeDialog.el === memoryModal) timelineDirty = true;
      else renderTimeline();
    }
  }

  function removeMemoryFromUI(entry) {
    tlEntries = tlEntries.filter(function (e) { return e !== entry; });
    var item = galleryGrid.querySelector('.gallery-item[data-memory-id="' + entry.memoryId + '"]');
    if (item) { unobservePreviews(item); item.remove(); }
    refreshGalleryItems();
    renderTimeline();
    toast(entry.fileRemoveFailed
      ? 'Anı silindi, ama dosyası depodan silinemedi (supabase/schema.sql\'i tekrar çalıştır).'
      : 'Anı silindi.');
  }

  parseSeed();
  tlKey = currentKey();
  renderTimeline();

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
      return 'Bu anıyı ' + (msg === 'no-permission-update' ? 'düzenleme' : 'silme') +
        ' izni yok. Başkasının eklediği anılar için supabase/schema.sql dosyasını Supabase SQL Editor\'de tekrar çalıştır.';
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
    closeDialog(true);
    clearRenderedMemories();
    if (form) form.reset();
    if (formStatus) formStatus.textContent = '';
    setAuthState('out');
    // Mesaj yoksa ekrandakini silme (çıkış olayı birden fazla kez gelebilir)
    var text = message || pendingAuthMessage;
    if (text) authStatus.textContent = text;
    pendingAuthMessage = '';
  }

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
    sb.rpc('is_member').then(function (res) {
      checkingUserId = null;
      if (res.error || res.data !== true) {
        pendingAuthMessage = res.error
          ? friendlyError(res.error)
          : (user.email + ' adresinin Dijital Albüm\'e erişim izni yok.');
        return sb.auth.signOut({ scope: 'local' }).then(function () { showLogin(); });
      }
      currentUser = user;
      signOutBtn.title = user.email + ' olarak giriş yapıldı';
      authStatus.textContent = '';
      resetAuthForm();
      setAuthState('in');
      updateRail(); // panel artık görünür: çubuk ölçülerini yenile
      refreshMemories();
    });
  }

  if (!sb) {
    setAuthState('out');
    authStatus.textContent = 'Uygulama yapılandırılamadı. Sunucuyu "npm start" ile başlatıp http://localhost:8080 adresinden aç.';
    authSubmit.disabled = true;
  } else {
    // Supabase, bu dinleyicinin içinden başka Supabase çağrısı yapılmamasını önerir;
    // bu yüzden işi bir sonraki adıma erteliyoruz.
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
  var settingsModal = document.getElementById('settingsModal');
  var settingsClose = document.getElementById('settingsClose');
  var settingsEmail = document.getElementById('settingsEmail');

  function openSettings(opener) {
    settingsEmail.textContent = currentUser ? currentUser.email : '';
    openDialog(settingsModal, opener, { initialFocus: settingsClose });
  }

  toArray(document.querySelectorAll('[data-open-settings]')).forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      openSettings(link);
    });
  });

  settingsClose.addEventListener('click', function () { closeDialog(); });
  settingsModal.addEventListener('click', function (e) {
    if (e.target === settingsModal || e.target.classList.contains('settings-backdrop')) closeDialog();
  });

  signOutBtn.addEventListener('click', function () {
    signOutBtn.disabled = true;
    sb.auth.signOut().then(function () {
      signOutBtn.disabled = false;
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

  function attachMediaUrls(rows) {
    var photos = rows.map(function (r) { return r.photo_url; }).filter(Boolean);
    var videos = rows.map(function (r) { return r.video_url; }).filter(Boolean);
    return Promise.all([signPaths(PHOTO_BUCKET, photos), signPaths(VIDEO_BUCKET, videos)]).then(function (maps) {
      rows.forEach(function (r) {
        if (r.video_url && maps[1][r.video_url]) r.media = { type: 'video', src: maps[1][r.video_url] };
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
        clearGalleryMemories();
        rows.forEach(function (row) { if (row.media) addToGallery(row.id, row.title, row.media); });
        setTimelineMemories(rows);
        refreshGalleryItems();
        lastLoadedAt = Date.now();
      })
      .catch(function (err) {
        if (token === loadToken && formStatus) formStatus.textContent = 'Anılar yüklenemedi. ' + friendlyError(err);
      });
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
    }
    btn.innerHTML = '<div class="gallery-media">' + thumbHTML(media) + '</div>';
    galleryGrid.insertBefore(btn, galleryGrid.firstChild);
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
  toArray(document.querySelectorAll('a[href="#ani-ekle"]')).forEach(function (a) { a.addEventListener('click', fillTodayDate); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') fillTodayDate(); });

  if (form) {
    var submitBtn = form.querySelector('[type="submit"]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!currentUser) return;

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
      var path = file ? currentUser.id + '/' + uniqueId() + fileExtension(file, kind) : null;
      submitBtn.disabled = true;
      formStatus.textContent = kind === 'video' ? 'Video yükleniyor… (büyük dosyalarda biraz sürebilir)'
        : kind === 'photo' ? 'Fotoğraf yükleniyor...' : 'Kaydediliyor...';

      var upload = file
        ? sb.storage.from(bucket).upload(path, file, { contentType: contentTypeOf(file, kind), upsert: false })
        : Promise.resolve({ error: null });

      upload
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
          row.media = file ? { type: kind, src: URL.createObjectURL(file) } : null;
          // Galeri bir fotoğraf/video arşivi: sadece medyası olan anılar girer
          if (row.media) addToGallery(row.id, row.title, row.media);
          addTimelineMemory(row);
          refreshGalleryItems();
          form.reset();
          formStatus.textContent = 'Anı kaydedildi 🤍';
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
