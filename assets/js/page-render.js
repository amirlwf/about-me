/* page-render.js — renders a block-based page created in the admin panel.
 *
 * Route:      /p/?slug=<slug>          (a real file, so GitHub Pages returns 200)
 * Source:     public.pages             (anon SELECT only returns LIVE rows:
 *                                        published / scheduled-whose-time-came)
 * Menus:      public.menus             (header/footer × fa/en)
 * CSP:        style-src 'self' -> no inline styles; script-src 'self' -> all
 *             code lives in this file. Meta/JSON-LD are injected as data
 *             blocks, which CSP does not block.
 */
(function () {
  "use strict";

  var CFG = window.SITE_CONFIG || {};
  var API = CFG.SUPABASE_URL || "";
  var KEY = CFG.SUPABASE_ANON_KEY || "";
  var ORIGIN = "https://amirlwf.ir";
  var BRAND_FA = "امیررضا لطفی";
  var BRAND_EN = "Amir Reza Lotfi";

  var slug = "";
  try { slug = new URLSearchParams(location.search).get("slug") || ""; } catch (e) {}
  slug = slug.trim();

  var main = document.getElementById("dyn-main");
  var headerEl = document.getElementById("dyn-header");
  var footerEl = document.getElementById("dyn-footer");

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function attr(v) { return esc(v); }
  function txt(v) { return esc(v).replace(/\n/g, "<br>"); }

  function api(path) {
    if (!API || !KEY) return Promise.reject(new Error("config missing"));
    return fetch(API + path, {
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, Accept: "application/json" },
    }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }

  /* ------------------------------------------------------------ states */
  function showState(title, body, href, label, noindex) {
    main.innerHTML =
      '<div class="dyn-state"><h1>' + esc(title) + "</h1><p>" + esc(body) + "</p>" +
      (href ? '<a class="btn btn-primary" href="' + attr(href) + '">' + esc(label) + "</a>" : "") +
      "</div>";
    document.querySelector('meta[name="robots"]')
      .setAttribute("content", noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large");
    headerEl.innerHTML = "";
    footerEl.innerHTML = "";
  }

  /* ------------------------------------------------------------ chrome */
  function renderMenu(items, lang) {
    if (!items || !items.length) return "";
    return '<nav class="dyn-nav">' + items.map(function (it) {
      var href = String(it.href || "#");
      var internal = href.charAt(0) === "/";
      var external = !internal && /^https?:\/\//i.test(href);
      return '<a href="' + attr(href) + '"' +
        (it.new_tab || external ? ' target="_blank" rel="noopener"' : "") + ">" +
        esc(it.label || href) + "</a>";
    }).join("") + "</nav>";
  }

  function renderChrome(page, menu) {
    var brand = page.lang === "en" ? BRAND_EN : BRAND_FA;
    var home = page.lang === "en" ? "/" : "/fa/";
    headerEl.className = "dyn-header";
    headerEl.innerHTML =
      '<div class="dyn-inner"><a class="dyn-brand" href="' + home + '">' + esc(brand) + "</a>" +
      renderMenu(menu) + "</div>";
    footerEl.className = "dyn-footer";
    footerEl.innerHTML =
      '<div class="dyn-inner"><span>© ' + new Date().getFullYear() + " · " + esc(brand) + "</span></div>";
  }

  /* ------------------------------------------------------------ blocks */
  function list(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }

  var BLOCKS = {
    hero: function (p) {
      var cls = "blk-hero" + (p.align === "left" ? " blk-hero-left" : "");
      return '<section class="' + cls + '">' +
        "<h1>" + esc(p.title || "") + "</h1>" +
        (p.subtitle ? "<p>" + txt(p.subtitle) + "</p>" : "") +
        (p.cta_label && p.cta_href
          ? '<a class="btn btn-primary" href="' + attr(p.cta_href) + '">' + esc(p.cta_label) + "</a>"
          : "") +
        "</section>";
    },
    heading: function (p) {
      var tag = p.level === "h3" ? "h3" : "h2";
      return '<section class="blk blk-heading"><' + tag + ">" + esc(p.text || "") + "</" + tag + "></section>";
    },
    text: function (p) {
      var paras = list(p.paragraphs);
      if (!paras.length && p.text) paras = [p.text];
      return '<section class="blk blk-text">' +
        paras.map(function (x) { return "<p>" + txt(x) + "</p>"; }).join("") + "</section>";
    },
    image: function (p) {
      if (!p.src) return "";
      return '<section class="blk blk-image"><figure>' +
        '<img src="' + attr(p.src) + '" alt="' + attr(p.alt || "") + '" loading="lazy">' +
        (p.caption ? "<figcaption>" + esc(p.caption) + "</figcaption>" : "") +
        "</figure></section>";
    },
    gallery: function (p) {
      var items = list(p.items).filter(function (i) { return i && i.src; });
      if (!items.length) return "";
      return '<section class="blk blk-gallery-sec"><div class="blk-gallery">' +
        items.map(function (i) {
          return '<img src="' + attr(i.src) + '" alt="' + attr(i.alt || "") + '" loading="lazy">';
        }).join("") + "</div></section>";
    },
    cards: function (p) {
      var items = list(p.items).filter(Boolean);
      if (!items.length) return "";
      return '<section class="blk"><div class="blk-cards">' +
        items.map(function (c) {
          var inner = (c.icon ? '<span class="blk-icon">' + esc(c.icon) + "</span>" : "") +
            "<h3>" + esc(c.title || "") + "</h3>" +
            (c.text ? "<p>" + txt(c.text) + "</p>" : "");
          return c.href
            ? '<a class="blk-card" href="' + attr(c.href) + '">' + inner + "</a>"
            : '<div class="blk-card">' + inner + "</div>";
        }).join("") + "</div></section>";
    },
    cta: function (p) {
      return '<section class="blk-cta">' +
        (p.title ? "<h2>" + esc(p.title) + "</h2>" : "") +
        (p.text ? "<p>" + txt(p.text) + "</p>" : "") +
        (p.button_label && p.button_href
          ? '<a class="btn btn-primary" href="' + attr(p.button_href) + '">' + esc(p.button_label) + "</a>"
          : "") +
        "</section>";
    },
    faq: function (p) {
      var items = list(p.items).filter(Boolean);
      if (!items.length) return "";
      return '<section class="blk blk-faq">' +
        (p.title ? "<h2>" + esc(p.title) + "</h2>" : "") +
        items.map(function (q) {
          return "<details><summary>" + esc(q.q || q.title || "") + "</summary>" +
            "<p>" + txt(q.a || q.answer || "") + "</p></details>";
        }).join("") + "</section>";
    },
    divider: function () { return '<section class="blk blk-divider"><hr></section>'; },
    embed: function (p) {
      var src = String(p.src || "");
      if (!/^https?:\/\//i.test(src)) return "";
      return '<section class="blk blk-embed"><div class="blk-frame">' +
        '<iframe src="' + attr(src) + '" title="' + attr(p.title || "video") +
        '" loading="lazy" allowfullscreen></iframe></div></section>';
    },
  };

  function renderBlocks(blocks) {
    var html = list(blocks).map(function (b) {
      if (!b || !b.type) return "";
      var fn = BLOCKS[b.type];
      if (!fn) return "";
      try { return fn(b.props || b); } catch (e) { return ""; }
    }).join("");
    main.innerHTML = html || '<section class="blk"><p>این صفحه هنوز بلوکی ندارد.</p></section>';
  }

  /* ------------------------------------------------------------ meta */
  function setMeta(name, content) {
    if (!content) return;
    var el = document.querySelector('meta[name="' + name + '"]');
    if (el) el.setAttribute("content", content);
  }
  function setProp(name, content) {
    if (!content) return;
    var el = document.querySelector('meta[property="' + name + '"]');
    if (el) el.setAttribute("content", content);
  }
  function setCanonical(href) {
    var el = document.querySelector('link[rel="canonical"]');
    if (el) el.setAttribute("href", href);
  }
  function injectJsonLd(obj) {
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(obj);
    document.head.appendChild(s);
  }

  function applyMeta(page) {
    var isEn = page.lang === "en";
    var title = page.seo_title || page.title;
    var desc = page.seo_description || "";
    var url = ORIGIN + "/p/?slug=" + encodeURIComponent(page.slug);

    document.documentElement.lang = isEn ? "en" : "fa";
    document.documentElement.dir = isEn ? "ltr" : "rtl";
    document.body.classList.toggle("is-light", !!page.blocks_light);

    document.title = title;
    setMeta("description", desc);
    setCanonical(url);
    setProp("og:title", title);
    setProp("og:description", desc);
    setProp("og:url", url);
    setProp("og:type", "article");
    setProp("og:locale", isEn ? "en_US" : "fa_IR");
    if (page.og_image) {
      setProp("og:image", page.og_image);
      setMeta("twitter:image", page.og_image);
    }
    setProp("twitter:title", title);
    setProp("twitter:description", desc);

    injectJsonLd({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      description: desc,
      url: url,
      inLanguage: isEn ? "en" : "fa",
      isPartOf: { "@type": "WebSite", name: isEn ? BRAND_EN : BRAND_FA, url: ORIGIN + "/" },
    });
  }

  /* ------------------------------------------------------------ boot */
  function boot() {
    if (!slug) {
      showState("آدرس صفحه نامعتبر است", "شناسهٔ صفحه (slug) در لینک نیست.", "/fa/", "بازگشت به خانه", true);
      return;
    }
    if (!API) {
      showState("اتصال برقرار نشد", "پیکربندی سوپابیس پیدا نشد.", "/fa/", "بازگشت به خانه", true);
      return;
    }

    Promise.all([
      api("/rest/v1/pages?slug=eq." + encodeURIComponent(slug) + "&select=*"),
      api("/rest/v1/menus?select=location,items"),
    ]).then(function (res) {
      var rows = res[0] || [];
      var page = rows[0];
      if (!page) {
        showState("صفحه پیدا نشد", "این صفحه وجود ندارد یا هنوز منتشر نشده است.",
          (document.documentElement.lang === "en" ? "/" : "/fa/"), "بازگشت به خانه", true);
        return;
      }
      var menus = res[1] || [];
      var loc = (page.lang === "en" ? "en_header" : "fa_header");
      var menu = null;
      for (var i = 0; i < menus.length; i++) if (menus[i].location === loc) menu = menus[i].items;

      document.body.classList.add("dyn-page");
      if (page.lang === "en") document.body.classList.add("blk-light");
      applyMeta(page);
      renderChrome(page, menu);
      renderBlocks(page.blocks);
      window.__DYN_PAGE__ = page;
    }).catch(function () {
      showState("خطا در دریافت صفحه", "ارتباط با سرور برقرار نشد؛ چند لحظه بعد دوباره تلاش کنید.",
        (document.documentElement.lang === "en" ? "/" : "/fa/"), "بازگشت به خانه", true);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
