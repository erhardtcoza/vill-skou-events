import { json, bad } from "../utils/http.js";
import { scanTicket } from "../services/scan.js";

export function mountScan(router) {
  router.add("POST", "/api/scan", async (req, env) => {
    const b = await req.json().catch(()=>null);
    if (!b?.qr || !b?.gate_id) return bad("qr and gate_id required");
    const result = await scanTicket(env.DB, env.HMAC_SECRET, b.qr, b.gate_id, b.device_id||null, { gender: b.gender, confirm: b.confirm });
    return json(result.ok ? result : { ok:false, error: result.error }, { status: result.ok ? 200 : 400 });
  });
}
