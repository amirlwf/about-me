/* EN free-edit lead form: name + email validation, honeypot + math captcha,
   submit via the SAME Edge Function as the FA order form (source=en_landing
   keeps EN leads separable), with direct-REST fallback. No phone asked. */
(function () {
  'use strict';

  // frame-busting (frame-ancestors can't be enforced via <meta>)
  try {
    if (window.top !== window.self) window.top.location = window.self.location;
  } catch (e) { /* sandboxed frame — nothing to do */ }

  var form = document.getElementById('en-lead-form');
  if (!form) return;

  var cfg = window.SITE_CONFIG || {};
  var EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  var LINK = /^https?:\/\/\S+\.\S+/;
  var captchaA = 2 + Math.floor(Math.random() * 8);
  var captchaB = 1 + Math.floor(Math.random() * 9);

  var capQ = document.getElementById('e-captcha-q');
  if (capQ) capQ.textContent = captchaA + ' + ' + captchaB + ' = ?';

  function toast(msg) {
    if (window.showToast) { window.showToast(msg); return; }
    var t = document.getElementById('toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 4500);
  }

  /* ---------- validation ---------- */
  function setInvalid(id, bad) {
    var f = document.getElementById('efield-' + id);
    if (f) f.classList.toggle('invalid', !!bad);
    return !bad;
  }
  function read() {
    return {
      name: document.getElementById('e-name').value.trim(),
      email: document.getElementById('e-email').value.trim().toLowerCase(),
      link: document.getElementById('e-link').value.trim(),
      notes: document.getElementById('e-notes').value.trim(),
      captcha: document.getElementById('e-captcha').value.trim()
    };
  }
  function buildDesc(v) {
    var d = v.notes;
    if (v.link) d += (d ? '\n\n' : '') + 'Footage: ' + v.link;
    if (d.length < 5) d = 'Free edit request from ' + v.name;
    return d;
  }
  function validate() {
    var v = read();
    var ok = true;
    ok = setInvalid('name', v.name.length < 2) && ok;
    ok = setInvalid('email', !EMAIL.test(v.email)) && ok;
    ok = setInvalid('link', !!v.link && (!LINK.test(v.link) || v.link.length > 500)) && ok;
    var desc = buildDesc(v);
    ok = setInvalid('notes', desc.length > 2000) && ok;
    ok = setInvalid('captcha', v.captcha !== String(captchaA + captchaB)) && ok;
    return { ok: ok, v: v, desc: desc };
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
    var r = validate();
    if (!r.ok) { toast('Please fix the highlighted fields.'); return; }
    // honeypot: bots fill it; humans can't see it
    if (document.getElementById('e-website').value) return;

    var trackToken = uuid();
    var payload = {
      name: r.v.name,
      email: r.v.email,
      service: 'edit',
      sub_service: 'free_edit',
      description: r.desc,
      raw_link: r.v.link,
      source: 'en_landing',
      type: 'free_edit',
      track_token: trackToken,
      captcha: r.v.captcha,
      website: ''
    };
    var btn = document.getElementById('e-submit');
    btn.disabled = true; btn.textContent = 'Sending…';

    var edgeUrl = cfg.SUPABASE_URL ? cfg.SUPABASE_URL + '/functions/v1/create-order' : null;
    var attempt = edgeUrl
      ? fetch(edgeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: cfg.SUPABASE_ANON_KEY }, body: JSON.stringify(payload) })
          .then(function (res) { return res.json().then(function (j) { return { status: res.status, body: j }; }); })
      : Promise.resolve({ status: 404, body: {} });

    attempt.then(function (res) {
      if (res.status === 200 && res.body && res.body.id) return { id: res.body.id, token: trackToken };
      // fallback: direct PostgREST insert (RLS allows anon EN insert; edge rate-limit bypassed — edge preferred)
      return fetch(cfg.SUPABASE_URL + '/rest/v1/orders', {
        method: 'POST',
        headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + cfg.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ name: payload.name, email: payload.email, service: 'edit',
          sub_service: 'free_edit', description: payload.description, raw_link: payload.raw_link || null,
          source: 'en_landing', track_token: trackToken, status: 'new' })
      }).then(function (res2) {
        if (!res2.ok) throw new Error('submit failed: ' + res2.status);
        return res2.json();
      }).then(function (rows) { return { id: rows[0].id, token: trackToken }; });
    }).then(function (t) {
      onLeadCreated(t.id, t.token);
    }).catch(function () {
      toast('Sending failed. Please try again in a moment.');
      btn.disabled = false; btn.textContent = 'Claim My Free Edit';
    });
  });

  function onLeadCreated(id, token) {
    try { localStorage.setItem('en_last_lead', JSON.stringify({ id: id, token: token })); } catch (e) {}
    form.classList.add('hidden');
    var box = document.getElementById('en-success');
    document.getElementById('en-track-code').textContent = token;
    if (box) box.classList.remove('hidden');
    toast('Request received! Your free edit is in the queue.');
    if (box && box.scrollIntoView) box.scrollIntoView({ block: 'center' });
  }
})();
