// /src/index.js
import { Router } from "./router.js";
import { withCORS } from "./utils/http.js";
import { bindEnv } from "./env.js";
import { mountWATest } from "./routes/wa_test.js";

// API route mounts
import { mountPublic } from "./routes/public.js";
import { mountAdmin } from "./routes/admin.js";
import { mountPOS } from "./routes/pos.js";
import { mountScan } from "./routes/scan.js";
import { mountSync } from "./routes/sync.js";
import { mountAuth } from "./routes/auth.js";
import { mountWhatsApp } from "./routes/whatsapp.js";

// UI
import { landingHTML } from "./ui/landing.js";
import { adminHTML } from "./ui/admin.js";
import { shopHTML } from "./ui/shop.js";
import { posHTML, posSellHTML } from "./ui/pos.js";
import { scannerHTML } from "./ui/scanner.js";
import { checkoutHTML } from "./ui/checkout.js";
import { ticketHTML } from "./ui/ticket.js";
import { loginHTML } from "./ui/login.js";

// Auth guard for UI pages
import { requireRole } from "./utils/auth.js";

const router = Router();

// Helper: accept either a function (returning HTML) or a string export
function renderHTML(mod, ...args) {
  try {
    const html = (typeof mod === "function") ? mod(...args) : mod;
    return new Response(html, { headers: { "content-type": "text/html" } });
  } catch (e) {
    return new Response("Internal error rendering page", { status: 500 });
  }
}

/* ---------------------- API ROUTES ---------------------- */
mountAuth(router);       // /api/auth/login, /api/auth/logout
mountPublic(router);     // /api/public/*
mountAdmin(router);      // /api/admin/*
mountPOS(router);        // /api/pos/*
mountScan(router);       // /api/scan/*
mountSync(router);       // /api/sync/*
mountWhatsApp(router);   // /api/whatsapp/*
mountWATest(router);

/* ---------------------- UI ROUTES ----------------------- */

// Landing
router.add("GET", "/", async () => renderHTML(landingHTML));

// Admin UI (guarded)
router.add("GET", "/admin", requireRole("admin", async () => renderHTML(adminHTML)));
// Admin login UI
router.add("GET", "/admin/login", async () => renderHTML(() => loginHTML("admin")));

// POS UI (guarded)
router.add("GET", "/pos", requireRole("pos", async () => renderHTML(posHTML)));
// POS login UI
router.add("GET", "/pos/login", async () => renderHTML(() => loginHTML("pos")));

// POS sell screen (guarded)
router.add("GET", "/pos/sell", requireRole("pos", async (req) => {
  const u = new URL(req.url);
  const session_id = Number(u.searchParams.get("session_id") || 0);
  return renderHTML(posSellHTML, session_id);
}));

// Scanner UI (guarded)
router.add("GET", "/scan", requireRole("scan", async () => renderHTML(scannerHTML)));
// Scanner login UI
router.add("GET", "/scan/login", async () => renderHTML(() => loginHTML("scan")));

// Event shop + checkout
router.add("GET", "/shop/:slug", async (_req, _env, _ctx, { slug }) =>
  renderHTML(() => shopHTML(slug))
);

router.add("GET", "/shop/:slug/checkout", async (_req, _env, _ctx, { slug }) =>
  renderHTML(() => checkoutHTML(slug))
);

// Ticket display
router.add("GET", "/t/:code", async (_req, _env, _ctx, { code }) =>
  renderHTML(() => ticketHTML(code))
);

/* ---------------------- WORKER EXPORT ------------------- */
export default {
  async fetch(req, env, ctx) {
    const handler = withCORS((rq, e, c, p) => router.handle(rq, e, c, p));
    const bound = bindEnv(env);
    return handler(req, bound, ctx);
  },
};
