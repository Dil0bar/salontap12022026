-- USERS
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT CHECK (
    role IN ('super_admin','salon_admin','master','client')
  ) NOT NULL DEFAULT 'client'
);


-- SALONS
CREATE TABLE IF NOT EXISTS salons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  short_desc TEXT,
  full_desc TEXT,
  photos TEXT,
  categories TEXT,
  lat REAL,
  lng REAL,
  FOREIGN KEY(owner_id) REFERENCES users(id)
);

-- MASTERS
CREATE TABLE IF NOT EXISTS masters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_id INTEGER,
  user_id INTEGER,
  name TEXT,
  FOREIGN KEY (salon_id) REFERENCES salons(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);



-- SERVICES
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  salon_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER,
  price INTEGER,
  category TEXT,
  FOREIGN KEY(salon_id) REFERENCES salons(id)
);

-- SERVICE ↔ MASTERS
CREATE TABLE IF NOT EXISTS service_masters (
  service_id INTEGER NOT NULL,
  master_id INTEGER NOT NULL,
  PRIMARY KEY (service_id, master_id),
  FOREIGN KEY(service_id) REFERENCES services(id),
  FOREIGN KEY(master_id) REFERENCES masters(id)
);



-- SCHEDULE
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  is_taken INTEGER NOT NULL DEFAULT 0,
  service_id INTEGER,
  price INTEGER,
  FOREIGN KEY(master_id) REFERENCES masters(id),
  FOREIGN KEY(service_id) REFERENCES services(id)
);

-- BOOKINGS

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  client_name TEXT,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  comment TEXT,
  status TEXT DEFAULT 'pending',

  confirm_code TEXT,
  confirm_expires_at TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(schedule_id) REFERENCES schedule(id)
);



CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT,
  entity TEXT,
  entity_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

UPDATE salons
SET categories = '["nails","hair","brows_lashes","barbershop","men_services"]'
WHERE name LIKE '%Bosco%';

UPDATE salons
SET categories = '["nails"]'
WHERE name LIKE '%Bloom%';


