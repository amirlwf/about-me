/* Shared site behaviour: stars, toast, dynamic site_content + per-page contact
   channels. Pages declare scope via <body data-page="fa|fa_edit|fa_web|fa_pc">.
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

  function pageScope() {
    var b = document.body;
    return (b && b.getAttribute('data-page')) || 'fa';
  }

  function applyOverrides(data) {
    if (!data || typeof data !== 'object') return;
    // text overrides: <... data-sc="business.hours"> or <... data-sc="fa_edit.hero_title">
    Array.prototype.forEach.call(document.querySelectorAll('[data-sc]'), function (el) {
      var v = getPath(data, el.getAttribute('data-sc'));
      if (typeof v === 'string' && v && v !== 'CHANGE_ME' && !/^0{5}/.test(v)) el.textContent = v;
    });
    applySeo(data);
    renderLists(data);
    renderChannels(getPath(data, 'business') || {});
  }

  /* ---------- SEO runtime: admin-editable title + description per page ----------
     Static <title>/<meta> stay crawlable; this swaps them live for A/B tests. */
  function applySeo(data) {
    var scope = pageScope();
    var map = { fa: 'fa_home', fa_edit: 'fa_edit', fa_web: 'fa_web', fa_pc: 'fa_pc',
      en_edit: 'en_edit', en_web: 'en_web' };
    var key = map[scope];
    if (!key || !data[key]) return;
    var page = data[key];
    if (typeof page.seo_title === 'string' && page.seo_title.trim()) {
      document.title = page.seo_title.trim();
      setMeta('property', 'og:title', page.seo_title.trim());
      setMeta('name', 'twitter:title', page.seo_title.trim());
    }
    if (typeof page.seo_description === 'string' && page.seo_description.trim()) {
      setMeta('name', 'description', page.seo_description.trim());
      setMeta('property', 'og:description', page.seo_description.trim());
      setMeta('name', 'twitter:description', page.seo_description.trim());
    }
  }
  function setMeta(attr, name, content) {
    var sel = 'meta[' + attr + '="' + name + '"]';
    var el = document.querySelector(sel);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  /* ---------- dynamic lists: data-sc-list="fa_edit.subservices|faq" ----------
     Static HTML keeps full SEO content; this re-renders only when the admin
     saved a non-empty override list. Item slots use data-sc-item="title|text|cta|q|a". */
  function renderLists(data) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-sc-list]'), function (box) {
      var path = box.getAttribute('data-sc-list');
      var list = getPath(data, path);
      if (!Array.isArray(list) || !list.length) return;
      if (/(^|\.)faq$/.test(path)) renderFaq(box, list);
      else if (/subservices$/.test(path)) renderSubservices(box, list, getPath(data, path.split('.')[0]) || {});
      else renderCards(box, list);
    });
  }

  // generic icon|title|text list (EN "ships with" grids, FA card grids):
  // updates the static cards in place so classes, links and reveal stay intact.
  function renderCards(box, list) {
    var cards = box.querySelectorAll('article, .step');
    list.forEach(function (it, i) {
      if (!it || !it.title) return;
      var el = cards[i];
      if (!el) return;
      var icon = el.querySelector('.icon');
      var h = el.querySelector('h3');
      var p = el.querySelector('p');
      if (icon && it.icon) icon.textContent = it.icon;
      if (h) h.textContent = it.title;
      if (p && it.text) p.textContent = it.text;
    });
  }

  function renderFaq(box, list) {
    box.innerHTML = '';
    list.forEach(function (it) {
      if (!it || !it.q) return;
      var d = document.createElement('details');
      var s = document.createElement('summary');
      s.textContent = it.q;
      var p = document.createElement('p');
      p.textContent = it.a || '';
      d.appendChild(s); d.appendChild(p);
      box.appendChild(d);
    });
  }

  function renderSubservices(box, list, pageData) {
    // per-item CTA overrides live in the same page object as cta_0..N
    var arts = box.querySelectorAll('article.subsvc');
    list.forEach(function (it, i) {
      if (!it) return;
      var art = arts[i];
      if (!art) {
        art = document.createElement('article');
        art.className = 'subsvc';
        art.innerHTML = '<h3></h3><p></p><a class="btn btn-primary" href="#order"></a>';
        box.appendChild(art);
      }
      var h3 = art.querySelector('[data-sc-item="title"], h3');
      var p = art.querySelector('[data-sc-item="text"], p');
      var cta = art.querySelector('a.btn');
      if (h3 && it.title) h3.textContent = it.title;
      if (p && it.text) p.textContent = it.text;
      if (cta) {
        var cv = pageData['cta_' + i];
        if (typeof cv === 'string' && cv) cta.textContent = cv;
        else if (it.cta) cta.textContent = it.cta;
      }
    });
  }

  /* ---------- per-page channels ----------
     Priority: business.page_channels.<scope> -> legacy business.channels_enabled.
     business = shared values (numbers/IDs); page_channels.<scope> = per-page toggles.
     Containers may pin a scope via data-page-channels; default = <body data-page>. */
  var CH_ICON = { phone: '/assets/img/phone.svg', telegram: '/assets/img/telegram.svg',
    whatsapp: '/assets/img/whatsapp.svg', rubika: '/assets/img/rubika.svg',
    email: '/assets/img/mail.svg', linkedin: '/assets/img/linkedin.svg',
    youtube: '/assets/img/youtube.svg' };
  var CH_LABEL_FA = { phone: null, telegram: 'تلگرام', whatsapp: 'واتساپ', rubika: 'روبیکا',
    email: 'ایمیل', linkedin: 'لینکدین', youtube: 'یوتیوب' };
  var CH_LABEL_EN = { phone: null, telegram: 'Telegram', whatsapp: 'WhatsApp', rubika: 'Rubika',
    email: 'Email', linkedin: 'LinkedIn', youtube: 'YouTube' };
  // English pages get English chip labels (same markup, data-driven)
  function channelLabels() {
    var lang = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    return lang.indexOf('en') === 0 ? CH_LABEL_EN : CH_LABEL_FA;
  }

  function channelHref(kind, val) {
    val = String(val || '').trim();
    if (!val || val === 'CHANGE_ME') return null;
    if (kind === 'phone' || kind === 'whatsapp') {
      var digits = val.replace(/^0/, '');
      if (!/^\d{7,15}$/.test(digits)) return null;
      return kind === 'phone' ? 'tel:+98' + digits : 'https://wa.me/98' + digits;
    }
    if (kind === 'email') return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val) ? 'mailto:' + val : null;
    if (kind === 'telegram') return 'https://t.me/' + val.replace(/^@/, '');
    if (kind === 'linkedin') return val.indexOf('http') === 0 ? val : 'https://linkedin.com/in/' + val.replace(/^@/, '');
    if (kind === 'youtube') return val.indexOf('http') === 0 ? val : 'https://youtube.com/' + val.replace(/^@/, '');
    if (kind === 'rubika') return val.indexOf('http') === 0 ? val : 'https://rubika.ir/' + val;
    return null;
  }

  function togglesFor(biz, scope) {
    var pc = biz.page_channels || {};
    if (pc[scope] && typeof pc[scope] === 'object') return pc[scope];
    return biz.channels_enabled || {};
  }

  function renderChannels(biz) {
    var labels = channelLabels();
    document.querySelectorAll('[data-channels]').forEach(function (box) {
      var scope = box.getAttribute('data-page-channels') || pageScope();
      var en = togglesFor(biz, scope);
      var kinds = ['phone', 'telegram', 'whatsapp', 'rubika', 'email', 'linkedin', 'youtube'];
      var items = [];
      kinds.forEach(function (kind) {
        if (en[kind] === false) return;
        var href = channelHref(kind, biz[kind]);
        if (!href) return;
        var label = kind === 'phone' ? biz.phone : (labels[kind] || kind);
        items.push({ kind: kind, href: href, label: label });
      });
      if (!items.length) return; // keep static fallback content
      box.innerHTML = '';
      items.forEach(function (it) {
        var a = document.createElement('a');
        a.href = it.href;
        if (box.classList.contains('channel-row')) a.className = 'channel-chip';
        if (it.href.indexOf('tel:') !== 0 && it.href.indexOf('mailto:') !== 0) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        var img = document.createElement('img');
        img.src = CH_ICON[it.kind] || CH_ICON.phone;
        img.alt = it.label;
        img.loading = 'lazy';
        img.decoding = 'async';
        if (it.kind === 'rubika') { img.className = 'ch-icon-wide'; img.width = 52; img.height = 22; }
        else { img.className = 'ch-icon'; img.width = 22; img.height = 22; }
        a.appendChild(img);
        a.appendChild(document.createTextNode(it.label));
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
      // upgrade immediately from the static defaults, then again with the
      // remote overrides when they land — a slow or unreachable Supabase
      // must never delay (or hide) the page's dynamic layer
      mergeAndApply(staticData, []);
      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.fetch) return;
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

  /* ---------- progressive touches: scroll reveal + header shadow ----------
     Only act when the page actually uses them (EN content pages). */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(els, function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  function initChrome() {
    var header = document.querySelector('.en-header');
    if (!header) return;
    function onScroll() { header.classList.toggle('scrolled', window.scrollY > 8); }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initStars(); initReveal(); initChrome(); loadContent();
  });
})();
