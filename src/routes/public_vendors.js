// /src/routes/public_vendors.js
// Public vendor directory JSON endpoints.

function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function likeWrap(s){ return `%${s.replace(/[%_]/g, m => '\\'+m)}%`; }

export function mountPublicVendors(router){

  // Optional: event header for directory
  router.get('/api/public/event/header/:event_id', async (c)=>{
    const { event_id } = c.req.param();
    const row = await c.env.DB.prepare(
      `SELECT id, name, venue, logo_url,
              starts_at, ends_at
       FROM events WHERE id=?1 LIMIT 1`
    ).bind(event_id).first();
    if (!row) return c.json({ ok:false });
    const dates = (row.starts_at && row.ends_at)
      ? new Date(row.starts_at*1000).toLocaleDateString() + ' – ' + new Date(row.ends_at*1000).toLocaleDateString()
      : '';
    return c.json({ ok:true, event:{ id:row.id, name:row.name, venue:row.venue, logo_url:row.logo_url, dates } });
  });

  // If you have a "current" event concept:
  router.get('/api/public/event/current', async (c)=>{
    const row = await c.env.DB.prepare(
      `SELECT id, name, venue, logo_url, starts_at, ends_at
       FROM events ORDER BY starts_at DESC LIMIT 1`
    ).first();
    if (!row) return c.json({ ok:true, event:{} });
    const dates = (row.starts_at && row.ends_at)
      ? new Date(row.starts_at*1000).toLocaleDateString() + ' – ' + new Date(row.ends_at*1000).toLocaleDateString()
      : '';
    return c.json({ ok:true, event:{ id:row.id, name:row.name, venue:row.venue, logo_url:row.logo_url, dates } });
  });

  // Distinct stall types (categories)
  router.get('/api/public/vendors/types', async (c)=>{
    const eventId = Number(c.req.query('event_id')||0) || null;
    let q = `SELECT DISTINCT COALESCE(NULLIF(TRIM(stall_type),''),'Other') as t
             FROM vendors WHERE is_published=1`;
    const args = [];
    if (eventId){ q += ` AND event_id=?1`; args.push(eventId); }
    q += ` ORDER BY t COLLATE NOCASE`;
    const rows = await c.env.DB.prepare(q).bind(...args).all();
    return c.json({ ok:true, types: (rows.results||[]).map(r=>r.t).filter(Boolean) });
  });

  // Listing with pagination + search + filter
  router.get('/api/public/vendors', async (c)=>{
    const eventId = Number(c.req.query('event_id')||0) || null;
    const q = String(c.req.query('q')||'').trim();
    const type = String(c.req.query('type')||'').trim();
    const page = clamp(parseInt(c.req.query('page')||'1',10)||1, 1, 9999);
    const pageSize = 18;

    const wh = [`is_published=1`];
    const args = [];
    if (eventId){ wh.push(`event_id=?${args.length+1}`); args.push(eventId); }
    if (q){
      wh.push(`(name LIKE ?${args.length+1} ESCAPE '\\' OR description LIKE ?${args.length+2} ESCAPE '\\' OR site_no LIKE ?${args.length+3} ESCAPE '\\' OR tel LIKE ?${args.length+4} ESCAPE '\\')`);
      args.push(likeWrap(q), likeWrap(q), likeWrap(q), likeWrap(q));
    }
    if (type){
      wh.push(`COALESCE(NULLIF(TRIM(stall_type),''),'Other') = ?${args.length+1}`);
      args.push(type);
    }
    const where = 'WHERE ' + wh.join(' AND ');

    const totalRow = await c.env.DB.prepare(`SELECT COUNT(*) as n FROM vendors ${where}`).bind(...args).first();
    const total = totalRow?.n || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const offset = (page - 1) * pageSize;

    const rows = await c.env.DB.prepare(
      `SELECT id, name, stall_type, site_no, tel, email, description, website, facebook, logo_url
       FROM vendors
       ${where}
       ORDER BY name COLLATE NOCASE
       LIMIT ${pageSize} OFFSET ${offset}`
    ).bind(...args).all();

    // Defaults for fallback logos
    const defaultEventLogo = await c.env.DB.prepare(`SELECT value FROM site_settings WHERE key='DEFAULT_EVENT_LOGO_URL'`).first();

    return c.json({
      ok:true,
      page, total_pages: totalPages, total,
      items: rows.results || [],
      defaults: {
        event_logo: defaultEventLogo?.value || null,
        vendor_logo: null
      }
    }, { headers: { "Cache-Control": "max-age=60, stale-while-revalidate=300" }});
  });
}
