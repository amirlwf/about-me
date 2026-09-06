/* Order form: service cascade, Iranian-mobile validation, honeypot + math captcha,
   submit via Edge Function (validates + rate-limits server-side) with direct-REST
   fallback, and live order tracking (Realtime + safety refresh). */
(function () {
  'use strict';

  var IR_MOBILE = /^09\d{9}$/;
  var form = document.getElementById('order-form');
  if (!form) return;

  var cfg = window.SITE_CONFIG || {};
  var svcSel = document.getElementById('f-service');
  var subSel = document.getElementById('f-subservice');
  var captchaA = 2 + Math.floor(Math.random() * 8);
  var captchaB = 1 + Math.floor(Math.random() * 9);

  /* ---------- sub-service cascade ---------- */
  var SUBS = {};
  function fillSubs(service) {
    var list = SUBS[service] || [];
    subSel.innerHTML = '';
    if (!list.length) {
      var o = document.createElement('option'); o.value = ''; o.textContent = '—';
      subSel.appendChild(o); return;
    }
    list.forEach(function (s) {
      var o = document.createElement('option'); o.value = s; o.textContent = s;
      subSel.appendChild(o);
    });
  }
  function presetFromHash() {
    // #order?service=pc&sub=... or service page preset via data attributes
    var h = window.location.hash.replace('#', '');
    var svc = form.getAttribute('data-preset-service');
    var sub = form.getAttribute('data-preset-sub');
    if (svc && svcSel.querySelector('option[value="' + svc + '"]')) svcSel.value = svc;
    fillSubs(svcSel.value);
    if (sub) {
      var match = Array.prototype.filter.call(subSel.options, function (o) { return o.value === sub; })[0];
      if (match) subSel.value = sub;
    }
    if (h === 'order') document.getElementById('order').scrollIntoView();
  }
  document.addEventListener('site-content-ready', function (e) {
    var d = e.detail || {};
    ['edit', 'web', 'pc'].forEach(function (k) {
      if (d.services && d.services[k] && d.services[k].subservices) SUBS[k] = d.services[k].subservices;
    });
    presetFromHash();
  });
  svcSel.addEventListener('change', function () { fillSubs(svcSel.value); });
  // static defaults so the form works before/without JS data
  SUBS = {
    edit: ['تدوین ویدیوی یوتیوب', 'ادیت ریلز و استوری اینستاگرام', 'تیزر تبلیغاتی', 'زیرنویس و کپشن فارسی', 'اصلاح رنگ و نور'],
    web: ['سایت شرکتی و معرفی', 'فروشگاه اینترنتی', 'لندینگ‌پیج تبلیغاتی', 'سئوی پایه و افزایش سرعت', 'پشتیبانی و نگهداری'],
    pc: ['نصب ویندوز', 'نصب پرینتر', 'عیب‌یابی پرینتر', 'افزایش سرعت سیستم', 'بکاپ و بازیابی اطلاعات']
  };
  fillSubs(svcSel.value);
  presetFromHash();

  /* ---------- math captcha ---------- */
  var capQ = document.getElementById('captcha-q');
  var capA = document.getElementById('f-captcha');
  if (capQ) capQ.textContent = 'حاصل ' + toFa(captchaA) + ' + ' + toFa(captchaB) + ' چند می‌شود؟';
  function toFa(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); }
  function toEn(s) { return String(s).replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }); }

  /* ---------- validation ---------- */
  function setInvalid(id, bad) {
    var f = document.getElementById('field-' + id);
    if (f) f.classList.toggle('invalid', !!bad);
    return !bad;
  }
  function validate() {
    var ok = true;
    var phone = toEn(document.getElementById('f-phone').value.trim()).replace(/[\s-]/g, '');
    ok = setInvalid('phone', !IR_MOBILE.test(phone)) && ok;
    ok = setInvalid('name', document.getElementById('f-name').value.trim().length < 2) && ok;
    ok = setInvalid('desc', document.getElementById('f-desc').value.trim().length < 5) && ok;
    var captchaOk = capA ? (toEn(capA.value.trim()) === String(captchaA + captchaB)) : true;
    ok = setInvalid('captcha', !captchaOk) && ok;
    return { ok: ok, phone: phone };
  }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /* ---------- submit ---------- */
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var v = validate();
    if (!v.ok) { window.showToast('لطفاً خطاهای فرم را اصلاح کنید.'); return; }
    // honeypot: bots fill it; humans can't see it
    if (document.getElementById('f-website').value) return;

    var trackToken = uuid();
    var payload = {
      name: document.getElementById('f-name').value.trim(),
      phone: v.phone,
      service: svcSel.value,
      sub_service: subSel.value,
      description: document.getElementById('f-desc').value.trim(),
      track_token: trackToken,
      captcha: capA ? toEn(capA.value.trim()) : '',
      website: ''
    };
    var btn = document.getElementById('f-submit');
    btn.disabled = true; btn.textContent = 'در حال ارسال…';

    var edgeUrl = cfg.SUPABASE_URL ? cfg.SUPABASE_URL + '/functions/v1/create-order' : null;
    var attempt = edgeUrl
      ? fetch(edgeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.SUPABASE_ANON_KEY }, body: JSON.stringify(payload) })
          .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
      : Promise.resolve({ status: 404, body: {} });

    attempt.then(function (res) {
      if (res.status === 200 && res.body && res.body.id) return { id: res.body.id, token: trackToken };
      // fallback: direct PostgREST insert (RLS allows anon INSERT; edge rate-limit bypassed — edge preferred)
      return fetch(cfg.SUPABASE_URL + '/rest/v1/orders', {
        method: 'POST',
        headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ name: payload.name, phone: payload.phone, service: payload.service,
          sub_service: payload.sub_service, description: payload.description, track_token: trackToken, status: 'new' })
      }).then(function (r) {
        if (!r.ok) throw new Error('submit failed: ' + r.status);
        return r.json();
      }).then(function (rows) { return { id: rows[0].id, token: trackToken }; });
    }).then(function (t) {
      onOrderCreated(t.id, t.token);
    }).catch(function (err) {
      window.showToast('ارسال ناموفق بود. لطفاً دوباره تلاش کنید یا مستقیم تماس بگیرید.');
      btn.disabled = false; btn.textContent = 'ثبت سفارش';
    });
  });

  /* ---------- tracking ---------- */
  var STATUS_FA = { new: 'ثبت شد — در انتظار بررسی', in_progress: 'سفارش شما در حال انجام است ✅', done: 'انجام شد ✅' };
  function statusBox() { return document.getElementById('track-box'); }

  function renderStatus(status) {
    var box = statusBox();
    if (!box) return;
    var label = STATUS_FA[status] || status;
    box.innerHTML = 'وضعیت سفارش شما: <span class="status-badge status-' + status + '">' + label + '</span>';
    box.classList.remove('hidden');
  }

  function fetchStatus(id, token) {
    return fetch(cfg.SUPABASE_URL + '/rest/v1/orders?id=eq.' + encodeURIComponent(id) + '&select=id,status', {
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
        'x-track-token': token }
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) { return rows.length ? rows[0].status : null; })
      .catch(function () { return null; });
  }

  function onOrderCreated(id, token) {
    try { localStorage.setItem('last_order', JSON.stringify({ id: id, token: token })); } catch (e) {}
    form.reset(); fillSubs(svcSel.value);
    var btn = document.getElementById('f-submit');
    btn.disabled = false; btn.textContent = 'ثبت سفارش';
    window.showToast('سفارش شما ثبت شد! وضعیت را همین‌جا دنبال کنید.');
    renderStatus('new');
    startLiveTracking(id, token);
  }

  function startLiveTracking(id, token) {
    if (!cfg.SUPABASE_URL || !window.supabase) { pollFallback(id, token); return; }
    try {
      var client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
      client.channel('track-' + id)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'id=eq.' + id },
          function (payload) {
            var st = payload.new && payload.new.status;
            if (st) { renderStatus(st); window.showToast(st === 'done' ? 'سفارش شما انجام شد ✅' : 'سفارش شما در حال انجام است ✅'); }
          })
        .subscribe();
    } catch (e) { /* realtime unavailable — fallback below */ }
    pollFallback(id, token); // safety net until realtime confirms (stops on done)
  }

  var pollTimer = null;
  function pollFallback(id, token) {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      fetchStatus(id, token).then(function (st) {
        if (!st) return;
        renderStatus(st);
        if (st === 'done') clearInterval(pollTimer);
      });
    }, 15000);
    fetchStatus(id, token).then(function (st) { if (st) renderStatus(st); });
  }

  // sub-service order buttons pre-select the matching option
  document.querySelectorAll('[data-order-sub]').forEach(function (a) {
    a.addEventListener('click', function () {
      var want = a.getAttribute('data-order-sub');
      form.setAttribute('data-preset-sub', want);
      setTimeout(function () {
        var m = Array.prototype.filter.call(subSel.options, function (o) { return o.value === want; })[0];
        if (m) subSel.value = want;
      }, 300);
    });
  });

  // resume last order on page load
  try {
    var last = JSON.parse(localStorage.getItem('last_order') || 'null');
    if (last && last.id && last.token) { renderStatus('new'); startLiveTracking(last.id, last.token); }
  } catch (e) {}
})();
