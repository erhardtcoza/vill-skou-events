// /src/routes/admin.js
import { json, bad } from "../utils/http.js";
import { requireRole } from "../utils/auth.js";   // <— keep only this one

/**
 * Helper: run a statement and return first row or all rows
 */
async function all(db, sql, ...binds) {
  return (await db.prepare(sql).bind(...binds).all()).results || [];
}
async function one(db, sql, ...binds) {
  return await db.prepare(sql).bind(...binds).first();
}

export function mountAdmin(router) {
  //
  // ──────────────────────────────────────────────────────────────────────────
  // AUTH-GUARDED ADMIN API
  // ──────────────────────────────────────────────────────────────────────────
  //

  // ── Site settings (KV) ───────────────────────────────────────────────────
  router.add(
    "GET",
    "/api/admin/settings",
    requireRole("admin", async (_req, env) => {
      const raw = await env.EVENTS_KV.get("site_settings");
      const val = raw ? JSON.parse(raw) : { site_name: "", logo_url: "", banner_url: "" };
      return json({ ok: true, settings: val });
    })
  );

  router.add(
    "POST",
    "/api/admin/settings",
    requireRole("admin", async (req, env) => {
      const body = await req.json().catch(() => null);
      if (!body) return bad("Invalid JSON");
      const val = {
        site_name: body.site_name || "",
        logo_url: body.logo_url || "",
        banner_url: body.banner_url || "",
      };
      await env.EVENTS_KV.put("site_settings", JSON.stringify(val));
      return json({ ok: true, settings: val });
    })
  );



  // ── Users CRUD ───────────────────────────────────────────────────────────
  router.add(
    "GET",
    "/api/admin/users",
    requireRole("admin", async (_req, env) => {
      const rows = (await env.DB.prepare(
        `SELECT id, username, display_name, role, is_active, created_at FROM users ORDER BY id ASC`
      ).all()).results || [];
      return json({ ok:true, users: rows });
    })
  );

  router.add(
    "POST",
    "/api/admin/users",
    requireRole("admin", async (req, env) => {
      const b = await req.json().catch(()=>null);
      const username = (b?.username||"").trim();
      const display = (b?.display_name||"").trim();
      const role = (b?.role||"").trim();
      const password = (b?.password||"").trim();
      if (!username || !password || !["admin","pos","scan"].includes(role)) return bad("Invalid fields");
      const salt = newSalt();
      const pwHash = await hashPassword(env, password, salt);
      try {
        const r = await env.DB.prepare(
          `INSERT INTO users (username, display_name, role, salt, password_hash, is_active)
           VALUES (?1, ?2, ?3, ?4, ?5, 1)`
        ).bind(username, display, role, salt, pwHash).run();
        return json({ ok:true, id: r.meta.last_row_id });
      } catch (e) {
        return json({ ok:false, error: String(e) }, 400);
      }
    })
  );

  router.add(
    "PUT",
    "/api/admin/users/:id",
    requireRole("admin", async (req, env, _ctx, { id }) => {
      const b = await req.json().catch(()=>null);
      const updates = [];
      const binds = [];
      if (b?.display_name != null) { updates.push("display_name=?"); binds.push(b.display_name); }
      if (b?.role && ["admin","pos","scan"].includes(b.role)) { updates.push("role=?"); binds.push(b.role); }
      if (typeof b?.is_active === "number") { updates.push("is_active=?"); binds.push(b.is_active ? 1 : 0); }
      if (b?.password) {
        const salt = newSalt();
        const hash = await hashPassword(env, b.password, salt);
        updates.push("salt=?", "password_hash=?"); binds.push(salt, hash);
      }
      if (!updates.length) return json({ ok:true, updated:0 });
      binds.push(Number(id));
      await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id=?`).bind(...binds).run();
      return json({ ok:true, updated:1 });
    })
  );

  router.add(
    "DELETE",
    "/api/admin/users/:id",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      await env.DB.prepare(`UPDATE users SET is_active=0 WHERE id=?1`).bind(Number(id)).run();
      return json({ ok:true });
    })
  );

// … end of mountAdmin
  
  // ── Events CRUD ──────────────────────────────────────────────────────────
  router.add(
    "GET",
    "/api/admin/events",
    requireRole("admin", async (_req, env) => {
      const rows = await all(
        env.DB,
        `SELECT id, slug, name, venue, starts_at, ends_at, status,
                hero_url, poster_url, gallery_urls
         FROM events ORDER BY starts_at DESC`
      );
      return json({ ok: true, events: rows });
    })
  );

  router.add(
    "GET",
    "/api/admin/events/:id",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      const ev = await one(
        env.DB,
        `SELECT id, slug, name, venue, starts_at, ends_at, status,
                hero_url, poster_url, gallery_urls
         FROM events WHERE id=?1`,
        Number(id)
      );
      if (!ev) return bad("Not found", 404);
      return json({ ok: true, event: ev });
    })
  );

  router.add(
    "POST",
    "/api/admin/events",
    requireRole("admin", async (req, env) => {
      const b = await req.json().catch(() => null);
      if (!b?.slug || !b?.name || !b?.starts_at || !b?.ends_at)
        return bad("Missing fields");

      const res = await env.DB.prepare(
        `INSERT INTO events (slug, name, venue, starts_at, ends_at, status, hero_url, poster_url, gallery_urls)
         VALUES (?1, ?2, ?3, ?4, ?5, COALESCE(?6,'active'), ?7, ?8, ?9)`
      )
        .bind(
          b.slug,
          b.name,
          b.venue || "",
          Number(b.starts_at),
          Number(b.ends_at),
          b.status || "active",
          b.hero_url || "",
          b.poster_url || "",
          b.gallery_urls ? JSON.stringify(b.gallery_urls) : null
        )
        .run();

      return json({ ok: true, id: res.meta.last_row_id });
    })
  );

  router.add(
    "PUT",
    "/api/admin/events/:id",
    requireRole("admin", async (req, env, _ctx, { id }) => {
      const b = await req.json().catch(() => null);
      if (!b) return bad("Invalid JSON");
      await env.DB.prepare(
        `UPDATE events SET
           slug=COALESCE(?2,slug),
           name=COALESCE(?3,name),
           venue=COALESCE(?4,venue),
           starts_at=COALESCE(?5,starts_at),
           ends_at=COALESCE(?6,ends_at),
           status=COALESCE(?7,status),
           hero_url=COALESCE(?8,hero_url),
           poster_url=COALESCE(?9,poster_url),
           gallery_urls=?10
         WHERE id=?1`
      )
        .bind(
          Number(id),
          b.slug ?? null,
          b.name ?? null,
          b.venue ?? null,
          b.starts_at ?? null,
          b.ends_at ?? null,
          b.status ?? null,
          b.hero_url ?? null,
          b.poster_url ?? null,
          b.gallery_urls ? JSON.stringify(b.gallery_urls) : null
        )
        .run();
      return json({ ok: true });
    })
  );

  router.add(
    "DELETE",
    "/api/admin/events/:id",
    requireRole("admin", async (_req, env, _ctx, { id }) => {
      await env.DB.prepare(`DELETE FROM events WHERE id=?1`).bind(Number(id)).run();
      return json({ ok: true });
    })
  );

  // ── Global Gates (used by scanner) ───────────────────────────────────────
  router.add(
    "GET",
    "/api/admin/gates",
    requireRole("admin", async (_req, env) => {
      return json({ ok: true, gates: await all(env.DB, `SELECT id,name FROM gates ORDER BY id ASC`) });
    })
  );

  router.add(
    "POST",
    "/api/admin/gates",
    requireRole("admin", async (req, env) => {
      const b = await req.json().catch(() => null);
      if (!b?.name) return bad("Name required");
      const r = await env.DB.prepare(`INSERT INTO gates(name) VALUES (?1)`).bind(b.name).run();
      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  // ── Ticket Types (per event) ─────────────────────────────────────────────
  router.add(
    "POST",
    "/api/admin/events/:id/ticket-types",
    requireRole("admin", async (req, env, _ctx, { id }) => {
      const b = await req.json().catch(() => null);
      if (!b?.name) return bad("Name required");
      const cents =
        b.price_rands === "" || b.price_rands === null || b.price_rands === undefined
          ? 0
          : Math.round(Number(b.price_rands) * 100);
      const r = await env.DB.prepare(
        `INSERT INTO ticket_types (event_id, name, price_cents, capacity, per_order_limit, requires_gender)
         VALUES (?1, ?2, ?3, 0, 10, ?4)`
      )
        .bind(Number(id), b.name, isFinite(cents) ? cents : 0, b.requires_gender ? 1 : 0)
        .run();
      return json({ ok: true, id: r.meta.last_row_id });
    })
  );

  // ── POS Admin: cashups + totals ──────────────────────────────────────────
  router.add(
    "GET",
    "/api/admin/pos/cashups",
    requireRole("admin", async (req, env) => {
      const url = new URL(req.url);
      const from = Number(url.searchParams.get("from") || 0);
      const to = Number(url.searchParams.get("to") || 4102444800); // year 2100
      const shifts = await all(
        env.DB,
        `SELECT id, cashier_name, gate_name, opened_at, closed_at,
                opening_float_cents, notes
         FROM pos_shifts
         WHERE opened_at BETWEEN ?1 AND ?2
         ORDER BY opened_at DESC`,
        from,
        to
      );

      // POS order totals
      const totals = await one(
        env.DB,
        `SELECT
           SUM(CASE WHEN payment_method='cash' THEN total_cents ELSE 0 END) AS cash_cents,
           SUM(CASE WHEN payment_method='card' THEN total_cents ELSE 0 END) AS card_cents,
           SUM(total_cents) AS grand_cents,
           COUNT(*) AS orders_count
         FROM orders
         WHERE source='pos' AND created_at BETWEEN ?1 AND ?2`,
        from,
        to
      );

      return json({
        ok: true,
        shifts,
        totals: totals || { cash_cents: 0, card_cents: 0, grand_cents: 0, orders_count: 0 },
      });
    })
  );
}
