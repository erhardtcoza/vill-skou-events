// /src/routes/public_vendors.js
// Public vendor directory JSON endpoints.

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function likeWrap(s) { return `%${String(s||"").replace(/[%_]/g, m => '\\' + m)}%`; }
function nonEmpty(s) { s = String(s || "").trim(); return s ? s : null; }

function formatDateRangeUnix(starts_at, ends_at) {
  if (!starts_at || !ends_at) return "";
  const a = new Date(Number(starts_at) * 1000);
  const b = new Date(Number(ends_at) * 1000);
  // Keep it locale-friendly without forcing a specific locale on the Worker
  const aStr = a.toLocaleDateString();
  const bStr = b.toLocaleDateString();
  return (aStr === bStr) ? aStr : `${aStr} – ${bStr}`;
}

function safeSort(sort) {
  switch ((sort || "").toLowerCase()) {
    case "site": return "site_no";
    case "type": return "stall_type";
    case "name":
    default: return "name";
  }
}
function safeOrder(order) {
  return (String(order || "").toLowerCase() === "desc") ? "DESC" : "ASC";
}

export function mountPublicVendors(router) {

  /* -------------------------- Event headers -------------------------- */

  // Optional: event header for directory
  router.get("/api/public/event/header/:event_id", async (c) => {
    const { event_id } = c.req.param();
    const row = await c.env.DB.prepare(
      `SELECT id, name, venue, logo_url, starts_at, ends_at
         FROM events WHERE id=?1 LIMIT 1`
    ).bind(event_id).first();

    if (!row) return c.json({ ok: false });

    return c.json({
      ok: true,
      event: {
        id: row.id,
        name: row.name,
        venue: row.venue,
        logo_url: row.logo_url,
        dates: formatDateRangeUnix(row.starts_at, row.ends_at)
      }
    });
  });

  // If you have a "current" event concept (latest by starts_at)
  router.get("/api/public/event/current", async (c) => {
    const row = await c.env.DB.prepare(
      `SELECT id, name, venue, logo_url, starts_at, ends_at
         FROM events
        ORDER BY starts_at DESC
        LIMIT 1`
    ).first();

    if (!row) return c.json({ ok: true, event: {} });

    return c.json({
      ok: true,
      event: {
        id: row.id,
        name: row.name,
        venue: row.venue,
        logo_url: row.logo_url,
        dates: formatDateRangeUnix(row.starts_at, row.ends_at)
      }
    });
  });

  /* -------------------- Distinct stall types & counts -------------------- */

  // Distinct stall types (categories)
  router.get("/api/public/vendors/types", async (c) => {
    const eventId = Number(c.req.query("event_id") || 0) || null;

    let q = `SELECT DISTINCT COALESCE(NULLIF(TRIM(stall_type),''),'Other') AS t
               FROM vendors
              WHERE is_published=1`;
    const args = [];
    if (eventId) { q += ` AND event_id=?1`; args.push(eventId); }
    q += ` ORDER BY t COLLATE NOCASE`;

    const rows = await c.env.DB.prepare(q).bind(...args).all();
    return c.json({
      ok: true,
      types: (rows.results || []).map(r => r.t).filter(Boolean)
    }, { headers: { "Cache-Control": "max-age=120, stale-while-revalidate=600" }});
  });

  // Counts per type (handy for filter pills)
  router.get("/api/public/vendors/type-counts", async (c) => {
    const eventId = Number(c.req.query("event_id") || 0) || null;

    let q = `SELECT COALESCE(NULLIF(TRIM(stall_type),''),'Other') AS t, COUNT(1) AS n
               FROM vendors
              WHERE is_published=1`;
    const args = [];
    if (eventId) { q += ` AND event_id=?1`; args.push(eventId); }
    q += ` GROUP BY t ORDER BY t COLLATE NOCASE`;

    const rows = await c.env.DB.prepare(q).bind(...args).all();
    return c.json({
      ok: true,
      counts: (rows.results || []).map(r => ({ type: r.t, count: r.n }))
    }, { headers: { "Cache-Control": "max-age=120, stale-while-revalidate=600" }});
  });

  /* ---------------- Listing with pagination + search + filter --------------- */

  router.get("/api/public/vendors", async (c) => {
    const eventId     = Number(c.req.query("event_id") || 0) || null;
    const qStr        = String(c.req.query("q") || "").trim();
    const type        = String(c.req.query("type") || "").trim();
    const site        = String(c.req.query("site") || "").trim();
    const hasWebsite  = String(c.req.query("has_website") || "").toLowerCase() === "1";
    const hasFacebook = String(c.req.query("has_facebook") || "").toLowerCase() === "1";
    const page        = clamp(parseInt(c.req.query("page") || "1", 10) || 1, 1, 9999);
    const pageSizeReq = clamp(parseInt(c.req.query("page_size") || "18", 10) || 18, 6, 60);
    const sortKey     = safeSort(c.req.query("sort"));
    const sortOrder   = safeOrder(c.req.query("order"));

    const wh = [`is_published=1`];
    const args = [];

    if (eventId) { wh.push(`event_id=?${args.length + 1}`); args.push(eventId); }

    if (qStr) {
      // Search name, description, site, tel, email
      wh.push(`(name LIKE ?${args.length + 1} ESCAPE '\\'
            OR description LIKE ?${args.length + 2} ESCAPE '\\'
            OR site_no LIKE ?${args.length + 3} ESCAPE '\\'
            OR tel LIKE ?${args.length + 4} ESCAPE '\\'
            OR email LIKE ?${args.length + 5} ESCAPE '\\')`);
      const wrapped = likeWrap(qStr);
      args.push(wrapped, wrapped, wrapped, wrapped, wrapped);
    }

    if (type) {
      wh.push(`COALESCE(NULLIF(TRIM(stall_type),''),'Other') = ?${args.length + 1}`);
      args.push(type);
    }

    if (site) {
      wh.push(`site_no = ?${args.length + 1}`);
      args.push(site);
    }

    if (hasWebsite) {
      wh.push(`website IS NOT NULL AND TRIM(website) <> ''`);
    }
    if (hasFacebook) {
      wh.push(`facebook IS NOT NULL AND TRIM(facebook) <> ''`);
    }

    const where = "WHERE " + wh.join(" AND ");

    const totalRow = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM vendors ${where}`
    ).bind(...args).first();

    const total = totalRow?.n || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSizeReq));
    const pageSafe = clamp(page, 1, totalPages);
    const offset = (pageSafe - 1) * pageSizeReq;

    // Using identifiers directly for ORDER BY (whitelisted via safeSort/safeOrder)
    const rows = await c.env.DB.prepare(
      `SELECT id, slug, name, stall_type, site_no, tel, email,
              description, website, facebook, logo_url
         FROM vendors
        ${where}
        ORDER BY ${sortKey} COLLATE NOCASE ${sortOrder}
        LIMIT ${pageSizeReq} OFFSET ${offset}`
    ).bind(...args).all();

    // Defaults for fallback logos
    const defaultEventLogo = await c.env.DB.prepare(
      `SELECT value FROM site_settings WHERE key='DEFAULT_EVENT_LOGO_URL' LIMIT 1`
    ).first();

    return c.json({
      ok: true,
      page: pageSafe,
      page_size: pageSizeReq,
      total_pages: totalPages,
      total,
      items: rows.results || [],
      defaults: {
        event_logo: defaultEventLogo?.value || null,
        vendor_logo: null
      }
    }, { headers: { "Cache-Control": "max-age=60, stale-while-revalidate=300" }});
  });

  /* -------------------------- Single vendor fetch --------------------------- */

  // Fetch by numeric id or slug in one endpoint
  router.get("/api/public/vendor/:key", async (c) => {
    const { key } = c.req.param();
    const isId = /^\d+$/.test(key);

    const row = isId
      ? await c.env.DB.prepare(
          `SELECT id, slug, name, stall_type, site_no, tel, email,
                  description, website, facebook, logo_url, is_published
             FROM vendors
            WHERE id=?1 LIMIT 1`
        ).bind(Number(key)).first()
      : await c.env.DB.prepare(
          `SELECT id, slug, name, stall_type, site_no, tel, email,
                  description, website, facebook, logo_url, is_published
             FROM vendors
            WHERE slug=?1 LIMIT 1`
        ).bind(key).first();

    if (!row || !Number(row.is_published)) {
      return c.json({ ok: false, error: "not_found" }, 404);
    }

    return c.json({ ok: true, vendor: row }, {
      headers: { "Cache-Control": "max-age=120, stale-while-revalidate=600" }
    });
  });

  /* --------------------------- Random sampler ------------------------------ */

  // Small random selection for homepage carousels/grids
  router.get("/api/public/vendors/random", async (c) => {
    const eventId   = Number(c.req.query("event_id") || 0) || null;
    const limitReq  = clamp(parseInt(c.req.query("limit") || "6", 10) || 6, 1, 24);

    const wh = [`is_published=1`];
    const args = [];
    if (eventId) { wh.push(`event_id=?${args.length + 1}`); args.push(eventId); }
    const where = "WHERE " + wh.join(" AND ");

    // SQLite doesn't have ORDER BY RANDOM() perf issues at this small scale
    const rows = await c.env.DB.prepare(
      `SELECT id, slug, name, stall_type, site_no, logo_url
         FROM vendors
        ${where}
        ORDER BY RANDOM()
        LIMIT ${limitReq}`
    ).bind(...args).all();

    return c.json({ ok: true, items: rows.results || [] }, {
      headers: { "Cache-Control": "max-age=30, stale-while-revalidate=180" }
    });
  });

}
