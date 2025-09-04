// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";
import { sendOrderOnWhatsApp } from "../services/whatsapp.js";

/** Small helpers */
const int = (v) => Number.parseInt(v, 10) || 0;
const cents = (v) => Math.max(0, Number(v) | 0);
const now = () => Math.floor(Date.now() / 1000);

/** Create a short, human friendly order code (kept to letters+numbers). */
function shortCode(seed) {
  const rnd = Math.floor(Math.random() * 36 ** 3).toString(36);
  return (Number(seed || 0).toString(36) + rnd).slice(-7).toUpperCase();
}

/** Generate a compact ticket QR/token. */
function ticketQR(orderId, ticketTypeId, i) {
  // format: T-<base36(order)>-<base36(tt)>-<n>-<random>
  const r = Math.random().toString(36).slice(2, 6);
  return `T-${Number(orderId).toString(36)}-${Number(ticketTypeId).toString(36)}-${i}-${r}`.toUpperCase();
}

/** POS endpoints */
export function mountPOS(router) {
  // Bootstrap: list events + gates from DB
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      const evQ = await env.DB.prepare(
        `SELECT id, slug, name FROM events ORDER BY id DESC`
      ).all();
      const events = (evQ.results || []).map(r => ({ id:r.id, slug:r.slug, name:r.name }));

      const gQ = await env.DB.prepare(
        `SELECT id, name FROM gates ORDER BY id ASC`
      ).all();
      const gates = (gQ.results || []).map(r => ({ id:r.id, name:r.name }));

      return json({ ok:true, events, gates });
    })
  );

  // Open a cashier session
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const cashier_name = String(b?.cashier_name || "").trim();
      const event_id = int(b?.event_id);
      const gate_id = int(b?.gate_id);
      const opening_float_cents = cents(b?.opening_float_cents);
      const cashier_msisdn = String(b?.cashier_msisdn || "").trim();

      if (!cashier_name) return bad("cashier_name required");
      if (!event_id) return bad("event_id required");
      if (!gate_id) return bad("gate_id required");

      let r;
      try {
        r = await env.DB.prepare(
          `INSERT INTO pos_sessions (event_id, cashier_name, gate_id, opening_float_cents, opened_at, cashier_msisdn)
           VALUES (?1, ?2, ?3, ?4, unixepoch(), NULLIF(?5,''))`
        ).bind(event_id, cashier_name, gate_id, opening_float_cents, cashier_msisdn).run();
      } catch {
        // Fallback for schemas without cashier_msisdn
        r = await env.DB.prepare(
          `INSERT INTO pos_sessions (event_id, cashier_name, gate_id, opening_float_cents, opened_at)
           VALUES (?1, ?2, ?3, ?4, unixepoch())`
        ).bind(event_id, cashier_name, gate_id, opening_float_cents).run();
      }

      return json({ ok:true, session_id: r.meta.last_row_id });
    })
  );

  // Close a cashier session
  router.add(
    "POST",
    "/api/pos/session/close",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const session_id = int(b?.session_id);
      const closing_manager = String(b?.closing_manager || "").trim();
      if (!session_id) return bad("session_id required");

      await env.DB.prepare(
        `UPDATE pos_sessions
           SET closed_at = unixepoch(),
               closing_manager = COALESCE(NULLIF(?1,''), closing_manager)
         WHERE id = ?2`
      ).bind(closing_manager, session_id).run();

      return json({ ok:true });
    })
  );

  // Sell screen context (event + ticket types)
  router.add(
    "GET",
    "/api/pos/session/:id/context",
    requireRole("pos", async (_req, env, _ctx, params) => {
      const session_id = int(params?.id);
      if (!session_id) return bad("session_id required");

      const sQ = await env.DB.prepare(
        `SELECT ps.id, ps.event_id, ps.cashier_name, ps.gate_id, ps.cashier_msisdn, g.name AS gate_name
           FROM pos_sessions ps
           LEFT JOIN gates g ON g.id = ps.gate_id
          WHERE ps.id = ?1`
      ).bind(session_id).first();
      if (!sQ) return bad("session not found");

      const ev = await env.DB.prepare(
        `SELECT id, slug, name, starts_at, ends_at FROM events WHERE id = ?1`
      ).bind(sQ.event_id).first();

      const ttQ = await env.DB.prepare(
        `SELECT id, name, price_cents
           FROM ticket_types
          WHERE event_id = ?1
          ORDER BY id ASC`
      ).bind(sQ.event_id).all();

      return json({
        ok: true,
        session: {
          id: sQ.id, event_id: sQ.event_id,
          cashier_name: sQ.cashier_name, gate_id: sQ.gate_id, gate_name: sQ.gate_name,
          cashier_msisdn: sQ.cashier_msisdn || null,
        },
        event: ev || null,
        ticket_types: (ttQ.results || []).map(t => ({ id:t.id, name:t.name, price_cents:t.price_cents }))
      });
    })
  );

  // Create & tender a POS order (cash/card) + issue tickets + WhatsApp
  router.add(
    "POST",
    "/api/pos/order/tender",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

      const session_id = int(b?.session_id);
      const method = String(b?.method || "").toLowerCase(); // 'cash' | 'card'
      const buyer_name = String(b?.buyer_name || "").trim();
      const buyer_phone = String(b?.buyer_phone || "").trim();
      /** items: [{ ticket_type_id, qty }] */
      const items = Array.isArray(b?.items) ? b.items : [];

      if (!session_id) return bad("session_id required");
      if (!items.length) return bad("no items");
      if (method !== "cash" && method !== "card") return bad("method must be cash or card");

      // Load session -> event (and cashier fallback number)
      const s = await env.DB.prepare(
        `SELECT ps.id, ps.event_id, ps.cashier_msisdn
           FROM pos_sessions ps
          WHERE ps.id = ?1 AND ps.closed_at IS NULL`
      ).bind(session_id).first();
      if (!s) return bad("session not found/closed");

      // Price lookup
      const ids = items.map(i => int(i.ticket_type_id)).filter(Boolean);
      const placeholders = ids.map(()=>"?").join(",");
      const prices = await env.DB.prepare(
        `SELECT id, price_cents FROM ticket_types WHERE id IN (${placeholders})`
      ).bind(...ids).all();

      const priceMap = new Map((prices.results||[]).map(r => [r.id, r.price_cents|0]));
      let total_cents = 0;
      const normItems = [];
      for (const it of items) {
        const tid = int(it.ticket_type_id);
        const qty = int(it.qty);
        if (!tid || !qty) continue;
        const p = priceMap.get(tid) || 0;
        total_cents += p * qty;
        normItems.push({ ticket_type_id: tid, qty, price_cents: p });
      }
      if (!normItems.length) return bad("no valid items");

      const methodTag = method === "cash" ? "pos_cash" : "pos_card";

      // Insert order (paid)
      const createdAt = now();
      const orderRes = await env.DB.prepare(
        `INSERT INTO orders
           (short_code, event_id, status, payment_method, payment_ref, total_cents,
            contact_json, created_at, paid_at, source, buyer_name, buyer_email, buyer_phone, items_json)
         VALUES
           (NULL, ?1, 'paid', ?2, NULL, ?3,
            ?4, ?5, ?5, 'pos', ?6, NULL, ?7, ?8)`
      ).bind(
        s.event_id,
        methodTag,
        total_cents,
        JSON.stringify({ name: buyer_name, phone: buyer_phone }),
        createdAt,
        buyer_name || null,
        buyer_phone || null,
        JSON.stringify(normItems)
      ).run();

      const order_id = orderRes.meta.last_row_id;

      // Ensure the order has a short_code (useful for links / scanning parity)
      const code = shortCode(order_id);
      await env.DB.prepare(
        `UPDATE orders SET short_code = ?1 WHERE id = ?2`
      ).bind(code, order_id).run();

      // Insert order_items
      for (const it of normItems) {
        await env.DB.prepare(
          `INSERT INTO order_items (order_id, ticket_type_id, qty, price_cents)
           VALUES (?1, ?2, ?3, ?4)`
        ).bind(order_id, it.ticket_type_id, it.qty, it.price_cents).run();
      }

      // Issue tickets (best effort — skip silently if table/columns differ)
      try {
        for (const it of normItems) {
          for (let i = 1; i <= it.qty; i++) {
            const qr = ticketQR(order_id, it.ticket_type_id, i);
            await env.DB.prepare(
              `INSERT INTO tickets (event_id, order_id, ticket_type_id, qr, state, issued_at)
               VALUES (?1, ?2, ?3, ?4, 'unused', unixepoch())`
            ).bind(s.event_id, order_id, it.ticket_type_id, qr).run();
          }
        }
      } catch {
        // If your schema is different (e.g., extra cols), the sale still succeeds.
      }

      // POS payment journal (optional)
      try {
        await env.DB.prepare(
          `INSERT INTO pos_payments (session_id, order_id, method, amount_cents, created_at)
           VALUES (?1, ?2, ?3, ?4, unixepoch())`
        ).bind(session_id, order_id, methodTag, total_cents).run();
      } catch {}

      // WhatsApp delivery (template) — prefer buyer; else fall back to cashier number
      const msisdn = (buyer_phone && buyer_phone.trim()) || (s.cashier_msisdn && s.cashier_msisdn.trim());
      if (msisdn) {
        // We send a compact message via your template helper.
        // It links to /t/<short_code> so the customer can open tickets.
        try {
          await sendOrderOnWhatsApp(env, msisdn, {
            short_code: code,
            total_cents,
            event_slug: null // set if you want deep-link context; template helper handles default link
          });
        } catch {
          // Don't fail the sale if WA delivery fails.
        }
      }

      return json({ ok:true, order_id, total_cents, short_code: code });
    })
  );
}
