// src/ui/checkout.js
//
// Checkout page (public)
// - Creates an order via /api/public/orders/create
// - If method === 'pay_now' it will redirect to Yoco (or the simulator)
// - Always forwards to /thanks/:code?next=<redirect_url> so the thank-you page
//   can recover the payment redirect if the browser didn’t follow it for any reason.

import { h } from "./_lib.js"; // if you don’t have a helper, inline DOM ops below
import { currency } from "../utils/time.js"; // or wherever your money fmt lives
import { api } from "../addons/api.js";      // thin fetch wrapper (GET/POST)

function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function mountCheckout(el, { event, ticketTypes }) {
  // Expect markup already on page with a <form id="checkout-form"> etc.
  // Hook into the form submit.
  const form = qs("#checkout-form", el) || el.querySelector("form");

  if (!form) {
    console.warn("[checkout] form not found");
    return;
  }

  // Show totals immediately if you have a cart summary
  updateTotalFromForm();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const btn = qs("[data-submit]", form) || qs("button[type=submit]", form);
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Verwerk...";
    }

    try {
      // Gather payload
      const payload = collectPayload(form, event);

      // Create order
      const res = await api.post("/api/public/orders/create", payload);

      if (!res?.ok) {
        throw new Error(res?.error || "Kon nie bestelling skep nie.");
      }

      const order = res.order || {};
      const code  = String(order.short_code || "");
      const payMethod = String(order.payment_method || "");
      const redirectUrl = String(res.redirect_url || ""); // set by backend
      const thanksUrl = `/thanks/${encodeURIComponent(code)}${
        redirectUrl ? `?next=${encodeURIComponent(redirectUrl)}` : ""
      }`;

      // If online payment, try to go straight to Yoco
      if (payMethod === "online_yoco" && redirectUrl) {
        // Navigate to Yoco *and* update location history to thank-you so
        // back navigation brings the user to the waiting screen.
        // We do replace() to avoid a confusing extra step in history.
        window.location.replace(redirectUrl);
        // As a fallback in case the payment page blocks or the browser cancels,
        // also set a timer to land on thank-you. If replace() succeeded, user
        // won’t see this.
        setTimeout(() => { window.location.href = thanksUrl; }, 600);
        return;
      }

      // Cash/POS or if no redirect given: go to thank-you
      window.location.href = thanksUrl;
    } catch (err) {
      console.error("[checkout] submit failed", err);
      alert(err?.message || "Iets het fout geloop met jou bestelling.");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Voltooi";
      }
    }
  });

  // If quantities change, recompute total (optional nicety)
  form.addEventListener("input", (e) => {
    if (e.target.matches("[data-qty]")) updateTotalFromForm();
  });

  function updateTotalFromForm() {
    try {
      const items = qsa("[data-qty]", form).map(i => ({
        ticket_type_id: Number(i.getAttribute("data-id")),
        qty: Number(i.value || 0),
        price_cents: Number(i.getAttribute("data-price") || 0)
      }));
      const total = items.reduce((s, r) => s + (r.qty * r.price_cents), 0);
      const out = qs("[data-total]", form);
      if (out) out.textContent = "R" + (total/100).toFixed(2);
    } catch {}
  }
}

/* Helpers */

function collectPayload(form, event) {
  const fd = new FormData(form);

  const methodRaw = String(fd.get("method") || "").toLowerCase();
  const method = (methodRaw.includes("pay") || methodRaw.includes("aanlyn"))
    ? "pay_now" : "pos_cash";

  const buyer_name  = String(fd.get("buyer_name") || fd.get("name") || "").trim();
  const email       = String(fd.get("email") || "").trim();
  const phone       = String(fd.get("phone") || fd.get("buyer_phone") || "").trim();

  // Quantities: inputs with [data-qty] plus data-id + data-price
  const items = [];
  form.querySelectorAll("[data-qty]").forEach(inp => {
    const qty = Number(inp.value || 0);
    const id  = Number(inp.getAttribute("data-id") || 0);
    if (!qty || !id) return;
    items.push({
      ticket_type_id: id,
      qty,
    });
  });

  // Attendees: blocks named attendee_first/last/gender/phone with data-tid
  const attendees = [];
  form.querySelectorAll("[data-attendee-row]").forEach(row => {
    const tid = Number(row.getAttribute("data-tid") || 0);
    if (!tid) return;
    attendees.push({
      ticket_type_id: tid,
      attendee_first: val(row, "[name='attendee_first']"),
      attendee_last:  val(row, "[name='attendee_last']"),
      gender:         val(row, "[name='gender']"),
      phone:          val(row, "[name='attendee_phone']"),
    });
  });

  return {
    event_id: Number(event?.id || fd.get("event_id") || 0),
    items,
    attendees,
    buyer_name,
    email,
    phone,
    method, // "pay_now" | "pos_cash"
  };
}

function val(root, sel) {
  const n = root.querySelector(sel);
  return n ? String((n.value ?? "").trim()) : "";
}