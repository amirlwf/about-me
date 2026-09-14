/* en-home.js — dynamic layer for the EN root page: overrides text from
   site_content.en_home (data-en / data-en-list), renders contact channels
   (data-channels-en) with per-channel toggles, loads visible portfolio
   items for page=en, and reveals sections on scroll. Progressive
   enhancement — the page is complete with JS disabled. */
(function () {
  'use strict';

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o && o[k] !== undefined) ? o[k] : undefined;
    }, obj);
  }

  var CH_META = {
    phone:    { icon: '/assets/img/phone.svg',    label: 'Call' },
    email:    { icon: '/assets/img/mail.svg',     label: 'Email' },
    telegram: { icon: '/assets/img/telegram.svg', label: 'Telegram' },
    whatsapp: { icon: '/assets/img/whatsapp.svg', label: 'WhatsApp' },
    rubika:   { icon: '/assets/img/rubika.svg',   label: 'Rubika' },
    linkedin: { icon: '/assets/img/linkedin.svg', label: 'LinkedIn' },
    youtube:  { icon: '/assets/img/youtube.svg',  label: 'YouTube' }
  };
  var ORDER = ['telegram', 'whatsapp', 'youtube', 'linkedin', 'email', 'phone', 'rubika'];

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

  function renderChannels(biz) {
    var boxes = document.querySelectorAll('[data-channels-en]');
    if (!boxes.length) return;
    var en = (biz && biz.channels_enabled) || {};
    var items = [];
    ORDER.forEach(function (kind) {
      if (en[kind] === false) return;
      var href = channelHref(kind, biz && biz[kind]);
      if (href) items.push({ kind: kind, href: href });
    });
    boxes.forEach(function (box) {
      if (!items.length) { box.classList.add('hidden'); return; }
      box.classList.remove('hidden');
      box.innerHTML = '';
      items.forEach(function (it) {
        var meta = CH_META[it.kind] || CH_META.telegram;
        var a = document.createElement('a');
        a.className = 'channel-chip';
        a.href = it.href;
        if (it.href.indexOf('tel:') !== 0 && it.href.indexOf('mailto:') !== 0) {
          a.target = '_blank'; a.rel = 'noopener noreferrer';
        }
        var img = document.createElement('img');
        img.src = meta.icon; img.alt = meta.label;
        img.loading = 'lazy'; img.decoding = 'async';
        img.width = 20; img.height = 20;
        a.appendChild(img);
        a.appendChild(document.createTextNode(meta.label));
        box.appendChild(a);
      });
    });
  }

  function applyEnHome(data) {
    var home = (data && data.en_home) || {};
    var biz = (data && data.business) || {};
    // scalar strings
    document.querySelectorAll('[data-en]').forEach(function (el) {
      var v = getPath(home, el.getAttribute('data-en'));
      if (typeof v !== 'string' || !v || v === 'CHANGE_ME') return;
      if (el.getAttribute('data-en') === 'brand_name') {
        var b = biz.owner || biz.name;
        el.textContent = (typeof b === 'string' && b && b !== 'CHANGE_ME') ? b : v;
        return;
      }
      el.textContent = v;
    });
    // lists: offer_points, services, steps, faq
    document.querySelectorAll('[data-en-list]').forEach(function (box) {
      var key = box.getAttribute('data-en-list');
      if (key === 'portfolio') return; // filled by renderPortfolio
      var list = home[key];
      if (!Array.isArray(list) || !list.length) return;
      box.innerHTML = '';
      list.forEach(function (it) {
        var node;
        if (key === 'offer_points') {
          node = document.createElement('li');
          node.textContent = String(it);
        } else if (key === 'services') {
          node = document.createElement('article');
          node.className = 'card reveal in';
          node.innerHTML = '<div class="icon"></div><h3></h3><p></p>';
          node.querySelector('.icon').textContent = it.icon || '🎬';
          node.querySelector('h3').textContent = it.title || '';
          node.querySelector('p').textContent = it.text || '';
        } else if (key === 'steps') {
          node = document.createElement('div');
          node.className = 'step reveal in';
          node.innerHTML = '<h3></h3><p></p>';
          node.querySelector('h3').textContent = it.title || '';
          node.querySelector('p').textContent = it.text || '';
        } else if (key === 'faq') {
          node = document.createElement('details');
          node.className = 'card reveal in';
          var s = document.createElement('summary');
          var st = document.createElement('strong');
          st.textContent = it.q || '';
          s.appendChild(st);
          var p = document.createElement('p');
          p.textContent = it.a || '';
          node.appendChild(s);
          node.appendChild(p);
        } else { return; }
        box.appendChild(node);
      });
    });
    renderChannels(biz);
  }

  function renderPortfolio(items) {
    var grid = document.getElementById('portfolio-grid');
    if (!grid || !items || !items.length) return; // keep static frames
    grid.innerHTML = '';
    var frames = ['f1', 'f2', 'f3'];
    items.slice(0, 6).forEach(function (it, i) {
      var a = document.createElement('a');
      a.className = 'frame ' + frames[i % 3] + ' reveal in';
      var target = it.video_url || '#lead';
      a.href = target;
      if (target !== '#lead') { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      if (it.thumb_url) a.style.backgroundImage = 'url("' + it.thumb_url.replace(/"/g, '') + '")';
      var play = document.createElement('span');
      play.className = 'play';
      play.setAttribute('aria-hidden', 'true');
      play.innerHTML = '&#9654;';
      var t = document.createElement('strong');
      t.textContent = it.title || '';
      var c = document.createElement('small');
      c.textContent = it.caption || '';
      a.appendChild(play);
      a.appendChild(t);
      a.appendChild(c);
      grid.appendChild(a);
    });
  }

  function loadRemote() {
    var cfg = window.SITE_CONFIG || {};
    function done(rows) {
      var data = {};
      (rows || []).forEach(function (row) {
        try {
          var v = (typeof row.value === 'string') ? JSON.parse(row.value) : row.value;
          data[row.key] = v;
        } catch (e) { /* ignore bad row */ }
      });
      window.SITE_CONTENT = data;
      applyEnHome(data);
    }
    function loadPortfolio() {
      if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.fetch) return;
      fetch(cfg.SUPABASE_URL + '/rest/v1/portfolio_items?page=eq.en&visible=eq.true&order=sort.asc,id.desc&limit=6&select=title,caption,thumb_url,video_url', {
        headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY }
      }).then(function (r) { return r.ok ? r.json() : []; })
        .then(renderPortfolio)
        .catch(function () { /* static frames stay */ });
    }
    if (!cfg.SUPABASE_URL || !window.fetch) { applyEnHome({}); return; }
    fetch(cfg.SUPABASE_URL + '/rest/v1/site_content?select=key,value', {
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY }
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(done)
      .catch(function () { applyEnHome({}); });
    loadPortfolio();
  }

  /* ---------- scroll reveal ---------- */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* ---------- buttery touches: header shadow + smooth anchor offset ---------- */
  function initChrome() {
    var header = document.querySelector('.en-header');
    function onScroll() {
      if (header) header.classList.toggle('scrolled', window.scrollY > 8);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initReveal();
    initChrome();
    loadRemote();
  });
})();
