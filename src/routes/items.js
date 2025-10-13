// /src/routes/items.js
import { json, bad } from '../utils/http.js';

export function mountItems(router, env) {
  // List items (optionally by category)
  router.get('/api/items', async (req) => {
    const url = new URL(req.url);
    const cat = url.searchParams.get('cat');
    const q = cat
      ? `SELECT * FROM items WHERE active=1 AND category=?1 ORDER BY name`
      : `SELECT * FROM items WHERE active=1 ORDER BY category,name`;
    const rows = cat
      ? await env.DB.prepare(q).bind(cat).all()
      : await env.DB.prepare(q).all();
    return json({ items: rows.results || [] });
  });

  // Create item (optional admin use)
  router.post('/api/items', async (req) => {
    const { id, name, category, price_cents } = await req.json();
    if (!id || !name || !category || !price_cents)
      return bad(400, "missing_fields");
    await env.DB.prepare(
      `INSERT INTO items(id,name,category,price_cents,active) VALUES(?1,?2,?3,?4,1)`
    ).bind(id, name, category, price_cents).run();
    return json({ ok: true, id });
  });
}
