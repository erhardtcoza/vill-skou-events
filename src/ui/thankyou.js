// src/ui/thankyou.js
//
// Thank-you page with payment recovery + gated tickets.
// - Polls /api/public/orders/status/:code
// - Shows “Gaan betaal” button. If ?next=… exists, uses that URL.
//   Otherwise it calls /api/payments/yoco/intent to obtain one.
// - “Wys my kaartjies” only works once status === "paid".

(function () {
  function qs(sel, root = document) { return root.querySelector(sel); }
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
    let j = null; try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(j?.error || `HTTP ${r.status}`); e.body = j; throw e; }
    return j;
  }

  function mountThankYou(root, options = {}) {
    // Find code from param or from /thanks/:code
    let code = String(options.code || "");
    if (!code) {
      const m = location.pathname.match(/\/thanks\/([^/?#]+)/i);
      code = m ? decodeURIComponent(m[1]) : "";
    }
    if (!code) return console.warn("[thankyou] missing order code");

    const statusDot = qs("[data-status-dot]", root);
    const showBtn   = qs("[data-show-tickets]", root);
    const payBtn    = qs("[data-pay-now]", root);
    const payHint   = qs("[data-pay-alert]", root);

    const urlBits = new URL(location.href);
    // If we arrived from checkout error, param exists
    let next = urlBits.searchParams.get("next") || "";
    const hadErr = urlBits.searchParams.get("pay") === "err";

    // UI init
    gateTickets(false);
    if (payBtn) payBtn.style.display = "";  // always visible for recovery
    if (payHint) payHint.style.display = "";

    // Clicking “Pay now”
    if (payBtn) {
      payBtn.addEventListener("click", async () => {
        await goPay();
      });
    }

    // “Wys my kaartjies”
    if (showBtn) {
      showBtn.addEventListener("click", () => {
        if (!showBtn.dataset.enabled) return;
        window.location.href = `/t/${encodeURIComponent(code)}`;
      });
    }

    // If we arrived with an error, immediately try to get a fresh URL and open it.
    // We do this in a setTimeout to let the page paint first.
    if (hadErr) {
      setTimeout(() => { goPay().catch(()=>{}); }, 500);
    } else if (next) {
      // If we were given a “next”, gently nudge to it once (opens new tab)
      setTimeout(() => {
        try {
          const w = window.open(next, "_blank");
          if (!w) window.location.assign(next);
        } catch {}
      }, 400);
    }

    // Poll order status
    let tries = 0;
    const iv = setInterval(async () => {
      tries++;
      try {
        const j = await getJSON(`/api/public/orders/status/${encodeURIComponent(code)}`);
        const st = String(j?.status || "").toLowerCase();
        gateTickets(st === "paid");
        if (st === "paid") { clearInterval(iv); }
      } catch { /* ignore */ }
      if (tries > 120) clearInterval(iv); // ~6 minutes at 3s
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
      if (payBtn && payHint) {
        if (isPaid) {
          payBtn.style.display = "none";
          payHint.style.display = "none";
        } else {
          payBtn.style.display = "";
          payHint.style.display = "";
        }
      }
    }

    async function goPay() {
      try {
        // If we already have a URL, open it
        if (!next) {
          // Ask the server to provide a URL (in TEST this returns simulator)
          const j = await postJSON("/api/payments/yoco/intent", {
            code,
            next: `/thanks/${encodeURIComponent(code)}`
          });
          next = j?.url || "";
        }
      } catch (e) {
        // If server complains, keep trying to open whatever hint we have
      }
      if (next) {
        const w = window.open(next, "_blank");
        if (!w) window.location.assign(next);
      } else {
        alert("Kon nie die betaalblad oopmaak nie. Probeer weer.");
      }
    }
  }

  // expose for your router/view loader
  window.mountThankYou = mountThankYou;
})();
