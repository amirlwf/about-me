/* Admin panel: Supabase Auth, live orders via Realtime, status toggle,
   site_content editor, contact-channels editor. No hardcoded credentials. */
(function () {
  'use strict';

  var cfg = window.SITE_CONFIG || {};
  var client = null;
  try {
    client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  } catch (e) {
    document.getElementById('login-err').textContent = 'خطا در اتصال به سرور. اتصال اینترنت را بررسی کنید.';
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

  /* ---------- auth ---------- */
  document.getElementById('login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var email = document.getElementById('l-email').value.trim();
    var pass = document.getElementById('l-pass').value;
    client.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
      if (res.error) {
        document.getElementById('login-err').textContent = 'ورود ناموفق: ' + res.error.message;
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
    loginSection.style.display = 'none';
    panelSection.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    loadOrders();
    subscribeOrders();
    loadContent();
  }

  /* ---------- orders ---------- */
  var STATUS_FA = { new: 'جدید', in_progress: 'در حال انجام', done: 'انجام‌شده' };

  function loadOrders() {
    client.from('orders').select('*').order('created_at', { ascending: false }).limit(100)
      .then(function (res) {
        if (res.error) { ordersBody.innerHTML = '<tr><td colspan="7">خطا: ' + esc(res.error.message) + '</td></tr>'; return; }
        orders = res.data || [];
        renderOrders();
      });
  }

  document.getElementById('refresh-btn').addEventListener('click', loadOrders);
  document.getElementById('status-filter').addEventListener('change', renderOrders);

  function renderOrders() {
    var f = document.getElementById('status-filter').value;
    var list = f ? orders.filter(function (o) { return o.status === f; }) : orders;
    if (!list.length) { ordersBody.innerHTML = '<tr><td colspan="7">سفارشی نیست.</td></tr>'; return; }
    ordersBody.innerHTML = '';
    list.forEach(function (o) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', o.id);
      var d = new Date(o.created_at);
      var when = isNaN(d) ? '' : d.toLocaleString('fa-IR');
      tr.innerHTML =
        '<td>' + esc(when) + '</td>' +
        '<td>' + esc(o.name) + '</td>' +
        '<td dir="ltr">' + esc(o.phone) + '</td>' +
        '<td>' + esc(o.service) + ' / ' + esc(o.sub_service) + '</td>' +
        '<td>' + esc(o.description) + (o.admin_reply ? '<br><strong>پاسخ شما:</strong> ' + esc(o.admin_reply) : '') + '</td>' +
        '<td><span class="status-badge status-' + esc(o.status) + '">' + esc(STATUS_FA[o.status] || o.status) + '</span></td>' +
        '<td><div class="admin-bar" style="margin:0">' +
        '<button data-act="accept">✅ قبول</button>' +
        '<button data-act="done">✔️ انجام شد</button>' +
        '<button data-act="reply">💬 پاسخ</button>' +
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
      var text = window.prompt('پاسخ به مشتری (در پنل و اعلان ذخیره می‌شود):');
      if (text) setReply(id, text);
    }
  });

  function setStatus(id, status) {
    client.from('orders').update({ status: status }).eq('id', id).then(function (res) {
      if (res.error) { window.showToast('خطا: ' + res.error.message); return; }
      // log a notification row so the customer + telegram bot pick it up
      client.from('notifications').insert({ order_id: id, channel: 'site', payload: { status: status } })
        .then(function () {
          window.showToast(status === 'done' ? 'سفارش انجام شد ✅' : 'سفارش قبول شد ✅');
          loadOrders();
        });
    });
  }

  function setReply(id, text) {
    client.from('orders').update({ admin_reply: text }).eq('id', id).then(function (res) {
      if (res.error) { window.showToast('خطا: ' + res.error.message); return; }
      window.showToast('پاسخ ذخیره شد.');
      loadOrders();
    });
  }

  function subscribeOrders() {
    client.channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function (payload) {
        if (payload.eventType === 'INSERT') {
          orders.unshift(payload.new);
          window.showToast('🔔 سفارش جدید: ' + (payload.new.name || '') + ' — ' + (payload.new.service || ''));
        } else if (payload.eventType === 'UPDATE') {
          orders = orders.map(function (o) { return o.id === payload.new.id ? payload.new : o; });
        } else if (payload.eventType === 'DELETE') {
          orders = orders.filter(function (o) { return o.id !== payload.old.id; });
        }
        renderOrders();
      })
      .subscribe(function (status) {
        if (status === 'SUBSCRIBED') liveInd.style.display = 'inline-block';
      });
  }

  /* ---------- site_content editor ---------- */
  var contentCache = {};

  function loadContent() {
    client.from('site_content').select('key,value').then(function (res) {
      if (res.error || !res.data) return;
      res.data.forEach(function (row) {
        var v = row.value;
        try { if (typeof v === 'string') v = JSON.parse(v); } catch (e) {}
        contentCache[row.key] = v;
      });
      var biz = contentCache.business || {};
      if (biz.hours) document.getElementById('c-hours').value = biz.hours;
      if (biz.city) document.getElementById('c-city').value = biz.city;
      if (biz.phone) document.getElementById('ch-phone').value = biz.phone;
      if (biz.telegram && biz.telegram !== 'CHANGE_ME') document.getElementById('ch-telegram').value = biz.telegram;
      if (biz.whatsapp) document.getElementById('ch-whatsapp').value = biz.whatsapp;
      if (biz.rubika && biz.rubika !== 'CHANGE_ME') document.getElementById('ch-rubika').value = biz.rubika;
      var en = biz.channels_enabled || {};
      document.getElementById('ch-phone-en').checked = en.phone !== false;
      document.getElementById('ch-telegram-en').checked = en.telegram !== false;
      document.getElementById('ch-whatsapp-en').checked = en.whatsapp !== false;
      document.getElementById('ch-rubika-en').checked = en.rubika !== false;
    });
  }

  function saveKey(key, value) {
    return client.from('site_content').upsert({ key: key, value: value }, { onConflict: 'key' });
  }

  document.getElementById('save-content-btn').addEventListener('click', function () {
    var biz = contentCache.business || {};
    var h = document.getElementById('c-hours').value.trim();
    var c = document.getElementById('c-city').value.trim();
    if (h) biz.hours = h;
    if (c) biz.city = c;
    saveKey('business', biz).then(function (res) {
      window.showToast(res.error ? 'خطا: ' + res.error.message : 'محتوا ذخیره شد و روی سایت اعمال می‌شود.');
    });
  });

  document.getElementById('save-channels-btn').addEventListener('click', function () {
    var biz = contentCache.business || {};
    biz.phone = document.getElementById('ch-phone').value.trim();
    biz.telegram = document.getElementById('ch-telegram').value.trim() || 'CHANGE_ME';
    biz.whatsapp = document.getElementById('ch-whatsapp').value.trim();
    biz.rubika = document.getElementById('ch-rubika').value.trim() || 'CHANGE_ME';
    biz.channels_enabled = {
      phone: document.getElementById('ch-phone-en').checked,
      telegram: document.getElementById('ch-telegram-en').checked,
      whatsapp: document.getElementById('ch-whatsapp-en').checked,
      rubika: document.getElementById('ch-rubika-en').checked
    };
    saveKey('business', biz).then(function (res) {
      window.showToast(res.error ? 'خطا: ' + res.error.message : 'کانال‌ها ذخیره شد و روی سایت اعمال می‌شود.');
    });
  });
})();
