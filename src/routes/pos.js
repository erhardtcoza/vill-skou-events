import { json, bad } from "../utils/http.js";
import { createPOSOrder } from "../services/orders.js";

export function mountPOS(router) {
  router.add("POST", "/api/pos/order", async (req, env) => {
    const body = await req.json().catch(()=>null);
    if (!body?.event_id || !Array.isArray(body.items)) return bad("Invalid request");
    if (!["yoco","cash"].includes(body.payment_method||"")) return bad("payment_method required");
    const result = await createPOSOrder(env.DB, env.HMAC_SECRET, body);
    return json({ ok:true, ...result });
  });
}
