// src/ui/checkout.js
//
// Creates the order, then tries to open the Yoco payment page.
// If anything goes wrong, we still land on /thanks/:code but
// include a "next" hint so the Thank-you page can recover.

(function () {
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

  // You probably call this from your view renderer
  function mountCheckout(root) {
    const form = qs("form[data-checkout]", root) || root;
    if (!form) return;

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();

      // Build payload from the existing form (you already have this in your app;
      // keep your version if you prefer)
      const fd = new FormData(form);
      const items = JSON.parse(fd.get("items") || "[]");
      const attendees = JSON.parse(fd.get("attendees") || "[]");

      const payload = {
        event_id: Number(fd.get("event_id") || 0),
        items, attendees,
        buyer_name: String(fd.get("buyer_name") || "").trim(),
        email: String(fd.get("buyer_email") || "").trim(),
        phone: String(fd.get("buyer_phone") || "").trim(),
        method: fd.get("method") === "pay_now" ? "pay_now" : "pos"
      };

      let order = null;
      try {
        const j = await postJSON("/api/public/orders/create", payload);
        order = j.order;
      } catch (e) {
        alert("Kon nie bestelling skep nie. Probeer weer.");
        return;
      }

      // Only online_yoco flows want to head to payment
      const code = order?.short_code;
      const thanksUrl = `/thanks/${encodeURIComponent(code)}`;

      if (order?.payment_method === "online_yoco") {
        try {
          // Ask the server for an intent/simulator URL in TEST,
          // or for LIVE this can still reply 400. We’ll catch and recover.
          const intent = await postJSON("/api/payments/yoco/intent", {
            code,
            next: thanksUrl   // so Yoco returns you to the thank-you
          });

          // If we got a URL, open it. Use assign so pop-up blockers don’t bite.
          if (intent?.url) {
            // Prefer opening in a new tab, keeps thank-you reachable if needed
            const w = window.open(intent.url, "_blank");
            // If blocked, fallback to same-tab navigation
            if (!w) window.location.assign(intent.url);
            // And always land on thank-you in the current tab so polling starts
            window.location.replace(`${thanksUrl}?next=${encodeURIComponent(intent.url)}`);
            return;
          }

          // No URL? fall through to error path
          throw new Error("no_url");
        } catch (err) {
          // We still go to thank-you and let that page show “Pay now”
          // If the server included a candidate URL in error body, pass it along
          const hinted = err?.body?.url ? `&next=${encodeURIComponent(err.body.url)}` : "";
          window.location.replace(`${thanksUrl}?pay=err${hinted}`);
          return;
        }
      }

      // Non-online flows just land on thank-you
      window.location.replace(thanksUrl);
    });
  }

  // expose for your router/view loader
  window.mountCheckout = mountCheckout;
})();
