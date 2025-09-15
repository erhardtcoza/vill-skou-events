/* Thank-you page logic
 * - Polls /api/public/orders/status/:code
 * - Shows a “Gaan betaal” recovery button if ?next=<yoco_url> is present
 * - Enables “Wys my kaartjies” ONLY when status === "paid"
 * Exposed as: window.App.mountThankYou(root)
 */
(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }

  async function getJSON(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  function mountThankYou(root, opts) {
    root = root || document;
    opts = opts || {};

    // Code can be passed in, or inferred from /thanks/:code
    let code = String(opts.code || "");
    if (!code) {
      const m = location.pathname.match(/\/thanks\/([^/?#]+)/i);
      code = m ? decodeURIComponent(m[1]) : "";
    }
    if (!code) {
      console.warn("[thankyou] missing order code");
      return;
    }

    const statusDot = qs("[data-status-dot]", root);
    const showBtn   = qs("[data-show-tickets]", root);
    const payBtn    = qs("[data-pay-now]", root);
    const payHint   = qs("[data-pay-alert]", root);

    const u = new URL(location.href);
    const next = u.searchParams.get("next") || "";

    gateTickets(false);
    if (payBtn)  payBtn.style.display  = next ? "" : "none";
    if (payHint) payHint.style.display = next ? "" : "none";

    if (payBtn && next) {
      payBtn.addEventListener("click", () => window.location.assign(next));
    }
    if (showBtn) {
      showBtn.addEventListener("click", () => {
        if (!showBtn.dataset.enabled) return; // guard
        window.location.href = `/t/${encodeURIComponent(code)}`;
      });
    }

    // If we have a payment URL and the browser didn’t follow it earlier,
    // nudge once automatically (non-blocking).
    if (next) setTimeout(() => { try { window.location.assign(next); } catch {} }, 400);

    // Poll status until paid
    let tries = 0;
    const iv = setInterval(async () => {
      tries++;
      try {
        const j = await getJSON(`/api/public/orders/status/${encodeURIComponent(code)}`);
        const st = String(j?.status || "").toLowerCase();
        if (st === "paid") {
          clearInterval(iv);
          gateTickets(true);
        } else {
          gateTickets(false);
        }
      } catch {
        // ignore transient errors
      }
      if (tries > 120) clearInterval(iv); // ~6 minutes
    }, 3000);

    function gateTickets(isPaid) {
      if (statusDot) {
        statusDot.className = isPaid ? "dot dot--green" : "dot dot--waiting";
        statusDot.textContent = isPaid ? "Betaalbevestig ✔" : "Wag vir betaalbevestiging…";
      }
      if (showBtn) {
        showBtn.disabled = !isPaid;
        if (isPaid) {
          showBtn.dataset.enabled = "1";
          showBtn.classList.remove("is-disabled");
        } else {
          delete showBtn.dataset.enabled;
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

  // expose + auto-mount
  window.App = window.App || {};
  window.App.mountThankYou = mountThankYou;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      if (qs("[data-thankyou]")) mountThankYou(document);
    });
  } else {
    if (qs("[data-thankyou]")) mountThankYou(document);
  }
})();
