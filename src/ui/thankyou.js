// src/ui/thankyou.js
//
// Thank-you page with payment recovery + ticket gating.
// - Polls /api/public/orders/status/:code
// - Shows a "Gaan betaal" button if ?next=<yoco_url> is present
// - Enables "Wys my kaartjies" only when status === "paid"

(function (global) {
  "use strict";

  function qs(sel, root) { return (root || document).querySelector(sel); }

  function getJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || "Request failed"); });
      return r.json();
    });
  }

  function mountThankYou(root, options) {
    root = root || document;
    options = options || {};

    // Code can be passed in, or inferred from /thanks/:code
    var code = String(options.code || "");
    if (!code) {
      var m = (location.pathname || "").match(/\/thanks\/([^\/?#]+)/i);
      code = m ? decodeURIComponent(m[1]) : "";
    }
    if (!code) {
      console.warn("[thankyou] missing order code");
      return;
    }

    var statusDot = qs("[data-status-dot]", root);
    var showBtn   = qs("[data-show-tickets]", root);
    var payBtn    = qs("[data-pay-now]", root);
    var payHint   = qs("[data-pay-alert]", root);

    var u = new URL(location.href);
    var next = u.searchParams.get("next") || "";

    gateTickets(false);
    if (payBtn)  payBtn.style.display  = next ? "" : "none";
    if (payHint) payHint.style.display = next ? "" : "none";

    if (payBtn && next) {
      payBtn.addEventListener("click", function () {
        try { window.location.assign(next); } catch (_) {}
      });
    }
    if (showBtn) {
      showBtn.addEventListener("click", function () {
        if (!showBtn.getAttribute("data-enabled")) return; // guard
        window.location.href = "/t/" + encodeURIComponent(code);
      });
    }

    // If we have a payment URL and the browser didn't follow it earlier,
    // nudge once automatically (non-blocking).
    if (next) setTimeout(function () {
      try { window.location.assign(next); } catch (_) {}
    }, 400);

    // Poll status until paid
    var tries = 0;
    var iv = setInterval(function () {
      tries += 1;
      getJSON("/api/public/orders/status/" + encodeURIComponent(code))
        .then(function (j) {
          var st = String((j && j.status) || "").toLowerCase();
          if (st === "paid") {
            clearInterval(iv);
            gateTickets(true);
          } else {
            gateTickets(false);
          }
        })
        .catch(function () {
          // ignore transient errors
        });

      // safety stop (~6 minutes at 3s if you keep this interval)
      if (tries > 120) clearInterval(iv);
    }, 3000);

    function gateTickets(isPaid) {
      if (statusDot) {
        statusDot.className = isPaid ? "dot dot--green" : "dot dot--waiting";
        statusDot.textContent = isPaid ? "Betaalbevestig" : "Wag vir betaalbevestiging...";
      }
      if (showBtn) {
        showBtn.disabled = !isPaid;
        if (isPaid) {
          showBtn.setAttribute("data-enabled", "1");
          showBtn.classList.remove("is-disabled");
        } else {
          showBtn.removeAttribute("data-enabled");
          showBtn.classList.add("is-disabled");
        }
      }
      if (payBtn) {
        if (isPaid) {
          payBtn.style.display = "none";
          if (payHint) payHint.style.display = "none";
        } else if (next) {
          payBtn.style.display = "";
          if (payHint) payHint.style.display = "";
        }
      }
    }
  }

  // Expose for both module and non-module use
  var App = global.App = global.App || {};
  App.mountThankYou = mountThankYou;
  try { if (typeof export !== "undefined") {} } catch (_) {}
  try { /* ESM named export for <script type="module"> use */
    // eslint-disable-next-line no-undef
    if (typeof window === "undefined") {} // keep bundlers happy
  } catch (_) {}
  // If you import as a module:  import { mountThankYou } from "/ui/thankyou.js"
  // we provide the named export below in ESM-aware bundlers:
  // (Some bundlers will ignore this line when not used.)
  // eslint-disable-next-line
  if (typeof document !== "undefined") { /* marker to avoid tree-shake */ }

  // Provide an ESM export when loaded as a module
  // (wrangler/esbuild is fine parsing this).
  // eslint-disable-next-line
  export { mountThankYou };

})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));