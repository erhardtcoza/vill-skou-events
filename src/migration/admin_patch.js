// src/migrations/admin_patch.js
export async function runAdminMigration(env) {
  const DB = env.DB;

  async function tableExists(name) {
    const r = await DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?1`
    ).bind(name).first();
    return !!r;
  }

  async function getColumns(table) {
    const rows = await DB.prepare(`PRAGMA table_info(${table})`).all();
    const set = new Set();
    for (const r of (rows.results || [])) set.add(r.name);
    return set;
  }

  async function ensureTable(sql) {
    await DB.prepare(sql).run();
  }

  async function ensureIndex(sql) {
    await DB.prepare(sql).run();
  }

  async function ensureColumn(table, col, sqlAdd) {
    const cols = await getColumns(table);
    if (!cols.has(col)) {
      await DB.prepare(sqlAdd).run();
      return true;
    }
    return false;
  }

  // ------------- site_settings -------------
  if (!(await tableExists("site_settings"))) {
    await ensureTable(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  // ------------- wa_templates --------------
  if (!(await tableExists("wa_templates"))) {
    await ensureTable(`
      CREATE TABLE IF NOT EXISTS wa_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        language TEXT NOT NULL,
        status TEXT,
        category TEXT,
        components_json TEXT,
        updated_at INTEGER DEFAULT 0,
        UNIQUE(name, language)
      )
    `);
  }

  // ------------- orders extra columns ------
  if (await tableExists("orders")) {
    await ensureColumn("orders", "short_code",      `ALTER TABLE orders ADD COLUMN short_code TEXT`);
    await ensureColumn("orders", "payment_method",  `ALTER TABLE orders ADD COLUMN payment_method TEXT`);
    await ensureColumn("orders", "buyer_name",      `ALTER TABLE orders ADD COLUMN buyer_name TEXT`);
    await ensureColumn("orders", "buyer_email",     `ALTER TABLE orders ADD COLUMN buyer_email TEXT`);
    await ensureColumn("orders", "buyer_phone",     `ALTER TABLE orders ADD COLUMN buyer_phone TEXT`);
    await ensureColumn("orders", "paid_at",         `ALTER TABLE orders ADD COLUMN paid_at INTEGER`);

    // Optional: baseline fields if somehow missing (safe no-ops if present)
    await ensureColumn("orders", "created_at",      `ALTER TABLE orders ADD COLUMN created_at INTEGER`);
    await ensureColumn("orders", "updated_at",      `ALTER TABLE orders ADD COLUMN updated_at INTEGER`);
    await ensureColumn("orders", "status",          `ALTER TABLE orders ADD COLUMN status TEXT`);

    // Backfills / indexes (best-effort)
    await DB.prepare(`
      UPDATE orders SET payment_method = COALESCE(payment_method, method, 'cash')
      WHERE payment_method IS NULL
    `).run();

    await DB.prepare(`
      UPDATE orders SET paid_at = COALESCE(paid_at, created_at)
      WHERE (status='paid' OR status='refunded') AND paid_at IS NULL
    `).run();

    await ensureIndex(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_short_code ON orders(short_code)`);
    await ensureIndex(`CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at)`);
    await ensureIndex(`CREATE INDEX IF NOT EXISTS idx_orders_event_id ON orders(event_id)`);
  }

  // ------------- gates ---------------------
  if (!(await tableExists("gates"))) {
    await ensureTable(`
      CREATE TABLE IF NOT EXISTS gates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name TEXT NOT NULL
      )
    `);
    await ensureIndex(`CREATE INDEX IF NOT EXISTS idx_gates_event ON gates(event_id)`);
  }

  // ------------- vendors -------------------
  if (!(await tableExists("vendors"))) {
    await ensureTable(`
      CREATE TABLE IF NOT EXISTS vendors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        contact_name TEXT,
        phone TEXT,
        email TEXT,
        stand_number TEXT,
        staff_quota INTEGER DEFAULT 0,
        vehicle_quota INTEGER DEFAULT 0
      )
    `);
    await ensureIndex(`CREATE INDEX IF NOT EXISTS idx_vendors_event ON vendors(event_id)`);
  }

  // ------------- vendor_passes -------------
  if (!(await tableExists("vendor_passes"))) {
    await ensureTable(`
      CREATE TABLE IF NOT EXISTS vendor_passes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
        type TEXT CHECK(type IN ('staff','vehicle')) NOT NULL,
        label TEXT,
        vehicle_reg TEXT,
        qr TEXT UNIQUE NOT NULL,
        state TEXT CHECK(state IN ('unused','in','out','void')) DEFAULT 'unused',
        first_in_at INTEGER,
        last_out_at INTEGER,
        issued_at INTEGER DEFAULT (unixepoch())
      )
    `);
    await ensureIndex(`CREATE INDEX IF NOT EXISTS idx_vendor_passes_vendor ON vendor_passes(vendor_id)`);
  }

  // ------------- pos_sessions --------------
  if (!(await tableExists("pos_sessions"))) {
    await ensureTable(`
      CREATE TABLE IF NOT EXISTS pos_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        gate_id  INTEGER REFERENCES gates(id) ON DELETE SET NULL,
        cashier_name TEXT,
        opened_at INTEGER NOT NULL,
        closed_at INTEGER,
        closing_manager TEXT,
        opening_float_cents INTEGER DEFAULT 0
      )
    `);
    await ensureIndex(`CREATE INDEX IF NOT EXISTS idx_pos_sessions_event ON pos_sessions(event_id)`);
  }

  // ------------- pos_payments --------------
  if (!(await tableExists("pos_payments"))) {
    await ensureTable(`
      CREATE TABLE IF NOT EXISTS pos_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES pos_sessions(id) ON DELETE CASCADE,
        order_id   INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        method TEXT NOT NULL,            -- 'pos_cash' | 'pos_card' | etc.
        amount_cents INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
    await ensureIndex(`CREATE INDEX IF NOT EXISTS idx_pos_payments_session ON pos_payments(session_id)`);
    await ensureIndex(`CREATE INDEX IF NOT EXISTS idx_pos_payments_method  ON pos_payments(method)`);
  }

  // ------------- events extra (optional, if your table is minimal) --------
  if (await tableExists("events")) {
    await ensureColumn("events", "slug",         `ALTER TABLE events ADD COLUMN slug TEXT`);
    await ensureColumn("events", "venue",        `ALTER TABLE events ADD COLUMN venue TEXT`);
    await ensureColumn("events", "starts_at",    `ALTER TABLE events ADD COLUMN starts_at INTEGER`);
    await ensureColumn("events", "ends_at",      `ALTER TABLE events ADD COLUMN ends_at INTEGER`);
    await ensureColumn("events", "status",       `ALTER TABLE events ADD COLUMN status TEXT`);
    await ensureColumn("events", "hero_url",     `ALTER TABLE events ADD COLUMN hero_url TEXT`);
    await ensureColumn("events", "poster_url",   `ALTER TABLE events ADD COLUMN poster_url TEXT`);
    await ensureColumn("events", "gallery_urls", `ALTER TABLE events ADD COLUMN gallery_urls TEXT`);
    await ensureColumn("events", "created_at",   `ALTER TABLE events ADD COLUMN created_at INTEGER`);
    await ensureColumn("events", "updated_at",   `ALTER TABLE events ADD COLUMN updated_at INTEGER`);

    await ensureIndex(`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_slug ON events(slug)`);
    await ensureIndex(`CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at)`);
  }

  // ------------- users (basic) -------------
  if (!(await tableExists("users"))) {
    await ensureTable(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'admin'
      )
    `);
  }

  // ------------- light data hygiene -------
  // Generate short_code for existing orders if missing
  if (await tableExists("orders")) {
    await DB.prepare(`
      UPDATE orders
         SET short_code = LOWER(substr(hex(randomblob(4)),1,8))
       WHERE short_code IS NULL
    `).run();
  }

  return { ok: true };
}