// src/ui/checkout.js
//
// Public checkout:
// 1) Collects form data and POSTs /api/public/orders/create
// 2) If the order's payment method is online_yoco, calls
//    POST /api/payments/yoco/intent { code, next }
//    to get the Yoco (or simulator) URL.
// 3) Redirects to Yoco, with a fallback to /thanks/:code?next=<yocoUrl>.

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

async function getJSON(url) {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
async function postJSON(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body || {})
  });
  let j = null;
  try { j = await r.json(); } catch { /* ignore */ }
  if (!r.ok) throw new Error(j?.error || r.statusText || "Request failed");
  return j;
}

export function mountCheckout(root, { event } = {}) {
  const form = qs("#checkout-form", root) || qs("form", root);
  if (!form) return console.warn("[checkout] form not found");

  // Update total when quantities change (optional)
  form.addEventListener("input", (e) => {
    if (e.target.matches("[data-qty]")) updateTotal();
  });
  updateTotal();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = qs("[data-submit]", form) || qs("button[type=submit]", form);
    if (btn) { btn.disabled = true; btn.textContent = "Verwerk..."; }

    try {
      const payload = collectPayload(form, event);

      // 1) Create the order
      const res = await postJSON("/api/public/orders/create", payload);
      if (!res?.ok || !res?.order) throw new Error(res?.error || "Kon nie bestelling skep nie.");

      const order = res.order;
      const code  = String(order.short_code || "");
      const thanksUrlBase = `/thanks/${encodeURIComponent(code)}`;

      // 2) If online payment, fetch Yoco URL and go
      if (order.payment_method === "online_yoco") {
        // We'll tell the intent endpoint where to land if redirect fails.
        const next = location.origin + thanksUrlBase; // no query, we add below
        let yocoUrl = "";
        try {
          const intent = await postJSON("/api/payments/yoco/intent", { code, next });
          yocoUrl = String(intent?.url || "");
        } catch (err) {
          console.warn("[checkout] could not create yoco intent:", err);
        }

        // Build the thank-you URL with ?next= so they can recover payment
        const thanksUrl = yocoUrl ? `${thanksUrlBase}?next=${encodeURIComponent(yocoUrl)}` : thanksUrlBase;

        if (yocoUrl) {
          // Try to jump directly to Yoco;
          // also schedule a fallback to thank-you in case navigation is blocked.
          window.location.replace(yocoUrl);
          setTimeout(() => { window.location.href = thanksUrl; }, 600);
          return;
        }

        // If we didn’t get a URL, go to thank-you (it will show the waiting UI)
        window.location.href = thanksUrl;
        return;
      }

      // 3) POS/Cash flow → straight to thank-you (no payment URL)
      window.location.href = thanksUrlBase;

    } catch (err) {
      console.error("[checkout] failed", err);
      alert(err?.message || "Iets het fout geloop met jou bestelling.");
    } finally {
      const btn = qs("[data-submit]", form) || qs("button[type=submit]", form);
      if (btn) { btn.disabled = false; btn.textContent = "Voltooi"; }
    }
  });

  function updateTotal() {
    try {
      const items = qsa("[data-qty]", form).map(i => ({
        price: Number(i.getAttribute("data-price") || 0),
        qty:   Number(i.value || 0)
      }));
      const cents = items.reduce((s, r) => s + r.qty * r.price, 0);
      const out = qs("[data-total]", form);
      if (out) out.textContent = "R" + (cents / 100).toFixed(2);
    } catch {}
  }
}

/* ---------- helpers ---------- */

function collectPayload(form, event) {
  const fd = new FormData(form);

  // Pay method – treat anything that looks like “pay now / aanlyn” as online
  const methodRaw = String(fd.get("method") || "").toLowerCase();
  const method = (methodRaw.includes("pay") || methodRaw.includes("aanlyn")) ? "pay_now" : "pos_cash";

  const buyer_name  = str(fd.get("buyer_name") || fd.get("name"));
  const email       = str(fd.get("email"));
  const phone       = str(fd.get("phone") || fd.get("buyer_phone"));

  const items = [];
  form.querySelectorAll("[data-qty]").forEach(inp => {
    const qty = Number(inp.value || 0);
    const id  = Number(inp.getAttribute("data-id") || 0);
    if (qty > 0 && id) items.push({ ticket_type_id: id, qty });
  });

  const attendees = [];
  form.querySelectorAll("[data-attendee-row]").forEach(row => {
    const tid = Number(row.getAttribute("data-tid") || 0);
    if (!tid) return;
    attendees.push({
      ticket_type_id: tid,
      attendee_first: str(sel(row, "[name='attendee_first']")),
      attendee_last:  str(sel(row, "[name='attendee_last']")),
      gender:         str(sel(row, "[name='gender']")).toLowerCase() || null,
      phone:          str(sel(row, "[name='attendee_phone']")) || null,
    });
  });

  return {
    event_id: Number(event?.id || fd.get("event_id") || 0),
    items,
    attendees,
    buyer_name,
    email,
    phone,
    method,
  };
}

function sel(root, s) { const n = root.querySelector(s); return n ? n.value : ""; }
function str(v) { return String(v || "").trim(); }