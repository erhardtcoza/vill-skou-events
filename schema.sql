PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  venue TEXT,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  status TEXT CHECK(status IN ('draft','active','archived')) DEFAULT 'active',
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS ticket_types (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  price_cents INTEGER NOT NULL,
  capacity INTEGER NOT NULL,
  per_order_limit INTEGER DEFAULT 10,
  requires_gender INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  channel TEXT CHECK(channel IN ('online','pos')) NOT NULL,
  payment_method TEXT CHECK(payment_method IN ('yoco','cash')) NOT NULL,
  payment_ref TEXT,
  amount_cents INTEGER NOT NULL,
  status TEXT CHECK(status IN ('paid','refunded','void')) DEFAULT 'paid',
  buyer_name TEXT, buyer_email TEXT, buyer_phone TEXT,
  gate_id INTEGER, cashier_id INTEGER,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id INTEGER NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  attendee_first TEXT, attendee_last TEXT,
  gender TEXT CHECK(gender IN ('male','female','other')) NULL,
  email TEXT, phone TEXT,
  qr TEXT UNIQUE NOT NULL,
  state TEXT CHECK(state IN ('unused','in','out','void')) DEFAULT 'unused',
  first_in_at INTEGER, last_out_at INTEGER,
  issued_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  gate_id INTEGER NOT NULL,
  direction TEXT CHECK(direction IN ('in','out')) NOT NULL,
  device_id TEXT, scanned_at INTEGER DEFAULT (unixepoch()), note TEXT
);

CREATE TABLE IF NOT EXISTS gates (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT, username TEXT UNIQUE, role TEXT CHECK(role IN ('admin','manager','cashier','guard')) NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  label TEXT, role TEXT, gate_id INTEGER, last_seen INTEGER, user_id INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cashups (
  id INTEGER PRIMARY KEY,
  gate_id INTEGER NOT NULL REFERENCES gates(id),
  manager_id INTEGER NOT NULL REFERENCES users(id),
  opened_at INTEGER DEFAULT (unixepoch()), closed_at INTEGER,
  opening_float_cents INTEGER DEFAULT 0,
  cash_taken_cents INTEGER DEFAULT 0,
  card_taken_cents INTEGER DEFAULT 0,
  expected_cash_cents INTEGER DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS cashup_orders (
  cashup_id INTEGER NOT NULL REFERENCES cashups(id) ON DELETE CASCADE,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  PRIMARY KEY(cashup_id, order_id)
);

-- Vendors & passes
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT, phone TEXT, email TEXT,
  stand_number TEXT, staff_quota INTEGER DEFAULT 0, vehicle_quota INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS passes (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  kind TEXT CHECK(kind IN ('visitor','vendor_staff','vehicle','staff','vip')) NOT NULL,
  holder_name TEXT, phone TEXT, email TEXT, vehicle_reg TEXT,
  qr TEXT UNIQUE NOT NULL,
  state TEXT CHECK(state IN ('unused','in','out','void')) DEFAULT 'unused',
  first_in_at INTEGER, last_out_at INTEGER, issued_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS pass_scans (
  id INTEGER PRIMARY KEY,
  pass_id INTEGER NOT NULL REFERENCES passes(id) ON DELETE CASCADE,
  gate_id INTEGER NOT NULL,
  direction TEXT CHECK(direction IN ('in','out')) NOT NULL,
  device_id TEXT, scanned_at INTEGER DEFAULT (unixepoch()), note TEXT
);

-- Convenience indexes
CREATE INDEX IF NOT EXISTS idx_tickets_qr ON tickets(qr);
CREATE INDEX IF NOT EXISTS idx_scans_ticket ON scans(ticket_id);

-- Seed a few gates (editable in Admin)
INSERT OR IGNORE INTO gates(id,name) VALUES (1,'Main Gate'),(2,'Exhibitor Gate'),(3,'VIP Gate');
