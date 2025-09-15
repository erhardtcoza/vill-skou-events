// src/ui/checkout.js
//
// Server-safe module (no "window" at import time) + browser behavior.
// - Exports a harmless stub `checkoutHTML` so index.js can import it.
// - Defines `mountCheckout` and only attaches it to `window` in the browser.

export const checkoutHTML = undefined; // keeps server-side import happy

function qs(sel, root = document) { return root.querySelector(sel); }

async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body || {})
  });
  let j = null;
  try { j = await r.json(); } catch {}
  if (!r.ok) {
    const err = new Error(j?.error || j?.message || `HTTP ${r.status}`);
    err.body = j; throw err;
  }
  return j;
}

function mountCheckout(root) {
  const form = (root && root.querySelector?.("form[data-checkout]")) || root || document;

  if (!form || !form.addEventListener) return;

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();

    // Build payload from your form (adjust if your fields differ)
    const fd = new FormData(form);
    const items     = JSON.parse(fd.get("items") || "[]");
    const attendees = JSON.parse(fd.get("attendees") || "[]");

    const payload = {
      event_id: Number(fd.get("event_id") || 0),
      items, attendees,
      buyer_name: String(fd.get("buyer_name") || "").trim(),
      email:      String(fd.get("buyer_email") || "").trim(),
      phone:      String(fd.get("buyer_phone") || "").trim(),
      method:     fd.get("method") === "pay_now" ? "pay_now" : "pos"
    };

    let order;
    try {
      const j = await postJSON("/api/public/orders/create", payload);
      order = j.order;
    } catch {
      alert("Kon nie bestelling skep nie. Probeer weer.");
      return;
    }

    const code = order?.short_code;
    const thanksUrl = `/thanks/${encodeURIComponent(code)}`;

    if (order?.payment_method === "online_yoco") {
      try {
        const intent = await postJSON("/api/payments/yoco/intent", {
          code,
          next: thanksUrl
        });
        if (intent?.url) {
          // open payment in a new tab
          const w = window.open(intent.url, "_blank");
          if (!w) window.location.assign(intent.url);
          // land on thank-you in current tab so polling starts
          window.location.replace(`${thanksUrl}?next=${encodeURIComponent(intent.url)}`);
          return;
        }
        throw new Error("no_url");
      } catch (err) {
        const hinted = err?.body?.url ? `&next=${encodeURIComponent(err.body.url)}` : "";
        window.location.replace(`${thanksUrl}?pay=err${hinted}`);
        return;
      }
    }

    // Non-online flows
    window.location.replace(thanksUrl);
  });
}

// Only attach to window when running in the browser
if (typeof window !== "undefined") {
  window.mountCheckout = mountCheckout;
}

// Optional export (doesn't hurt the server bundle)
export { mountCheckout };
