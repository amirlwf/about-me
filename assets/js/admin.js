/* Admin panel: Supabase Auth, live orders via Realtime, EN/FA content
   editor (page selector), contact channels with per-channel toggles,
   portfolio manager with storage uploads. No hardcoded credentials. */
(function () {
  'use strict';

  var cfg = window.SITE_CONFIG || {};
  var client = null;
  try {
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } catch (e) {
    document.getElementById('login-err').textContent = 'Connection error. Check your internet.';
    return;
  }

  var loginSection = document.getElementById('login-section');
  var panelSection = document.getElementById('panel-section');
  var logoutBtn = document.getElementById('logout-btn');
  var liveInd = document.getElementById('live-ind');
  var ordersBody = document.getElementById('orders-body');
  var orders = [];

  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  window.showToast = window.showToast || function (msg) {
    var t = document.getElementById('toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('show'); }, 4500);
  };

  /* ---------- tabs ---------- */
  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.tabpane').forEach(function (p) { p.classList.remove('active'); });
      tab.classList.add('active');
      document.getElementById('tab-' + tab.getAttribute('data-tab')).classList.add('active');
    });
  });

  /* ---------- auth ---------- */
  document.getElementById('login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var email = document.getElementById('l-email').value.trim();
    var pass = document.getElementById('l-pass').value;
    client.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
      if (res.error) {
        document.getElementById('login-err').textContent = 'Login failed: ' + res.error.message;
        return;
      }
      enterPanel();
    });
  });

  logoutBtn.addEventListener('click', function () {
    client.auth.signOut().then(function () { window.location.reload(); });
  });

  client.auth.getSession().then(function (res) {
    if (res.data && res.data.session) enterPanel();
  });

  function enterPanel() {
    loginSection.classList.add('hidden');
    panelSection.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    loadOrders();
    subscribeOrders();
    loadContent();
    loadChannels();
    loadPortfolio();
  }

  /* ---------- orders ---------- */
  var STATUS = { new: 'New', in_progress: 'In progress', done: 'Done' };

  function loadOrders() {
    client.from('orders').select('*').order('created_at', { ascending: false }).limit(100)
      .then(function (res) {
        if (res.error) { ordersBody.innerHTML = '<tr><td colspan="7">Error: ' + esc(res.error.message) + '</td></tr>'; return; }
        orders = res.data || [];
        renderOrders();
      });
  }

  document.getElementById('refresh-btn').addEventListener('click', loadOrders);
  document.getElementById('status-filter').addEventListener('change', renderOrders);
  document.getElementById('source-filter').addEventListener('change', renderOrders);

  function contactOf(o) {
    return o.phone || o.email || '';
  }

  function renderOrders() {
    var f = document.getElementById('status-filter').value;
    var src = document.getElementById('source-filter').value;
    var list = orders.filter(function (o) {
      return (!f || o.status === f) && (!src || (o.source || 'fa_site') === src);
    });
    if (!list.length) { ordersBody.innerHTML = '<tr><td colspan="7">No orders.</td></tr>'; return; }
    ordersBody.innerHTML = '';
    list.forEach(function (o) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', o.id);
      var d = new Date(o.created_at);
      var when = isNaN(d) ? '' : d.toLocaleString('en-GB');
      var isEN = (o.source || '') === 'en_landing';
      var desc = esc(o.description) +
        (o.raw_link ? '<br>Footage: <a href="' + esc(o.raw_link) + '" target="_blank" rel="noopener">link</a>' : '') +
        (o.admin_reply ? '<br><strong>Your reply:</strong> ' + esc(o.admin_reply) : '');
      tr.innerHTML =
        '<td>' + esc(when) + '</td>' +
        '<td>' + esc(o.name) + (isEN ? ' <span class="src-tag en">🎬[EN-FREE]</span>' : '') + '</td>' +
        '<td dir="ltr">' + esc(contactOf(o)) + '</td>' +
        '<td>' + esc(o.service) + ' / ' + esc(o.sub_service) + '</td>' +
        '<td>' + desc + '</td>' +
        '<td><span class="status-badge status-' + esc(o.status) + '">' + esc(STATUS[o.status] || o.status) + '</span></td>' +
        '<td><div class="admin-bar m-0">' +
        '<button data-act="accept">✅ Accept</button>' +
        '<button data-act="done">✔️ Done</button>' +
        '<button data-act="reply">💬 Reply</button>' +
        '<button data-act="del">🗑 Delete</button>' +
        '</div></td>';
      ordersBody.appendChild(tr);
    });
  }

  ordersBody.addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    var tr = ev.target.closest('tr[data-id]');
    var id = tr.getAttribute('data-id');
    var act = btn.getAttribute('data-act');
    if (act === 'accept') setStatus(id, 'in_progress');
    else if (act === 'done') setStatus(id, 'done');
    else if (act === 'reply') {
      var text = window.prompt('Reply to customer (stored in panel + notifications):');
      if (text) setReply(id, text);
    } else if (act === 'del') {
      if (window.confirm('Delete order #' + id + ' permanently?')) delOrder(id, tr);
    }
  });

  function delOrder(id, tr) {
    client.from('orders').delete().eq('id', id).then(function (res) {
      if (res.error) { window.showToast('Error: ' + res.error.message); return; }
      try { if (tr && tr.parentNode) tr.parentNode.removeChild(tr); } catch (e) {}
      orders = orders.filter(function (o) { return String(o.id) !== String(id); });
      window.showToast('Order #' + id + ' deleted.');
      loadOrders();
    });
  }

  function setStatus(id, status) {
    client.from('orders').update({ status: status }).eq('id', id).then(function (res) {
      if (res.error) { window.showToast('Error: ' + res.error.message); return; }
      client.from('notifications').insert({ order_id: id, channel: 'site', payload: { status: status } })
        .then(function () {
          window.showToast(status === 'done' ? 'Order done ✅' : 'Order accepted ✅');
          loadOrders();
        });
    });
  }

  function setReply(id, text) {
    client.from('orders').update({ admin_reply: text }).eq('id', id).then(function (res) {
      if (res.error) { window.showToast('Error: ' + res.error.message); return; }
      window.showToast('Reply saved.');
      loadOrders();
    });
  }

  /* ---------- order alerts: Notification API + beep ---------- */
  var notifyOn = false;

  function beep() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = beep._ctx || (beep._ctx = new AC());
      if (ctx.state === 'suspended') ctx.resume();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.65);
    } catch (e) { /* audio unavailable — toast still shows */ }
  }

  function notifyAdmin(title, body) {
    if (!notifyOn) return;
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: body, tag: 'new-order' });
      }
    } catch (e) { /* fall through to toast (already shown) */ }
  }

  document.getElementById('notify-btn').addEventListener('click', function () {
    if (!('Notification' in window)) {
      window.showToast('This browser has no notifications; sound + in-panel message stay on.');
      notifyOn = true;
      return;
    }
    Notification.requestPermission().then(function (perm) {
      if (perm === 'granted') {
        notifyOn = true;
        document.getElementById('notify-btn').textContent = '🔔 Alerts on';
        window.showToast('New-order alerts on ✅');
      } else {
        window.showToast('Permission denied; beep stays on.');
        notifyOn = true;
      }
    });
  });

  function subscribeOrders() {
    client.channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function (payload) {
        if (payload.eventType === 'INSERT') {
          orders.unshift(payload.new);
          var label = '🔔 New order: ' + (payload.new.name || '') + ' — ' + (payload.new.service || '');
          window.showToast(label);
          notifyAdmin('New order 🧾', (payload.new.name || '') + ' — ' + (payload.new.service || '') +
            ' — ' + contactOf(payload.new));
          beep();
        } else if (payload.eventType === 'UPDATE') {
          orders = orders.map(function (o) { return o.id === payload.new.id ? payload.new : o; });
        } else if (payload.eventType === 'DELETE') {
          orders = orders.filter(function (o) { return o.id !== payload.old.id; });
        }
        renderOrders();
      })
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') liveInd.classList.remove('hidden');
      });
  }

  /* ---------- page content editor (EN + FA) ---------- */
  var contentCache = {};

  // field schema per page: [key, label, kind] — kind: text | area | list | cards | steps | faq
  var EN_SCHEMA = [
    ['brand_name', 'Brand name (header + footer)', 'text'],
    ['footer_tagline', 'Footer tagline', 'text'],
    ['seo_title', 'SEO title (browser tab + Google, ≤60 chars)', 'text'],
    ['seo_description', 'SEO description (Google snippet, ≤155 chars)', 'area'],
    ['hero_eyebrow', 'Hero eyebrow', 'text'],
    ['hero_title', 'Hero title', 'text'],
    ['hero_lead', 'Hero subtitle', 'area'],
    ['hero_cta_primary', 'Hero button (primary)', 'text'],
    ['hero_cta_secondary', 'Hero button (secondary)', 'text'],
    ['hero_micro', 'Hero micro-line', 'text'],
    ['splash_kicker', 'Intro kicker (entry splash)', 'text'],
    ['splash_title', 'Intro title (entry splash, blank = brand)', 'text'],
    ['splash_sub', 'Intro subtitle (entry splash)', 'text'],
    ['splash_cta', 'Intro button (entry splash)', 'text'],
    ['work_title', 'Work section title', 'text'],
    ['work_sub', 'Work section subtitle', 'area'],
    ['offer_title', 'Offer title', 'text'],
    ['offer_sub', 'Offer subtitle', 'area'],
    ['offer_points', 'Offer checklist (one per line)', 'list'],
    ['offer_cta', 'Offer button', 'text'],
    ['services_title', 'Services title', 'text'],
    ['services_sub', 'Services subtitle', 'area'],
    ['services', 'Services (icon | title | text per line)', 'cards'],
    ['steps_title', 'Steps title', 'text'],
    ['steps_sub', 'Steps subtitle', 'area'],
    ['steps', 'Steps (title | text per line)', 'steps'],
    ['faq_title', 'FAQ title', 'text'],
    ['faq_sub', 'FAQ subtitle', 'area'],
    ['faq', 'FAQ (question | answer per line)', 'faq'],
    ['form_title', 'Form title', 'text'],
    ['form_sub', 'Form subtitle', 'area']
  ];
  var FA_SCHEMA = [
    ['seo_title', 'SEO title (browser tab + Google, ≤60 chars)', 'text'],
    ['seo_description', 'SEO description (Google snippet, ≤155 chars)', 'area'],
    ['hero_title', 'Hero title (H1)', 'text'],
    ['hero_lead', 'Hero subtitle', 'area'],
    ['hero_cta_primary', 'Hero button primary', 'text'],
    ['hero_cta_secondary', 'Hero button secondary', 'text'],
    ['card_edit_title', 'Card: video-editing title', 'text'],
    ['card_edit_text', 'Card: video-editing text', 'area'],
    ['card_web_title', 'Card: web-design title', 'text'],
    ['card_web_text', 'Card: web-design text', 'area'],
    ['card_pc_title', 'Card: computer-services title', 'text'],
    ['card_pc_text', 'Card: computer-services text', 'area'],
    ['faq_title', 'FAQ title', 'text'],
    ['faq', 'FAQ (question | answer per line)', 'faq'],
    ['form_title', 'Order form title', 'text']
  ];
  // service-page schema factory: svc = edit|web|pc (5 sub-services each)
  function faSvcSchema(svc) {
    var pre = 'fa_' + svc;
    void pre;
    var s = [
      ['seo_title', 'SEO title (browser tab + Google, ≤60 chars)', 'text'],
      ['seo_description', 'SEO description (Google snippet, ≤155 chars)', 'area'],
      ['hero_title', 'Hero title (H1)', 'text'],
      ['intro_title', 'Intro section title', 'text'],
      ['price_title', 'Pricing section title', 'text'],
      ['price_note2', 'Pricing guide paragraph (below the price line)', 'area'],
      ['subsvc_title', 'Sub-services section title', 'text'],
      ['subservices', 'Sub-services (title | text per line, order = page order)', 'steps'],
      ['faq_title', 'FAQ title', 'text'],
      ['faq', 'FAQ (question | answer per line)', 'faq'],
      ['more_title', '“Other services” title', 'text'],
      ['form_title', 'Order form title', 'text']
    ];
    for (var i = 0; i < 5; i++) s.push(['cta_' + i, 'Order button #' + (i + 1) + ' text (in page order)', 'text']);
    return s;
  }
  var PAGE_DEFS = {
    en:      { key: 'en_home', schema: EN_SCHEMA },
    fa:      { key: 'fa_home', schema: FA_SCHEMA },
    fa_edit: { key: 'fa_edit', schema: null },
    fa_web:  { key: 'fa_web',  schema: null },
    fa_pc:   { key: 'fa_pc',   schema: null },
    shared:  { key: null, schema: null } // business + services catalog
  };
  PAGE_DEFS.fa_edit.schema = faSvcSchema('edit');
  PAGE_DEFS.fa_web.schema = faSvcSchema('web');
  PAGE_DEFS.fa_pc.schema = faSvcSchema('pc');
  var SHARED_SCHEMA = [
    ['__biz__', '— Business info (shared: name, city, hours, area) —', 'sep'],
    ['business.name', 'Business name', 'text'],
    ['business.owner', 'Owner name', 'text'],
    ['business.city', 'City', 'text'],
    ['business.hours', 'Working hours', 'text'],
    ['business.area_note', 'Service-area note (FAQ answer)', 'area'],
    ['__svc__', '— Services catalog (titles, taglines, price lines, sub-service lists) —', 'sep'],
    ['services.edit.title', 'Edit: title', 'text'],
    ['services.edit.tagline', 'Edit: tagline (hero lead on edit page)', 'area'],
    ['services.edit.price_note', 'Edit: price line (cards + price section)', 'area'],
    ['services.edit.subservices', 'Edit: sub-service names (one per line — also fills order-form dropdown)', 'list'],
    ['services.web.title', 'Web: title', 'text'],
    ['services.web.tagline', 'Web: tagline (hero lead on web page)', 'area'],
    ['services.web.price_note', 'Web: price line (cards + price section)', 'area'],
    ['services.web.subservices', 'Web: sub-service names (one per line — also fills order-form dropdown)', 'list'],
    ['services.pc.title', 'PC: title', 'text'],
    ['services.pc.tagline', 'PC: tagline (hero lead on PC page)', 'area'],
    ['services.pc.price_note', 'PC: price line (cards + price section)', 'area'],
    ['services.pc.subservices', 'PC: sub-service names (one per line — also fills order-form dropdown)', 'list']
  ];

  function cardsToText(list, mapFn) {
    return (list || []).map(mapFn).join('\n');
  }
  function textToCards(text, mapFn) {
    return text.split('\n').map(function (l) { return l.trim(); })
      .filter(Boolean).map(mapFn).filter(Boolean);
  }

  function fieldToText(key, kind, val) {
    if (kind === 'list') return (val || []).join('\n');
    if (kind === 'cards') return cardsToText(val, function (c) { return (c.icon || '') + ' | ' + (c.title || '') + ' | ' + (c.text || ''); });
    if (kind === 'steps') return cardsToText(val, function (c) { return (c.title || '') + ' | ' + (c.text || ''); });
    if (kind === 'faq') return cardsToText(val, function (c) { return (c.q || '') + ' | ' + (c.a || ''); });
    return (val === undefined || val === null) ? '' : String(val);
  }

  function textToField(key, kind, text) {
    if (kind === 'list') return text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    if (kind === 'cards') return textToCards(text, function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      return p[1] ? { icon: p[0] || '🎬', title: p[1], text: p[2] || '' } : null;
    });
    if (kind === 'steps') return textToCards(text, function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      return p[0] ? { title: p[0], text: p[1] || '' } : null;
    });
    if (kind === 'faq') return textToCards(text, function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      return p[0] ? { q: p[0], a: p[1] || '' } : null;
    });
    return text;
  }

  function currentPage() {
    return document.getElementById('page-select').value || 'en';
  }
  function currentDef() {
    return PAGE_DEFS[currentPage()] || PAGE_DEFS.en;
  }
  function currentPageKey() {
    return currentDef().key;
  }
  function currentSchema() {
    return currentDef().schema;
  }
  function isShared() {
    return currentPage() === 'shared';
  }

  function sharedGet(path) {
    var parts = path.split('.');
    var root = parts[0] === 'business' ? (contentCache.business || {}) : (contentCache.services || {});
    var v = root;
    for (var i = 1; i < parts.length; i++) {
      v = (v && v[parts[i]] !== undefined) ? v[parts[i]] : undefined;
    }
    return v;
  }
  function sharedSet(obj, path, val) {
    var parts = path.split('.');
    var rootKey = parts[0];
    obj[rootKey] = obj[rootKey] || {};
    var node = obj[rootKey];
    for (var i = 1; i < parts.length - 1; i++) {
      node[parts[i]] = node[parts[i]] || {};
      node = node[parts[i]];
    }
    node[parts[parts.length - 1]] = val;
  }

  function renderContentFields() {
    var box = document.getElementById('content-fields');
    box.innerHTML = '';
    if (isShared()) {
      SHARED_SCHEMA.forEach(function (f) {
        var fkey = f[0], label = f[1], kind = f[2];
        var wrap = document.createElement('div');
        if (kind === 'sep') {
          wrap.className = 'sep-line';
          wrap.textContent = label;
          box.appendChild(wrap);
          return;
        }
        wrap.className = 'field';
        var lab = document.createElement('label');
        lab.setAttribute('for', 'cf-' + fkey.replace(/\./g, '_'));
        lab.textContent = label;
        var input = (kind === 'text') ? document.createElement('input') : document.createElement('textarea');
        if (kind === 'text') input.type = 'text';
        else { input.rows = kind === 'area' ? 3 : 6; input.className = 'tall'; }
        input.id = 'cf-' + fkey.replace(/\./g, '_');
        input.setAttribute('data-ckey', fkey);
        input.setAttribute('data-kind', kind);
        input.setAttribute('data-shared', '1');
        input.value = fieldToText(fkey, kind, sharedGet(fkey));
        if (document.body.dir === 'rtl' || /[\u0600-\u06FF]/.test(input.value)) input.dir = 'auto';
        else if (kind === 'text') input.dir = 'ltr';
        wrap.appendChild(lab);
        wrap.appendChild(input);
        box.appendChild(wrap);
      });
      return;
    }
    var key = currentPageKey();
    var data = contentCache[key] || {};
    currentSchema().forEach(function (f) {
      var fkey = f[0], label = f[1], kind = f[2];
      var wrap = document.createElement('div');
      wrap.className = 'field';
      var lab = document.createElement('label');
      lab.setAttribute('for', 'cf-' + fkey);
      lab.textContent = label;
      var input;
      if (kind === 'text') {
        input = document.createElement('input');
        input.type = 'text';
      } else {
        input = document.createElement('textarea');
        input.rows = kind === 'area' ? 3 : 6;
        input.className = 'tall';
      }
      input.id = 'cf-' + fkey;
      input.setAttribute('data-ckey', fkey);
      input.setAttribute('data-kind', kind);
      input.value = fieldToText(fkey, kind, data[fkey]);
      wrap.appendChild(lab);
      wrap.appendChild(input);
      box.appendChild(wrap);
    });
  }

  function loadContent() {
    client.from('site_content').select('key,value').then(function (res) {
      if (res.error || !res.data) return;
      res.data.forEach(function (row) {
        var v = row.value;
        try { if (typeof v === 'string') v = JSON.parse(v); } catch (e) {}
        contentCache[row.key] = v;
      });
      renderContentFields();
      renderChannelFields();
    });
  }

  document.getElementById('page-select').addEventListener('change', renderContentFields);

  function saveKey(key, value) {
    return client.from('site_content').upsert({ key: key, value: value }, { onConflict: 'key' });
  }

  document.getElementById('save-content-btn').addEventListener('click', function () {
    if (isShared()) {
      var staged = { business: Object.assign({}, contentCache.business || {}),
                     services: JSON.parse(JSON.stringify(contentCache.services || {})) };
      document.querySelectorAll('#content-fields [data-ckey]').forEach(function (input) {
        sharedSet(staged, input.getAttribute('data-ckey'),
          textToField(null, input.getAttribute('data-kind'), input.value));
      });
      var biz = staged.business;
      // keep legacy toggle object intact; strip accidental CHANGE_ME empties is handled in channels tab
      var p1 = saveKey('business', biz);
      var p2 = saveKey('services', staged.services);
      Promise.all([p1, p2]).then(function (rs) {
        var err = (rs[0] && rs[0].error) || (rs[1] && rs[1].error);
        if (err) { window.showToast('Error: ' + err.message); return; }
        contentCache.business = biz;
        contentCache.services = staged.services;
        window.showToast('Saved — live on the site within seconds.');
      });
      return;
    }
    var key = currentPageKey();
    var data = Object.assign({}, contentCache[key] || {});
    document.querySelectorAll('#content-fields [data-ckey]').forEach(function (input) {
      data[input.getAttribute('data-ckey')] = textToField(null, input.getAttribute('data-kind'), input.value);
    });
    saveKey(key, data).then(function (res) {
      if (res.error) { window.showToast('Error: ' + res.error.message); return; }
      contentCache[key] = data;
      window.showToast('Saved — live on the site within seconds.');
    });
  });

  /* ---------- channels: shared values + per-page toggles ---------- */
  var CHANNELS = [
    ['phone', 'Phone number', 'e.g. 09123456789', 'Show call button'],
    ['email', 'Email address', 'you@example.com', 'Show email button'],
    ['telegram', 'Telegram ID', 'username without @', 'Show Telegram button'],
    ['whatsapp', 'WhatsApp number', 'e.g. 09123456789', 'Show WhatsApp button'],
    ['youtube', 'YouTube', 'channel URL or @handle', 'Show YouTube button'],
    ['linkedin', 'LinkedIn', 'profile URL or username', 'Show LinkedIn button'],
    ['rubika', 'Rubika', 'ID or link', 'Show Rubika button']
  ];
  var CHANNEL_PAGES = ['en', 'fa', 'fa_edit', 'fa_web', 'fa_pc'];
  var CHANNEL_PAGE_LABEL = {
    en: 'English home', fa: 'Persian home', fa_edit: 'Video editing page',
    fa_web: 'Web design page', fa_pc: 'Computer services page'
  };

  function channelsPage() {
    var sel = document.getElementById('channels-page-select');
    return (sel && sel.value) || 'en';
  }
  function pageToggles(biz, scope) {
    var pc = (biz && biz.page_channels) || {};
    if (pc[scope] && typeof pc[scope] === 'object') return pc[scope];
    // first run: inherit legacy global toggles so nothing disappears
    return (biz && biz.channels_enabled) || {};
  }

  function renderChannelFields() {
    var biz = contentCache.business || {};
    var scope = channelsPage();
    var en = pageToggles(biz, scope);
    var box = document.getElementById('channels-fields');
    if (!box) return;
    box.innerHTML = '';
    var note = document.createElement('p');
    note.className = 'hint';
    note.textContent = 'Toggles below apply to: ' + (CHANNEL_PAGE_LABEL[scope] || scope) +
      '. Values are shared across all pages.';
    box.appendChild(note);
    CHANNELS.forEach(function (c) {
      var kind = c[0];
      var row = document.createElement('div');
      row.className = 'field';
      var lab = document.createElement('label');
      lab.setAttribute('for', 'chn-' + kind);
      lab.textContent = c[1] + '  (shared value)';
      var input = document.createElement('input');
      input.id = 'chn-' + kind;
      input.type = 'text';
      input.dir = 'ltr';
      input.placeholder = c[2];
      input.setAttribute('data-ch', kind);
      var cur = biz[kind];
      input.value = (typeof cur === 'string' && cur !== 'CHANGE_ME') ? cur : '';
      var check = document.createElement('div');
      check.className = 'check-line';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'chn-' + kind + '-en';
      cb.checked = en[kind] !== false;
      var clab = document.createElement('label');
      clab.setAttribute('for', 'chn-' + kind + '-en');
      clab.textContent = c[3] + ' — on ' + (CHANNEL_PAGE_LABEL[scope] || scope);
      check.appendChild(cb);
      check.appendChild(clab);
      row.appendChild(lab);
      row.appendChild(input);
      row.appendChild(check);
      box.appendChild(row);
    });
  }

  function loadChannels() {
    client.from('site_content').select('value').eq('key', 'business').single().then(function (res) {
      if (res.error || !res.data) { renderChannelFields(); return; }
      var v = res.data.value;
      try { if (typeof v === 'string') v = JSON.parse(v); } catch (e) {}
      contentCache.business = v || {};
      // one-time migration: copy legacy global toggles into every page scope
      var biz = contentCache.business;
      if (!biz.page_channels && biz.channels_enabled) {
        biz.page_channels = {};
        CHANNEL_PAGES.forEach(function (p) {
          biz.page_channels[p] = Object.assign({}, biz.channels_enabled);
        });
      }
      renderChannelFields();
    });
  }

  var chSel = document.getElementById('channels-page-select');
  if (chSel) chSel.addEventListener('change', renderChannelFields);

  document.getElementById('save-channels-btn').addEventListener('click', function () {
    var biz = Object.assign({}, contentCache.business || {});
    var scope = channelsPage();
    biz.page_channels = biz.page_channels || {};
    // ensure every page has an object so the site never falls back unexpectedly
    CHANNEL_PAGES.forEach(function (p) {
      if (!biz.page_channels[p] || typeof biz.page_channels[p] !== 'object') {
        biz.page_channels[p] = Object.assign({}, biz.channels_enabled || {});
      }
    });
    biz.page_channels[scope] = biz.page_channels[scope] || {};
    document.querySelectorAll('#channels-fields [data-ch]').forEach(function (input) {
      var kind = input.getAttribute('data-ch');
      var v = input.value.trim();
      biz[kind] = v || 'CHANGE_ME';
      var cb = document.getElementById('chn-' + kind + '-en');
      biz.page_channels[scope][kind] = !!(cb && cb.checked);
    });
    saveKey('business', biz).then(function (res) {
      if (res.error) { window.showToast('Error: ' + res.error.message); return; }
      contentCache.business = biz;
      window.showToast('Channels saved for ' + (CHANNEL_PAGE_LABEL[scope] || scope) + ' — live within seconds.');
    });
  });

  /* ---------- portfolio ---------- */
  var portfolioBody = document.getElementById('portfolio-body');

  function loadPortfolio() {
    client.from('portfolio_items').select('*').order('sort', { ascending: true }).order('id', { ascending: false }).limit(100)
      .then(function (res) {
        if (res.error) { portfolioBody.innerHTML = '<tr><td colspan="5">Error: ' + esc(res.error.message) + '</td></tr>'; return; }
        var list = res.data || [];
        if (!list.length) { portfolioBody.innerHTML = '<tr><td colspan="5">No portfolio items yet.</td></tr>'; return; }
        portfolioBody.innerHTML = '';
        list.forEach(function (it) {
          var tr = document.createElement('tr');
          tr.setAttribute('data-id', it.id);
          tr.innerHTML =
            '<td>' + (it.thumb_url ? '<img class="thumb-sm" src="' + esc(it.thumb_url) + '" alt="" loading="lazy">' : '—') + '</td>' +
            '<td>' + esc(it.title) + (it.caption ? '<br><small>' + esc(it.caption) + '</small>' : '') + '</td>' +
            '<td>' + esc(it.page === 'fa' ? 'Persian' : 'English') + '</td>' +
            '<td>' + (it.visible
              ? '<button data-pact="hide">👁 On</button>'
              : '<button data-pact="show">🚫 Off</button>') + '</td>' +
            '<td><div class="admin-bar m-0"><button data-pact="del">🗑 Delete</button></div></td>';
          portfolioBody.appendChild(tr);
        });
      });
  }

  portfolioBody.addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-pact]');
    if (!btn) return;
    var tr = ev.target.closest('tr[data-id]');
    var id = tr.getAttribute('data-id');
    var act = btn.getAttribute('data-pact');
    if (act === 'hide' || act === 'show') {
      client.from('portfolio_items').update({ visible: act === 'show' }).eq('id', id).then(function (res) {
        window.showToast(res.error ? 'Error: ' + res.error.message : 'Updated.');
        loadPortfolio();
      });
    } else if (act === 'del') {
      if (!window.confirm('Delete portfolio item #' + id + '?')) return;
      client.from('portfolio_items').delete().eq('id', id).then(function (res) {
        window.showToast(res.error ? 'Error: ' + res.error.message : 'Deleted.');
        loadPortfolio();
      });
    }
  });

  document.getElementById('p-add-btn').addEventListener('click', function () {
    var msg = document.getElementById('p-msg');
    var file = document.getElementById('p-thumb').files[0];
    var title = document.getElementById('p-title').value.trim();
    var caption = document.getElementById('p-caption').value.trim();
    var video = document.getElementById('p-video').value.trim();
    var sort = parseInt(document.getElementById('p-sort').value, 10) || 0;
    var visible = document.getElementById('p-visible').checked;
    var page = document.getElementById('p-page').value;
    if (title.length < 2) { msg.textContent = 'Title is required.'; return; }
    if (!file) { msg.textContent = 'Pick a thumbnail image first.'; return; }
    msg.textContent = 'Uploading…';
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    var path = page + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    client.storage.from('portfolio').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
      .then(function (up) {
        if (up.error) { msg.textContent = 'Upload failed: ' + up.error.message; return; }
        var pub = client.storage.from('portfolio').getPublicUrl(path);
        var thumbUrl = (pub.data && pub.data.publicUrl) || '';
        return client.from('portfolio_items').insert({
          page: page, title: title, caption: caption || null,
          thumb_url: thumbUrl, video_url: video || null,
          sort: sort, visible: visible
        }).then(function (ins) {
          if (ins.error) { msg.textContent = 'Saved upload but DB failed: ' + ins.error.message; return; }
          msg.textContent = 'Added ✅ — visible on the site now.';
          document.getElementById('p-title').value = '';
          document.getElementById('p-caption').value = '';
          document.getElementById('p-video').value = '';
          document.getElementById('p-thumb').value = '';
          loadPortfolio();
        });
      });
  });
})();
