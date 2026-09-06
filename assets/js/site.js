/* Shared site behaviour: stars, toast, dynamic site_content + contact channels.
   Progressive enhancement — page content is fully static; this only upgrades. */
(function () {
  'use strict';

  // frame-busting (frame-ancestors can't be enforced via <meta>)
  try {
    if (window.top !== window.self) window.top.location = window.self.location;
  } catch (e) { /* sandboxed frame — nothing to do */ }

  /* ---------- star canvas (decorative, guarded) ---------- */
  function initStars() {
    var canvas = document.getElementById('star-canvas');
    if (!canvas || !window.requestAnimationFrame) return;
    try {
      var ctx = canvas.getContext('2d');
      if (!ctx) return;
      var w, h, stars = [], shooting = [];
      function resize() { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
      function make() {
        stars = [];
        var n = Math.min(220, Math.floor((w * h) / 7000));
        for (var i = 0; i < n; i++) {
          stars.push({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.5 + 0.3,
            a: Math.random() * 0.6 + 0.2, s: Math.random() * 0.01 + 0.003, o: Math.random() * 6.28 });
        }
      }
      var frame = 0;
      function draw() {
        ctx.clearRect(0, 0, w, h);
        for (var k = 0; k < stars.length; k++) {
          var s = stars[k];
          var tw = Math.sin(frame * s.s * 60 * 0.016 + s.o) * 0.3 + 0.7;
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283);
          ctx.fillStyle = 'rgba(255,255,255,' + (s.a * tw).toFixed(3) + ')'; ctx.fill();
        }
        if (shooting.length < 2 && Math.random() < 0.015) {
          shooting.push({ x: Math.random() * w, y: Math.random() * h * 0.5, len: Math.random() * 100 + 50,
            sp: Math.random() * 8 + 6, a: 1, ang: Math.PI / 4 });
        }
        for (var i = shooting.length - 1; i >= 0; i--) {
          var ss = shooting[i];
          ss.x += Math.cos(ss.ang) * ss.sp; ss.y += Math.sin(ss.ang) * ss.sp; ss.a -= 0.015;
          if (ss.a <= 0 || ss.x > w || ss.y > h) { shooting.splice(i, 1); continue; }
          var tx = ss.x - Math.cos(ss.ang) * ss.len, ty = ss.y - Math.sin(ss.ang) * ss.len;
          var g = ctx.createLinearGradient(tx, ty, ss.x, ss.y);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,' + ss.a.toFixed(3) + ')');
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ss.x, ss.y);
          ctx.strokeStyle = g; ctx.lineWidth = 1.5; ctx.stroke();
        }
        frame++;
        requestAnimationFrame(draw);
      }
      resize(); make();
      window.addEventListener('resize', function () { resize(); make(); });
      draw();
    } catch (e) { /* decorative only */ }
  }

  /* ---------- toast ---------- */
  window.showToast = function (msg) {
    var t = document.getElementById('toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 5000);
  };

  /* ---------- dynamic content: static defaults in HTML, Supabase overrides at runtime ---------- */
  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return (o && o[k] !== undefined) ? o[k] : undefined; }, obj);
  }

  function applyOverrides(data) {
    if (!data || typeof data !== 'object') return;
    // text overrides: <... data-sc="business.hours">
    Array.prototype.forEach.call(document.querySelectorAll('[data-sc]'), function (el) {
      var v = getPath(data, el.getAttribute('data-sc'));
      if (typeof v === 'string' && v && v !== 'CHANGE_ME' && !/^0{5}/.test(v)) el.textContent = v;
    });
    renderChannels(getPath(data, 'business') || {});
  }

  function renderChannels(biz) {
    document.querySelectorAll('[data-channels]').forEach(function (box) {
      var en = biz.channels_enabled || {};
      var items = [];
      if (en.phone !== false && biz.phone) items.push({ href: 'tel:+98' + String(biz.phone).replace(/^0/, ''), label: '📞 ' + biz.phone });
      if (en.telegram !== false && biz.telegram && biz.telegram !== 'CHANGE_ME') items.push({ href: 'https://t.me/' + biz.telegram, label: '💬 تلگرام' });
      if (en.whatsapp !== false && biz.whatsapp) items.push({ href: 'https://wa.me/98' + String(biz.whatsapp).replace(/^0/, ''), label: '🟢 واتساپ' });
      if (en.rubika !== false && biz.rubika && biz.rubika !== 'CHANGE_ME') items.push({ href: biz.rubika.indexOf('http') === 0 ? biz.rubika : 'https://rubika.ir/' + biz.rubika, label: '🟣 روبیکا' });
      if (!items.length) return; // keep static fallback content
      box.innerHTML = '';
      items.forEach(function (it) {
        var a = document.createElement('a');
        a.href = it.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = it.label;
        box.appendChild(a);
      });
    });
  }

  function mergeAndApply(staticData, remoteRows) {
    var data = staticData || {};
    (remoteRows || []).forEach(function (row) {
      try {
        var val = (typeof row.value === 'string') ? JSON.parse(row.value) : row.value;
        data[row.key] = val;
      } catch (e) { /* ignore bad row */ }
    });
    window.SITE_CONTENT = data;
    applyOverrides(data);
    document.dispatchEvent(new CustomEvent('site-content-ready', { detail: data }));
  }

  function loadContent() {
    var cfg = window.SITE_CONFIG || {};
    function withRemote(staticData) {
      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.fetch) { mergeAndApply(staticData, []); return; }
      fetch(cfg.SUPABASE_URL + '/rest/v1/site_content?select=key,value', {
        headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY }
      }).then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) { mergeAndApply(staticData, rows); })
        .catch(function () { mergeAndApply(staticData, []); });
    }
    if (window.fetch) {
      fetch(cfg.CONTENT_JSON || '/data/site-content.json')
        .then(function (r) { return r.ok ? r.json() : {}; })
        .then(withRemote)
        .catch(function () { withRemote({}); });
    } else { mergeAndApply({}, []); }
  }

  document.addEventListener('DOMContentLoaded', function () { initStars(); loadContent(); });
})();
