import { q, qi } from "../env.js";

export async function listEvents(db) {
  return await q(db, "SELECT * FROM events ORDER BY starts_at DESC");
}
export async function getEventBySlug(db, slug) {
  const rows = await q(db, "SELECT * FROM events WHERE slug=?", slug);
  return rows[0] || null;
}
export async function createEvent(db, e) {
  const id = await qi(db, `
    INSERT INTO events (slug,name,venue,starts_at,ends_at,status)
    VALUES (?,?,?,?,?,?)`,
    e.slug, e.name, e.venue, e.starts_at, e.ends_at, e.status || "active");
  return id;
}
export async function addTicketType(db, t) {
  const id = await qi(db, `
    INSERT INTO ticket_types (event_id,name,code,price_cents,capacity,per_order_limit,requires_gender)
    VALUES (?,?,?,?,?,?,?)`,
    t.event_id, t.name, t.code||null, t.price_cents, t.capacity, t.per_order_limit||10, t.requires_gender?1:0);
  return id;
}
export async function getCatalog(db, event_id) {
  const event = (await q(db,"SELECT * FROM events WHERE id=?", event_id))[0];
  const types = await q(db,"SELECT * FROM ticket_types WHERE event_id=? ORDER BY id", event_id);
  return { event, types };
}
