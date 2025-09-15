// src/ui/thankyou.js
//
// Server-safe module (no "window" at import time) + browser behavior.
// - Exports a harmless stub `thankYouHTML` so index.js can import it.
// - Adds resilient "Gaan betaal" that opens/recovers the Yoco page.
// - Disables "Wys my kaartjies" until status === "paid".

export const thankYouHTML = undefined; // keeps server-side import happy

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
  let code = String(options.code || "");
  if (!code) {
    const m = location.pathname.match(/\/thanks\/([^/?#]+)/i);
    code = m ? decodeURIComponent(m[1]) : "";
  }
  if (!code) return;

  const statusDot = qs("[data-status-dot]", root);
  const showBtn   = qs("[data-show-tickets]", root);
  const payBtn    = qs("[data-pay-now]", root);
  const payHint   = qs("[data-pay-alert]", root);

  const urlBits = new URL(location.href);
  let next = urlBits.searchParams.get("next") || "";
  const hadErr = urlBits.searchParams.get("pay") === "err";

  gateTickets(false);
  if (payBtn)  payBtn.style.display = "";
  if (payHint) payHint.style.display = "";

  if (payBtn) {
    payBtn.addEventListener("click", async () => { await goPay(); });
  }
  if (showBtn) {
    showBtn.addEventListener("click", () => {
      if (!showBtn.dataset.enabled) return;
      window.location.href = `/t/${encodeURIComponent(code)}`;
    });
  }

  if (hadErr)       setTimeout(() => { goPay().catch(()=>{}); }, 500);
  else if (next)    setTimeout(() => { const w = window.open(next, "_blank"); if (!w) window.location.assign(next); }, 400);

  // Poll order status
  let tries = 0;
  const iv = setInterval(async () => {
    tries++;
    try {
      const j = await getJSON(`/api/public/orders/status/${encodeURIComponent(code)}`);
      const st = String(j?.status || "").toLowerCase();
      const paid = (st === "paid");
      gateTickets(paid);
      if (paid) clearInterval(iv);
    } catch {}
    if (tries > 120) clearInterval(iv);
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
      payBtn.style.display  = isPaid ? "none" : "";
      payHint.style.display = isPaid ? "none" : "";
    }
  }

  async function goPay() {
    try {
      if (!next) {
        const j = await postJSON("/api/payments/yoco/intent", {
          code,
          next: `/thanks/${encodeURIComponent(code)}`
        });
        next = j?.url || "";
      }
    } catch {}
    if (next) {
      const w = window.open(next, "_blank");
      if (!w) window.location.assign(next);
    } else {
      alert("Kon nie die betaalblad oopmaak nie. Probeer weer.");
    }
  }
}

// Only attach to window when running in the browser
if (typeof window !== "undefined") {
  window.mountThankYou = mountThankYou;
}

// Optional export (doesn't hurt the server bundle)
export { mountThankYou };
