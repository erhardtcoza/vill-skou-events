// src/routes/public_pages.js
// Public-facing HTML pages (no admin/pos/scanner guards here).
import { landingHTML } from "../ui/landing.js";
import { shopHTML } from "../ui/shop.js";
import { checkoutHTML } from "../ui/checkout.js";
import { ticketHTML } from "../ui/ticket.js";
import { ticketSingleHTML } from "../ui/ticket_single.js";
import { thankYouHTML } from "../ui/thankyou.js";

// Small helper (self-contained so this file can mount independently)
function renderHTML(mod, ...args) {
  try {
    const html = (typeof mod === "function") ? mod(...args) : mod;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (_e) {
    return new Response("Internal error rendering page", { status: 500 });
  }
}

export function mountPublicPages(router) {
  // Landing
  router.add("GET", "/", async () => renderHTML(landingHTML));

  // Event shop + checkout (public)
  router.add("GET", "/shop/:slug", async (_req, _env, _ctx, { slug }) =>
    renderHTML(() => shopHTML(slug))
  );
  router.add("GET", "/shop/:slug/checkout", async (_req, _env, _ctx, { slug }) =>
    renderHTML(() => checkoutHTML(slug))
  );

  // Ticket display (batch by order short code)
  router.add("GET", "/t/:code", async (_req, _env, _ctx, { code }) =>
    renderHTML(() => ticketHTML(code))
  );

  // Single-ticket display by token
  router.add("GET", "/tt/:token", async (_req, _env, _ctx, { token }) =>
    renderHTML(() => ticketSingleHTML(token))
  );

  // Thank-you page after checkout
  router.add("GET", "/thanks/:code", async (_req, _env, _ctx, { code }) =>
    renderHTML(() => thankYouHTML(code))
  );
}
