// /src/routes/pos.js
import { json, bad } from "../utils/http.js";
import { requireAny, requireRole } from "../utils/auth.js";
import { sendOrderOnWhatsApp } from "../services/whatsapp.js";

/** Small helper to build an IN (?, ?, ?) clause safely */
function sqlIn(ids) {
  const arr = Array.from(new Set(ids.map(x => Number(x)).filter(Boolean)));
  return { list: arr, placeholders: arr.map(() => "?").join(",") };
}

/** Random 6-char uppercase short code (base36) */
function shortCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** POS endpoints */
export function mountPOS(router) {
  // ---------- Bootstrap: list events + gates from DB ----------
  router.add(
    "GET",
    "/api/pos/bootstrap",
    requireAny(["pos", "admin"], async (_req, env) => {
      const evQ = await env.DB.prepare(
        `SELECT id, slug, name FROM events ORDER BY id DESC`
      ).all();
      const events = (evQ.results || []).map(r => ({ id:r.id, slug:r.slug, name:r.name }));

      // If your gates live in a different table/columns, tweak this SELECT
      const gQ = await env.DB.prepare(
        `SELECT id, name FROM gates ORDER BY id ASC`
      ).all();
      const gates = (gQ.results || []).map(r => ({ id:r.id, name:r.name }));

      return json({ ok:true, events, gates });
    })
  );

  // ---------- Open session ----------
  router.add(
    "POST",
    "/api/pos/session/open",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const cashier_name = String(b?.cashier_name || "").trim();
      const event_id = Number(b?.event_id || 0);
      const gate_id = Number(b?.gate_id || 0);
      const opening_float_cents = Math.max(0, Number(b?.opening_float_cents || 0));
      const cashier_msisdn = (b?.cashier_msisdn ? String(b.cashier_msisdn).trim() : null);

      if (!cashier_name) return bad("cashier_name required");
      if (!event_id) return bad("event_id required");
      if (!gate_id) return bad("gate_id required");

      const r = await env.DB.prepare(
        `INSERT INTO pos_sessions (event_id, cashier_name, gate_id, opening_float_cents, opened_at, cashier_msisdn)
         VALUES (?1, ?2, ?3, ?4, unixepoch(), ?5)`
      ).bind(event_id, cashier_name, gate_id, opening_float_cents, cashier_msisdn).run();

      return json({ ok:true, session_id: r.meta.last_row_id });
    })
  );

  // ---------- Close session ----------
  router.add(
    "POST",
    "/api/pos/session/close",
    requireRole("pos", async (req, env) => {
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
      const session_id = Number(b?.session_id || 0);
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

  // ---------- Recall an order by short code ----------
  router.add(
    "GET",
    "/api/pos/order/lookup/:code",
    requireRole("pos", async (_req, env, _ctx, { code }) => {
      const c = String(code || "").trim().toUpperCase();
      if (!c) return bad("code required");

      const ord = await env.DB.prepare(
        `SELECT id, event_id, buyer_name, buyer_phone, total_cents, status, short_code
           FROM orders WHERE short_code = ?1`
      ).bind(c).first();

      if (!ord) return json({ ok:false, error:"not found" });

      const itemsQ = await env.DB.prepare(
        `SELECT ticket_type_id, qty, unit_price_cents FROM order_items WHERE order_id = ?1`
      ).bind(ord.id).all();

      return json({
        ok:true,
        order:{
          id: ord.id,
          event_id: ord.event_id,
          buyer_name: ord.buyer_name,
          buyer_phone: ord.buyer_phone,
          total_cents: ord.total_cents,
          status: ord.status,
          short_code: ord.short_code,
          items: (itemsQ.results||[]).map(r=>({
            ticket_type_id: r.ticket_type_id,
            qty: r.qty,
            unit_price_cents: r.unit_price_cents
          }))
        }
      });
    })
  );

  // ---------- Create a POS sale (cash/card) ----------
  router.add(
    "POST",
    "/api/pos/order/sale",
    requireRole("pos", async (req, env) => {
      // Expect: { session_id, event_id?, customer_name?, customer_msisdn?, method, items:[{ticket_type_id, qty}] }
      let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

      const session_id = Number(b?.session_id || 0);
      const method = String(b?.method || "").trim(); // 'pos_cash' | 'pos_card'
      const items = Array.isArray(b?.items) ? b.items : [];
      const customer_name = String(b?.customer_name || "").trim() || null;
      const customer_msisdn = String(b?.customer_msisdn || "").trim() || null;

      if (!session_id) return bad("session_id required");
      if (!items.length) return bad("items required");
      if (method !== "pos_cash" && method !== "pos_card") return bad("invalid method");

      // Validate session and determine event_id from it
      const sess = await env.DB.prepare(
        `SELECT id, event_id, closed_at FROM pos_sessions WHERE id = ?1`
      ).bind(session_id).first();
      if (!sess) return bad("invalid session");
      if (sess.closed_at) return bad("session closed");
      const event_id = Number(sess.event_id);

      // Price lookup for the chosen ticket types
      const { list, placeholders } = sqlIn(items.map(i=>i.ticket_type_id));
      if (!list.length) return bad("invalid items");

      const ttRows = await env.DB.prepare(
        `SELECT id, price_cents FROM ticket_types WHERE id IN (${placeholders})`
      ).bind(...list).all();
      const priceMap = new Map((ttRows.results||[]).map(r => [Number(r.id), Number(r.price_cents||0)]));

      // Build order totals
      let total = 0;
      const normItems = items.map(i => {
        const id = Number(i.ticket_type_id||0);
        const qty = Math.max(0, Number(i.qty||0));
        const price = priceMap.get(id) || 0;
        total += qty * price;
        return { id, qty, price };
      }).filter(x => x.qty > 0);

      if (!normItems.length) return bad("no positive qty items");

      // Create order
      const code = shortCode();
      const insOrder = await env.DB.prepare(
        `INSERT INTO orders (event_id, buyer_name, buyer_phone, total_cents, short_code, status, created_at, source)
         VALUES (?1, ?2, ?3, ?4, ?5, 'paid', unixepoch(), 'pos')`
      ).bind(event_id, customer_name, customer_msisdn, total, code).run();
      const order_id = insOrder.meta.last_row_id;

      // Insert items
      for (const it of normItems) {
        await env.DB.prepare(
          `INSERT INTO order_items (order_id, ticket_type_id, qty, unit_price_cents)
           VALUES (?1, ?2, ?3, ?4)`
        ).bind(order_id, it.id, it.qty, it.price).run();
      }

      // Record POS payment
      await env.DB.prepare(
        `INSERT INTO pos_payments (session_id, order_id, method, amount_cents, created_at)
         VALUES (?1, ?2, ?3, ?4, unixepoch())`
      ).bind(session_id, order_id, method, total).run();

      // Try WhatsApp ticket delivery (best-effort; ignore failure)
      if (customer_msisdn) {
        try {
          await sendOrderOnWhatsApp(env, customer_msisdn, {
            short_code: code,
            id: order_id,
            event_slug: null,            // optional if you want to include a deep link
            buyer_name: customer_name || undefined,
            total_cents: total
          });
        } catch (e) {
          // Log-only; do not fail the sale if WA fails
          console.log("WhatsApp send failed:", e?.message || e);
        }
      }

      return json({ ok:true, order_id, short_code: code, total_cents: total });
    })
  );
}
