// /src/routes/payments.js
import { json, bad } from "../utils/http.js";

export function mountPayments(router) {
  // helpers
  async function getSetting(env, key) {
    const row = await env.DB.prepare(`SELECT value FROM site_settings WHERE key=?1 LIMIT 1`).bind(key).first();
    return row ? row.value : null;
  }

  // POST /api/payments/yoco/intent
  // Body: { code }
  router.add("POST", "/api/payments/yoco/intent", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const code = String(b?.code || "").trim().toUpperCase();
    if (!code) return bad("code required");

    const o = await env.DB.prepare(
      `SELECT id, short_code, status, total_cents
         FROM orders
        WHERE UPPER(short_code)=?1
        LIMIT 1`
    ).bind(code).first();
    if (!o) return bad("Order not found", 404);

    // already paid? just send them through
    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || (env.PUBLIC_BASE_URL || "");
    const ticketsUrl = base ? `${base}/t/${encodeURIComponent(code)}` : `/t/${encodeURIComponent(code)}`;
    const thanksUrl  = base ? `${base}/thanks/${encodeURIComponent(code)}?next=${encodeURIComponent(ticketsUrl)}` :
                              `/thanks/${encodeURIComponent(code)}?next=${encodeURIComponent(ticketsUrl)}`;

    // Yoco mode
    const mode = ((await getSetting(env, "YOCO_MODE")) || "sandbox").toLowerCase();

    // Sandbox: simulate immediate success so your polling flips to paid
    if (mode === "sandbox") {
      // mark paid if not yet paid
      if ((o.status || "").toLowerCase() !== "paid") {
        const now = Math.floor(Date.now()/1000);
        await env.DB.prepare(
          `UPDATE orders SET status='paid', paid_at=?1, updated_at=?1 WHERE id=?2`
        ).bind(now, o.id).run();

        await env.DB.prepare(
          `INSERT INTO payments (order_id, amount_cents, method, status, created_at, updated_at)
           VALUES (?1, ?2, 'online_yoco', 'approved', ?3, ?3)`
        ).bind(o.id, Number(o.total_cents||0), now).run();
      }

      return json({ ok:true, redirect_url: thanksUrl });
    }

    // Live mode placeholder (return a clear error until live integration is added)
    return json({
      ok: false,
      error: "Yoco live integration not configured yet. Set YOCO_* keys and implement hosted checkout creation.",
    }, 501);
  });
}