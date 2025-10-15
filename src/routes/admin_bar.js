// /src/routes/admin_bar.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";

function i(n){ return Number(n||0)|0; }
function s(v){ return (v==null ? null : String(v)); }

export function mountAdminBar(router){
  const guard = (fn) => requireRole("admin", fn);

  /* ---------------- BAR: MENU (pos_items CRUD) ---------------- */
  // List
  router.add("GET", "/api/admin/bar/items", guard(async (req, env)=>{
    const u = new URL(req.url);
    const q   = (u.searchParams.get("q")||"").trim();
    const cat = (u.searchParams.get("category")||"").trim();
    const hasActive = u.searchParams.has("active");
    const hasMain   = u.searchParams.has("main_menu");

    const where = [];
    const args  = [];

    if (q){
      where.push(`(
        UPPER(name)     LIKE UPPER(?${args.length+1}) OR
        UPPER(category) LIKE UPPER(?${args.length+1}) OR
        UPPER(variant)  LIKE UPPER(?${args.length+1})
      )`);
      args.push(`%${q}%`);
    }
    if (cat){
      where.push(`category = ?${args.length+1}`);
      args.push(cat);
    }
    if (hasActive){
      const val = i(u.searchParams.get("active"));
      where.push(`active = ?${args.length+1}`);
      args.push(val ? 1 : 0);
    }
    if (hasMain){
      const val = i(u.searchParams.get("main_menu"));
      where.push(`main_menu = ?${args.length+1}`);
      args.push(val ? 1 : 0);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await env.DB.prepare(
      `SELECT id, name, category, variant, unit, size_ml, is_deposit,
              active, sort_index, price_cents, main_menu
         FROM pos_items
        ${whereSql}
        ORDER BY category ASC, sort_index ASC, name ASC, variant ASC`
    ).bind(...args).all();

    return json({ ok:true, items: rows.results || [] });
  }));

  // Save (create or update)
  router.add("POST", "/api/admin/bar/items/save", guard(async (req, env)=>{
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }

    const id = i(b?.id);
    const f = {
      name: (b?.name||"").trim(),
      category: (b?.category||"").trim(),
      variant: (b?.variant ?? "").trim(),
      unit: s(b?.unit),
      size_ml: (b?.size_ml==null? null : i(b.size_ml)),
      is_deposit: i(b?.is_deposit) ? 1 : 0,
      active: i(b?.active ?? 1) ? 1 : 0,
      sort_index: i(b?.sort_index),
      price_cents: (b?.price_cents==null? null : i(b.price_cents)),
      main_menu: i(b?.main_menu) ? 1 : 0,
    };

    if (!f.name || !f.category) return bad("name and category required");

    if (id){
      await env.DB.prepare(
        `UPDATE pos_items
            SET name=?1, category=?2, variant=?3, unit=?4, size_ml=?5,
                is_deposit=?6, active=?7, sort_index=?8, price_cents=?9, main_menu=?10
          WHERE id=?11`
      ).bind(
        f.name,f.category,f.variant,f.unit,f.size_ml,
        f.is_deposit,f.active,f.sort_index,f.price_cents,f.main_menu,
        id
      ).run();
      return json({ ok:true, id });
    } else {
      const r = await env.DB.prepare(
        `INSERT INTO pos_items
           (name, category, variant, unit, size_ml, is_deposit, active, sort_index, price_cents, main_menu)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`
      ).bind(
        f.name,f.category,f.variant,f.unit,f.size_ml,
        f.is_deposit,f.active,f.sort_index,f.price_cents,f.main_menu
      ).run();
      return json({ ok:true, id: r.meta.last_row_id });
    }
  }));

  // Delete
  router.add("POST", "/api/admin/bar/items/delete", guard(async (req, env)=>{
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = i(b?.id);
    if (!id) return bad("id required");
    await env.DB.prepare(`DELETE FROM pos_items WHERE id=?1`).bind(id).run();
    return json({ ok:true });
  }));

  // Toggle main_menu
  router.add("POST", "/api/admin/bar/items/toggle-main", guard(async (req, env)=>{
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const id = i(b?.id);
    const flag = i(b?.main_menu) ? 1 : 0;
    if (!id) return bad("id required");
    await env.DB.prepare(`UPDATE pos_items SET main_menu=?1 WHERE id=?2`).bind(flag, id).run();
    return json({ ok:true });
  }));

  /* ---------------- BAR: WALLETS (list/search) ---------------- */
  router.add("GET", "/api/admin/bar/wallets", guard(async (req, env)=>{
    const u = new URL(req.url);
    const q = (u.searchParams.get("q")||"").trim();
    const limit  = Math.min(Math.max(i(u.searchParams.get("limit")||50),1),200);
    const offset = Math.max(i(u.searchParams.get("offset")||0),0);

    const where = [];
    const args  = [];
    if (q){
      where.push(`(
        id LIKE ?${args.length+1} OR
        UPPER(name) LIKE UPPER(?${args.length+1}) OR
        REPLACE(mobile,' ','') LIKE ?${args.length+1}
      )`);
      args.push(`%${q}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const list = await env.DB.prepare(
      `SELECT id, name, mobile, status, version, balance_cents, created_at
         FROM wallets
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}`
    ).bind(...args).all();

    const cRow = await env.DB.prepare(
      `SELECT COUNT(*) AS c FROM wallets ${whereSql}`
    ).bind(...args).first();

    return json({
      ok:true,
      wallets: list.results || [],
      total: Number(cRow?.c||0), limit, offset
    });
  }));

  /* ---------------- BAR: CASHUPS ---------------- */
  // Wallet cashup (top-ups) grouped by day & method
  router.add("GET", "/api/admin/bar/cashup/wallet", guard(async (req, env)=>{
    const u = new URL(req.url);
    const from = i(u.searchParams.get("from") || 0);
    const to   = i(u.searchParams.get("to")   || 4102444800); // ~2100-01-01

    // primary: wallet_movements
    const q1 = await env.DB.prepare(
      `SELECT date(created_at,'unixepoch','localtime') AS day,
              SUM(CASE WHEN json_extract(COALESCE(meta_json,'{}'),'$.method')='cash' THEN amount_cents ELSE 0 END) AS cash_cents,
              SUM(CASE WHEN json_extract(COALESCE(meta_json,'{}'),'$.method')='card' THEN amount_cents ELSE 0 END) AS card_cents,
              SUM(amount_cents) AS total_cents
         FROM wallet_movements
        WHERE kind='topup' AND created_at BETWEEN ?1 AND ?2
        GROUP BY day
        ORDER BY day DESC`
    ).bind(from, to).all().catch(()=>({results:[]}));

    let rows = q1.results || [];

    // fallback: legacy topups table (source: 'cash'/'card')
    if (!rows.length){
      const q2 = await env.DB.prepare(
        `SELECT date(created_at,'unixepoch','localtime') AS day,
                SUM(CASE WHEN source='cash' THEN amount_cents ELSE 0 END) AS cash_cents,
                SUM(CASE WHEN source='card' THEN amount_cents ELSE 0 END) AS card_cents,
                SUM(amount_cents) AS total_cents
           FROM topups
          WHERE created_at BETWEEN ?1 AND ?2
          GROUP BY day
          ORDER BY day DESC`
      ).bind(from, to).all().catch(()=>({results:[]}));
      rows = q2.results || [];
    }

    return json({ ok:true, days: rows });
  }));

  // Bar cashup (sales): totals by day + per-item
  router.add("GET", "/api/admin/bar/cashup/sales", guard(async (req, env)=>{
    const u = new URL(req.url);
    const from = i(u.searchParams.get("from") || 0);
    const to   = i(u.searchParams.get("to")   || 4102444800);

    // totals from wallet_movements (purchases are negative amounts)
    const totalsQ = await env.DB.prepare(
      `SELECT date(created_at,'unixepoch','localtime') AS day,
              SUM(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END) AS sales_cents
         FROM wallet_movements
        WHERE kind='purchase' AND created_at BETWEEN ?1 AND ?2
        GROUP BY day
        ORDER BY day DESC`
    ).bind(from, to).all().catch(()=>({results:[]}));

    let totals = totalsQ.results || [];

    if (!totals.length){
      // fallback: legacy sales table
      const t2 = await env.DB.prepare(
        `SELECT date(created_at,'unixepoch','localtime') AS day,
                SUM(total_cents) AS sales_cents
           FROM sales
          WHERE created_at BETWEEN ?1 AND ?2
          GROUP BY day
          ORDER BY day DESC`
      ).bind(from, to).all().catch(()=>({results:[]}));
      totals = t2.results || [];
    }

    // per-item from wallet_movements.meta_json.items
    const itemsQ = await env.DB.prepare(
      `SELECT
         json_extract(j.value,'$.id')   AS item_id,
         json_extract(j.value,'$.name') AS item_name,
         SUM(json_extract(j.value,'$.qty')) AS qty,
         SUM(json_extract(j.value,'$.qty') * json_extract(j.value,'$.unit_price_cents')) AS cents
       FROM wallet_movements wm,
            json_each(COALESCE(wm.meta_json,'{}'),'$.items') AS j
      WHERE wm.kind='purchase' AND wm.created_at BETWEEN ?1 AND ?2
      GROUP BY item_id, item_name
      ORDER BY cents DESC, item_name ASC`
    ).bind(from, to).all().catch(()=>({results:[]}));

    let items = itemsQ.results || [];

    if (!items.length){
      // fallback: legacy sales.items_json
      const i2 = await env.DB.prepare(
        `SELECT
           json_extract(j.value,'$.id')   AS item_id,
           json_extract(j.value,'$.name') AS item_name,
           SUM(json_extract(j.value,'$.qty')) AS qty,
           SUM(json_extract(j.value,'$.qty') * json_extract(j.value,'$.unit_price_cents')) AS cents
         FROM sales s,
              json_each(COALESCE(s.items_json,'[]')) AS j
        WHERE s.created_at BETWEEN ?1 AND ?2
        GROUP BY item_id, item_name
        ORDER BY cents DESC, item_name ASC`
      ).bind(from, to).all().catch(()=>({results:[]}));
      items = i2.results || [];
    }

    return json({ ok:true, totals, items });
  }));

  // (No HTML routes here — UI is handled by /src/ui/admin.js with the Bar tab)
}