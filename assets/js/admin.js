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
    ['hero_title', 'Hero title (FA)', 'text'],
    ['hero_lead', 'Hero subtitle (FA)', 'area'],
    ['hero_cta_primary', 'Hero button primary (FA)', 'text'],
    ['hero_cta_secondary', 'Hero button secondary (FA)', 'text']
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

  function currentPageKey() {
    return document.getElementById('page-select').value === 'fa' ? 'fa_home' : 'en_home';
  }
  function currentSchema() {
    return document.getElementById('page-select').value === 'fa' ? FA_SCHEMA : EN_SCHEMA;
  }

  function renderContentFields() {
    var key = currentPageKey();
    var data = contentCache[key] || {};
    var box = document.getElementById('content-fields');
    box.innerHTML = '';
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
    });
  }

  document.getElementById('page-select').addEventListener('change', renderContentFields);

  function saveKey(key, value) {
    return client.from('site_content').upsert({ key: key, value: value }, { onConflict: 'key' });
  }

  document.getElementById('save-content-btn').addEventListener('click', function () {
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

  /* ---------- channels ---------- */
  var CHANNELS = [
    ['phone', 'Phone number', 'e.g. 09123456789', 'Show call button'],
    ['email', 'Email address', 'you@example.com', 'Show email button'],
    ['telegram', 'Telegram ID', 'username without @', 'Show Telegram button'],
    ['whatsapp', 'WhatsApp number', 'e.g. 09123456789', 'Show WhatsApp button'],
    ['youtube', 'YouTube', 'channel URL or @handle', 'Show YouTube button'],
    ['linkedin', 'LinkedIn', 'profile URL or username', 'Show LinkedIn button'],
    ['rubika', 'Rubika', 'ID or link', 'Show Rubika button']
  ];

  function renderChannelFields() {
    var biz = contentCache.business || {};
    var en = biz.channels_enabled || {};
    var box = document.getElementById('channels-fields');
    box.innerHTML = '';
    CHANNELS.forEach(function (c) {
      var kind = c[0];
      var row = document.createElement('div');
      row.className = 'field';
      var lab = document.createElement('label');
      lab.setAttribute('for', 'chn-' + kind);
      lab.textContent = c[1];
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
      clab.textContent = c[3];
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
      renderChannelFields();
    });
  }

  document.getElementById('save-channels-btn').addEventListener('click', function () {
    var biz = Object.assign({}, contentCache.business || {});
    biz.channels_enabled = biz.channels_enabled || {};
    document.querySelectorAll('#channels-fields [data-ch]').forEach(function (input) {
      var kind = input.getAttribute('data-ch');
      var v = input.value.trim();
      biz[kind] = v || 'CHANGE_ME';
      var cb = document.getElementById('chn-' + kind + '-en');
      biz.channels_enabled[kind] = !!(cb && cb.checked);
    });
    saveKey('business', biz).then(function (res) {
      if (res.error) { window.showToast('Error: ' + res.error.message); return; }
      contentCache.business = biz;
      window.showToast('Channels saved — live on the site within seconds.');
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
