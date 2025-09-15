// src/ui/checkout.js
//
// Server-safe module (no "window" usage at import time).
// - Exports a harmless stub `checkoutHTML` so index.js can import it.
// - On submit -> POST /api/public/orders/create
// - If method is "pay_now" (online_yoco) -> build an intent URL and
//   navigate to /thanks/:code?next=<intent-url> (the Thank-you page
//   will open it in a new tab and keep polling order status).

export const checkoutHTML = undefined; // keeps server-side import happy

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body || {})
  });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  if (!r.ok) {
    const msg = j?.error || j?.message || `HTTP ${r.status}`;
    const e = new Error(msg); e.body = j; throw e;
  }
  return j;
}

async function getJSON(url) {
  const r = await fetch(url, { credentials: "same-origin" });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch {}
  if (!r.ok) {
    const msg = j?.error || j?.message || `HTTP ${r.status}`;
    const e = new Error(msg); e.body = j; throw e;
  }
  return j;
}

function mountCheckout(root, opts = {}) {
  const form = qs("form[data-checkout]", root) || root; // your page uses a single form

  if (!form) return;

  const btn  = qs("[data-submit]", root) || qs('button[type="submit"]', form);
  const errB = qs("[data-error]", root);

  function setBusy(b) {
    if (btn) {
      btn.disabled = !!b;
      btn.dataset.loading = b ? "1" : "";
    }
  }
  function showError(msg) {
    if (errB) {
      errB.textContent = msg || "Iets het verkeerd geloop. Probeer weer.";
      errB.style.display = "";
    } else {
      alert(msg || "Iets het verkeerd geloop. Probeer weer.");
    }
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    setBusy(true);

    try {
      // Collect minimal payload expected by /api/public/orders/create
      const f = new FormData(form);

      const event_id = Number(f.get("event_id") || 0);
      const methodUi = String(f.get("method") || "pay_now"); // "pay_now" or "pos_cash"
      const buyer = {
        name:  String(f.get("buyer_name") || f.get("name") || "").trim(),
        email: String(f.get("email") || "").trim(),
        phone: String(f.get("phone") || f.get("buyer_phone") || "").trim(),
      };

      // Items: expect inputs like name="item[ticket_type_id]=<id>" and "item[qty]=<n>"
      // If your markup differs, adapt this mapping (kept permissive):
      const items = [];
      qsa("[data-item]", root).forEach((row) => {
        const tid = Number(row.getAttribute("data-ttid") || row.getAttribute("data-ticket-type-id") || 0);
        const qtyEl = qs("[name='qty'], [data-qty]", row);
        const qty = Number((qtyEl && qtyEl.value) || row.getAttribute("data-qty") || 0);
        if (tid && qty > 0) items.push({ ticket_type_id: tid, qty });
      });
      // Fallback: scan common field names if no [data-item] rows were present
      if (!items.length) {
        const tids = qsa("[name='ticket_type_id'], [name^='items['][name$='][ticket_type_id]']", root);
        const qtys = qsa("[name='qty'], [name^='items['][name$='][qty]']", root);
        for (let i = 0; i < Math.max(tids.length, qtys.length); i++) {
          const tid = Number(tids[i]?.value || 0);
          const qty = Number(qtys[i]?.value || 0);
          if (tid && qty > 0) items.push({ ticket_type_id: tid, qty });
        }
      }

      // Optional attendees (kept liberal; attach if present)
      const attendees = [];
      qsa("[data-attendee]", root).forEach((row) => {
        attendees.push({
          ticket_type_id: Number(row.getAttribute("data-ttid") || 0),
          attendee_first: String(qs("[name='attendee_first']", row)?.value || "").trim(),
          attendee_last:  String(qs("[name='attendee_last']",  row)?.value || "").trim(),
          gender:         String(qs("[name='gender']",         row)?.value || "").trim(),
          phone:          String(qs("[name='attendee_phone']", row)?.value || "").trim(),
        });
      });

      if (!event_id) throw new Error("event_id ontbreek");
      if (!items.length) throw new Error("Geen items gekies nie");
      if (!buyer.name) throw new Error("Volledige naam word vereis");

      const body = {
        event_id,
        items,
        attendees,
        buyer_name: buyer.name,
        email:      buyer.email,
        phone:      buyer.phone,
        method:     methodUi === "pay_now" ? "pay_now" : "pos_cash",
      };

      // Create order
      const created = await postJSON("/api/public/orders/create", body);
      const order   = created?.order || {};
      const code    = String(order.short_code || "").toUpperCase();

      if (!code) throw new Error("Kon nie bestelling kode kry nie");

      // If POS/cash, just go straight to thanks (no payment URL)
      if (order.payment_method !== "online_yoco") {
        window.location.assign(`/thanks/${encodeURIComponent(code)}`);
        return;
      }

      // Try to prebuild intent URL. If it fails, we still go to /thanks?pay=err,
      // and the Thank-you page will show the “Gaan betaal” button to recover.
      let nextUrl = "";
      try {
        // Use GET so we don’t trip any body parsers or CORS in edge cases.
        const j = await getJSON(
          `/api/payments/yoco/intent?code=${encodeURIComponent(code)}&next=${encodeURIComponent("/thanks/" + code)}`
        );
        nextUrl = j?.url || "";
      } catch {
        // ignore; we'll fall back to pay=err
      }

      const qsNext = nextUrl ? `?next=${encodeURIComponent(nextUrl)}` : `?pay=err`;
      window.location.assign(`/thanks/${encodeURIComponent(code)}${qsNext}`);
    } catch (e) {
      showError(e?.message || "Kon nie bestelling skep nie");
    } finally {
      setBusy(false);
    }
  });
}

// Only attach to window in the browser
if (typeof window !== "undefined") {
  window.mountCheckout = mountCheckout;
}

export { mountCheckout };
