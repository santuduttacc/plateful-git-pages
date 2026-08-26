(function () {
  "use strict";

  var ns = window.__siteTracking = window.__siteTracking || {};
  if (ns.initialized) return;
  ns.initialized = true;
  ns.loadedScripts = ns.loadedScripts || {};

  function addScript(src, attrs, isAsync) {
    if (!src || ns.loadedScripts[src]) return;
    var script = document.createElement("script");
    script.src = src;
    script.async = isAsync !== false;
    script.defer = isAsync === false;
    script.setAttribute("data-site-tracker", "true");

    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] !== null && attrs[key] !== undefined) {
          script.setAttribute(key, String(attrs[key]));
        }
      });
    }

    document.head.appendChild(script);
    ns.loadedScripts[src] = true;
  }

  function runInline(name, callback) {
    if (typeof callback !== "function") return;
    try {
      callback();
    } catch (error) {
      console.error("[site-tracking] " + name + " failed:", error);
    }
  }

  runInline("oir-init", function () {
    window._oirtrk = window._oirtrk || [];
  });

  runInline("plateful-tracker", function () {
    (function (
      e,
      d,
      k,
      n,
      u,
      v,
      g,
      w,
      C,
      f,
      p,
      x,
      D,
      c,
      q,
      r,
      h,
      t,
      y,
      G,
      z
    ) {
      function A() {
        for (var a = d.querySelectorAll(".dtpcnt"), b = 0, l = a.length; b < l; b++) {
          a[b][w] = a[b][w].replace(/(^|\s+)dtpcnt($|\s+)/g, "");
        }
      }
      function E(a, b, l, F) {
        var m = new Date();
        m.setTime(m.getTime() + (F || 864e5));
        d.cookie =
          a +
          "=" +
          b +
          "; " +
          l +
          "samesite=Strict; expires=" +
          m.toGMTString() +
          "; path=/";
        k.setItem(a, b);
        k.setItem(a + "-expires", m.getTime());
      }
      function B(a) {
        var b = d.cookie.match(new RegExp("(^| )" + a + "=([^;]+)"));
        return b
          ? b.pop()
          : k.getItem(a + "-expires") && +k.getItem(a + "-expires") > new Date().getTime()
            ? k.getItem(a)
            : null;
      }
      z = e.location.protocol === "https:" ? "secure; " : "";
      e[f] ||
        ((e[f] = function () {
          (e[f].q = e[f].q || []).push(arguments);
        }),
        (r = d[u]),
        (d[u] = function () {
          r && r.apply(this, arguments);
          if (
            e[f] &&
            !e[f].hasOwnProperty("params") &&
            /loaded|interactive|complete/.test(d.readyState)
          ) {
            for (; (c = d[v][p++]); ) {
              /\/?click\/?($|(\/[0-9]+)?$)/.test(c.pathname) &&
                (c[g] =
                  "javascrip" +
                  e.postMessage.toString().slice(4, 5) +
                  ":" +
                  f +
                  '.l="' +
                  c[g] +
                  '",void 0');
            }
          }
        }),
        setTimeout(function () {
          (t = RegExp("[?&]cpid(=([^&#]*)|&|#|$)").exec(e.location.href)) &&
            t[2] &&
            ((h = t[2]), (y = B("vl-" + h)));
          var a = B("vl-cep"),
            b = location[g];
          if (
            "savedCep" === D &&
            a &&
            (!h || "undefined" === typeof h) &&
            0 > b.indexOf("cep=")
          ) {
            var l = -1 < b.indexOf("?") ? "&" : "?";
            b += l + a;
          }
          c = d.createElement("script");
          q = d.scripts[0];
          c.defer = 1;
          c.src =
            x +
            (-1 === x.indexOf("?") ? "?" : "&") +
            "lpref=" +
            n(d.referrer) +
            "&lpurl=" +
            n(b) +
            "&lpt=" +
            n(d.title) +
            "&vtm=" +
            new Date().getTime() +
            (y ? "&uw=no" : "");
          c[C] = function () {
            for (p = 0; (c = d[v][p++]); )
              /dtpCallback\.l/.test(c[g]) &&
                (c[g] = decodeURIComponent(c[g]).match(/dtpCallback\.l="([^"]+)/)[1]);
            A();
          };
          q.parentNode.insertBefore(c, q);
          h && E("vl-" + h, "1", z);
        }, 0),
        setTimeout(A, 7e3));
    })(
      window,
      document,
      window.localStorage,
      encodeURIComponent,
      "onreadystatechange",
      "links",
      "href",
      "className",
      "onerror",
      "dtpCallback",
      0,
      "https://trkv.plateful.co/d/.js",
      "savedCep"
    );
  });

  runInline("gtm-bootstrap", function () {
    if (!window.dataLayer) {
      window.dataLayer = [];
    }
    window.dataLayer.push({
      "gtm.start": new Date().getTime(),
      event: "gtm.js",
    });
  });

  var legacyLoadList = [
    { src: "js/.js.js", attrs: {}, async: false },
    { src: "js/6kbynhfbcl.js", attrs: {}, async: true },
    { src: "js/oir.min.js", attrs: { oirtyp: "6311ae17", oirid: "P5B2226L2" }, async: true },
    { src: "js/ux-loader.js", attrs: {}, async: false }
  ];

  legacyLoadList.forEach(function (item) {
    addScript(item.src, item.attrs, item.async);
  });
})();
