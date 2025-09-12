PRAGMA foreign_keys = ON;

-- ---------------------------------------
-- Core site configuration
-- ---------------------------------------
CREATE TABLE IF NOT EXISTS site_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_site_settings_updated ON site_settings(updated_at);

-- ---------------------------------------
-- Events & tickets
-- ---------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  name       TEXT NOT NULL,
  venue      TEXT,
  starts_at  INTEGER,                 -- unix epoch (sec)
  ends_at    INTEGER,                 -- unix epoch (sec)
  status     TEXT DEFAULT 'active',   -- 'active' | 'closed' | 'draft'
  hero_url   TEXT,
  poster_url TEXT,
  gallery_urls TEXT                   -- JSON array of urls
);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_starts ON events(starts_at);

CREATE TABLE IF NOT EXISTS ticket_types (
  id              INTEGER PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  code            TEXT,
  price_cents     INTEGER NOT NULL DEFAULT 0,
  capacity        INTEGER NOT NULL DEFAULT 0,
  per_order_limit INTEGER,
  requires_gender INTEGER NOT NULL DEFAULT 0  -- 0/1
);

CREATE INDEX IF NOT EXISTS idx_ticket_types_event ON ticket_types(event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_types_code ON ticket_types(event_id, code);

-- ---------------------------------------
-- Orders / Payments
-- ---------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id  INTEGER NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  quantity        INTEGER NOT NULL DEFAULT 1,
  total_cents     INTEGER NOT NULL,

  -- legacy field kept for compatibility (POS used to write here)
  method          TEXT DEFAULT 'cash',            -- 'cash' | 'card' | 'yoco' | 'eft' …

  -- canonical fields used by routes/payments.js and public.js
  status          TEXT NOT NULL DEFAULT 'pending',-- 'pending' | 'awaiting_payment' | 'paid' | 'payment_failed' | 'refunded'
  payment_method  TEXT,                           -- 'online_yoco' | 'pos_cash' | 'pos_card' …
  paid_at         INTEGER,                        -- unix epoch (sec)

  -- buyer info (captured at checkout UI)
  buyer_name      TEXT,
  buyer_email     TEXT,
  buyer_phone     TEXT,

  -- short reference code shown to users & used in Yoco flows
  short_code      TEXT UNIQUE,

  -- gateway integration notes
  payment_ext_id  TEXT,
  payment_note    TEXT,

  created_at      INTEGER DEFAULT (unixepoch()),
  updated_at      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orders_event ON orders(event_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_short_code ON orders(short_code);

CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY,
  order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,                    -- negative = refund
  method       TEXT NOT NULL,                       -- 'online_yoco' | 'pos_cash' | 'pos_card' | …
  status       TEXT NOT NULL,                       -- 'approved' | 'failed' | 'pending'
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- ---------------------------------------
-- Tickets
-- ---------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
  id             INTEGER PRIMARY KEY,
  order_id       INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id INTEGER NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,

  attendee_first TEXT,
  attendee_last  TEXT,
  gender         TEXT CHECK(gender IN ('male','female','other')) NULL,
  email          TEXT,
  phone          TEXT,

  qr             TEXT UNIQUE NOT NULL,

  state          TEXT CHECK(state IN ('unused','in','out','void')) DEFAULT 'unused',
  first_in_at    INTEGER,
  last_out_at    INTEGER,
  issued_at      INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_tickets_event ON tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_tickets_order ON tickets(order_id);

-- ---------------------------------------
-- POS (optional session-level tracking)
-- ---------------------------------------
CREATE TABLE IF NOT EXISTS pos_payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method        TEXT NOT NULL,              -- 'pos_cash' | 'pos_card'
  amount_cents  INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pos_payments_order ON pos_payments(order_id);

-- ---------------------------------------
-- Gates (scanner UI expects /api/scan/gates)
-- ---------------------------------------
CREATE TABLE IF NOT EXISTS gates (
  id       INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gates_event ON gates(event_id);

-- ---------------------------------------
-- Passes (if you use staff/vendor passes)
-- ---------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  phone   TEXT,
  email   TEXT
);

CREATE TABLE IF NOT EXISTS passes (
  id          INTEGER PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id   INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  kind        TEXT CHECK(kind IN ('visitor','vendor_staff','vehicle','staff','vip')) NOT NULL,
  holder_name TEXT,
  phone       TEXT,
  email       TEXT,
  vehicle_reg TEXT,
  qr          TEXT UNIQUE NOT NULL,
  state       TEXT CHECK(state IN ('unused','in','out','void')) DEFAULT 'unused',
  first_in_at INTEGER,
  last_out_at INTEGER,
  issued_at   INTEGER DEFAULT (unixepoch())
);

-- ---------------------------------------
-- WhatsApp: templates + inbox
-- ---------------------------------------
CREATE TABLE IF NOT EXISTS wa_templates (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  language        TEXT NOT NULL,
  status          TEXT,                -- e.g. APPROVED
  category        TEXT,                -- e.g. MARKETING, UTILITY
  components_json TEXT,                -- JSON blob from Meta
  updated_at      INTEGER DEFAULT (unixepoch()),
  UNIQUE(name, language)
);

CREATE INDEX IF NOT EXISTS idx_wa_templates_status ON wa_templates(status);

-- inbound messages (from /api/whatsapp/webhook)
CREATE TABLE IF NOT EXISTS wa_inbox (
  id                       INTEGER PRIMARY KEY,
  wa_message_id            TEXT UNIQUE,     -- Meta message id
  from_msisdn              TEXT,            -- 27xxxxxxxxx
  to_msisdn                TEXT,            -- our number id (msisdn)
  timestamp                INTEGER,         -- epoch from webhook
  type                     TEXT,            -- text, image, button, etc.
  text                     TEXT,            -- normalized display text (if present)
  payload_json             TEXT,            -- raw JSON payload (stringified)
  auto_replied             INTEGER DEFAULT 0,     -- 0/1
  manual_replied           INTEGER DEFAULT 0,     -- 0/1
  auto_reply_message_id    TEXT,
  manual_reply_message_id  TEXT,
  created_at               INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_wa_inbox_from ON wa_inbox(from_msisdn);
CREATE INDEX IF NOT EXISTS idx_wa_inbox_created ON wa_inbox(created_at);

-- ---------------------------------------
-- Past visitors (marketing list; import + sync)
-- ---------------------------------------
CREATE TABLE IF NOT EXISTS past_visitors (
  id               INTEGER PRIMARY KEY,
  name             TEXT,
  phone            TEXT,          -- normalized MSISDN (27xxxxxxxxx)
  source           TEXT,          -- 'import:2025.csv' | 'orders:2025' | etc.
  created_at       INTEGER DEFAULT (unixepoch()),
  last_contacted_at INTEGER,
  notes            TEXT,
  UNIQUE(phone, source)           -- allows same phone from different sources but prevents dup within a source
);

CREATE INDEX IF NOT EXISTS idx_past_visitors_phone ON past_visitors(phone);