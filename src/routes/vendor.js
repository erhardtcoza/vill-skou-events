// src/routes/vendor.js
import { json, bad } from "../utils/http.js";
import { badgeHTML } from "../ui/badge.js";

/* --------------------------- helpers --------------------------- */
function asInt(n, d = 0) { const x = Number(n); return Number.isFinite(x) ? Math.trunc(x) : d; }
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
function genToken(len = 22) {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let o = ""; for (let i = 0; i < len; i++) o += a[Math.floor(Math.random() * a.length)];
  return o;
}
async function getSetting(env, key) {
  const row = await env.DB.prepare(`SELECT value FROM site_settings WHERE key=?1 LIMIT 1`)
    .bind(key).first();
  return row ? row.value : null;
}

/* Expected tables (minimal)
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  slug TEXT UNIQUE,
  name TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  site_no TEXT,
  stall_type TEXT,
  electricity_req TEXT,
  description TEXT,
  facebook TEXT,
  website TEXT,
  tel TEXT,
  status TEXT DEFAULT 'invited',
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS vendor_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL,
  day TEXT,                -- e.g. 'fri','sat','both'
  employee_name TEXT,
  employee_phone TEXT,
  role TEXT,               -- e.g. 'VENDOR'
  qr TEXT UNIQUE,
  token TEXT UNIQUE,
  state TEXT DEFAULT 'new', -- 'new'|'printed'|'scanned'
  issued_at INTEGER
);
*/

export function mountVendor(router) {
  /* Create/Invite a vendor (admin triggers this; minimal fields).
     Body: { event_id, name, contact_name, email, phone }
     Returns vendor slug + portal URL to share with vendor. */
  router.add("POST", "/api/vendor/invite", async (req, env) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const event_id = asInt(b?.event_id);
    const name = String(b?.name || "").trim();
    if (!event_id || !name) return bad("event_id and name required");

    const now = Math.floor(Date.now() / 1000);
    let slug = slugify(name);
    if (!slug) slug = "vendor-" + Math.random().toString(36).slice(2, 8);

    try {
      await env.DB.prepare(
        `INSERT INTO vendors (event_id, slug, name, contact_name, email, phone, status, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,'invited',?7,?7)`
      ).bind(
        event_id, slug, name,
        (b?.contact_name || null),
        (b?.email || null),
        (b?.phone || null),
        now
      ).run();
    } catch (e) {
      return bad("Failed to invite vendor");
    }

    const base = (await getSetting(env, "PUBLIC_BASE_URL")) || env.PUBLIC_BASE_URL || "";
    const portal_url = base ? `${base}/vendor/${encodeURIComponent(slug)}` : null;

    return json({ ok: true, vendor: { event_id, name, slug, portal_url } });
  });

  /* Vendor GET (portal prefill).
     Returns vendor record + issued badges. */
  router.add("GET", "/api/vendor/:slug", async (_req, env, _ctx, { slug }) => {
    const v = await env.DB.prepare(
      `SELECT * FROM vendors WHERE slug=?1 LIMIT 1`
    ).bind(slug).first();
    if (!v) return bad("Not found", 404);

    const badges = await env.DB.prepare(
      `SELECT id, day, employee_name, employee_phone, role, qr, token, state, issued_at
         FROM vendor_badges WHERE vendor_id=?1 ORDER BY id ASC`
    ).bind(v.id).all();

    return json({ ok: true, vendor: v, badges: badges.results || [] });
  });

  /* Vendor POST update (portal submits details).
     Body: { contact_name, email, phone, site_no, stall_type, electricity_req, description, facebook, website, tel }
  */
  router.add("POST", "/api/vendor/:slug/update", async (req, env, _ctx, { slug }) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const v = await env.DB.prepare(`SELECT id FROM vendors WHERE slug=?1 LIMIT 1`).bind(slug).first();
    if (!v) return bad("Not found", 404);

    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `UPDATE vendors
            SET contact_name=?1, email=?2, phone=?3, site_no=?4,
                stall_type=?5, electricity_req=?6, description=?7,
                facebook=?8, website=?9, tel=?10, status='submitted', updated_at=?11
          WHERE id=?12`
      ).bind(
        (b?.contact_name || null),
        (b?.email || null),
        (b?.phone || null),
        (b?.site_no || null),
        (b?.stall_type || null),
        (b?.electricity_req || null),
        (b?.description || null),
        (b?.facebook || null),
        (b?.website || null),
        (b?.tel || null),
        now, v.id
      ).run();
    } catch {
      return bad("Failed to update vendor");
    }

    return json({ ok: true });
  });

  /* Issue badges for employees (admin or portal after submit).
     Body: { passes: [ { day:'fri'|'sat'|'both', employee_name, employee_phone } ] }
     Returns created badges with tokens for printing/QR. */
  router.add("POST", "/api/vendor/:slug/issue-badges", async (req, env, _ctx, { slug }) => {
    let b; try { b = await req.json(); } catch { return bad("Bad JSON"); }
    const passes = Array.isArray(b?.passes) ? b.passes : [];
    if (!passes.length) return bad("passes required");

    const v = await env.DB.prepare(`SELECT id, name FROM vendors WHERE slug=?1 LIMIT 1`).bind(slug).first();
    if (!v) return bad("Not found", 404);

    const now = Math.floor(Date.now() / 1000);
    const out = [];

    try {
      await env.DB.exec("BEGIN");
      for (const p of passes) {
        const day = String(p?.day || "both").toLowerCase(); // 'fri' | 'sat' | 'both'
        const emp = String(p?.employee_name || "").trim();
        const phone = String(p?.employee_phone || "").trim() || null;
        if (!emp) continue;

        const token = genToken(20);
        const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
        const qr = `V-${slug}-${rand}`;

        const r = await env.DB.prepare(
          `INSERT INTO vendor_badges (vendor_id, day, employee_name, employee_phone, role, qr, token, state, issued_at)
           VALUES (?1,?2,?3,?4,'VENDOR',?5,?6,'new',?7)`
        ).bind(v.id, day, emp, phone, qr, token, now).run();

        out.push({
          id: r.meta.last_row_id,
          day, employee_name: emp, employee_phone: phone, role: "VENDOR", qr, token, state: "new", issued_at: now
        });
      }
      await env.DB.exec("COMMIT");
    } catch (e) {
      try { await env.DB.exec("ROLLBACK"); } catch {}
      return bad("Failed to issue badges");
    }

    return json({ ok: true, badges: out });
  });

  /* Fetch a badge by token (for scan/verify + printing) */
  router.add("GET", "/api/vendor/badge/:token", async (_req, env, _ctx, { token }) => {
    const row = await env.DB.prepare(
      `SELECT vb.*, v.name AS vendor_name, v.site_no
         FROM vendor_badges vb
         JOIN vendors v ON v.id = vb.vendor_id
        WHERE vb.token=?1
        LIMIT 1`
    ).bind(token).first();
    if (!row) return bad("Not found", 404);
    return json({ ok: true, badge: row });
  });

  /* Printable badge HTML using your existing /src/ui/badge.js */
  router.add("GET", "/ui/vendor/badge/:token", async (_req, env, _ctx, { token }) => {
    const row = await env.DB.prepare(
      `SELECT vb.*, v.name AS vendor_name, v.site_no, v.phone AS vendor_phone
         FROM vendor_badges vb
         JOIN vendors v ON v.id = vb.vendor_id
        WHERE vb.token=?1
        LIMIT 1`
    ).bind(token).first();
    if (!row) return new Response("Not found", { status: 404 });

    const html = badgeHTML({
      title: "VENDOR",
      name: row.employee_name || "",
      org: row.vendor_name || "",
      site: row.site_no || "",
      tel: row.vendor_phone || row.employee_phone || "",
      day: String(row.day || "").toUpperCase(), // e.g. BOTH/FRI/SAT
      qrImg: `/api/qr/png/${encodeURIComponent(row.qr)}`, // assuming you have a QR PNG route
    });

    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" }});
  });
}
