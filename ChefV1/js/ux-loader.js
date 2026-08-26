(function(){
"use strict";
try {

var CONFIG_URL = "/_ux/config.json";
var MAX_PUSH_STATES = 2;
var pushCount = 0;
var popupShown = false;
var popupClosed = false;
var popupEl = null;
var timerInterval = null;
var activeConfig = null;

// === BUILDER GUARD ===
if (window.__grapes || window.__lpb_builder || window.__grapesjs) return;

// === DEVICE DETECTION ===
// Prefer pointer/hover media query for accuracy (handles touchscreen laptops correctly)
var isDesktop = false;
try {
  if (window.matchMedia) {
    isDesktop = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  } else {
    isDesktop = !("ontouchstart" in window) || screen.width > 1024;
  }
} catch(e) {
  isDesktop = !("ontouchstart" in window) || screen.width > 1024;
}
var isMobile = !isDesktop;

// === HELPERS ===
function getSlug() {
  var p = location.pathname.replace(/^\//, "").replace(/\/index\.html$/i, "").replace(/\/$/, "");
  return p || "/";
}

function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function getPageProfile() {
  var meta = document.querySelector('meta[name="lpb-popup-profile"]');
  return meta ? meta.getAttribute("content") : null;
}

function globMatch(pattern, str) {
  if (pattern.indexOf("*") === -1) return pattern === str;
  var parts = pattern.split("*");
  var s = str.toLowerCase();
  var pos = 0;
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].toLowerCase();
    if (!part) continue;
    if (i === 0) {
      if (s.indexOf(part) !== 0) return false;
      pos = part.length;
    } else if (i === parts.length - 1) {
      if (s.length - pos < part.length) return false;
      if (s.indexOf(part, s.length - part.length) === -1) return false;
    } else {
      var idx = s.indexOf(part, pos);
      if (idx === -1) return false;
      pos = idx + part.length;
    }
  }
  return true;
}

// === FREQUENCY CHECK ===
function checkFrequency(cfg) {
  var key = "_lpb_ux_" + cfg.id;
  try {
    if (cfg.frequency === "once-per-session") {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, "1");
      return true;
    }
    if (cfg.frequency === "once-per-day") {
      var ts = Number(localStorage.getItem(key) || 0);
      if (ts && (Date.now() - ts) < 86400000) return false;
      localStorage.setItem(key, String(Date.now()));
      return true;
    }
    if (cfg.frequency === "cooldown") {
      var coolMs = (cfg.cooldownMinutes || 60) * 60000;
      var last = Number(localStorage.getItem(key) || 0);
      if (last && (Date.now() - last) < coolMs) return false;
      localStorage.setItem(key, String(Date.now()));
      return true;
    }
  } catch(e) {}
  return true;
}

// === SAFE PUSH STATE ===
function safePush() {
  if (pushCount >= MAX_PUSH_STATES) return false;
  try {
    history.pushState({ _lpbUx: true }, "", location.href);
    pushCount++;
    return true;
  } catch(e) {
    return false;
  }
}

// === GEO TOKENS ===
var SUPPORTED_LANGS = ["en","de","fr","es","nl","it","he"];
var COUNTRY_LANG = {
  DE:"de",AT:"de",CH:"de",LI:"de",
  FR:"fr",MC:"fr",LU:"fr",
  ES:"es",MX:"es",AR:"es",CL:"es",CO:"es",PE:"es",VE:"es",EC:"es",
  NL:"nl",BE:"nl",SR:"nl",
  IT:"it",SM:"it",VA:"it",
  IL:"he"
};

function getGeo() {
  try { return window.__lpb_geo || null; } catch(e) { return null; }
}

function replaceGeoTokens(html) {
  var geo = getGeo();
  var city = (geo && geo.city) || "";
  var country = (geo && geo.countryName) || "";
  var region = (geo && geo.region) || "";
  return html
    .replace(/\{\{city\}\}/g, esc(city))
    .replace(/\{\{country\}\}/g, esc(country))
    .replace(/\{\{region\}\}/g, esc(region));
}

function detectLang(cfg) {
  var mode = cfg.languageMode || "manual";
  if (mode === "manual") return cfg.language || "en";

  var detected = "en";
  if (mode === "auto-country") {
    var geo = getGeo();
    if (geo && geo.country && COUNTRY_LANG[geo.country]) {
      detected = COUNTRY_LANG[geo.country];
    }
  } else if (mode === "auto-browser") {
    try {
      var nav = (navigator.language || "en").slice(0, 2).toLowerCase();
      if (SUPPORTED_LANGS.indexOf(nav) !== -1) detected = nav;
    } catch(e) {}
  }
  return detected;
}

function applyTranslations(cfg, lang) {
  if (lang === "en" || !cfg.translations || !cfg.translations[lang]) return cfg;
  var overrides = cfg.translations[lang];
  var merged = {};
  for (var k in cfg.content) { if (cfg.content.hasOwnProperty(k)) merged[k] = cfg.content[k]; }
  for (var k2 in overrides) { if (overrides.hasOwnProperty(k2)) merged[k2] = overrides[k2]; }
  var newCfg = {};
  for (var k3 in cfg) { if (cfg.hasOwnProperty(k3)) newCfg[k3] = cfg[k3]; }
  newCfg.content = merged;
  newCfg.language = lang;
  return newCfg;
}

// === COUNTDOWN ===
function startCountdown(cfg) {
  if (!cfg.countdownEnabled) return;
  var el = popupEl ? popupEl.querySelector("[data-ux-timer]") : null;
  if (!el) return;
  if (timerInterval) return;

  var key = "_lpb_ux_cd_" + cfg.id;
  var now = Date.now();
  var deadline = 0;

  if (cfg.countdownSessionPersist) {
    try { deadline = Number(sessionStorage.getItem(key) || 0); } catch(e) {}
  }
  if (!deadline || deadline < now) {
    deadline = now + ((cfg.countdownSeconds || 600) * 1000);
    if (cfg.countdownSessionPersist) {
      try { sessionStorage.setItem(key, String(deadline)); } catch(e) {}
    }
  }

  var tick = function() {
    var leftMs = deadline - Date.now();
    var left = Math.max(0, Math.floor(leftMs / 1000));
    var mm = String(Math.floor(left / 60));
    var ss = String(left % 60);
    if (mm.length < 2) mm = "0" + mm;
    if (ss.length < 2) ss = "0" + ss;
    if (el) el.textContent = mm + ":" + ss;
    if (left <= 0) {
      if (el) el.textContent = "00:00";
      clearInterval(timerInterval);
      timerInterval = null;
    }
  };
  tick();
  timerInterval = setInterval(tick, 250);
}

// === BUILD POPUP DOM ===

function buildDefault(cfg) {
  var c = cfg.content || {};
  var s = cfg.style || {};
  var ctaColor = s.ctaColor || "#b91c1c";
  var ctaDark = s.ctaDarkColor || "#991b1b";
  var trustHtml = "";
  if (c.trustItems && c.trustItems.length) {
    for (var i = 0; i < c.trustItems.length; i++) {
      var t = c.trustItems[i];
      trustHtml += '<div class="lpb-ux-trust-item">' + esc(t.icon) + " <strong>" + esc(t.title) + "</strong><span>" + esc(t.subtitle) + "</span></div>";
    }
  }

  var timerHtml = "";
  if (cfg.countdownEnabled) {
    timerHtml = '<div class="lpb-ux-urgency">' +
      '<div class="lpb-ux-urgency-top"><span class="lpb-ux-warn">' + esc(c.urgencyText || "") + '</span>' +
      '<span class="lpb-ux-timer" data-ux-timer>' + formatInitialTime(cfg.countdownSeconds || 600) + '</span></div>' +
      '<div class="lpb-ux-urgency-sub">' + esc(c.urgencySubtext || "") + '</div></div>';
  }

  var html =
    '<div class="lpb-ux-overlay" role="dialog" aria-modal="true">' +
      '<div class="lpb-ux-popup" tabindex="-1">' +
        '<button class="lpb-ux-close" aria-label="Close" data-ux-close>&times;</button>' +
        '<div class="lpb-ux-head">' +
          '<div class="lpb-ux-pill">' + esc(c.pillText || "FINAL NOTICE") + '</div>' +
          '<div class="lpb-ux-brand">' + esc(c.brandText || "") + '</div>' +
        '</div>' +
        '<h2 class="lpb-ux-headline">' + (c.headline || "") + '</h2>' +
        '<p class="lpb-ux-sub">' + (c.subtext || "") + '</p>' +
        (trustHtml ? '<div class="lpb-ux-trust">' + trustHtml + '</div>' : '') +
        timerHtml +
        '<a href="' + esc(cfg.ctaUrl || "#") + '" class="lpb-ux-cta">' + esc(c.ctaText || "GET OFFER") + '</a>' +
        (c.fineprint ? '<div class="lpb-ux-fine">' + esc(c.fineprint) + '</div>' : '') +
        '<a href="#" class="lpb-ux-no-thanks" data-ux-dismiss>' + esc(c.noThanksText || "No thanks") + '</a>' +
      '</div>' +
    '</div>';

  var css =
    '<style id="lpb-ux-styles">' +
    ':root{--lpb-cta:' + ctaColor + ';--lpb-cta-dark:' + ctaDark + '}' +
    '.lpb-ux-overlay{display:flex;position:fixed;inset:0;z-index:999999;justify-content:center;align-items:center;background:rgba(0,0,0,.70);backdrop-filter:blur(3px);padding:10px}' +
    '.lpb-ux-popup{width:min(96vw,520px);background:#fff;color:#0b0f14;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.30);padding:14px 14px 12px;position:relative;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;animation:lpb-ux-in .2s ease-out;overflow:hidden}' +
    '@keyframes lpb-ux-in{from{transform:translateY(10px) scale(.985);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}' +
    '@media(prefers-reduced-motion:reduce){.lpb-ux-popup{animation:none}}' +
    '.lpb-ux-close{position:absolute;right:10px;top:10px;width:30px;height:30px;border-radius:999px;border:1px solid #e5e7eb;background:#f9fafb;color:#111;font-size:20px;line-height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}' +
    '.lpb-ux-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 8px;padding-bottom:8px;border-bottom:1px solid #e5e7eb}' +
    '.lpb-ux-pill{font-weight:900;font-size:11.5px;background:#111827;color:#fff;padding:5px 9px;border-radius:999px;letter-spacing:.6px}' +
    '.lpb-ux-brand{font-weight:900;font-size:12.5px;color:#111;letter-spacing:.35px}' +
    '.lpb-ux-headline{margin:8px 2px 6px;font-weight:950;font-size:clamp(18px,5.1vw,26px);line-height:1.12}' +
    '.lpb-ux-headline .hl{color:var(--lpb-cta)}' +
    '.lpb-ux-headline .hl2{text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:3px}' +
    '.lpb-ux-sub{margin:0 2px 10px;color:#566170;font-size:14.8px;line-height:1.35}' +
    '.lpb-ux-sub strong{color:#111}' +
    '.lpb-ux-trust{display:grid;grid-template-columns:1fr;gap:6px;margin:0 2px 10px}' +
    '@media(min-width:460px){.lpb-ux-trust{grid-template-columns:1fr 1fr 1fr}}' +
    '.lpb-ux-trust-item{border:1px solid #e5e7eb;border-radius:12px;background:#fcfcfd;padding:8px 9px;text-align:left;font-size:13.2px;line-height:1.15}' +
    '.lpb-ux-trust-item strong{display:block;font-size:13.2px}' +
    '.lpb-ux-trust-item span{display:block;color:#566170;margin-top:2px;font-size:12.2px}' +
    '.lpb-ux-urgency{margin:0 2px 10px;padding:9px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#7c2d12}' +
    '.lpb-ux-urgency-top{display:flex;align-items:center;justify-content:space-between;gap:10px;font-weight:950;font-size:13.2px}' +
    '.lpb-ux-timer{font-variant-numeric:tabular-nums;background:#7c2d12;color:#fff;padding:3px 8px;border-radius:999px;font-size:12.6px;letter-spacing:.5px;white-space:nowrap}' +
    '.lpb-ux-urgency-sub{margin-top:5px;font-size:12.6px;font-weight:700;line-height:1.25}' +
    '.lpb-ux-cta{display:block;width:100%;text-align:center;text-decoration:none;border:0;border-radius:12px;cursor:pointer;background:var(--lpb-cta);color:#fff;font-weight:950;font-size:16px;padding:12px;margin:0 2px 8px;transition:transform .06s ease,background .2s ease;font-family:inherit;-webkit-appearance:none;appearance:none}' +
    '.lpb-ux-cta:hover{background:var(--lpb-cta-dark)}' +
    '.lpb-ux-cta:active{transform:translateY(1px)}' +
    '.lpb-ux-fine{margin:0 2px 4px;font-size:12.3px;color:#566170;text-align:center}' +
    '.lpb-ux-no-thanks{display:inline-block;margin:2px 2px 0;font-size:12.8px;color:#566170;text-decoration:underline}' +
    '@media(max-width:360px){.lpb-ux-popup{padding:12px 12px 10px}.lpb-ux-headline{font-size:18px}.lpb-ux-sub{font-size:14px}.lpb-ux-cta{font-size:15.5px;padding:11px}}' +
    '</style>';

  return css + html;
}

function buildCountdown(cfg) {
  var c = cfg.content || {};
  var s = cfg.style || {};
  var accent = s.accentColor || "#dc2626";
  var ctaColor = s.ctaColor || "#16a34a";
  var ctaDark = s.ctaDarkColor || "#15803d";

  var priceHtml = "";
  if (c.priceMode === "discount-only") {
    priceHtml = '<div class="lpb-ux-cd-price"><span class="lpb-ux-cd-discount">' + esc(c.discountPercent || "") + '% OFF</span></div>';
  } else {
    priceHtml = '<div class="lpb-ux-cd-price">' +
      (c.oldPrice ? '<span class="lpb-ux-cd-old">' + esc(c.oldPrice) + '</span>' : '') +
      (c.newPrice ? '<span class="lpb-ux-cd-new">' + esc(c.newPrice) + '</span>' : '') +
      (c.saveBadge ? '<span class="lpb-ux-cd-save">' + esc(c.saveBadge) + '</span>' : '') +
    '</div>';
  }

  var timerHtml = "";
  if (cfg.countdownEnabled) {
    timerHtml = '<div class="lpb-ux-cd-timer-box">' +
      '<span class="lpb-ux-cd-timer-label">' + esc(c.urgencyText || "Offer expires in") + '</span>' +
      '<span class="lpb-ux-cd-timer" data-ux-timer>' + formatInitialTime(cfg.countdownSeconds || 600) + '</span>' +
    '</div>';
  }

  var css = '<style id="lpb-ux-styles">' +
    '.lpb-ux-overlay{display:flex;position:fixed;inset:0;z-index:999999;justify-content:center;align-items:center;background:rgba(0,0,0,.70);backdrop-filter:blur(3px);padding:10px}' +
    '.lpb-ux-cd-popup{width:min(96vw,480px);background:#fff;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.30);position:relative;font-family:Georgia,"Times New Roman",serif;animation:lpb-ux-in .2s ease-out;overflow:hidden}' +
    '@keyframes lpb-ux-in{from{transform:translateY(10px) scale(.985);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}' +
    '.lpb-ux-cd-topbar{background:linear-gradient(135deg,' + accent + ',#991b1b);color:#fff;text-align:center;padding:10px 14px;font-family:system-ui,sans-serif;font-weight:700;font-size:13px;letter-spacing:.3px}' +
    '.lpb-ux-close{position:absolute;right:10px;top:10px;width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.2);color:#fff;font-size:18px;line-height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}' +
    '.lpb-ux-cd-body{padding:20px 18px 16px;text-align:center}' +
    '.lpb-ux-cd-emoji{font-size:40px;margin-bottom:10px}' +
    '.lpb-ux-cd-headline{margin:0 0 6px;font-weight:900;font-size:22px;line-height:1.18;color:#111}' +
    '.lpb-ux-cd-headline .hl{color:' + accent + '}' +
    '.lpb-ux-cd-sub{margin:0 0 16px;color:#555;font-size:15px;line-height:1.4}' +
    '.lpb-ux-cd-timer-box{display:inline-flex;align-items:center;gap:10px;border:2px solid ' + accent + ';border-radius:10px;padding:9px 18px;margin-bottom:16px}' +
    '.lpb-ux-cd-timer-label{font-family:system-ui,sans-serif;font-size:13px;font-weight:700;color:#333}' +
    '.lpb-ux-cd-timer{font-family:system-ui,sans-serif;font-variant-numeric:tabular-nums;background:' + accent + ';color:#fff;padding:4px 12px;border-radius:6px;font-size:17px;font-weight:800;letter-spacing:1px}' +
    '.lpb-ux-cd-price{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:16px;font-family:system-ui,sans-serif}' +
    '.lpb-ux-cd-old{text-decoration:line-through;color:#999;font-size:16px}' +
    '.lpb-ux-cd-new{color:#16a34a;font-size:26px;font-weight:900}' +
    '.lpb-ux-cd-save{background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;padding:3px 8px;border-radius:999px}' +
    '.lpb-ux-cd-discount{color:' + accent + ';font-size:30px;font-weight:900}' +
    '.lpb-ux-cta{display:block;width:90%;margin:0 auto 10px;text-align:center;text-decoration:none;border:0;border-radius:10px;cursor:pointer;background:linear-gradient(135deg,' + ctaColor + ',' + ctaDark + ');color:#fff;font-weight:900;font-size:16px;padding:13px;font-family:system-ui,sans-serif;transition:transform .06s ease}' +
    '.lpb-ux-cta:hover{filter:brightness(1.08)}' +
    '.lpb-ux-cta:active{transform:translateY(1px)}' +
    '.lpb-ux-no-thanks{display:inline-block;margin:0 0 6px;font-size:13px;color:#888;text-decoration:underline;cursor:pointer;font-family:system-ui,sans-serif}' +
    '</style>';

  var html =
    '<div class="lpb-ux-overlay" role="dialog" aria-modal="true">' +
      '<div class="lpb-ux-cd-popup">' +
        '<button class="lpb-ux-close" aria-label="Close" data-ux-close>&times;</button>' +
        (c.topbarText ? '<div class="lpb-ux-cd-topbar">' + esc(c.topbarText) + '</div>' : '') +
        '<div class="lpb-ux-cd-body">' +
          (c.emoji ? '<div class="lpb-ux-cd-emoji">' + esc(c.emoji) + '</div>' : '') +
          '<h2 class="lpb-ux-cd-headline">' + (c.headline || "") + '</h2>' +
          (c.subtext ? '<p class="lpb-ux-cd-sub">' + (c.subtext || "") + '</p>' : '') +
          timerHtml +
          priceHtml +
          '<a href="' + esc(cfg.ctaUrl || "#") + '" class="lpb-ux-cta">' + esc(c.ctaText || "CLAIM OFFER") + '</a>' +
          '<a href="#" class="lpb-ux-no-thanks" data-ux-dismiss>' + esc(c.noThanksText || "No thanks") + '</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  return css + html;
}

function buildDoctor(cfg) {
  var c = cfg.content || {};
  var s = cfg.style || {};
  var hFrom = s.headerBgFrom || "#1e3a5f";
  var hTo = s.headerBgTo || "#2563eb";
  var ctaColor = s.ctaColor || "#16a34a";
  var ctaDark = s.ctaDarkColor || "#15803d";

  var css = '<style id="lpb-ux-styles">' +
    '.lpb-ux-overlay{display:flex;position:fixed;inset:0;z-index:999999;justify-content:center;align-items:center;background:rgba(0,0,0,.70);backdrop-filter:blur(3px);padding:10px}' +
    '.lpb-ux-dr-popup{width:min(96vw,480px);background:#fff;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.30);position:relative;font-family:Georgia,"Times New Roman",serif;animation:lpb-ux-in .2s ease-out;overflow:hidden}' +
    '@keyframes lpb-ux-in{from{transform:translateY(10px) scale(.985);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}' +
    '.lpb-ux-dr-header{background:linear-gradient(135deg,' + hFrom + ',' + hTo + ');padding:18px 16px;display:flex;align-items:center;gap:14px}' +
    '.lpb-ux-dr-avatar{width:52px;height:52px;border-radius:999px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0}' +
    '.lpb-ux-dr-name{color:#fff;font-weight:900;font-size:17px;margin-bottom:2px;font-family:system-ui,sans-serif}' +
    '.lpb-ux-dr-creds{color:rgba(255,255,255,.75);font-size:12.5px;font-family:system-ui,sans-serif}' +
    '.lpb-ux-close{position:absolute;right:10px;top:10px;width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.15);color:#fff;font-size:18px;line-height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}' +
    '.lpb-ux-dr-body{padding:18px 16px 14px}' +
    '.lpb-ux-dr-headline{margin:0 0 12px;font-weight:900;font-size:20px;line-height:1.2;color:#111}' +
    '.lpb-ux-dr-headline .hl{color:' + hTo + '}' +
    '.lpb-ux-dr-quote{border-left:3px solid ' + hTo + ';padding:12px 14px;margin:0 0 14px;background:#eff6ff;border-radius:0 8px 8px 0;font-style:italic;font-size:15px;line-height:1.45;color:#333}' +
    '.lpb-ux-dr-offer{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px 14px;margin:0 0 14px;text-align:center;font-family:system-ui,sans-serif;font-size:14px;color:#166534;font-weight:600}' +
    '.lpb-ux-dr-coupon{display:inline-block;margin-top:6px;border:2px dashed #16a34a;border-radius:6px;padding:5px 14px;font-weight:900;font-size:15px;letter-spacing:1.5px;color:#15803d;background:#fff}' +
    '.lpb-ux-cta{display:block;width:100%;text-align:center;text-decoration:none;border:0;border-radius:10px;cursor:pointer;background:' + ctaColor + ';color:#fff;font-weight:900;font-size:16px;padding:13px;font-family:system-ui,sans-serif;transition:transform .06s ease,background .15s ease;margin-bottom:10px}' +
    '.lpb-ux-cta:hover{background:' + ctaDark + '}' +
    '.lpb-ux-cta:active{transform:translateY(1px)}' +
    '.lpb-ux-no-thanks{display:inline-block;margin:0 0 4px;font-size:13px;color:#888;text-decoration:underline;cursor:pointer;font-family:system-ui,sans-serif}' +
    '</style>';

  var html =
    '<div class="lpb-ux-overlay" role="dialog" aria-modal="true">' +
      '<div class="lpb-ux-dr-popup">' +
        '<button class="lpb-ux-close" aria-label="Close" data-ux-close>&times;</button>' +
        '<div class="lpb-ux-dr-header">' +
          '<div class="lpb-ux-dr-avatar">' + esc(c.doctorEmoji || c.emoji || "") + '</div>' +
          '<div>' +
            '<div class="lpb-ux-dr-name">' + esc(c.doctorName || "") + '</div>' +
            '<div class="lpb-ux-dr-creds">' + esc(c.doctorCreds || "") + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="lpb-ux-dr-body">' +
          '<h2 class="lpb-ux-dr-headline">' + (c.headline || "") + '</h2>' +
          (c.quoteText ? '<div class="lpb-ux-dr-quote">"' + esc(c.quoteText) + '"</div>' : '') +
          ((c.offerText || c.couponCode) ? '<div class="lpb-ux-dr-offer">' +
            (c.offerText ? esc(c.offerText) : '') +
            (c.couponCode ? '<br><span class="lpb-ux-dr-coupon">' + esc(c.couponCode) + '</span>' : '') +
          '</div>' : '') +
          '<a href="' + esc(cfg.ctaUrl || "#") + '" class="lpb-ux-cta">' + esc(c.ctaText || "CLAIM OFFER") + '</a>' +
          '<a href="#" class="lpb-ux-no-thanks" data-ux-dismiss>' + esc(c.noThanksText || "No thanks") + '</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  return css + html;
}

function buildSupply(cfg) {
  var c = cfg.content || {};
  var s = cfg.style || {};
  var accent = s.accentColor || "#ea580c";
  var ctaColor = s.ctaColor || "#16a34a";
  var ctaDark = s.ctaDarkColor || "#15803d";

  var stockLeft = Number(c.stockLeft) || 3;
  var stockTotal = Number(c.stockTotal) || 20;
  var stockPct = stockTotal > 0 ? Math.round((stockLeft / stockTotal) * 100) : 0;

  var priceHtml = "";
  if (c.priceMode === "discount-only") {
    priceHtml = '<div class="lpb-ux-sp-pricebox"><span class="lpb-ux-sp-discount">' + esc(c.discountPercent || "") + '% OFF</span></div>';
  } else {
    priceHtml = '<div class="lpb-ux-sp-pricebox">' +
      (c.oldPrice ? '<span class="lpb-ux-sp-old">' + esc(c.oldPrice) + '</span>' : '') +
      (c.newPrice ? '<span class="lpb-ux-sp-new">' + esc(c.newPrice) + '</span>' : '') +
    '</div>';
  }

  var css = '<style id="lpb-ux-styles">' +
    '.lpb-ux-overlay{display:flex;position:fixed;inset:0;z-index:999999;justify-content:center;align-items:center;background:rgba(0,0,0,.70);backdrop-filter:blur(3px);padding:10px}' +
    '.lpb-ux-sp-popup{width:min(96vw,460px);background:#fff;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.30);position:relative;font-family:system-ui,-apple-system,sans-serif;animation:lpb-ux-in .2s ease-out;overflow:hidden}' +
    '@keyframes lpb-ux-in{from{transform:translateY(10px) scale(.985);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}' +
    '.lpb-ux-sp-topbar{background:' + accent + ';color:#fff;text-align:center;padding:8px 14px;font-weight:700;font-size:13px;letter-spacing:.3px}' +
    '.lpb-ux-close{position:absolute;right:10px;top:10px;width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.15);color:#fff;font-size:18px;line-height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}' +
    '.lpb-ux-sp-body{padding:18px 16px 14px;text-align:center}' +
    '.lpb-ux-sp-badge{display:inline-block;background:' + accent + ';color:#fff;font-weight:800;font-size:12px;padding:4px 12px;border-radius:999px;margin-bottom:10px;letter-spacing:.5px}' +
    '.lpb-ux-sp-headline{margin:0 0 14px;font-weight:900;font-size:20px;line-height:1.2;color:#111}' +
    '.lpb-ux-sp-headline .hl{color:#dc2626}' +
    '.lpb-ux-sp-stock{margin:0 0 8px}' +
    '.lpb-ux-sp-stock-track{height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden}' +
    '.lpb-ux-sp-stock-fill{height:100%;background:#dc2626;border-radius:999px;transition:width .3s ease}' +
    '.lpb-ux-sp-stock-text{font-size:13px;color:#666;margin-top:5px}' +
    '.lpb-ux-sp-stock-text strong{color:#dc2626}' +
    '.lpb-ux-sp-viewers{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#666;margin-bottom:14px}' +
    '.lpb-ux-sp-dot{width:8px;height:8px;border-radius:999px;background:#dc2626;animation:lpb-ux-pulse 1.5s ease-in-out infinite}' +
    '@keyframes lpb-ux-pulse{0%,100%{opacity:1}50%{opacity:.3}}' +
    '.lpb-ux-sp-pricebox{background:#1a1a1a;border-radius:10px;padding:14px;margin:0 0 14px;display:flex;align-items:center;justify-content:center;gap:12px}' +
    '.lpb-ux-sp-old{text-decoration:line-through;color:#888;font-size:16px}' +
    '.lpb-ux-sp-new{color:#4ade80;font-size:28px;font-weight:900}' +
    '.lpb-ux-sp-discount{color:#4ade80;font-size:28px;font-weight:900}' +
    '.lpb-ux-cta{display:block;width:100%;text-align:center;text-decoration:none;border:0;border-radius:10px;cursor:pointer;background:' + ctaColor + ';color:#fff;font-weight:900;font-size:16px;padding:13px;transition:transform .06s ease,background .15s ease;margin-bottom:10px}' +
    '.lpb-ux-cta:hover{background:' + ctaDark + '}' +
    '.lpb-ux-cta:active{transform:translateY(1px)}' +
    '.lpb-ux-no-thanks{display:inline-block;margin:0 0 4px;font-size:13px;color:#888;text-decoration:underline;cursor:pointer}' +
    '</style>';

  var html =
    '<div class="lpb-ux-overlay" role="dialog" aria-modal="true">' +
      '<div class="lpb-ux-sp-popup">' +
        '<button class="lpb-ux-close" aria-label="Close" data-ux-close>&times;</button>' +
        (c.topbarText ? '<div class="lpb-ux-sp-topbar">' + esc(c.topbarText) + '</div>' : '') +
        '<div class="lpb-ux-sp-body">' +
          (c.alertBadge ? '<div class="lpb-ux-sp-badge">' + esc(c.alertBadge) + '</div>' : '') +
          '<h2 class="lpb-ux-sp-headline">' + (c.headline || "") + '</h2>' +
          '<div class="lpb-ux-sp-stock"><div class="lpb-ux-sp-stock-track"><div class="lpb-ux-sp-stock-fill" style="width:' + stockPct + '%"></div></div>' +
          '<div class="lpb-ux-sp-stock-text">Only <strong>' + esc(String(stockLeft)) + '</strong> left in stock</div></div>' +
          (c.viewerCount ? '<div class="lpb-ux-sp-viewers"><span class="lpb-ux-sp-dot"></span> ' + esc(c.viewerCount) + ' people viewing this</div>' : '') +
          priceHtml +
          '<a href="' + esc(cfg.ctaUrl || "#") + '" class="lpb-ux-cta">' + esc(c.ctaText || "CLAIM OFFER") + '</a>' +
          '<a href="#" class="lpb-ux-no-thanks" data-ux-dismiss>' + esc(c.noThanksText || "No thanks") + '</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  return css + html;
}

function buildReader(cfg) {
  var c = cfg.content || {};
  var s = cfg.style || {};
  var hFrom = s.headerBgFrom || "#0f172a";
  var hTo = s.headerBgTo || "#1e3a5f";
  var ctaColor = s.ctaColor || "#16a34a";
  var ctaDark = s.ctaDarkColor || "#15803d";

  var checksHtml = "";
  if (c.checkItems && c.checkItems.length) {
    for (var i = 0; i < c.checkItems.length; i++) {
      checksHtml += '<div class="lpb-ux-rd-check"><span class="lpb-ux-rd-chk">✓</span> ' + esc(c.checkItems[i]) + '</div>';
    }
  }

  var priceHtml = "";
  if (c.priceMode === "discount-only") {
    priceHtml = '<div class="lpb-ux-rd-price"><span class="lpb-ux-rd-discount">' + esc(c.discountPercent || "") + '% OFF</span></div>';
  } else {
    priceHtml = '<div class="lpb-ux-rd-price">' +
      (c.oldPrice ? '<span class="lpb-ux-rd-old">' + esc(c.oldPrice) + '</span>' : '') +
      (c.newPrice ? '<span class="lpb-ux-rd-new">' + esc(c.newPrice) + '</span>' : '') +
      (c.perText ? '<span class="lpb-ux-rd-per">' + esc(c.perText) + '</span>' : '') +
    '</div>';
  }

  var css = '<style id="lpb-ux-styles">' +
    '.lpb-ux-overlay{display:flex;position:fixed;inset:0;z-index:999999;justify-content:center;align-items:center;background:rgba(0,0,0,.70);backdrop-filter:blur(3px);padding:10px}' +
    '.lpb-ux-rd-popup{width:min(96vw,480px);background:#fff;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.30);position:relative;font-family:system-ui,-apple-system,sans-serif;animation:lpb-ux-in .2s ease-out;overflow:hidden}' +
    '@keyframes lpb-ux-in{from{transform:translateY(10px) scale(.985);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}' +
    '.lpb-ux-rd-header{background:linear-gradient(135deg,' + hFrom + ',' + hTo + ');padding:24px 18px 20px;text-align:center;position:relative;overflow:hidden}' +
    '.lpb-ux-rd-ribbon{position:absolute;top:14px;right:-32px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;font-weight:900;font-size:11px;padding:4px 40px;transform:rotate(35deg);letter-spacing:1px}' +
    '.lpb-ux-rd-eyebrow{color:#fbbf24;font-size:12px;font-weight:700;letter-spacing:1.5px;margin-bottom:6px}' +
    '.lpb-ux-rd-title{color:#fff;font-family:Georgia,"Times New Roman",serif;font-size:22px;font-weight:900;line-height:1.2;margin:0}' +
    '.lpb-ux-close{position:absolute;right:10px;top:10px;width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.15);color:#fff;font-size:18px;line-height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}' +
    '.lpb-ux-rd-body{padding:18px 16px 14px}' +
    '.lpb-ux-rd-checks{margin:0 0 14px}' +
    '.lpb-ux-rd-check{padding:5px 0;font-size:14.5px;color:#333;line-height:1.35}' +
    '.lpb-ux-rd-chk{color:#16a34a;font-weight:700;margin-right:4px}' +
    '.lpb-ux-rd-divider{border:0;border-top:1px dashed #d1d5db;margin:0 0 14px}' +
    '.lpb-ux-rd-price{display:flex;align-items:baseline;justify-content:center;gap:10px;margin:0 0 14px}' +
    '.lpb-ux-rd-old{text-decoration:line-through;color:#999;font-size:16px}' +
    '.lpb-ux-rd-new{color:#16a34a;font-size:32px;font-weight:900}' +
    '.lpb-ux-rd-per{color:#666;font-size:13px}' +
    '.lpb-ux-rd-discount{color:#16a34a;font-size:32px;font-weight:900}' +
    '.lpb-ux-cta{display:block;width:100%;text-align:center;text-decoration:none;border:0;border-radius:10px;cursor:pointer;background:' + ctaColor + ';color:#fff;font-weight:900;font-size:16px;padding:13px;transition:transform .06s ease,background .15s ease;margin-bottom:10px}' +
    '.lpb-ux-cta:hover{background:' + ctaDark + '}' +
    '.lpb-ux-cta:active{transform:translateY(1px)}' +
    '.lpb-ux-rd-trust{display:flex;justify-content:center;gap:16px;margin:0 0 10px;font-size:12px;color:#666}' +
    '.lpb-ux-rd-trust span{display:inline-flex;align-items:center;gap:4px}' +
    '.lpb-ux-no-thanks{display:inline-block;margin:0 0 4px;font-size:13px;color:#888;text-decoration:underline;cursor:pointer}' +
    '</style>';

  var html =
    '<div class="lpb-ux-overlay" role="dialog" aria-modal="true">' +
      '<div class="lpb-ux-rd-popup">' +
        '<button class="lpb-ux-close" aria-label="Close" data-ux-close>&times;</button>' +
        '<div class="lpb-ux-rd-header">' +
          (c.ribbonText ? '<div class="lpb-ux-rd-ribbon">' + esc(c.ribbonText) + '</div>' : '') +
          (c.eyebrowText ? '<div class="lpb-ux-rd-eyebrow">' + esc(c.eyebrowText) + '</div>' : '') +
          '<h2 class="lpb-ux-rd-title">' + (c.headerTitle || c.headline || "") + '</h2>' +
        '</div>' +
        '<div class="lpb-ux-rd-body">' +
          (checksHtml ? '<div class="lpb-ux-rd-checks">' + checksHtml + '</div>' : '') +
          '<hr class="lpb-ux-rd-divider">' +
          priceHtml +
          '<a href="' + esc(cfg.ctaUrl || "#") + '" class="lpb-ux-cta">' + esc(c.ctaText || "CLAIM OFFER") + '</a>' +
          '<div class="lpb-ux-rd-trust"><span>🔒 Secure</span><span>✓ Guaranteed</span><span>📦 Free Shipping</span></div>' +
          '<a href="#" class="lpb-ux-no-thanks" data-ux-dismiss>' + esc(c.noThanksText || "No thanks") + '</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  return css + html;
}

function buildYesNo(cfg) {
  var c = cfg.content || {};
  var s = cfg.style || {};
  var ctaColor = s.ctaColor || "#16a34a";
  var ctaDark = s.ctaDarkColor || "#15803d";
  var discountNum = c.discountPercent || "50";

  var css = '<style id="lpb-ux-styles">' +
    '.lpb-ux-overlay{display:flex;position:fixed;inset:0;z-index:999999;justify-content:center;align-items:center;background:rgba(0,0,0,.70);backdrop-filter:blur(3px);padding:10px}' +
    '.lpb-ux-yn-popup{width:min(96vw,420px);background:#fff;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.30);position:relative;font-family:system-ui,-apple-system,sans-serif;animation:lpb-ux-in .2s ease-out;overflow:hidden}' +
    '@keyframes lpb-ux-in{from{transform:translateY(10px) scale(.985);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}' +
    '.lpb-ux-yn-top{background:linear-gradient(135deg,#2e1065,#581c87);padding:30px 20px 24px;text-align:center}' +
    '.lpb-ux-close{position:absolute;right:10px;top:10px;width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.15);color:#fff;font-size:18px;line-height:26px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}' +
    '.lpb-ux-yn-badge{display:inline-block;background:' + ctaColor + ';color:#fff;font-weight:800;font-size:12px;padding:4px 14px;border-radius:999px;margin-bottom:12px;letter-spacing:.5px}' +
    '.lpb-ux-yn-question{color:#fff;font-size:17px;font-weight:700;line-height:1.3;margin:0 0 14px}' +
    '.lpb-ux-yn-discount{color:#fff;font-size:64px;font-weight:900;line-height:1;margin:0}' +
    '.lpb-ux-yn-pct{font-size:22px;font-weight:800}' +
    '.lpb-ux-yn-off{color:rgba(255,255,255,.7);font-size:20px;font-weight:800;letter-spacing:3px;margin-top:2px}' +
    '.lpb-ux-yn-body{padding:20px 18px 16px;text-align:center}' +
    '.lpb-ux-yn-tagline{margin:0 0 16px;color:#555;font-size:15px;line-height:1.4}' +
    '.lpb-ux-cta{display:block;width:100%;text-align:center;text-decoration:none;border:0;border-radius:10px;cursor:pointer;background:' + ctaColor + ';color:#fff;font-weight:900;font-size:16px;padding:14px;transition:transform .06s ease,background .15s ease;margin-bottom:10px}' +
    '.lpb-ux-cta:hover{background:' + ctaDark + '}' +
    '.lpb-ux-cta:active{transform:translateY(1px)}' +
    '.lpb-ux-yn-no{display:block;width:100%;text-align:center;text-decoration:none;border:2px solid #d1d5db;border-radius:10px;cursor:pointer;background:#fff;color:#666;font-weight:700;font-size:14px;padding:12px;transition:border-color .15s ease}' +
    '.lpb-ux-yn-no:hover{border-color:#9ca3af}' +
    '</style>';

  var html =
    '<div class="lpb-ux-overlay" role="dialog" aria-modal="true">' +
      '<div class="lpb-ux-yn-popup">' +
        '<button class="lpb-ux-close" aria-label="Close" data-ux-close>&times;</button>' +
        '<div class="lpb-ux-yn-top">' +
          (c.badgeText ? '<div class="lpb-ux-yn-badge">' + esc(c.badgeText) + '</div>' : '') +
          (c.questionText ? '<div class="lpb-ux-yn-question">' + esc(c.questionText) + '</div>' : '') +
          '<div class="lpb-ux-yn-discount">' + esc(String(discountNum)) + '<span class="lpb-ux-yn-pct">%</span></div>' +
          '<div class="lpb-ux-yn-off">OFF</div>' +
        '</div>' +
        '<div class="lpb-ux-yn-body">' +
          (c.taglineText ? '<div class="lpb-ux-yn-tagline">' + esc(c.taglineText) + '</div>' : '') +
          '<a href="' + esc(cfg.ctaUrl || "#") + '" class="lpb-ux-cta">' + esc(c.yesButtonText || c.ctaText || "YES! GIVE ME THE DEAL") + '</a>' +
          '<a href="#" class="lpb-ux-yn-no" data-ux-dismiss>' + esc(c.noButtonText || "No, I prefer to pay full price") + '</a>' +
        '</div>' +
      '</div>' +
    '</div>';

  return css + html;
}

function buildPopup(cfg) {
  var template = cfg.template || "default";
  var markup;
  if (template === "countdown") markup = buildCountdown(cfg);
  else if (template === "doctor") markup = buildDoctor(cfg);
  else if (template === "supply") markup = buildSupply(cfg);
  else if (template === "reader") markup = buildReader(cfg);
  else if (template === "yesno") markup = buildYesNo(cfg);
  else markup = buildDefault(cfg);

  if (cfg.geoTokensEnabled) {
    markup = replaceGeoTokens(markup);
  }

  var wrapper = document.createElement("div");
  wrapper.id = "lpb-ux-root";
  if (cfg.language === "he") wrapper.setAttribute("dir", "rtl");
  wrapper.innerHTML = markup;
  document.body.appendChild(wrapper);
  popupEl = wrapper;

  var closeBtn = wrapper.querySelector("[data-ux-close]");
  if (closeBtn) closeBtn.addEventListener("click", function(e) { e.preventDefault(); closePopup(true); });
  var dismissEl = wrapper.querySelector("[data-ux-dismiss]");
  if (dismissEl) dismissEl.addEventListener("click", function(e) { e.preventDefault(); closePopup(true); });
  var overlay = wrapper.querySelector(".lpb-ux-overlay");
  if (overlay) overlay.addEventListener("click", function(e) {
    if (e.target === e.currentTarget) closePopup(true);
  });

  startCountdown(cfg);

  // Preserve original popup CTA URL for ClickFlare fail-safe restoration.
  var popupCta = wrapper.querySelector(".lpb-ux-cta");
  if (popupCta && cfg.ctaUrl && /^https?:\/\/[^\/]+\/cf\/click\/[1-9][0-9]*(\?.*)?$/i.test(cfg.ctaUrl)) {
    popupCta.setAttribute("data-lpb-cf-original", cfg.ctaUrl);
  }

  setTimeout(function() {
    var cta = wrapper.querySelector(".lpb-ux-cta");
    if (cta) cta.focus();
  }, 50);

  // Re-trigger ClickFlare link scan so it picks up the popup CTA.
  // Double-tap: immediate + delayed for slow devices / heavy pages.
  if (window.__lpbClickflareRescan) {
    if (window.__lpbClickflareDebug && window.console && typeof window.console.log === "function") {
      window.console.log("[LPB-CF]", "popup rendered -> rescan");
    }
    window.__lpbClickflareRescan();
    setTimeout(window.__lpbClickflareRescan, 200);
  }
}

function formatInitialTime(secs) {
  var mm = String(Math.floor(secs / 60));
  var ss = String(secs % 60);
  if (mm.length < 2) mm = "0" + mm;
  if (ss.length < 2) ss = "0" + ss;
  return mm + ":" + ss;
}

// === SHOW / CLOSE POPUP ===
function showPopup() {
  if (popupEl) return;
  if (!activeConfig) return;
  buildPopup(activeConfig);
  popupShown = true;
  document.body.style.overflow = "hidden";
}

function closePopup(rearmBackRedirect) {
  if (!popupEl) return;
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  popupEl.parentNode.removeChild(popupEl);
  popupEl = null;
  popupClosed = true;
  document.body.style.overflow = "";

  if (rearmBackRedirect && activeConfig && activeConfig.backRedirectEnabled) {
    safePush();
  }
}

// === ESCAPE KEY ===
function onKeydown(e) {
  if (e.key === "Escape" && popupEl) closePopup(true);
}
document.addEventListener("keydown", onKeydown);

// === POPSTATE HANDLER ===
function onPopstate() {
  if (!activeConfig) return;
  var cfg = activeConfig;

  // If popup is currently showing — user pressed back while popup open
  // Close popup WITHOUT re-arming, then redirect immediately if configured
  if (popupEl) {
    closePopup(false);
    if (cfg.backRedirectEnabled && cfg.backRedirectUrl) {
      location.href = cfg.backRedirectUrl;
    }
    return;
  }

  // Popup triggered by back-button and not yet shown
  if (cfg.popupTrigger === "back-button" && !popupShown) {
    if (checkFrequency(cfg)) {
      showPopup();
      safePush();
    } else if (cfg.backRedirectEnabled && cfg.backRedirectUrl) {
      location.href = cfg.backRedirectUrl;
    }
    return;
  }

  // Back-redirect: fires after popup was dismissed via UI (X / no-thanks / overlay)
  if (cfg.backRedirectEnabled && cfg.backRedirectUrl) {
    location.href = cfg.backRedirectUrl;
    return;
  }
}

// === EXIT INTENT (DESKTOP) ===
var exitIntentFired = false;
function onMouseLeave(e) {
  if (exitIntentFired) return;
  if (e.clientY > 0) return;
  if (!activeConfig) return;
  if (activeConfig.popupTrigger !== "exit-intent") return;
  if (popupEl) return;

  exitIntentFired = true;
  if (checkFrequency(activeConfig)) {
    showPopup();
  }
}

// === MATCHING ===
// Two-pass: per-page matches are more specific and take priority over global fallback.
function matchConfig(data) {
  var slug = getSlug();
  var host = location.hostname;
  var profile = getPageProfile();

  if (profile === "none") return null;

  // Global page exclude — overrides everything, no popup/back-redirect for these pages
  var gpe = data.globalPageExclude;
  if (gpe && gpe.length > 0) {
    for (var ge = 0; ge < gpe.length; ge++) {
      if (globMatch(gpe[ge], slug)) return null;
    }
  }

  var popups = data.popups || [];

  // Helper: returns false if cfg should be skipped due to domain/exclude filters
  function passesFilters(cfg) {
    if (cfg.domainFilter && cfg.domainFilter.length > 0) {
      var domainMatch = false;
      for (var d = 0; d < cfg.domainFilter.length; d++) {
        if (cfg.domainFilter[d] === host) { domainMatch = true; break; }
      }
      if (!domainMatch) return false;
    }
    if (cfg.pageExclude && cfg.pageExclude.length > 0) {
      for (var x = 0; x < cfg.pageExclude.length; x++) {
        if (globMatch(cfg.pageExclude[x], slug)) return false;
      }
    }
    return true;
  }

  // Page-level profile override (highest priority, still respects pageExclude)
  if (profile && profile !== "inherit") {
    for (var p = 0; p < popups.length; p++) {
      if (popups[p].enabled && popups[p].id === profile) {
        return passesFilters(popups[p]) ? popups[p] : null;
      }
    }
    return null;
  }

  // Pass 1: per-page match (most specific wins)
  for (var i = 0; i < popups.length; i++) {
    var cfg = popups[i];
    if (!cfg.enabled) continue;
    if (!passesFilters(cfg)) continue;
    if (cfg.scope === "per-page" && cfg.pageFilter && cfg.pageFilter.length > 0) {
      for (var f = 0; f < cfg.pageFilter.length; f++) {
        if (globMatch(cfg.pageFilter[f], slug)) return cfg;
      }
    }
  }

  // Pass 2: global fallback
  for (var g = 0; g < popups.length; g++) {
    var gcfg = popups[g];
    if (!gcfg.enabled) continue;
    if (!passesFilters(gcfg)) continue;
    if (gcfg.scope === "global") return gcfg;
  }

  return null;
}

// === INIT ===
function init() {
  // Fetch config
  try {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", CONFIG_URL, true);
    xhr.timeout = 10000;
    xhr.onload = function() {
      if (xhr.status < 200 || xhr.status >= 300) return;
      try {
        var data = JSON.parse(xhr.responseText);
        if (data.disabled) return;
        setup(data);
      } catch(e) {}
    };
    xhr.onerror = function() {};
    xhr.ontimeout = function() {};
    xhr.send();
  } catch(e) {}
}

function setup(data) {
  var cfg = matchConfig(data);
  if (!cfg) return;

  // Auto-language: detect and merge translations before building popup
  var lang = detectLang(cfg);
  if (lang !== (cfg.language || "en")) {
    cfg = applyTranslations(cfg, lang);
  }

  // Resolve "smart" trigger per device:
  // Desktop → exit-intent popup + back redirect
  // Mobile/Tablet → back-button popup + second back redirect
  var trigger = cfg.popupTrigger;
  if (trigger === "smart") {
    trigger = isDesktop ? "exit-intent" : "back-button";
    cfg = {
      popupTrigger: trigger,
      backRedirectEnabled: true,
      backRedirectUrl: cfg.backRedirectUrl,
      ctaUrl: cfg.ctaUrl,
      countdownEnabled: cfg.countdownEnabled,
      countdownSeconds: cfg.countdownSeconds,
      countdownSessionPersist: cfg.countdownSessionPersist,
      content: cfg.content,
      style: cfg.style,
      scope: cfg.scope,
      pageFilter: cfg.pageFilter,
      pageExclude: cfg.pageExclude,
      domainFilter: cfg.domainFilter,
      frequency: cfg.frequency,
      cooldownMinutes: cfg.cooldownMinutes,
      id: cfg.id,
      enabled: cfg.enabled,
      template: cfg.template,
      language: cfg.language,
      languageMode: cfg.languageMode,
      geoTokensEnabled: cfg.geoTokensEnabled,
      translations: cfg.translations,
      backButtonMode: cfg.backButtonMode
    };
  }

  // Short-circuit: nothing to do
  if (cfg.popupTrigger === "none" && !cfg.backRedirectEnabled) return;

  activeConfig = cfg;

  // Determine what triggers to set up based on device
  var needsBackHandler = false;
  var needsExitIntent = false;

  if (cfg.popupTrigger === "back-button") {
    needsBackHandler = true;
  } else if (cfg.popupTrigger === "exit-intent" && isDesktop) {
    needsExitIntent = true;
  }

  if (cfg.backRedirectEnabled) {
    needsBackHandler = true;
  }

  // Set up back-button handler (for popup trigger and/or redirect)
  if (needsBackHandler) {
    var bbMode = cfg.backButtonMode || "deferred";

    if (bbMode === "aggressive") {
      // Aggressive: try immediate pushState (works on non-Chrome / same-origin)
      // plus deferred fallback for Chrome cross-origin intervention.
      window.addEventListener("popstate", onPopstate);
      safePush();
      var _armExtra = false;
      var _addExtra = function() {
        if (_armExtra) return;
        _armExtra = true;
        safePush();
      };
      document.addEventListener("touchstart", _addExtra, { passive: true, capture: true, once: true });
      document.addEventListener("mousedown", _addExtra, { capture: true, once: true });
      document.addEventListener("scroll", _addExtra, { passive: true, capture: true, once: true });
    } else {
      // Deferred (default): wait for first user interaction to bypass Chrome's
      // History API Intervention which silently discards pushState calls made
      // immediately after cross-origin navigation with no user activation.
      var _backArmed = false;
      var _armBack = function() {
        if (_backArmed) return;
        _backArmed = true;
        safePush();
        window.addEventListener("popstate", onPopstate);
      };
      document.addEventListener("touchstart", _armBack, { passive: true, capture: true, once: true });
      document.addEventListener("mousedown", _armBack, { capture: true, once: true });
      document.addEventListener("scroll", _armBack, { passive: true, capture: true, once: true });
    }
  }

  // Set up exit-intent handler (desktop only)
  if (needsExitIntent) {
    document.documentElement.addEventListener("mouseleave", onMouseLeave);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

} catch(e) {
  // Fail silently — page continues normally
}
})();