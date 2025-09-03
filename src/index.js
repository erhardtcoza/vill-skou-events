// /src/index.js
import { Router } from "./router.js";
import { withCORS } from "./utils/http.js";
import { bindEnv } from "./env.js";

// Routes
import { mountPublic } from "./routes/public.js";
import { mountAdmin } from "./routes/admin.js";
import { mountPOS } from "./routes/pos.js";
import { mountScan } from "./routes/scan.js";
import { mountSync } from "./routes/sync.js";
import { mountAuth } from "./routes/auth.js";
import { mountWhatsApp } from "./routes/whatsapp.js";
import { mountWhatsAppDebug } from "./routes/whatsapp.js";

// UIs
import { landingHTML } from "./ui/landing.js";
import { adminHTML } from "./ui/admin.js";
import { shopHTML } from "./ui/shop.js";
import { posHTML } from "./ui/pos.js";
import { scannerHTML } from "./ui/scanner.js";
import { checkoutHTML } from "./ui/checkout.js";
import { ticketHTML } from "./ui/ticket.js";
import { loginHTML } from "./ui/login.js"; // <-- only once

const router = Router();

/* APIs */
mountAuth(router);
mountPublic(router);
mountAdmin(router);
mountPOS(router);
mountScan(router);
mountSync(router);
mountWhatsApp(router);
mountWhatsAppDebug(router);


/* Static UI (public) */
router.add("GET", "/", async () =>
  new Response(landingHTML(), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/shop/:slug", async (_req, _env, _ctx, { slug }) =>
  new Response(shopHTML(slug), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/shop/:slug/checkout", async (_req, _env, _ctx, { slug }) =>
  new Response(checkoutHTML(slug), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/t/:code", async (_req, _env, _ctx, { code }) =>
  new Response(ticketHTML(code), { headers: { "content-type": "text/html" }})
);

/* Static UI (role-guarded entry pages redirect there if not logged in) */
router.add("GET", "/admin", async () =>
  new Response(adminHTML(), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/pos", async () =>
  new Response(posHTML(), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/scan", async () =>
  new Response(scannerHTML(), { headers: { "content-type": "text/html" }})
);

/* Role login pages */
router.add("GET", "/admin/login", async () =>
  new Response(loginHTML("admin"), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/pos/login", async () =>
  new Response(loginHTML("pos"), { headers: { "content-type": "text/html" }})
);
router.add("GET", "/scan/login", async () =>
  new Response(loginHTML("scan"), { headers: { "content-type": "text/html" }})
);

export default {
  async fetch(req, env, ctx) {
    const h = withCORS((rq, e, c, p) => router.handle(rq, e, c, p));
    const bound = bindEnv(env);
    return h(req, bound, ctx);
  },
};
