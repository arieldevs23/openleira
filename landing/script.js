(function () {
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

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

  // semua gerak di bawah ini mati total saat reduced motion. kelas rv juga tidak dipasang di <head>
  if (reduce.matches) return;

  // reveal per komponen. --i = urutan di antara saudara yang juga di-reveal, jadi stagger per grup
  if (root.classList.contains('rv')) {
    var items = document.querySelectorAll('[data-rv]');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    items.forEach(function (el) {
      var n = 0, sib = el.previousElementSibling;
      while (sib) { if (sib.hasAttribute('data-rv')) n++; sib = sib.previousElementSibling; }
      el.style.setProperty('--i', n);
      io.observe(el);
    });
    root.classList.add('rv-ready');
  }

  // canvas workspace: status berpindah tiap 1.5 detik, 8 langkah = siklus 12 detik.
  // hanya berjalan selama canvas terlihat
  var cv = document.querySelector('.cv');
  var nodes = cv.querySelectorAll('.nd[data-s]');
  var edges = cv.querySelectorAll('.e[data-s]');
  var step = 4, loop = null;

  function render() {
    nodes.forEach(function (n) {
      var s = n.getAttribute('data-s').split(' ').map(Number);
      var run = s.indexOf(step) > -1;
      n.classList.toggle('is-run', run);
      n.classList.toggle('is-done', !run && s[0] < step);
    });
    edges.forEach(function (e) {
      e.classList.toggle('is-on', Number(e.getAttribute('data-s')) === step);
    });
  }

  new IntersectionObserver(function (entries) {
    if (entries[0].isIntersecting && !loop) {
      step = 1;
      render();
      loop = setInterval(function () { step = step % 8 + 1; render(); }, 1500);
    } else if (!entries[0].isIntersecting && loop) {
      clearInterval(loop);
      loop = null;
    }
  }).observe(cv);

  // parallax ornamen dan motion blur saat menggulir. hanya lapisan dekoratif yang diberi blur,
  // teks tidak pernah kena. loop rAF berhenti sendiri begitu kecepatan kembali nol
  var fx = [].map.call(document.querySelectorAll('[data-fx]'), function (el) {
    return { el: el, kind: el.getAttribute('data-fx'), top: 0, h: 0 };
  });
  var vh = window.innerHeight, lastY = window.scrollY, vel = 0, raf = 0, idle = 0;

  function measure() {
    vh = window.innerHeight;
    fx.forEach(function (f) {
      if (f.kind !== 'arch') return;
      var r = f.el.getBoundingClientRect();
      f.top = r.top + window.scrollY - (f.dy || 0);
      f.h = r.height;
    });
  }

  function frame() {
    var y = window.scrollY;
    vel += ((y - lastY) - vel) * 0.35;
    lastY = y;
    var blur = Math.min(3, Math.abs(vel) * 0.05);
    var shift = Math.max(-6, Math.min(6, vel * 0.12));
    var filter = blur > 0.15 ? 'blur(' + blur.toFixed(2) + 'px)' : '';

    fx.forEach(function (f) {
      var p = 0;
      if (f.kind === 'vine') p = -((y * 0.3) % 240); // pola bergerak 0.3 kali kecepatan konten
      else if (f.kind === 'rose') p = Math.min(y, vh * 1.5) * 0.35;
      else if (f.kind === 'art') p = Math.min(y, vh * 1.5) * 0.12;
      else if (f.kind === 'arch') {
        var d = f.top + f.h / 2 - (y + vh / 2);
        if (Math.abs(d) > vh) return;
        p = f.dy = -d * 0.25;
      }
      f.el.style.transform = 'translate3d(0,' + (p + shift).toFixed(1) + 'px,0)';
      f.el.style.filter = filter;
    });

    if (Math.abs(vel) < 0.05) idle++; else idle = 0;
    raf = idle > 6 ? 0 : requestAnimationFrame(frame);
  }

  function kick() { if (!raf) { idle = 0; raf = requestAnimationFrame(frame); } }

  measure();
  frame();
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', function () { measure(); kick(); });
  window.addEventListener('load', measure);
})();
