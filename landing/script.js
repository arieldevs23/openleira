(function () {
  // class .js dipasang di <head> cuma kalau IntersectionObserver ada, jadi tanpa itu konten tetap kelihatan.
  // prefers-reduced-motion ditangani di css
  if (document.documentElement.classList.contains('js')) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  }

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
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var src = document.getElementById(btn.getAttribute('data-copy'));
    var status = btn.closest('.install').querySelector('.cmd__status');
    var timer;

    function report(ok) {
      status.classList.toggle('is-error', !ok);
      status.textContent = ok ? 'Perintah tersalin.' : 'Gagal menyalin. Blok perintah lalu salin manual.';
      btn.textContent = ok ? 'Tersalin' : 'Salin';
      clearTimeout(timer);
      timer = setTimeout(function () { btn.textContent = 'Salin'; status.textContent = ''; }, 2500);
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

    btn.addEventListener('click', function () {
      var text = src.textContent.trim();
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { report(true); }, function () { fallback(text); });
      } else {
        fallback(text);
      }
    });
  });

  // TODO: hapus begitu repo publik. sementara link placeholder nggak lompat ke atas
  document.querySelectorAll('a[data-placeholder]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); });
  });
})();
