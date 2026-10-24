// Supabase istemcisini başlatır.
// URL ve anahtar .env dosyasından gelir: serve.mjs onları /config.js olarak sayfaya verir.
// Not: publishable (anon) anahtar tarayıcıda görünür; bu normaldir. Verileri koruyan
// şey Supabase'deki RLS kurallarıdır (supabase/schema.sql).
(function () {
  'use strict';

  var cfg = window.ANI_CONFIG || {};

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    window.aniSupabase = null;
    console.error('Supabase yapılandırılamadı. Uygulamayı "npm start" ile başlatıp http://localhost:8080 adresinden açın.');
    return;
  }

  window.aniSupabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,      // sayfa yenilenince tekrar giriş istemesin
      autoRefreshToken: true,
      detectSessionInUrl: false  // e-posta + şifre ile giriş: adresten oturum okumaya gerek yok
    }
  });
})();
