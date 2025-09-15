// src/ui/checkout.js
//
// 1) POST /api/public/orders/create
// 2) If payment_method is online_yoco, POST /api/payments/yoco/intent { code, next }
// 3) Redirect to Yoco (with fallback to /thanks/:code?next=<yocoUrl>)

(function (global) {
  "use strict";

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function getJSON(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || "Request failed"); });
      return r.json();
    });
  }
  function postJSON(url, body) {
    return fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {})
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = txt ? JSON.parse(txt) : null; } catch (_) {}
        if (!r.ok) throw new Error((j && j.error) || r.statusText || "Request failed");
        return j;
      });
    });
  }

  function mountCheckout(root, opts) {
    root = root || document;
    opts = opts || {};
    var form = qs("#checkout-form", root) || qs("form", root);
    if (!form) { console.warn("[checkout] form not found"); return; }

    form.addEventListener("input", function (e) {
      if (e.target && e.target.hasAttribute("data-qty")) updateTotal();
    });
    updateTotal();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = qs("[data-submit]", form) || qs("button[type=submit]", form);
      if (btn) { btn.disabled = true; btn.textContent = "Verwerk..."; }

      var payload = collectPayload(form, opts.event);

      // 1) Create order
      postJSON("/api/public/orders/create", payload)
        .then(function (res) {
          if (!res || !res.ok || !res.order) throw new Error((res && res.error) || "Kon nie bestelling skep nie.");
          var order = res.order;
          var code  = String(order.short_code || "");
          var thanksUrlBase = "/thanks/" + encodeURIComponent(code);

          // 2) Online payment flow
          if (order.payment_method === "online_yoco") {
            var next = location.origin + thanksUrlBase;
            postJSON("/api/payments/yoco/intent", { code: code, next: next })
              .then(function (intent) {
                var yocoUrl = (intent && intent.url) ? String(intent.url) : "";
                var thanksUrl = yocoUrl ? (thanksUrlBase + "?next=" + encodeURIComponent(yocoUrl)) : thanksUrlBase;

                if (yocoUrl) {
                  try { window.location.replace(yocoUrl); } catch (_) { window.location.href = yocoUrl; }
                  setTimeout(function () { window.location.href = thanksUrl; }, 600);
                  return;
                }
                window.location.href = thanksUrl;
              })
              .catch(function () {
                // If intent fails, still send to thank-you (will show pay button if next present)
                window.location.href = thanksUrlBase;
              });
            return;
          }

          // 3) POS/Cash -> thank-you
          window.location.href = thanksUrlBase;
        })
        .catch(function (err) {
          console.error("[checkout] failed", err);
          alert((err && err.message) ? err.message : "Iets het fout geloop met jou bestelling.");
        })
        .finally(function () {
          var b = qs("[data-submit]", form) || qs("button[type=submit]", form);
          if (b) { b.disabled = false; b.textContent = "Voltooi"; }
        });
    });

    function updateTotal() {
      try {
        var items = qsa("[data-qty]", form).map(function (inp) {
          return {
            price: Number(inp.getAttribute("data-price") || 0),
            qty:   Number(inp.value || 0)
          };
        });
        var cents = items.reduce(function (s, r) { return s + r.qty * r.price; }, 0);
        var out = qs("[data-total]", form);
        if (out) out.textContent = "R" + (cents / 100).toFixed(2);
      } catch (_) {}
    }
  }

  function collectPayload(form, eventObj) {
    var fd = new FormData(form);

    // treat anything that looks like "pay now" or "aanlyn" as online
    var methodRaw = String(fd.get("method") || "").toLowerCase();
    var method = (methodRaw.indexOf("pay") >= 0 || methodRaw.indexOf("aanlyn") >= 0) ? "pay_now" : "pos_cash";

    var buyer_name  = str(fd.get("buyer_name") || fd.get("name"));
    var email       = str(fd.get("email"));
    var phone       = str(fd.get("phone") || fd.get("buyer_phone"));

    var items = [];
    Array.prototype.slice.call(form.querySelectorAll("[data-qty]")).forEach(function (inp) {
      var qty = Number(inp.value || 0);
      var id  = Number(inp.getAttribute("data-id") || 0);
      if (qty > 0 && id) items.push({ ticket_type_id: id, qty: qty });
    });

    var attendees = [];
    Array.prototype.slice.call(form.querySelectorAll("[data-attendee-row]")).forEach(function (row) {
      var tid = Number(row.getAttribute("data-tid") || 0);
      if (!tid) return;
      attendees.push({
        ticket_type_id: tid,
        attendee_first: str(val(row, "[name='attendee_first']")),
        attendee_last:  str(val(row, "[name='attendee_last']")),
        gender:         (str(val(row, "[name='gender']")).toLowerCase() || null),
        phone:          (str(val(row, "[name='attendee_phone']")) || null)
      });
    });

    return {
      event_id: Number((eventObj && eventObj.id) || fd.get("event_id") || 0),
      items: items,
      attendees: attendees,
      buyer_name: buyer_name,
      email: email,
      phone: phone,
      method: method
    };
  }

  function val(root, s) { var n = (root || document).querySelector(s); return n ? n.value : ""; }
  function str(v) { return String(v || "").trim(); }

  // expose on window.App
  var App = global.App = global.App || {};
  App.mountCheckout = mountCheckout;

})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));