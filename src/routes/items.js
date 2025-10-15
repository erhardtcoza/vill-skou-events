// /src/routes/items.js
import { json, bad } from "../utils/http.js";

/**
 * Exposes bar/POS items from the `pos_items` table.
 * Returns: { ok:true, items:[{ id, name, category, variant, unit, is_deposit, price_cents, active, sort_index }] }
 *
 * Notes:
 * - We do NOT invent categories; we only return what's in DB.
 * - Only active=1 items are returned.
 * - Ordered by category, sort_index, name, variant.
 */
export function mountItems(router, env) {
  // List all items (active only)
  router.add("GET", "/api/items", async (_req, env2) => {
    try {
      const rows = await env2.DB.prepare(
        `SELECT id, name, category, variant, unit, size_ml, is_deposit, active, sort_index, price_cents
           FROM pos_items
          WHERE active = 1
          ORDER BY category ASC, sort_index ASC, name ASC, variant ASC`
      ).all();

      const items = (rows?.results || []).map(r => ({
        id: Number(r.id),
        name: String(r.name || "").trim(),
        category: String(r.category || "").trim(),
        variant: String(r.variant || "").trim(),     // '' when not applicable
        unit: r.unit ? String(r.unit) : null,
        size_ml: (r.size_ml == null ? null : Number(r.size_ml)),
        is_deposit: Number(r.is_deposit || 0) === 1,
        active: Number(r.active || 0) === 1,
        sort_index: Number(r.sort_index || 0),
        price_cents: (r.price_cents == null ? null : Number(r.price_cents)),
      }));

      return json({ ok: true, items });
    } catch (_e) {
      return bad(500, "items_failed");
    }
  });

  // Single item (optional, handy for debugging)
  router.add("GET", "/api/items/:id", async (_req, env2, _ctx, { id }) => {
    const row = await env2.DB.prepare(
      `SELECT id, name, category, variant, unit, size_ml, is_deposit, active, sort_index, price_cents
         FROM pos_items WHERE id=?1 LIMIT 1`
    ).bind(Number(id || 0)).first();

    if (!row) return bad(404, "not_found");

    return json({
      ok: true,
      item: {
        id: Number(row.id),
        name: String(row.name || "").trim(),
        category: String(row.category || "").trim(),
        variant: String(row.variant || "").trim(),
        unit: row.unit ? String(row.unit) : null,
        size_ml: (row.size_ml == null ? null : Number(row.size_ml)),
        is_deposit: Number(row.is_deposit || 0) === 1,
        active: Number(row.active || 0) === 1,
        sort_index: Number(row.sort_index || 0),
        price_cents: (row.price_cents == null ? null : Number(row.price_cents)),
      }
    });
  });
}
