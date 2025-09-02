import { Router } from "./router.js";
import { withCORS } from "./utils/http.js";
import { bindEnv } from "./env.js";
import { requireRole } from "./utils/auth.js";

import { mountAuth } from "./routes/auth.js";
import { mountPublic } from "./routes/public.js";
import { mountAdmin } from "./routes/admin.js";
import { mountPOS } from "./routes/pos.js";
import { mountScan } from "./routes/scan.js";
import { mountSync } from "./routes/sync.js";

import { landingHTML } from "./ui/landing.js";
import { adminHTML } from "./ui/admin.js";
import { shopHTML } from "./ui/shop.js";
import { posHTML } from "./ui/pos.js";
import { scannerHTML } from "./ui/scanner.js";
import { checkoutHTML } from "./ui/checkout.js";
import { ticketHTML } from "./ui/ticket.js";
import { loginHTML } from "./ui/login.js";

const router = Router();

/* APIs */
mountAuth(router);         // /api/auth/login + /api/auth/logout
mountPublic(router);       // public APIs (events list, checkout, etc.)

// Protect individual API routers with role guards:
mountAdmin(router, { protectWith: requireRole("admin") }); // guards every /api/admin/* endpoint inside
mountPOS(router,   { protectWith: requireRole("pos") });   // guards every /api/pos/* endpoint inside
mountScan(router,  { protectWith: requireRole("scan") });  // guards every /api/scan/* endpoint inside

mountSync(router);         // if you use it elsewhere

/* UI routes */
router.add("GET", "/", async () =>
  new Response(landingHTML(), { headers: { "content-type": "text/html" }})
);

// Role logins
router.add("GET", "/admin/login", async () =>
  new Response(loginHTML("admin"), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/pos/login", async () =>
  new Response(loginHTML("pos"), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/scan/login", async () =>
  new Response(loginHTML("scan"), { headers: { "content-type": "text/html" }})
);

// Protected UIs
router.add("GET", "/admin", requireRole("admin", async () =>
  new Response(adminHTML(), { headers: { "content-type": "text/html" }})
));
router.add("GET", "/pos", requireRole("pos", async () =>
  new Response(posHTML(), { headers: { "content-type": "text/html" }})
));
router.add("GET", "/scan", requireRole("scan", async () =>
  new Response(scannerHTML(), { headers: { "content-type": "text/html" }})
));

// Shop + checkout + ticket (public)
router.add("GET", "/shop/:slug", async (req, env, ctx, { slug }) =>
  new Response(shopHTML(slug), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/shop/:slug/checkout", async (req, env, ctx, { slug }) =>
  new Response(checkoutHTML(slug), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/t/:code", async (req, env, ctx, { code }) =>
  new Response(ticketHTML(code), { headers: { "content-type": "text/html" }})
);

export default {
  async fetch(req, env, ctx) {
    const h = withCORS((rq, e, c, p) => router.handle(rq, e, c, p));
    const bound = bindEnv(env);
    return h(req, bound, ctx);
  },
};