(function () {
  // menu mobile
  var toggle = document.querySelector('.nav__toggle');
  var links = document.getElementById('nav-links');

  function setMenu(open) {
    links.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Tutup menu' : 'Buka menu');
  }

  toggle.addEventListener('click', function () {
    setMenu(toggle.getAttribute('aria-expanded') !== 'true');
  });
  links.addEventListener('click', function (e) {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      toggle.focus();
    }
  });

  // tombol salin perintah installer. clipboard API butuh https, jadi ada fallback execCommand
  var copyBtn = document.querySelector('[data-copy]');
  var src = document.getElementById(copyBtn.getAttribute('data-copy'));
  var status = document.querySelector('.cmd__status');
  var timer;

  function report(ok) {
    status.classList.toggle('is-error', !ok);
    status.textContent = ok ? 'Perintah tersalin.' : 'Gagal menyalin, blok perintah lalu salin manual.';
    copyBtn.textContent = ok ? 'Tersalin' : 'Salin';
    clearTimeout(timer);
    timer = setTimeout(function () { copyBtn.textContent = 'Salin'; status.textContent = ''; }, 2500);
  }

  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    report(ok);
  }

  copyBtn.addEventListener('click', function () {
    var text = src.textContent.trim();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { report(true); }, function () { fallback(text); });
    } else {
      fallback(text);
    }
  });

  // tema. nilai awal sudah dipasang skrip di <head> supaya tidak berkedip saat load
  var root = document.documentElement;
  var themeBtn = document.querySelector('.theme-toggle');
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var switchTimer;

  function applyTheme(theme, animate) {
    if (animate) {
      root.classList.add('theme-switching');
      clearTimeout(switchTimer);
      switchTimer = setTimeout(function () { root.classList.remove('theme-switching'); }, 250);
    }
    root.setAttribute('data-theme', theme);
    themeMeta.setAttribute('content', theme === 'dark' ? '#0A0A0B' : '#F2F2F0');
    themeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
  }

  function storedTheme() {
    try { return localStorage.getItem('openleira-theme'); } catch (e) { return null; }
  }

  applyTheme(root.getAttribute('data-theme'), false);

  themeBtn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next, true);
    try { localStorage.setItem('openleira-theme', next); } catch (e) {}
  });

  // selama belum ada pilihan tersimpan, ikuti perubahan tema sistem
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function (e) {
    var saved = storedTheme();
    if (saved !== 'light' && saved !== 'dark') applyTheme(e.matches ? 'light' : 'dark', true);
  });
})();
