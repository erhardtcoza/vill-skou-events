// /src/routes/items.js
import { json } from '../utils/http.js';

export function mountItems(router, env){
  router.get('/api/items', async () => {
    const rows = await env.DB.prepare(`SELECT * FROM items WHERE active=1`).all();
    return json({ items: rows.results || [] });
  });
}
