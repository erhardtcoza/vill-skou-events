// src/ui/checkout.js
//
// Checkout page – creates an order then redirects the browser to Yoco
// when `method === "pay_now"`. No ESM exports (attached on window).

(function (global) {
  function qs(sel, root = document) { return root.querySelector(sel); }
  async function postJSON(url, body) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  function mountCheckout(root) {
    const form = root.querySelector("form[data-checkout]");
    if (!form) return console.warn("[checkout] form not found");

    const payMethodSel = qs("[name='pay_method']", form); // value: 'pay_now' | 'pos_cash'
    const submitBtn    = qs("[data-submit]", form);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      submitBtn && (submitBtn.disabled = true);

      try {
        const payload = collectForm(form);
        const res = await postJSON("/api/public/orders/create", payload);

        if (!res?.ok) throw new Error("Kon nie bestelling skep nie");

        const base = location.origin; // your PUBLIC_BASE_URL resolves here
        const code = res.order.short_code;

        // when pay_now, ask server for hosted checkout url (or simulate in test)
        const next = await getNextUrl(code);

        // land on /thanks/:code and give it ?next=<yoco_url> so it can recover
        const to = `${base}/thanks/${encodeURIComponent(code)}${next ? `?next=${encodeURIComponent(next)}` : ""}`;
        window.location.assign(to);
      } catch (err) {
        alert(err.message || err);
      } finally {
        submitBtn && (submitBtn.disabled = false);
      }
    });

    async function getNextUrl(code) {
      try {
        const body = { code, next: "" }; // ‘next’ is optional here
        const r = await postJSON("/api/payments/yoco/intent", body);
        if (r?.ok && r?.url) return r.url;
      } catch { /* ignore, we’ll still land on /thanks */ }
      return "";
    }

    function collectForm(f) {
      const fd = new FormData(f);

      // Build expected payload for /api/public/orders/create
      const event_id = Number(fd.get("event_id") || 0);
      const buyer_name  = String(fd.get("buyer_name") || "").trim();
      const email       = String(fd.get("buyer_email") || "").trim();
      const phone       = String(fd.get("buyer_phone") || "").trim();
      const method      = (payMethodSel?.value === "pay_now") ? "pay_now" : "pos_cash";

      // Items
      const items = [];
      f.querySelectorAll("[data-item]").forEach((row) => {
        const tt = Number(row.getAttribute("data-tt") || 0);
        const qty = Number(qs("[name='qty']", row)?.value || 0);
        const price = Number(qs("[data-price-cents]", row)?.getAttribute("data-price-cents") || 0);
        if (tt && qty > 0) items.push({ ticket_type_id: tt, qty, price_cents: price });
      });

      // Attendees (optional)
      const attendees = [];
      f.querySelectorAll("[data-attendee]").forEach((row) => {
        attendees.push({
          ticket_type_id: Number(row.getAttribute("data-tt") || 0),
          attendee_first: String(qs("[name='first']", row)?.value || ""),
          attendee_last:  String(qs("[name='last']", row)?.value  || ""),
          gender:         String(qs("[name='gender']", row)?.value || ""),
          phone:          String(qs("[name='att_phone']", row)?.value || "")
        });
      });

      return { event_id, buyer_name, email, phone, method, items, attendees };
    }
  }

  // expose for inline HTML: <script>window.mountCheckout(...)</script>
  global.mountCheckout = mountCheckout;
})(typeof window !== "undefined" ? window : self);
