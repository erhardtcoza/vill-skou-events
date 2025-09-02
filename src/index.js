import { Router } from "./router.js";
import { withCORS } from "./utils/http.js";
import { bindEnv } from "./env.js";
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

const router = Router();

// APIs
mountPublic(router);
mountAdmin(router);
mountPOS(router);
mountScan(router);
mountSync(router);

// Static UI
router.add("GET", "/", async () => new Response(landingHTML(), { headers: { "content-type": "text/html" }}));
router.add("GET", "/admin", async () => new Response(adminHTML(), { headers: { "content-type": "text/html" }}));
router.add("GET", "/pos", async () => new Response(posHTML(), { headers: { "content-type": "text/html" }}));
router.add("GET", "/scan", async () => new Response(scannerHTML(), { headers: { "content-type": "text/html" }}));
router.add("GET", "/shop/:slug/checkout", async (req, env, ctx, { slug }) =>
  new Response(checkoutHTML(slug), { headers: { "content-type": "text/html" }})
);

export default {
  async fetch(req, env, ctx) {
    const h = withCORS((rq,e,c,p)=>router.handle(rq, e, c, p));
    const bound = bindEnv(env);
    return h(req, bound, ctx);
  }
};
