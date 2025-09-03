// /src/index.js
import { Router } from "./router.js";
import { withCORS } from "./utils/http.js";
import { bindEnv } from "./env.js";

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
import { posHTML } from "./ui/pos.js";
import { scannerHTML } from "./ui/scanner.js";
import { checkoutHTML } from "./ui/checkout.js";
import { ticketHTML } from "./ui/ticket.js";
import { loginHTML } from "./ui/login.js";

// Auth guard for UI pages
import { requireRole } from "./utils/auth.js";

const router = Router();

/* ---------------------- API ROUTES ---------------------- */
mountAuth(router);       // /api/auth/login, /api/auth/logout
mountPublic(router);     // /api/public/*
mountAdmin(router);      // /api/admin/*
mountPOS(router);        // /api/pos/*
mountScan(router);       // /api/scan/*
mountSync(router);       // /api/sync/*
mountWhatsApp(router);   // /api/whatsapp/webhook, /api/whatsapp/send, /api/whatsapp/debug

/* ---------------------- UI ROUTES ----------------------- */

// Landing
router.add("GET", "/", async () =>
  new Response(landingHTML(), { headers: { "content-type": "text/html" }})
);

// Admin UI (guarded)
router.add("GET", "/admin", requireRole("admin", async () =>
  new Response(adminHTML(), { headers: { "content-type": "text/html" }})
));
// Admin login UI
router.add("GET", "/admin/login", async () =>
  new Response(loginHTML("admin"), { headers: { "content-type": "text/html" }})
);

// POS UI (guarded)
router.add("GET", "/pos", requireRole("pos", async () =>
  new Response(posHTML(), { headers: { "content-type": "text/html" }})
));
// POS login UI
router.add("GET", "/pos/login", async () =>
  new Response(loginHTML("pos"), { headers: { "content-type": "text/html" }})
);

// Scanner UI (guarded)
router.add("GET", "/scan", requireRole("scan", async () =>
  new Response(scannerHTML(), { headers: { "content-type": "text/html" }})
));
// Scanner login UI
router.add("GET", "/scan/login", async () =>
  new Response(loginHTML("scan"), { headers: { "content-type": "text/html" }})
);

// Event shop + checkout
router.add("GET", "/shop/:slug", async (_req, _env, _ctx, { slug }) =>
  new Response(shopHTML(slug), { headers: { "content-type": "text/html" }})
);

router.add("GET", "/shop/:slug/checkout", async (_req, _env, _ctx, { slug }) =>
  new Response(checkoutHTML(slug), { headers: { "content-type": "text/html" }})
);

// Ticket display
router.add("GET", "/t/:code", async (_req, _env, _ctx, { code }) =>
  new Response(ticketHTML(code), { headers: { "content-type": "text/html" }})
);

/* ---------------------- WORKER EXPORT ------------------- */

export default {
  async fetch(req, env, ctx) {
    const handler = withCORS((rq, e, c, p) => router.handle(rq, e, c, p));
    const bound = bindEnv(env);
    return handler(req, bound, ctx);
  },
};
