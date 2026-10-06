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
    document.getElementById('login-err').textContent = 'خطای اتصال. اینترنت خود را بررسی کنید.';
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
    loginSection.classList.add('hidden');
    panelSection.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    loadOrders();
    subscribeOrders();
    loadChat();
    subscribeChat();
    loadContent();
    loadChannels();
    loadPortfolio();
    loadBots();
  }

  /* ---------- orders ---------- */
  var STATUS = { new: 'جدید', in_progress: 'در حال انجام', done: 'انجام شد' };

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
    if (!list.length) { ordersBody.innerHTML = '<tr><td colspan="7">سفارشی وجود ندارد.</td></tr>'; return; }
    ordersBody.innerHTML = '';
    list.forEach(function (o) {
      var tr = document.createElement('tr');
      tr.setAttribute('data-id', o.id);
      var d = new Date(o.created_at);
      var when = isNaN(d) ? '' : d.toLocaleString('en-GB');
      var isEN = (o.source || '') === 'en_landing';
      var desc = esc(o.description) +
        (o.raw_link ? '<br>لینک فایل: <a href="' + esc(o.raw_link) + '" target="_blank" rel="noopener">لینک</a>' : '') +
        (o.admin_reply ? '<br><strong>پاسخ شما:</strong> ' + esc(o.admin_reply) : '');
      tr.innerHTML =
        '<td>' + esc(when) + '</td>' +
        '<td>' + esc(o.name) + (isEN ? ' <span class="src-tag en">🎬[EN-FREE]</span>' : '') + '</td>' +
        '<td dir="ltr">' + esc(contactOf(o)) + '</td>' +
        '<td>' + esc(o.service) + ' / ' + esc(o.sub_service) + '</td>' +
        '<td>' + desc + '</td>' +
        '<td><span class="status-badge status-' + esc(o.status) + '">' + esc(STATUS[o.status] || o.status) + '</span></td>' +
        '<td><div class="admin-bar m-0">' +
        '<button data-act="accept">✅ پذیرش</button>' +
        '<button data-act="done">✔️ انجام شد</button>' +
        '<button data-act="reply">💬 پاسخ</button>' +
        '<button data-act="del">🗑 حذف</button>' +
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
      var text = window.prompt('پاسخ به مشتری (در پنل و اطلاع‌رسانی ذخیره می‌شود):');
      if (text) setReply(id, text);
    } else if (act === 'del') {
      if (window.confirm('سفارش #' + id + ' برای همیشه حذف شود؟')) delOrder(id, tr);
    }
  });

  function delOrder(id, tr) {
    client.from('orders').delete().eq('id', id).then(function (res) {
      if (res.error) { window.showToast('خطا: ' + res.error.message); return; }
      try { if (tr && tr.parentNode) tr.parentNode.removeChild(tr); } catch (e) {}
      orders = orders.filter(function (o) { return String(o.id) !== String(id); });
      window.showToast('سفارش #' + id + ' حذف شد.');
      loadOrders();
    });
  }

  function setStatus(id, status) {
    client.from('orders').update({ status: status }).eq('id', id).then(function (res) {
      if (res.error) { window.showToast('خطا: ' + res.error.message); return; }
      client.from('notifications').insert({ order_id: id, channel: 'site', payload: { status: status } })
        .then(function () {
          window.showToast(status === 'done' ? 'سفارش انجام شد ✅' : 'سفارش پذیرفته شد ✅');
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
      window.showToast('این مرورگر اعلان ندارد؛ صدا و پیام داخل پنل فعال می‌ماند.');
      notifyOn = true;
      return;
    }
    Notification.requestPermission().then(function (perm) {
      if (perm === 'granted') {
        notifyOn = true;
        document.getElementById('notify-btn').textContent = '🔔 اعلان‌ها روشن';
        window.showToast('اعلان سفارش جدید فعال شد ✅');
      } else {
        window.showToast('اجازه داده نشد؛ صدا فعال می‌ماند.');
        notifyOn = true;
      }
    });
  });

  function subscribeOrders() {
    client.channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function (payload) {
        if (payload.eventType === 'INSERT') {
          orders.unshift(payload.new);
          var label = '🔔 سفارش جدید: ' + (payload.new.name || '') + ' — ' + (payload.new.service || '');
          window.showToast(label);
          notifyAdmin('سفارش جدید 🧾', (payload.new.name || '') + ' — ' + (payload.new.service || '') +
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
    ['brand_name', 'نام برند (هدر و فوتر)', 'text'],
    ['footer_tagline', 'شعار فوتر', 'text'],
    ['seo_title', 'عنوان سئو (تیتر تب و گوگل، حداکثر ۶۰ کاراکتر)', 'text'],
    ['seo_description', 'توضیح سئو (توضیح گوگل، حداکثر ۱۵۵ کاراکتر)', 'area'],
    ['hero_eyebrow', 'سطر بالای تیتر اصلی', 'text'],
    ['hero_title', 'تیتر اصلی (H1)', 'text'],
    ['hero_lead', 'متن زیر تیتر اصلی', 'area'],
    ['hero_cta_primary', 'دکمه اصلی زیر تیتر', 'text'],
    ['hero_cta_secondary', 'دکمه فرعی زیر تیتر', 'text'],
    ['hero_micro', 'خط کوتاه زیر دکمه‌ها', 'text'],
    ['splash_kicker', 'متن بالای ورود سینمایی', 'text'],
    ['splash_title', 'تیتر ورود سینمایی (خالی = نام برند)', 'text'],
    ['splash_sub', 'زیرنویس ورود سینمایی', 'text'],
    ['splash_cta', 'دکمه ورود سینمایی', 'text'],
    ['work_title', 'عنوان بخش نمونه‌کارها', 'text'],
    ['work_sub', 'زیرعنوان بخش نمونه‌کارها', 'area'],
    ['offer_title', 'عنوان پیشنهاد رایگان', 'text'],
    ['offer_sub', 'زیرعنوان پیشنهاد رایگان', 'area'],
    ['offer_points', 'چک‌لیست پیشنهاد (هر خط یک مورد)', 'list'],
    ['offer_cta', 'دکمه پیشنهاد رایگان', 'text'],
    ['services_title', 'عنوان بخش خدمات', 'text'],
    ['services_sub', 'زیرعنوان بخش خدمات', 'area'],
    ['services', 'خدمات (آیکون | عنوان | متن، هر خط یک مورد)', 'cards'],
    ['steps_title', 'عنوان مراحل کار', 'text'],
    ['steps_sub', 'زیرعنوان مراحل کار', 'area'],
    ['steps', 'مراحل (عنوان | متن، هر خط یک مرحله)', 'steps'],
    ['faq_title', 'عنوان سوالات پرتکرار', 'text'],
    ['faq_sub', 'زیرعنوان سوالات پرتکرار', 'area'],
    ['faq', 'سوالات (سوال | پاسخ، هر خط یک سوال)', 'faq'],
    ['form_title', 'عنوان فرم', 'text'],
    ['form_sub', 'زیرعنوان فرم', 'area']
  ];
  var FA_SCHEMA = [
    ['seo_title', 'عنوان سئو (تیتر تب و گوگل، حداکثر ۶۰ کاراکتر)', 'text'],
    ['seo_description', 'توضیح سئو (توضیح گوگل، حداکثر ۱۵۵ کاراکتر)', 'area'],
    ['hero_title', 'تیتر اصلی (H1)', 'text'],
    ['hero_lead', 'متن زیر تیتر اصلی', 'area'],
    ['hero_cta_primary', 'دکمه اصلی زیر تیتر', 'text'],
    ['hero_cta_secondary', 'دکمه فرعی زیر تیتر', 'text'],
    ['card_edit_title', 'کارت ادیت ویدیو: عنوان', 'text'],
    ['card_edit_text', 'کارت ادیت ویدیو: متن', 'area'],
    ['card_web_title', 'کارت طراحی سایت: عنوان', 'text'],
    ['card_web_text', 'کارت طراحی سایت: متن', 'area'],
    ['card_pc_title', 'کارت خدمات کامپیوتری: عنوان', 'text'],
    ['card_pc_text', 'کارت خدمات کامپیوتری: متن', 'area'],
    ['faq_title', 'عنوان سوالات پرتکرار', 'text'],
    ['faq', 'سوالات (سوال | پاسخ، هر خط یک سوال)', 'faq'],
    ['form_title', 'عنوان فرم سفارش', 'text']
  ];
  // service-page schema factory: svc = edit|web|pc (5 sub-services each)
  function faSvcSchema(svc) {
    var pre = 'fa_' + svc;
    void pre;
    var s = [
      ['seo_title', 'عنوان سئو (تیتر تب و گوگل، حداکثر ۶۰ کاراکتر)', 'text'],
      ['seo_description', 'توضیح سئو (توضیح گوگل، حداکثر ۱۵۵ کاراکتر)', 'area'],
      ['hero_title', 'تیتر اصلی (H1)', 'text'],
      ['intro_title', 'عنوان بخش مقدمه', 'text'],
      ['price_title', 'عنوان بخش هزینه‌ها', 'text'],
      ['price_note2', 'بند راهنمای قیمت (زیر خط قیمت)', 'area'],
      ['subsvc_title', 'عنوان بخش زیرخدمت‌ها', 'text'],
      ['subservices', 'زیرخدمت‌ها (عنوان | متن، ترتیب = ترتیب صفحه)', 'steps'],
      ['faq_title', 'عنوان سوالات پرتکرار', 'text'],
      ['faq', 'سوالات (سوال | پاسخ، هر خط یک سوال)', 'faq'],
      ['more_title', 'عنوان «سایر خدمات»', 'text'],
      ['form_title', 'عنوان فرم سفارش', 'text']
    ];
    for (var i = 0; i < 5; i++) s.push(['cta_' + i, 'متن دکمه سفارش #' + (i + 1) + ' (به ترتیب صفحه)', 'text']);
    return s;
  }
  // EN service-page schema factory: svc = edit|web (/en/services/*)
  function enSvcSchema(svc) {
    void svc;
    var s = [
      ['seo_title', 'عنوان سئو (تیتر تب و گوگل، حداکثر ۶۰ کاراکتر)', 'text'],
      ['seo_description', 'توضیح سئو (توضیح گوگل، حداکثر ۱۵۵ کاراکتر)', 'area'],
      ['brand_name', 'نام برند (هدر و فوتر)', 'text'],
      ['footer_tagline', 'شعار فوتر', 'text'],
      ['eyebrow', 'سطر بالای تیتر اصلی', 'text'],
      ['hero_title', 'تیتر اصلی (H1)', 'text'],
      ['hero_lead', 'متن زیر تیتر اصلی', 'area'],
      ['included_title', 'عنوان بخش «چه چیزی ارائه می‌شود»', 'text'],
      ['included_sub', 'زیرعنوان آن بخش', 'area'],
      ['included', 'آیتم‌های شبکه (آیکون | عنوان | متن)', 'cards'],
      ['offer_title', 'عنوان پیشنهاد رایگان', 'text'],
      ['offer_sub', 'زیرعنوان پیشنهاد رایگان', 'area'],
      ['steps_title', 'عنوان مراحل کار', 'text'],
      ['faq_title', 'عنوان سوالات پرتکرار', 'text'],
      ['faq', 'سوالات (سوال | پاسخ)', 'faq'],
      ['related_title', 'عنوان خدمات مرتبط', 'text'],
      ['form_title', 'عنوان فرم', 'text']
    ];
    return s;
  }
  var PAGE_DEFS = {
    en:      { key: 'en_home', schema: EN_SCHEMA },
    en_edit: { key: 'en_edit', schema: null },
    en_web:  { key: 'en_web',  schema: null },
    fa:      { key: 'fa_home', schema: FA_SCHEMA },
    fa_edit: { key: 'fa_edit', schema: null },
    fa_web:  { key: 'fa_web',  schema: null },
    fa_pc:   { key: 'fa_pc',   schema: null },
    shared:  { key: null, schema: null } // business + services catalog
  };
  PAGE_DEFS.en_edit.schema = enSvcSchema('edit');
  PAGE_DEFS.en_web.schema = enSvcSchema('web');
  PAGE_DEFS.fa_edit.schema = faSvcSchema('edit');
  PAGE_DEFS.fa_web.schema = faSvcSchema('web');
  PAGE_DEFS.fa_pc.schema = faSvcSchema('pc');
  var SHARED_SCHEMA = [
    ['__biz__', '— اطلاعات کسب‌وکار (مشترک: نام، شهر، ساعات، مناطق) —', 'sep'],
    ['business.name', 'نام کسب‌وکار', 'text'],
    ['business.owner', 'نام مالک', 'text'],
    ['business.city', 'شهر', 'text'],
    ['business.hours', 'ساعات کاری', 'text'],
    ['business.area_note', 'توضیح مناطق خدمات (پاسخ سوال پرتکرار)', 'area'],
    ['__svc__', '— کاتالوگ خدمات (عنوان، شعار، خط قیمت، فهرست زیرخدمت‌ها) —', 'sep'],
    ['services.edit.title', 'ادیت: عنوان', 'text'],
    ['services.edit.tagline', 'ادیت: شعار (متن زیر تیتر صفحه ادیت)', 'area'],
    ['services.edit.price_note', 'ادیت: خط قیمت (کارت‌ها و بخش هزینه)', 'area'],
    ['services.edit.subservices', 'ادیت: نام زیرخدمت‌ها (هر خط یک مورد — فهرست کشویی فرم سفارش را هم پر می‌کند)', 'list'],
    ['services.web.title', 'طراحی سایت: عنوان', 'text'],
    ['services.web.tagline', 'طراحی سایت: شعار (متن زیر تیتر صفحه وب)', 'area'],
    ['services.web.price_note', 'طراحی سایت: خط قیمت (کارت‌ها و بخش هزینه)', 'area'],
    ['services.web.subservices', 'طراحی سایت: نام زیرخدمت‌ها (هر خط یک مورد — فهرست کشویی فرم سفارش را هم پر می‌کند)', 'list'],
    ['services.pc.title', 'خدمات کامپیوتری: عنوان', 'text'],
    ['services.pc.tagline', 'خدمات کامپیوتری: شعار (متن زیر تیتر صفحه)', 'area'],
    ['services.pc.price_note', 'خدمات کامپیوتری: خط قیمت (کارت‌ها و بخش هزینه)', 'area'],
    ['services.pc.subservices', 'خدمات کامپیوتری: نام زیرخدمت‌ها (هر خط یک مورد — فهرست کشویی فرم سفارش را هم پر می‌کند)', 'list']
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
      renderSeo();
      renderSeoTable();
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
        if (err) { window.showToast('خطا: ' + err.message); return; }
        contentCache.business = biz;
        contentCache.services = staged.services;
        window.showToast('ذخیره شد — ظرف چند ثانیه روی سایت اعمال می‌شود.');
      });
      return;
    }
    var key = currentPageKey();
    var data = Object.assign({}, contentCache[key] || {});
    document.querySelectorAll('#content-fields [data-ckey]').forEach(function (input) {
      data[input.getAttribute('data-ckey')] = textToField(null, input.getAttribute('data-kind'), input.value);
    });
    saveKey(key, data).then(function (res) {
      if (res.error) { window.showToast('خطا: ' + res.error.message); return; }
      contentCache[key] = data;
      window.showToast('ذخیره شد — ظرف چند ثانیه روی سایت اعمال می‌شود.');
    });
  });

  /* ---------- channels: shared values + per-page toggles ---------- */
  var CHANNELS = [
    ['phone', 'شماره تلفن', 'مثلاً 09123456789', 'نمایش دکمه تماس'],
    ['email', 'ایمیل', 'you@example.com', 'نمایش دکمه ایمیل'],
    ['telegram', 'آیدی تلگرام', 'یوزرنیم بدون @', 'نمایش دکمه تلگرام'],
    ['whatsapp', 'شماره واتساپ', 'مثلاً 09123456789', 'نمایش دکمه واتساپ'],
    ['youtube', 'یوتیوب', 'لینک کانال یا @handle', 'نمایش دکمه یوتیوب'],
    ['linkedin', 'لینکدین', 'لینک پروفایل یا یوزرنیم', 'نمایش دکمه لینکدین'],
    ['rubika', 'روبیکا', 'آیدی یا لینک', 'نمایش دکمه روبیکا']
  ];
  var CHANNEL_PAGES = ['en', 'en_edit', 'en_web', 'fa', 'fa_edit', 'fa_web', 'fa_pc'];
  var CHANNEL_PAGE_LABEL = {
    en: 'صفحه اصلی انگلیسی', fa: 'صفحه اصلی فارسی', fa_edit: 'صفحه ادیت ویدیو',
    fa_web: 'صفحه طراحی سایت', fa_pc: 'صفحه خدمات کامپیوتری',
    en_edit: 'صفحه انگلیسی: ادیت ویدیو', en_web: 'صفحه انگلیسی: طراحی سایت'
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
    note.textContent = 'کلیدهای زیر برای این صفحه اعمال می‌شوند: ' + (CHANNEL_PAGE_LABEL[scope] || scope) +
      '. مقادیر (شماره‌ها و آیدی‌ها) بین همه صفحه‌ها مشترک است.';
    box.appendChild(note);
    CHANNELS.forEach(function (c) {
      var kind = c[0];
      var row = document.createElement('div');
      row.className = 'field';
      var lab = document.createElement('label');
      lab.setAttribute('for', 'chn-' + kind);
      lab.textContent = c[1] + '  (مقدار مشترک)';
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
      clab.textContent = c[3] + ' — در ' + (CHANNEL_PAGE_LABEL[scope] || scope);
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
      if (res.error) { window.showToast('خطا: ' + res.error.message); return; }
      contentCache.business = biz;
      window.showToast('کانال‌های ' + (CHANNEL_PAGE_LABEL[scope] || scope) + ' ذخیره شد — ظرف چند ثانیه روی سایت اعمال می‌شود.');
    });
  });

  /* ---------- portfolio ---------- */
  var portfolioBody = document.getElementById('portfolio-body');

  function loadPortfolio() {
    client.from('portfolio_items').select('*').order('sort', { ascending: true }).order('id', { ascending: false }).limit(100)
      .then(function (res) {
        if (res.error) { portfolioBody.innerHTML = '<tr><td colspan="5">خطا: ' + esc(res.error.message) + '</td></tr>'; return; }
        var list = res.data || [];
        if (!list.length) { portfolioBody.innerHTML = '<tr><td colspan="5">هنوز نمونه‌کاری ثبت نشده است.</td></tr>'; return; }
        portfolioBody.innerHTML = '';
        list.forEach(function (it) {
          var tr = document.createElement('tr');
          tr.setAttribute('data-id', it.id);
          tr.innerHTML =
            '<td>' + (it.thumb_url ? '<img class="thumb-sm" src="' + esc(it.thumb_url) + '" alt="" loading="lazy">' : '—') + '</td>' +
            '<td>' + esc(it.title) + (it.caption ? '<br><small>' + esc(it.caption) + '</small>' : '') + '</td>' +
            '<td>' + esc(it.page === 'fa' ? 'فارسی' : 'انگلیسی') + '</td>' +
            '<td>' + (it.visible
              ? '<button data-pact="hide">👁 نمایش</button>'
              : '<button data-pact="show">🚫 پنهان</button>') + '</td>' +
            '<td><div class="admin-bar m-0"><button data-pact="del">🗑 حذف</button></div></td>';
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
        window.showToast(res.error ? 'خطا: ' + res.error.message : 'به‌روزرسانی شد.');
        loadPortfolio();
      });
    } else if (act === 'del') {
      if (!window.confirm('نمونه‌کار #' + id + ' حذف شود؟')) return;
      client.from('portfolio_items').delete().eq('id', id).then(function (res) {
        window.showToast(res.error ? 'خطا: ' + res.error.message : 'حذف شد.');
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
    if (title.length < 2) { msg.textContent = 'عنوان الزامی است.'; return; }
    if (!file) { msg.textContent = 'اول یک تصویر بندانگشتی انتخاب کنید.'; return; }
    msg.textContent = 'در حال آپلود…';
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    var path = page + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    client.storage.from('portfolio').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
      .then(function (up) {
        if (up.error) { msg.textContent = 'آپلود ناموفق: ' + up.error.message; return; }
        var pub = client.storage.from('portfolio').getPublicUrl(path);
        var thumbUrl = (pub.data && pub.data.publicUrl) || '';
        return client.from('portfolio_items').insert({
          page: page, title: title, caption: caption || null,
          thumb_url: thumbUrl, video_url: video || null,
          sort: sort, visible: visible
        }).then(function (ins) {
          if (ins.error) { msg.textContent = 'فایل آپلود شد ولی ثبت در دیتابیس ناموفق: ' + ins.error.message; return; }
          msg.textContent = 'اضافه شد ✅ — همین حالا روی سایت نمایش داده می‌شود.';
          document.getElementById('p-title').value = '';
          document.getElementById('p-caption').value = '';
          document.getElementById('p-video').value = '';
          document.getElementById('p-thumb').value = '';
          loadPortfolio();
        });
      });
  });

  /* ---------- live chat (chat_messages) ---------- */
  var chatRows = [];
  var chatReplyTo = '';

  function loadChat() {
    client.from('chat_messages').select('*').order('id', { ascending: false }).limit(300)
      .then(function (res) {
        var body = document.getElementById('chat-body');
        if (!body) return;
        if (res.error) { body.innerHTML = '<tr><td colspan="4">خطا: ' + esc(res.error.message) + '</td></tr>'; return; }
        chatRows = (res.data || []).slice().reverse();
        renderChat();
      });
  }

  function renderChat() {
    var sel = document.getElementById('chat-visitor');
    var body = document.getElementById('chat-body');
    if (!sel || !body) return;
    var keep = sel.value;
    var seen = [];
    chatRows.forEach(function (m) { if (seen.indexOf(m.visitor_id) < 0) seen.push(m.visitor_id); });
    sel.innerHTML = '<option value="">همه بازدیدکنندگان</option>' + seen.map(function (v) {
      return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
    }).join('');
    if (keep && seen.indexOf(keep) >= 0) sel.value = keep;
    var list = chatRows.filter(function (m) { return !sel.value || m.visitor_id === sel.value; });
    if (!list.length) { body.innerHTML = '<tr><td colspan="4">هنوز پیام چتی نیست.</td></tr>'; return; }
    body.innerHTML = '';
    list.forEach(function (m) {
      var tr = document.createElement('tr');
      if (m.sender === 'owner') tr.className = 'chat-owner';
      tr.innerHTML =
        '<td>' + fmtTime(m.created_at) + '</td>' +
        '<td>#chat-' + esc(m.visitor_id) + '</td>' +
        '<td>' + (m.sender === 'owner' ? '<b>شما:</b> ' : '') + esc(m.text) + '</td>' +
        '<td><button class="btn btn-ghost" data-chat-reply="' + esc(m.visitor_id) + '">پاسخ</button> ' +
        '<button class="btn btn-ghost text-danger" data-chat-del="' + m.id + '">حذف</button></td>';
      body.appendChild(tr);
    });
  }

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString(); } catch (e) { return iso || ''; }
  }

  document.getElementById('chat-visitor').addEventListener('change', renderChat);
  document.getElementById('chat-refresh').addEventListener('click', loadChat);

  document.getElementById('chat-body').addEventListener('click', function (ev) {
    var tgt = ev.target;
    var rep = tgt.getAttribute ? tgt.getAttribute('data-chat-reply') : null;
    if (rep) {
      chatReplyTo = rep;
      document.getElementById('chat-reply-to').textContent = 'پاسخ به #chat-' + rep;
      document.getElementById('chat-reply-box').classList.remove('hidden');
      document.getElementById('chat-reply-text').focus();
      return;
    }
    var del = tgt.getAttribute ? tgt.getAttribute('data-chat-del') : null;
    if (del) {
      client.from('chat_messages').delete().eq('id', del).then(function (res) {
        if (res.error) { showToast('حذف ناموفق: ' + res.error.message); return; }
        loadChat();
      });
    }
  });

  document.getElementById('chat-send-btn').addEventListener('click', function () {
    var text = document.getElementById('chat-reply-text').value.trim();
    if (!text || !chatReplyTo) return;
    client.from('chat_messages').insert({ visitor_id: chatReplyTo, sender: 'owner', text: text })
      .select('id')
      .then(function (res) {
        if (res.error) { document.getElementById('chat-msg').textContent = 'ارسال ناموفق: ' + res.error.message; return; }
        document.getElementById('chat-reply-text').value = '';
        document.getElementById('chat-msg').textContent = '';
        // فرستادن فوری به بازدیدکننده (broadcast روی کانال همان گفت‌وگو)
        try {
          var row = (res.data || [])[0] || {};
          var ch = client.channel('chat-' + chatReplyTo, { config: { broadcast: { self: false } } });
          if (typeof ch.isJoined === 'function' && ch.isJoined()) {
            ch.send({ type: 'broadcast', event: 'owner_reply', payload: { id: row.id, text: text } });
          } else {
            ch.subscribe(function (st) {
              if (st === 'SUBSCRIBED') ch.send({ type: 'broadcast', event: 'owner_reply', payload: { id: row.id, text: text } });
            });
          }
        } catch (e) { /* بدون broadcast — سینک دوره‌ای پوشش می‌دهد */ }
        showToast('پاسخ ارسال شد — بازدیدکننده چند ثانیه دیگر می‌بیند.');
        loadChat();
      });
  });

  function subscribeChat() {
    client.channel('admin-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, function (payload) {
        var row = payload.new;
        if (!row) return;
        chatRows.push(row);
        renderChat();
        if (row.sender === 'visitor') {
          beep();
          notifyAdmin('پیام چت جدید', '#chat-' + row.visitor_id + ': ' + String(row.text || '').slice(0, 80));
        }
      })
      .subscribe();
  }

  /* ---------- bots (bot_config: tokens live in the DB, admin-only RLS) ---------- */
  function botMsg(id, text, bad) {
    var el = document.querySelector('[data-bot-msg="' + id + '"]');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('text-danger', !!bad);
  }
  function loadBots() {
    var hook = document.getElementById('chat-webhook-url');
    if (hook && window.SITE_CONFIG && window.SITE_CONFIG.SUPABASE_URL) {
      hook.textContent = window.SITE_CONFIG.SUPABASE_URL + '/functions/v1/chat-webhook';
    }
    client.from('bot_config').select('id, bot_token, chat_id, enabled').then(function (res) {
      var msg = document.getElementById('bots-msg');
      if (res.error) {
        if (msg) msg.textContent = 'خطا: ' + res.error.message + ' — اول migration_bots.sql را در SQL Editor اجرا کنید.';
        return;
      }
      if (msg) msg.textContent = (res.data || []).length ? '' : 'هنوز باتی ثبت نشده است.';
      (res.data || []).forEach(function (b) {
        var tok = document.querySelector('[data-bot-token="' + b.id + '"]');
        var cid = document.querySelector('[data-bot-chatid="' + b.id + '"]');
        var en = document.querySelector('[data-bot-enabled="' + b.id + '"]');
        if (tok) tok.value = b.bot_token || '';
        if (cid) cid.value = b.chat_id || '';
        if (en) en.checked = !!b.enabled;
        botMsg(b.id, b.bot_token ? 'ذخیره شده ✓' : 'توکن وارد نشده', !b.bot_token);
      });
    });
  }
  function saveBot(id) {
    var tok = (document.querySelector('[data-bot-token="' + id + '"]') || {}).value || '';
    var cid = (document.querySelector('[data-bot-chatid="' + id + '"]') || {}).value || '';
    var en = !!(document.querySelector('[data-bot-enabled="' + id + '"]') || {}).checked;
    if (!tok.trim() || !cid.trim()) { botMsg(id, 'توکن و chat_id هر دو لازم است.', true); return; }
    botMsg(id, 'در حال ذخیره…');
    client.from('bot_config')
      .update({ bot_token: tok.trim(), chat_id: cid.trim(), enabled: en, updated_at: new Date().toISOString() })
      .eq('id', id)
      .then(function (res) {
        if (res.error) { botMsg(id, 'خطا: ' + res.error.message, true); return; }
        botMsg(id, 'ذخیره شد ✓', false);
        showToast('ذخیره شد — نوتیف بات «' + id + '» فعال شد.');
      });
  }
  function testBot(id) {
    botMsg(id, 'در حال ارسال پیام آزمایشی…');
    client.functions.invoke('bot-test', { body: { id: id } }).then(function (res) {
      if (res.error) { botMsg(id, 'خطا: ' + res.error.message, true); return; }
      var d = res.data || {};
      if (d.ok) botMsg(id, 'پیام آزمایشی ارسال شد ✓ (منبع: ' + (d.via === 'db' ? 'دیتابیس' : 'secrets') + ')', false);
      else botMsg(id, 'ناموفق: ' + (d.error || 'بات تنظیم نشده'), true);
    });
  }
  var botsGrid = document.getElementById('bots-grid');
  if (botsGrid) {
    botsGrid.addEventListener('click', function (ev) {
      var el = ev.target.closest ? ev.target.closest('[data-bot-save],[data-bot-test],[data-bot-show]') : null;
      if (!el) return;
      var id = el.getAttribute('data-bot-save') || el.getAttribute('data-bot-test') || el.getAttribute('data-bot-show');
      if (el.hasAttribute('data-bot-save')) { saveBot(id); return; }
      if (el.hasAttribute('data-bot-test')) { testBot(id); return; }
      var tok = document.querySelector('[data-bot-token="' + id + '"]');
      if (tok) { tok.type = tok.type === 'password' ? 'text' : 'password'; }
    });
  }

  /* ---------- SEO tab: per-page title/description + Google preview ----------
     Values live in site_content (same keys the site applies at runtime);
     tools/bake_seo.py then writes them into the static <title>/<meta> that
     Google actually crawls. Static defaults below mirror the shipped HTML. */
  var SEO_PAGES = [
    { id: 'en', key: 'en_home', url: 'https://amirlwf.ir/',
      title: 'Short-Form Video Editor | Get 1 Free Edit',
      desc: 'Short-form video editor for Reels, TikTok and Shorts. Get your first reel edited FREE in 48 hours — no commitment.' },
    { id: 'en_edit', key: 'en_edit', url: 'https://amirlwf.ir/en/services/edit.html',
      title: 'Video Editing Services | Reels, Shorts and YouTube',
      desc: 'Retention-first short-form editing: hooks, captions, pacing, color and sound for Reels, Shorts and YouTube. First edit free, 48 hours.' },
    { id: 'en_web', key: 'en_web', url: 'https://amirlwf.ir/en/services/web.html',
      title: 'Web Design Services | Fast, SEO-Friendly Sites',
      desc: 'Fast, mobile-first websites and landing pages, built for speed and search, with support after launch. First short edit free.' },
    { id: 'fa', key: 'fa_home', url: 'https://amirlwf.ir/fa/',
      title: 'خدمات کامپیوتری در هشتگرد',
      desc: 'نصب ویندوز و پرینتر در محل، طراحی سایت ارزان و ادیت ویدیو حرفه‌ای در هشتگرد و حومه. ثبت سفارش آنلاین با پیگیری لحظه‌ای.' },
    { id: 'fa_edit', key: 'fa_edit', url: 'https://amirlwf.ir/fa/services/edit.html',
      title: 'ادیت ویدیو حرفه‌ای | تدوین یوتیوب و ریلز',
      desc: 'تدوین ویدیوی یوتیوب، ریلز اینستاگرام، تیزر تبلیغاتی و زیرنویس فارسی با اصلاح رنگ حرفه‌ای. سفارش آنلاین با تحویل منظم.' },
    { id: 'fa_web', key: 'fa_web', url: 'https://amirlwf.ir/fa/services/web.html',
      title: 'طراحی سایت ارزان و سئومحور | سفارش سایت',
      desc: 'طراحی سایت شرکتی، فروشگاهی و لندینگ‌پیج؛ سریع، واکنش‌گرا و سئومحور با پشتیبانی بعد از تحویل.' },
    { id: 'fa_pc', key: 'fa_pc', url: 'https://amirlwf.ir/fa/services/pc.html',
      title: 'خدمات کامپیوتر در هشتگرد | نصب ویندوز و پرینتر',
      desc: 'نصب ویندوز، نصب و عیب‌یابی پرینتر، افزایش سرعت سیستم و بکاپ اطلاعات در محل شما در هشتگرد و حومه.' }
  ];
  var SEO_MAP = {};
  SEO_PAGES.forEach(function (p) { SEO_MAP[p.id] = p; });

  function faNum(n) {
    return String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[+d]; });
  }
  function seoSel() {
    var s = document.getElementById('seo-page-select');
    return SEO_MAP[(s && s.value) || 'en'] || SEO_PAGES[0];
  }
  function seoStored(p) {
    var d = contentCache[p.key] || {};
    return {
      title: (typeof d.seo_title === 'string' && d.seo_title.trim()) ? d.seo_title.trim() : '',
      desc: (typeof d.seo_description === 'string' && d.seo_description.trim()) ? d.seo_description.trim() : ''
    };
  }
  function seoPreview() {
    var p = seoSel();
    var title = (document.getElementById('seo-title').value || '').trim() || p.title;
    var desc = (document.getElementById('seo-desc').value || '').trim() || p.desc;
    document.getElementById('serp-url').textContent = p.url;
    document.getElementById('serp-title').textContent = title;
    document.getElementById('serp-desc').textContent = desc;
    var tc = document.getElementById('seo-title-count');
    var dc = document.getElementById('seo-desc-count');
    tc.textContent = faNum(title.length);
    dc.textContent = faNum(desc.length);
    tc.className = title.length > 60 ? 'over' : '';
    dc.className = desc.length > 155 ? 'over' : '';
  }
  function renderSeo() {
    var p = seoSel();
    var v = seoStored(p);
    document.getElementById('seo-title').value = v.title || p.title;
    document.getElementById('seo-desc').value = v.desc || p.desc;
    var msg = document.getElementById('seo-msg');
    if (msg) msg.textContent = v.title || v.desc
      ? 'برای این صفحه سئوی سفارشی ذخیره شده است.'
      : 'هنوز سئوی سفارشی ذخیره نشده — مقدار پیش‌فرض HTML اجرا می‌شود.';
    seoPreview();
  }
  function renderSeoTable() {
    var body = document.getElementById('seo-body');
    if (!body) return;
    body.innerHTML = '';
    SEO_PAGES.forEach(function (p) {
      var v = seoStored(p);
      var title = v.title || p.title;
      var desc = v.desc || p.desc;
      var okT = title.length > 0 && title.length <= 60;
      var okD = desc.length > 0 && desc.length <= 155;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(SEO_LABEL[p.id] || p.id) + '</td>' +
        '<td dir="ltr"><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.url.replace('https://amirlwf.ir', '')) + '</a></td>' +
        '<td>' + faNum(title.length) + ' کاراکتر ' + (okT ? '✅' : '⚠️') + '</td>' +
        '<td>' + faNum(desc.length) + ' کاراکتر ' + (okD ? '✅' : '⚠️') + '</td>' +
        '<td>' + (v.title || v.desc ? 'سفارشی' : 'پیش‌فرض') + '</td>';
      body.appendChild(tr);
    });
  }
  var SEO_LABEL = {
    en: 'انگلیسی — صفحه اصلی', en_edit: 'انگلیسی — ادیت ویدیو', en_web: 'انگلیسی — طراحی سایت',
    fa: 'فارسی — صفحه اصلی', fa_edit: 'فارسی — ادیت ویدیو',
    fa_web: 'فارسی — طراحی سایت', fa_pc: 'فارسی — خدمات کامپیوتری'
  };

  var seoSelEl = document.getElementById('seo-page-select');
  if (seoSelEl) seoSelEl.addEventListener('change', renderSeo);
  ['seo-title', 'seo-desc'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', seoPreview);
  });
  var seoSave = document.getElementById('seo-save-btn');
  if (seoSave) seoSave.addEventListener('click', function () {
    var p = seoSel();
    var data = Object.assign({}, contentCache[p.key] || {});
    data.seo_title = document.getElementById('seo-title').value.trim();
    data.seo_description = document.getElementById('seo-desc').value.trim();
    saveKey(p.key, data).then(function (res) {
      if (res.error) { window.showToast('خطا: ' + res.error.message); return; }
      contentCache[p.key] = data;
      renderSeoTable();
      window.showToast('سئوی ذخیره شد — برای دیده‌شدن در گوگل tools/bake_seo.py را اجرا و پوش کنید.');
    });
  });
})();
