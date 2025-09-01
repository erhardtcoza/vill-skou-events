import { json, bad } from "../utils/http.js";
import { getEventBySlug, getCatalog } from "../services/events.js";
import { createOnlineOrder } from "../services/orders.js";

export function mountPublic(router) {
  // Catalog by slug
  router.add("GET", "/api/public/events/:slug", async (req, env, ctx, { slug }) => {
    const event = await getEventBySlug(env.DB, slug);
    if (!event) return bad("Event not found", 404);
    const cat = await getCatalog(env.DB, event.id);
    return json({ ok:true, ...cat });
  });

  // Checkout (assume Yoco app/machine processed; we just record ref and issue tickets)
  router.add("POST", "/api/public/checkout", async (req, env) => {
    const body = await req.json().catch(()=>null);
    if (!body?.event_id || !Array.isArray(body.items)) return bad("Invalid request");
    const result = await createOnlineOrder(env.DB, env.HMAC_SECRET, body);
    // TODO: queue email send (MailChannels) per ticket
    return json({ ok:true, ...result });
  });
}
