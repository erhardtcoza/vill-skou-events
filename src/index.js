// /src/index.js
import { Router } from "./router.js";
import { withCORS } from "./utils/http.js";
import { bindEnv } from "./env.js";

// Durable Object (must be exported from entrypoint)
import { WalletDO } from "./do/wallet.js";
export { WalletDO }; // required for CF DO binding

/* -------------------- API ROUTES -------------------- */
import { mountWATest } from "./routes/wa_test.js";
import { mountDiag } from "./routes/diag.js";
import { mountQR } from "./routes/qr.js";
import { registerAddonRoutes } from "./addons/api.js";
import { mountPayments } from "./routes/payments.js";
import { mountPOS } from "./routes/pos.js";
import { mountScan } from "./routes/scan.js";
import { mountPastVisitors } from "./routes/past_visitors.js";
import { mountVendor } from "./routes/vendor.js";
import { mountWallet } from "./routes/wallet.js";
import { mountPublicVendors } from "./routes/public_vendors.js";
import { mountPublic } from "./routes/public.js";
import { mountAdmin } from "./routes/admin.js";
import { mountSync } from "./routes/sync.js";
import { mountAuth } from "./routes/auth.js";
import { mountWhatsApp } from "./routes/whatsapp.js";
import { mountCashbar } from "./routes/cashbar.js";
import { mountItems } from "./routes/items.js";

/* ---------------------- UI ------------------------- */
import { badgeHTML } from "./ui/badge.js";
import { landingHTML } from "./ui/landing.js";
import { adminHTML } from "./ui/admin.js";
import { shopHTML } from "./ui/shop.js";
import { scannerHTML } from "./ui/scanner.js";
import { checkoutHTML } from "./ui/checkout.js";
import { ticketHTML } from "./ui/ticket.js";
import { loginHTML } from "./ui/login.js";
import { thankYouHTML } from "./ui/thankyou.js";
import { ticketSingleHTML } from "./ui/ticket_single.js";

// Gate POS pages (renamed files)
import { posHTML } from "./ui/pos_gate.js";                   // was src/ui/pos.js
import { posSellHTML as gateSellHTML } from "./ui/gate_sell.js"; // was src/ui/pos_sell.js

// Bar UI pages (renamed files)
import { barHTML as barSellHTML } from "./ui/bar_sell.js";        // was cashbar_bar.js
import { cashierHTML as barTopupHTML } from "./ui/bar_topup.js";  // was cashbar_cashier.js
import { walletHTML as barWalletHTML } from "./ui/bar_wallet.js"; // was cashbar_wallet.js

// Auth guard
import { requireRole } from "./utils/auth.js";

/* ----------------- ROUTER SETUP -------------------- */
const router = Router();
registerAddonRoutes(router);

// Helper to render string/function to HTML response
function renderHTML(mod, ...args) {
  try {
    const html = (typeof mod === "function") ? mod(...args) : mod;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (_e) {
    return new Response("Internal error rendering page", { status: 500 });
  }
}

/* ----------------- LAZY INIT (needs env) ---------------- */
let __initialized = false;
function initWithEnv(env) {
  if (__initialized) return;

  /* -------------- API ROUTES (need env) -------------- */
  mountAuth(router);                // /api/auth/*
  mountPublic(router);              // /api/public/*
  mountAdmin(router);               // /api/admin/*
  mountSync(router);                // /api/sync/*
  mountWhatsApp(router);            // /api/whatsapp/*
  mountWATest(router);              // /api/wa-test/*
  mountDiag(router);                // /api/diag*
  mountQR(router);                  // /api/qr/*
  mountPayments(router);            // /api/payments/*
  mountPOS(router, env);            // /api/pos/*
  mountScan(router, env);           // /api/scan/*
  mountPastVisitors(router);        // /api/past-visitors/*
  mountVendor(router);              // /api/vendor/*
  mountWallet(router);              // /api/wallet/*
  mountPublicVendors(router);       // /api/public/vendors/*
  mountCashbar(router, env);        // bar/wallet API
  mountItems(router, env);          // /api/items

  /* ------------------- UI ROUTES --------------------- */
  router.add("GET", "/", async () => renderHTML(landingHTML));

  // Admin (guarded)
  router.add("GET", "/admin", requireRole("admin", async () => renderHTML(adminHTML)));
  router.add("GET", "/admin/login", async () => renderHTML(() => loginHTML("admin")));

  // Gate POS (guarded) — canonical paths
  router.add("GET", "/gate", requireRole("pos", async () => renderHTML(posHTML)));
  router.add("GET", "/gate/sell", requireRole("pos", async (req) => {
    const u = new URL(req.url);
    const session_id = Number(u.searchParams.get("session_id") || 0);
    // gateSellHTML reads its own query (event_slug etc.), but we still pass session_id for older builds
    return renderHTML(gateSellHTML, session_id);
  }));

  // Legacy aliases (guarded) to avoid breaking old bookmarks
  router.add("GET", "/pos", requireRole("pos", async () => renderHTML(posHTML)));
  router.add("GET", "/pos/login", async () => renderHTML(() => loginHTML("pos")));
  router.add("GET", "/pos/sell", requireRole("pos", async (req) => {
    const u = new URL(req.url);
    const session_id = Number(u.searchParams.get("session_id") || 0);
    return renderHTML(gateSellHTML, session_id);
  }));

  // Shop + checkout (public)
  router.add("GET", "/shop/:slug", async (_req, _env2, _ctx, { slug }) =>
    renderHTML(() => shopHTML(slug))
  );
  router.add("GET", "/shop/:slug/checkout", async (_req, _env2, _ctx, { slug }) =>
    renderHTML(() => checkoutHTML(slug))
  );

  // Ticket display (by order short code)
  router.add("GET", "/t/:code", async (_req, _env2, _ctx, { code }) =>
    renderHTML(() => ticketHTML(code))
  );

  // Single-ticket display by token
  router.add("GET", "/tt/:token", async (_req, _env2, _ctx, { token }) =>
    renderHTML(() => ticketSingleHTML(token))
  );

  // Thank-you page after checkout
  router.add("GET", "/thanks/:code", async (_req, _env2, _ctx, { code }) =>
    renderHTML(() => thankYouHTML(code))
  );

  // Bar UI (public for now — can restrict later)
  router.add("GET", "/bar/topup", async () => renderHTML(barTopupHTML));
  router.add("GET", "/bar/sell",  async () => renderHTML(barSellHTML));

  // Public wallet display (QR page)
  router.add("GET", "/w/:id", async (_req, env2, _ctx, { id }) => {
    const w = await env2.DB.prepare(`SELECT * FROM wallets WHERE id=?1`).bind(id).first();
    if (!w) return new Response("Not found", { status: 404 });
    return renderHTML(() => barWalletHTML({ id: w.id, name: w.name, balance_cents: w.balance_cents }));
  });

  __initialized = true;
}

/* -------------------- WORKER EXPORT -------------------- */
export default {
  async fetch(req, env, ctx) {
    const bound = bindEnv(env);
    initWithEnv(bound); // ensure routes are mounted once
    const handler = withCORS((rq, e, c) => router.handle(rq, e, c));
    return handler(req, bound, ctx);
  },
};
