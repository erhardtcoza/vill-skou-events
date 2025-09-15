/* Checkout front-end logic
 * - Posts to /api/public/orders/create
 * - If method === "pay_now", redirects to Yoco (intent/simulate or hosted)
 * - Otherwise shows inline success
 * Exposed as: window.App.mountCheckout(root)
 */
(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

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

  // Serialize the checkout form into the order payload expected by the API
  function buildPayload(root) {
    const f = root.querySelector("form[data-checkout]");
    const evId = Number(f?.dataset?.eventId || 0);
    const buyer_name  = (qs('[name="buyer_name"]', f)?.value || "").trim();
    const buyer_email = (qs('[name="buyer_email"]', f)?.value || "").trim();
    const buyer_phone = (qs('[name="buyer_phone"]', f)?.value || "").trim();
    const method = (qs('[name="method"]', f)?.value || "pay_now");

    // items list (ticket_type_id, qty) from any inputs like data-tt-id + value
    const items = [];
    qsa("[data-tt-id]", f).forEach(inp => {
      const qty = Number(inp.value || 0);
      const id  = Number(inp.dataset.ttId || 0);
      if (id && qty > 0) items.push({ ticket_type_id: id, qty });
    });

    // optional attendees (per-line blocks)
    const attendees = [];
    qsa("[data-attendee]", f).forEach(row => {
      attendees.push({
        ticket_type_id: Number(row.dataset.ttId || 0),
        attendee_first: (qs('[name="att_first"]', row)?.value || "").trim(),
        attendee_last:  (qs('[name="att_last"]', row)?.value || "").trim(),
        gender:         (qs('[name="att_gender"]', row)?.value || "").trim(),
        phone:          (qs('[name="att_phone"]', row)?.value || "").trim(),
      });
    });

    return {
      event_id: evId,
      buyer_name,
      email: buyer_email,
      phone: buyer_phone,
      method, // "pay_now" or "pos_cash"
      items,
      attendees
    };
  }

  async function createOrderAndMaybePay(root) {
    const btn = qs("[data-submit]", root);
    const err = qs("[data-error]", root);

    function setBusy(b) {
      if (btn) {
        btn.disabled = !!b;
        btn.textContent = b ? "Verwerk..." : btn.dataset.label || "Voltooi";
      }
    }

    try {
      setBusy(true);
      if (err) err.textContent = "";

      const payload = buildPayload(root);
      const created = await postJSON("/api/public/orders/create", payload);

      // If pay_now, ask backend for Yoco intent/simulate URL in test mode
      if (payload.method === "pay_now") {
        const thanksUrl = `/thanks/${encodeURIComponent(created.order.short_code)}`;
        const intent = await postJSON("/api/payments/yoco/intent", {
          code: created.order.short_code,
          next: thanksUrl
        });

        // Hard redirect to payment (or simulator in test mode)
        if (intent?.url) {
          window.location.assign(intent.url);
          return;
        }

        // Fallback: just land on thanks and let recovery button appear
        window.location.assign(thanksUrl);
        return;
      }

      // Non-online flow → land on thanks immediately (pending)
      window.location.assign(`/thanks/${encodeURIComponent(created.order.short_code)}`);
    } catch (e) {
      console.error("[checkout] create error", e);
      if (err) err.textContent = "Kon nie voortgaan nie. Probeer asseblief weer.";
    } finally {
      setBusy(false);
    }
  }

  function mountCheckout(root) {
    root = root || document;
    const form = qs("form[data-checkout]", root);
    const btn  = qs("[data-submit]", root);
    if (!form || !btn) {
      console.warn("[checkout] form or button not found");
      return;
    }
    btn.dataset.label = btn.textContent;
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      createOrderAndMaybePay(root);
    });
  }

  // expose + auto-mount
  window.App = window.App || {};
  window.App.mountCheckout = mountCheckout;

  // Auto-mount if we see the marker
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (qs("form[data-checkout]")) mountCheckout(document);
    });
  } else {
    if (qs("form[data-checkout]")) mountCheckout(document);
  }
})();
