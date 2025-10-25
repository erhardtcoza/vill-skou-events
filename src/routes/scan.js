// /src/routes/scan.js
import { Router } from "../router.js";

export function mountScan(router, env) {
  const r = new Router();

  r.get("/diag", async () => Response.json({ ok: true, scanner: "ready" }));

  /* ------------------------------------------------------------------
   * /api/scan/check
   *
   * Body: { code }
   *
   * `code` can be either:
   *   - a ticket qr string (tickets.qr)
   *   - an order short_code, e.g. "CAXHIEG"
   *
   * We try ticket first. If not found, we try order.
   *
   * Response:
   * {
   *   ok: true,
   *   paid: true/false,
   *   items: [
   *     {
   *       ticket_id,
   *       qr,
   *       state,
   *       attendee_first,
   *       attendee_last,
   *       type_name,
   *       price_cents,
   *       order_code,
   *       order_status
   *     },
   *     ...
   *   ]
   * }
   *
   * or { ok:false, reason:"not_found" }
   * ------------------------------------------------------------------ */
  r.post("/check", async (req) => {
    let body;
    try { body = await req.json(); }
    catch { return Response.json({ ok:false, error:"Bad JSON" }, { status:400 }); }

    const rawCode = String(body?.code || "").trim();
    if (!rawCode) {
      return Response.json({ ok:false, error:"code required" }, { status:400 });
    }

    try {
      // 1) Try treat as single ticket QR first
      const t = await env.DB.prepare(
        `SELECT
           t.id           AS ticket_id,
           t.qr           AS qr,
           t.state        AS state,
           t.attendee_first,
           t.attendee_last,
           tt.name        AS type_name,
           tt.price_cents AS price_cents,
           o.short_code   AS order_code,
           o.status       AS order_status
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
         LEFT JOIN orders o    ON o.id = t.order_id
        WHERE t.qr = ?1
        LIMIT 1`
      ).bind(rawCode).first();

      if (t) {
        const paid = String(t.order_status || "").toLowerCase() === "paid";
        return Response.json({
          ok: true,
          paid,
          items: [t],
        });
      }

      // 2) Not a ticket.qr. Try treat as order short_code (case-insensitive).
      const order = await env.DB.prepare(
        `SELECT id, short_code, status
           FROM orders
          WHERE UPPER(short_code)=UPPER(?1)
          LIMIT 1`
      ).bind(rawCode).first();

      if (!order) {
        return Response.json({ ok:false, reason:"not_found" }, { status:404 });
      }

      // Load all tickets for that order:
      const listQ = await env.DB.prepare(
        `SELECT
           t.id           AS ticket_id,
           t.qr           AS qr,
           t.state        AS state,
           t.attendee_first,
           t.attendee_last,
           tt.name        AS type_name,
           tt.price_cents AS price_cents
         FROM tickets t
         JOIN ticket_types tt ON tt.id = t.ticket_type_id
        WHERE t.order_id = ?1
        ORDER BY t.id ASC`
      ).bind(order.id).all();

      const items = (listQ.results || []).map(row => ({
        ...row,
        order_code: order.short_code,
        order_status: order.status,
      }));

      const paid = String(order.status || "").toLowerCase() === "paid";

      return Response.json({
        ok: true,
        paid,
        items,
      });
    } catch (e) {
      return Response.json({ ok:false, error:String(e?.message||e) }, { status:500 });
    }
  });

  // keep the "old" toggle API etc. in case other parts still call them
  // but scanner UI won't use them anymore.

  r.post("/scan", async (req) => {
    return Response.json({ ok:false, error:"deprecated" }, { status:410 });
  });
  r.post("/lookup", async () => {
    return Response.json({ ok:false, error:"deprecated" }, { status:410 });
  });
  r.post("/enter", async () => {
    return Response.json({ ok:false, error:"deprecated" }, { status:410 });
  });
  r.post("/exit", async () => {
    return Response.json({ ok:false, error:"deprecated" }, { status:410 });
  });
  r.post("/toggle", async () => {
    return Response.json({ ok:false, error:"deprecated" }, { status:410 });
  });

  // mount under /api/scan/*
  router.mount("/api/scan", r);
}
