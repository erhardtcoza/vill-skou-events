// /src/services/events.js

// Get a single event by slug (for public/shop)
export async function getEventBySlug(db, slug) {
  return await db
    .prepare(`SELECT id, slug, name, venue, starts_at, ends_at, status,
                     hero_url, poster_url, gallery_urls
              FROM events
              WHERE slug=?`)
    .bind(slug)
    .first();
}

// Public catalog for a given event: DO NOT filter on capacity.
// Treat capacity NULL/0 as "unlimited".
export async function getCatalog(db, eventId) {
  const event = await db
    .prepare(`SELECT id, slug, name, venue, starts_at, ends_at, status,
                     hero_url, poster_url, gallery_urls
              FROM events
              WHERE id=?`)
    .bind(eventId)
    .first();

  const tts = await db
    .prepare(`SELECT id, name, price_cents, requires_gender
              FROM ticket_types
              WHERE event_id=?
              ORDER BY id ASC`)
    .bind(eventId)
    .all();

  return {
    event,
    ticket_types: tts.results || []
  };
}
