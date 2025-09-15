// src/ui/thankyou.js
//
// Thank-you / Order status page
// - Polls /api/public/orders/status/:code until PAID
// - Hides the "Show my tickets" button until paid
// - If there’s a ?next=<yoco_url> query, shows a resilient "Pay now" button
//   and (optionally) auto-kicks once after a brief delay.

import { api } from "../addons/api.js";

function qs(sel, root = document) { return root.querySelector(sel); }

export function mountThankYou(el, { code }) {
  const statusDot  = qs("[data-status-dot]", el);
  const showBtn    = qs("[data-show-tickets]", el);
  const backBtn    = qs("[data-back-home]", el);
  const payBtn     = qs("[data-pay-now]", el);      // new
  const alertBox   = qs("[data-pay-alert]", el);    // new

  // read ?next (payment URL) from location
  const u = new URL(location.href);
  const next = u.searchParams.get("next") || "";

  // Initial UI state
  setPaidUI(false);
  if (payBtn) payBtn.style.display = next ? "" : "none";
  if (alertBox) alertBox.style.display = next ? "" : "none";

  // Wire up buttons
  if (showBtn) {
    showBtn.addEventListener("click", () => {
      // Only allow when paid (guard in case someone fiddles with attributes)
      if (!showBtn.dataset.enabled) return;
      window.location.href = `/t/${encodeURIComponent(code)}`;
    });
  }

  if (payBtn && next) {
    payBtn.addEventListener("click", () => window.location.assign(next));
  }

  // Optional: auto-open the payment page once if we have next=...
  if (next) {
    // Give the page a moment to render, then try once.
    setTimeout(() => {
      window.location.assign(next);
    }, 400);
  }

  // Poll status until paid (or give up after N tries)
  let tries = 0;
  const timer = setInterval(async () => {
    tries++;
    try {
      const res = await api.get(`/api/public/orders/status/${encodeURIComponent(code)}`);
      const st = String(res?.status || "").toLowerCase();

      if (st === "paid") {
        clearInterval(timer);
        setPaidUI(true);
      } else {
        setPaidUI(false);
      }
    } catch {
      // keep trying silently
    }
    if (tries > 120) { // ~6 minutes at 3s interval if you adjust later
      clearInterval(timer);
    }
  }, 3000);

  function setPaidUI(isPaid) {
    if (statusDot) {
      statusDot.className = isPaid ? "dot dot--green" : "dot dot--waiting";
      statusDot.textContent = isPaid ? "Betaalbevestig ✔" : "Wag vir betaalbevestiging…";
    }
    if (showBtn) {
      showBtn.disabled = !isPaid;
      // dataset flag so click handler can double-guard
      if (isPaid) {
        showBtn.dataset.enabled = "1";
        showBtn.classList.remove("is-disabled");
      } else {
        delete showBtn.dataset.enabled;
        showBtn.classList.add("is-disabled");
      }
    }
    if (payBtn) {
      // When paid, hide the rescue pay flow
      if (isPaid) {
        payBtn.style.display = "none";
        if (alertBox) alertBox.style.display = "none";
      } else if (next) {
        payBtn.style.display = "";
        if (alertBox) alertBox.style.display = "";
      }
    }
  }
}