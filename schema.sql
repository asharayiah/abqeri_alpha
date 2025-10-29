-- Abqeri D1 schema — full set (idempotent)
CREATE TABLE IF NOT EXISTS forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT,
  email TEXT,
  message TEXT,
  plan TEXT,
  lang TEXT,
  ts TEXT NOT NULL,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_forms_kind_ts ON forms(kind, ts DESC);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  email TEXT,
  plan TEXT,
  amount REAL,
  currency TEXT,
  fee REAL,
  net_amount_usd REAL,
  status TEXT,
  created_at TEXT,
  raw TEXT
);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at DESC);

CREATE TABLE IF NOT EXISTS donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_id INTEGER,
  amount_usd REAL,
  computed_amount_usd REAL,
  status TEXT,
  created_at TEXT,
  FOREIGN KEY (txn_id) REFERENCES transactions(id)
);
CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(status);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS fx_rates (
  as_of TEXT, base TEXT, ccy TEXT, rate REAL,
  PRIMARY KEY (as_of, base, ccy)
);

CREATE TABLE IF NOT EXISTS qpc_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT,
  results TEXT,
  ts TEXT
);
	
-- users & sessions for Abqeri
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  salt TEXT NOT NULL,
  passhash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'rahma_free',
  trial_ends_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
