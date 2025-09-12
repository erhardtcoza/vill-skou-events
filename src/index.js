// /src/index.js
import { Router } from "./router.js";
import { withCORS } from "./utils/http.js";
import { bindEnv } from "./env.js";
import { mountWATest } from "./routes/wa_test.js";
import { badgeHTML } from "./ui/badge.js";
import { registerAddonRoutes } from "./addons/api.js";
import { mountPayments } from "./routes/payments.js";

import { mountPOS } from "./routes/pos.js";
import { mountScan } from "./routes/scan.js";


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
import { thankYouHTML } from "./ui/thankyou.js";   // ⬅️ NEW

// Auth guard for UI pages
import { requireRole } from "./utils/auth.js";

const router = Router();
registerAddonRoutes(router);   // <— keep addons

// Helper: accept either a function (returning HTML) or a string export
function renderHTML(mod, ...args) {
  try {
    const html = (typeof mod === "function") ? mod(...args) : mod;
    return new Response(html, { headers: { "content-type": "text/html" } });
  } catch (_e) {
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
mountPayments(router);
mountPOS(router, env);
mountScan(router, env);


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

// Printable badge by QR (public; uses vendor_passes + vendor + event)
router.add("GET", "/badge/:qr", async (_req, env, _ctx, { qr }) => {
  const p = await env.DB.prepare(
    `SELECT vp.id, vp.type, vp.label, vp.vehicle_reg, vp.qr,
            v.name AS vendor_name, v.event_id,
            e.name AS event_name, e.venue, e.starts_at, e.ends_at
       FROM vendor_passes vp
       JOIN vendors v ON v.id = vp.vendor_id
       JOIN events  e ON e.id = v.event_id
      WHERE vp.qr = ?1
      LIMIT 1`
  ).bind(qr).first();

  if (!p) return new Response("Badge not found", { status: 404 });

  const title =
    p.type === "vehicle" ? "VEHICLE" :
    p.type === "staff"   ? "VENDOR STAFF" : "VENDOR";

  const html = badgeHTML({
    title,
    name: p.label || p.vendor_name,
    org: p.vendor_name || "",
    plate: p.type === "vehicle" ? (p.vehicle_reg || "") : "",
    code: p.qr,
    event: {
      name: p.event_name,
      venue: p.venue,
      starts_at: p.starts_at,
      ends_at: p.ends_at
    }
  });

  return new Response(html, { headers: { "content-type": "text/html" } });
});

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

// Thank-you page after checkout  ⬅️ NEW
router.add("GET", "/thanks/:code", async (_req, _env, _ctx, { code }) =>
  renderHTML(() => thankYouHTML(code))
);

/* ---------------------- WORKER EXPORT ------------------- */
export default {
  async fetch(req, env, ctx) {
    const handler = withCORS((rq, e, c, p) => router.handle(rq, e, c, p));
    const bound = bindEnv(env);
    return handler(req, bound, ctx);
  },
};
