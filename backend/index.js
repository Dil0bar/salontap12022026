const express = require("express");
const bodyParser = require("body-parser");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const { notifyClient, notifyAdmin } = require("./notify");
function genCode(len = 4) {
  return Math.floor(
    Math.pow(10, len - 1) +
    Math.random() * 9 * Math.pow(10, len - 1)
  ).toString();
}

const categories = require("./categories");




const {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  JWT_SECRET,
  PORT
} = require("./config");

const TelegramBot =
  TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== "REPLACE_WITH_YOUR_NEW_TOKEN"
    ? require("node-telegram-bot-api")
    : null;

const bot = TelegramBot
  ? new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false })
  : null;

const app = express();

// ===== CATEGORIES =====
app.get("/api/categories", (req, res) => {
  res.json(categories);
});


app.use(
  "/admin",
  express.static(path.join(__dirname, "../frontend/admin"), { index: "index.html" })
);


// -------- middlewares --------
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors());
app.use(express.static(path.join(__dirname, "../frontend")));

const { db, runAsync, getAsync, allAsync } = require("./db");

const initPath = path.join(__dirname, "db_init.sql");
if (!fs.existsSync(initPath)) {
  console.error("Missing db_init.sql in backend folder.");
  process.exit(1);
}
const initSql = fs.readFileSync(initPath, "utf8");
db.exec(initSql, (err) => {
  if (err) console.error("DB init exec error:", err);
});


// -------- ensure salons table + columns --------
db.all("PRAGMA table_info(salons)", (err, cols) => {
  if (err) {
    console.error("PRAGMA table_info(salons) error", err);
    return;
  }

  // если таблицы нет (cols = []), создаём с нужными полями
  if (!cols || cols.length === 0) {
    console.log("Table 'salons' not found. Creating...");
    db.run(
      `CREATE TABLE IF NOT EXISTS salons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        address TEXT,
        short_desc TEXT,
        full_desc TEXT,
        photos TEXT,
        categories TEXT,
        FOREIGN KEY(owner_id) REFERENCES users(id)
      );`,
      (e) => {
        if (e) console.error("Create salons table error", e);
        else console.log("Table 'salons' created");
      }
    );
    return;
  }

  
  const hasPhotos = cols.some((c) => c.name === "photos");
  const hasCategories = cols.some((c) => c.name === "categories");

  if (!hasPhotos) {
    db.run("ALTER TABLE salons ADD COLUMN photos TEXT", (e) => {
      if (e) console.error("Failed to add photos column", e);
      else console.log("Added photos column to salons table");
    });
  }
  if (!hasCategories) {
    db.run("ALTER TABLE salons ADD COLUMN categories TEXT", (e) => {
      if (e) console.error("Failed to add categories column", e);
      else console.log("Added categories column to salons table");
    });
  }
});

// -------- auth middleware --------
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Missing auth" });
  const token = header.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied" });
    }
    next();
  };
}

app.get(
  "/api/admin/users",
  authMiddleware,
  allowRoles("super_admin"),
  async (req, res) => {
    const users = await allAsync(
      "SELECT id, email, role FROM users"
    );
    res.json(users);
  }
);





// ========== AUTH ==========

// signup
app.post("/api/signup", async (req, res) => {

  const { email, password, role } = req.body;
  const userRole = role === "salon_admin" ? "salon_admin" : "client";


  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);

    db.run(
      "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'client')",
      [email, hash],
      function (err) {
        if (err) {
          return res.status(400).json({ error: "User exists or DB error" });
        }

        // ✅ роль ЯВНО кладём в токен
        const token = jwt.sign(
          {
            id: this.lastID,
            email,
            role: "client"

          },
          JWT_SECRET
        );

        res.json({ ok: true, token });
      }
    );
  } catch (e) {
    console.error("Signup error", e);
    res.status(500).json({ error: "Server error" });
  }
});


// login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  db.get(
    "SELECT * FROM users WHERE email = ?",
    [email],
    async (err, row) => {
      if (err || !row)
        return res.status(400).json({ error: "Invalid credentials" });
      try {
        const match = await bcrypt.compare(password, row.password_hash);
        if (!match)
          return res.status(400).json({ error: "Invalid credentials" });
        const token = jwt.sign(
          { id: row.id, email: row.email, role: row.role },
          JWT_SECRET
        );
        res.json({ ok: true, token });
      } catch (e) {
        res.status(500).json({ error: "Server error" });
      }
    }
  );
});



// ========== SALONS ==========

// create salon (owner, with categories + photos)
app.post(
  "/api/salons",
  authMiddleware,
  allowRoles("salon_admin"),
  (req, res) => {

    const {
      name,
      address,
      short_desc,
      full_desc,
      photos,
      categories,
      lat,
      lng
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "name required" });
    }

    const photosJson = Array.isArray(photos)
      ? JSON.stringify(photos)
      : null;

    const categoriesJson = Array.isArray(categories)
      ? JSON.stringify(categories)
      : "[]";

    db.run(
      `
      INSERT INTO salons
      (owner_id, name, address, short_desc, full_desc, photos, categories, lat, lng)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        req.user.id,
        name,
        address || "",
        short_desc || "",
        full_desc || "",
        photosJson,
        categoriesJson,
        lat || null,
        lng || null
      ],
      function (err) {
        if (err) {
          console.error("Insert salon err", err);
          return res.status(500).json({ error: "DB error" });
        }

        res.json({
          ok: true,
          salon_id: this.lastID

        });
      }
    );
  }
);


// get salons list (public) - parse photos + categories
app.get("/api/salons", (req, res) => {
  db.all("SELECT * FROM salons", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });
    const parsed = rows.map((r) => {
      try {
        r.photos = r.photos ? JSON.parse(r.photos) : [];
      } catch (e) {
        r.photos = [];
      }
      try {
        r.categories = r.categories ? JSON.parse(r.categories) : [];
      } catch (e) {
        r.categories = [];
      }
      return r;
    });
    res.json(parsed);
  });
});


app.get(
  "/api/admin/my-salons",
  authMiddleware,
  allowRoles("salon_admin"),
  async (req, res) => {
    const salons = await allAsync(
      `SELECT s.* 
       FROM salons s
       WHERE s.owner_id = ?`,
      [req.user.id]
    );

    salons.forEach(s => {
      s.categories = s.categories ? JSON.parse(s.categories) : [];
    });

    res.json(salons);
  }
);


// salons with services + masters
app.get("/api/salons/full", async (req, res) => {
  try {
    const salons = await allAsync("SELECT * FROM salons", []);
    for (const s of salons) {
      try {
        s.photos = s.photos ? JSON.parse(s.photos) : [];
      } catch (e) {
        s.photos = [];
      }
      try {
        s.categories = s.categories ? JSON.parse(s.categories) : [];
      } catch (e) {
        s.categories = [];
      }
      s.services = await allAsync(
        "SELECT * FROM services WHERE salon_id = ?",
        [s.id]
      );
      s.masters = await allAsync(
        "SELECT * FROM masters WHERE salon_id = ?",
        [s.id]
      );
    }
    res.json(salons);
  } catch (e) {
    console.error("salons/full error", e);
    res.status(500).json({ error: "DB error" });
  }
});

app.get("/api/salons/:id/masters/status", async (req,res)=>{
  const rows = await allAsync(`
    SELECT m.id, m.name,
           COUNT(s.id) AS free_slots
    FROM masters m
    LEFT JOIN schedule s
      ON s.master_id = m.id
     AND s.is_taken = 0
     AND s.is_blocked = 0
    WHERE m.salon_id = ?
    GROUP BY m.id
  `,[req.params.id]);

  res.json(rows);
});


app.get("/api/salons/:id/stats", async (req,res)=>{
  const rows = await allAsync(`
    SELECT m.name, COUNT(b.id) AS total
    FROM bookings b
    JOIN schedule s ON b.schedule_id = s.id
    JOIN masters m ON s.master_id = m.id
    WHERE m.salon_id = ?
    GROUP BY m.id
  `,[req.params.id]);

  res.json(rows);
});


// get salon details with masters (parse photos + categories)
app.get("/api/salons/:id", (req, res) => {
  const id = req.params.id;
  db.get("SELECT * FROM salons WHERE id = ?", [id], (err, salon) => {
    if (err || !salon) return res.status(404).json({ error: "Not found" });
    try {
      salon.photos = salon.photos ? JSON.parse(salon.photos) : [];
    } catch (e) {
      salon.photos = [];
    }
    try {
      salon.categories = salon.categories
        ? JSON.parse(salon.categories)
        : [];
    } catch (e) {
      salon.categories = [];
    }
    db.all(
      "SELECT * FROM masters WHERE salon_id = ?",
      [id],
      (err2, masters) => {
        if (err2) return res.status(500).json({ error: "DB error" });
        res.json({ salon, masters });
      }
    );
  });
});

// ========== MASTERS ==========



// получить слоты мастера с услугами
// получить слоты мастера с ценой слота
app.get(
  "/api/masters/:id/schedule/full",
  authMiddleware,
  allowRoles("salon_admin", "master"),
  async (req, res) => {
    const master_id = req.params.id;

    if (req.user.role === "master") {
      const m = await getAsync(
        "SELECT id FROM masters WHERE user_id = ?",
        [req.user.id]
      );
      if (!m || m.id != master_id) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const rows = await allAsync(`
      SELECT 
        sch.id,
        sch.date,
        sch.time,
        sch.is_taken,
        sch.is_blocked,
        sch.price AS price,
        srv.name  AS service_name,
        m.name    AS master_name,

        b.client_name,
        b.client_phone

      FROM schedule sch
      JOIN services srv ON sch.service_id = srv.id
      JOIN masters m    ON sch.master_id = m.id
      LEFT JOIN bookings b ON b.schedule_id = sch.id   -- ВАЖНО

      WHERE sch.master_id = ?
      ORDER BY sch.date, sch.time
    `, [master_id]);



    res.json(rows);
  }
);


// получить услуги салона
app.get("/api/salons/:id/services", async (req, res) => {
  try {
    const rows = await allAsync(
      "SELECT * FROM services WHERE salon_id = ? ORDER BY id DESC",
      [req.params.id]
    );
    res.json(rows || []);
  } catch (e) {
    console.error("Get salon services error", e);
    res.status(500).json({ error: "DB error" });
  }
});

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}


app.get("/api/masters/:id/services", async (req, res) => {
  const { id } = req.params;

  const rows = await allAsync(`
    SELECT DISTINCT
      srv.id,
      srv.name
    FROM schedule sch
    JOIN services srv ON sch.service_id = srv.id
    WHERE sch.master_id = ?
    ORDER BY srv.name
  `, [id]);

  res.json(rows);
});


app.delete("/api/services/:id", authMiddleware, async (req, res) => {
  const service_id = req.params.id;

  try {
    const service = await getAsync(
      "SELECT * FROM services WHERE id = ?",
      [service_id]
    );
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    const salon = await getAsync(
      "SELECT * FROM salons WHERE id = ?",
      [service.salon_id]
    );

    // 🔐 ВАЖНО: либо super_admin, либо владелец салона
    if (
      req.user.role !== "super_admin" &&
      salon.owner_id !== req.user.id
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await runAsync(
      "DELETE FROM service_masters WHERE service_id = ?",
      [service_id]
    );

    await runAsync(
      "DELETE FROM schedule WHERE service_id = ?",
      [service_id]
    );

    await runAsync(
      "DELETE FROM services WHERE id = ?",
      [service_id]
    );

    res.json({ ok: true });

  } catch (e) {
    console.error("Delete service error", e);
    res.status(500).json({ error: "DB error" });
  }
});




// add master (only owner)
app.post("/api/salons/:id/masters", authMiddleware, allowRoles("salon_admin"), (req, res) => {
  const salon_id = req.params.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  db.get(
    "SELECT * FROM salons WHERE id = ?",
    [salon_id],
    (err, salon) => {
      if (err || !salon)
        return res.status(404).json({ error: "Salon not found" });
      if (salon.owner_id !== req.user.id)
        return res.status(403).json({ error: "Forbidden" });

      db.run(
        "INSERT INTO masters (salon_id, name) VALUES (?, ?)",
        [salon_id, name],
        function (err2) {
          if (err2) return res.status(500).json({ error: "DB error" });
          res.json({ ok: true, master_id: this.lastID });
        }
      );
    }
  );
});


app.put("/api/salons/:id", authMiddleware, async (req,res)=>{
  const id = req.params.id;

  const {name, short_desc, full_desc, address, lat, lng} = req.body;

  await db.run(`
    UPDATE salons
    SET name=?,
        short_desc=?,
        full_desc=?,
        address=?,
        lat=?,
        lng=?
    WHERE id=?`,
    [name, short_desc, full_desc, address, lat, lng, id]
  );

  res.json({ok:true});
});


// update master (owner only)
app.put("/api/masters/:id", authMiddleware, (req, res) => {
  const master_id = req.params.id;
  const { name } = req.body;
  db.get(
    "SELECT m.*, s.owner_id FROM masters m JOIN salons s ON m.salon_id = s.id WHERE m.id = ?",
    [master_id],
    (err, row) => {
      if (err || !row)
        return res.status(404).json({ error: "Master not found" });
      if (row.owner_id !== req.user.id)
        return res.status(403).json({ error: "Forbidden" });

      db.run(
        "UPDATE masters SET name = ? WHERE id = ?",
        [name, master_id],
        function (err2) {
          if (err2) return res.status(500).json({ error: "DB error" });
          res.json({ ok: true });
        }
      );
    }
  );
});

// delete master (owner only)
app.delete("/api/masters/:id", authMiddleware, async (req, res) => {
  const master_id = req.params.id;

  const master = await getAsync(
    "SELECT m.*, s.owner_id FROM masters m JOIN salons s ON m.salon_id = s.id WHERE m.id = ?",
    [master_id]
  );

  if (!master) {
    return res.status(404).json({ error: "Master not found" });
  }

  if (
    req.user.role !== "super_admin" &&
    master.owner_id !== req.user.id
  ) {
    return res.status(403).json({ error: "Forbidden" });
  }

  await runAsync("DELETE FROM schedule WHERE master_id = ?", [master_id]);
  await runAsync("DELETE FROM service_masters WHERE master_id = ?", [master_id]);
  await runAsync("DELETE FROM masters WHERE id = ?", [master_id]);

  res.json({ ok: true });
});


// list all masters (public)
app.get("/api/masters", async (req, res) => {
  try {
    const rows = await allAsync("SELECT * FROM masters", []);
    res.json(rows || []);
  } catch (e) {
    console.error("Get masters err", e);
    res.status(500).json({ error: "DB error" });
  }
});

// ========== SERVICES ==========

// assign master to a service (owner)
app.post("/api/services/:serviceId/assign", authMiddleware, async (req, res) => {
  try {
    const serviceId = req.params.serviceId;
    const { master_id } = req.body;

    if (!master_id) {
      return res.status(400).json({ error: "master_id required" });
    }

    const service = await getAsync(
      "SELECT * FROM services WHERE id = ?",
      [serviceId]
    );
    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    const salon = await getAsync(
      "SELECT * FROM salons WHERE id = ?",
      [service.salon_id]
    );
    if (!salon || salon.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await runAsync(
      "INSERT OR IGNORE INTO service_masters (service_id, master_id) VALUES (?, ?)",
      [serviceId, master_id]
    );
    const duration = service.duration_minutes || 0;

    res.json({ ok: true });
  } catch (e) {
    console.error("assign service→master error", e);
    res.status(500).json({ error: "DB error" });
  }
});

// получить мастеров, привязанных к услуге (public)
app.get("/api/services/:serviceId/masters", async (req, res) => {
  try {
    const serviceId = req.params.serviceId;
    const rows = await allAsync(
      `SELECT m.* 
       FROM masters m
       JOIN service_masters sm ON sm.master_id = m.id
       WHERE sm.service_id = ?`,
      [serviceId]
    );
    res.json(rows || []);
  } catch (e) {
    console.error("Get service masters err", e);
    res.status(500).json({ error: "DB error" });
  }
});



// создать услугу
// ========== CREATE SERVICE (WITH MASTERS REQUIRED) ==========
app.post(
  "/api/services",
  authMiddleware,
  allowRoles("salon_admin"),
  async (req, res) => {
    try {
      const { salon_id, name, duration_minutes, categories } = req.body;

      if (!salon_id || !name || !duration_minutes) {
        return res.status(400).json({ error: "Missing fields" });
      }

      const salon = await getAsync(
        "SELECT * FROM salons WHERE id = ?",
        [salon_id]
      );

      if (!salon) {
        return res.status(404).json({ error: "Salon not found" });
      }

      if (salon.owner_id !== req.user.id && req.user.role !== "super_admin") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const categoriesJson = Array.isArray(categories)
        ? JSON.stringify(categories)
        : "[]";

      const r = await runAsync(
        `
        INSERT INTO services
        (salon_id, name, duration_minutes, category)
        VALUES (?, ?, ?, ?)
        `,
        [
          salon_id,
          name,
          duration_minutes,
          categoriesJson
        ]
      );

      res.json({
        ok: true,
        service_id: r.lastID
      });

    } catch (e) {
      console.error("Create service error", e);
      res.status(500).json({ error: "DB error" });
    }
  }
);


// ========== SCHEDULE ==========

// get schedule for a master (owner)
// создать слоты расписания для мастера (owner)
app.post(
  "/api/masters/:id/schedule",
  authMiddleware,
  allowRoles("salon_admin"),
  async (req, res) => {
    const master_id = Number(req.params.id);
    const { service_id, slots } = req.body;

    if (!service_id || !Array.isArray(slots) || !slots.length) {
      return res.status(400).json({ error: "service_id and slots required" });
    }

    try {
      // 1. мастер + салон
      const master = await getAsync(
        `SELECT m.*, s.owner_id, s.id AS salon_id
         FROM masters m
         JOIN salons s ON m.salon_id = s.id
         WHERE m.id = ?`,
        [master_id]
      );

      if (!master)
        return res.status(404).json({ error: "Master not found" });

      if (master.owner_id !== req.user.id)
        return res.status(403).json({ error: "Forbidden" });

      // 2. услуга
      const service = await getAsync(
        "SELECT * FROM services WHERE id = ?",
        [service_id]
      );

      if (!service)
        return res.status(404).json({ error: "Service not found" });

      if (service.salon_id !== master.salon_id)
        return res.status(400).json({ error: "Different salons" });

      const duration = service.duration_minutes || 0;

      // 3. слоты
      for (const s of slots) {
        const start = timeToMinutes(s.time);
        const end = start + duration;

        const conflicts = await allAsync(
          `
          SELECT sch.time, srv.duration_minutes
          FROM schedule sch
          JOIN services srv ON sch.service_id = srv.id
          WHERE sch.master_id = ?
            AND sch.date = ?
            AND sch.is_blocked = 0
          `,
          [master_id, s.date]
        );

        const hasOverlap = conflicts.some(c => {
          const cStart = timeToMinutes(c.time);
          const cEnd = cStart + (c.duration_minutes || 0);
          return start < cEnd && end > cStart;
        });

        if (hasOverlap) {
          return res.status(400).json({
            error: `Слот ${s.date} ${s.time} пересекается`
          });
        }

        

        await runAsync(
          `
          INSERT INTO schedule
          (master_id, service_id, date, time, price, is_taken, is_blocked)
          VALUES (?, ?, ?, ?, ?, 0, 0)
          `,
          [master_id, service_id, s.date, s.time, s.price]
        );

      }

      res.json({ ok: true });

    } catch (e) {
      console.error("Create schedule error", e);
      res.status(500).json({ error: "DB error" });
    }
  }
);




// delete schedule slot (owner)
app.delete("/api/schedule/:id", authMiddleware, (req, res) => {
  const slot_id = req.params.id;
  db.get(
    `SELECT s.*, m.salon_id, salon.owner_id as owner_id
     FROM schedule s
     JOIN masters m ON s.master_id = m.id
     JOIN salons salon ON m.salon_id = salon.id
     WHERE s.id = ?`,
    [slot_id],
    (err, row) => {
      if (err || !row)
        return res.status(404).json({ error: "Slot not found" });
      if (row.owner_id !== req.user.id)
        return res.status(403).json({ error: "Forbidden" });
      if (row.is_taken)
        return res
          .status(400)
          .json({ error: "Cannot delete taken slot" });

      db.run(
        "DELETE FROM schedule WHERE id = ?",
        [slot_id],
        function (err2) {
          if (err2) return res.status(500).json({ error: "DB error" });
          res.json({ ok: true });
        }
      );
    }
  );
});



// book a slot (public)
// app.post("/api/book", async (req, res) => {
//   const { schedule_id, client_name, client_phone } = req.body;

//   if (!schedule_id || !client_phone) {
//     return res.status(400).json({ error: "schedule_id and client_phone required" });
//   }

//   const slot = await getAsync(`
//     SELECT s.*, m.name AS master_name, sa.name AS salon_name
//     FROM schedule s
//     JOIN masters m ON s.master_id = m.id
//     JOIN salons sa ON m.salon_id = sa.id
//     WHERE s.id = ?
//   `, [schedule_id]);

//   if (!slot) return res.status(404).json({ error: "Slot not found" });
//   if (slot.is_taken) return res.status(400).json({ error: "Slot already taken" });

//   // ✅ создаём запись СРАЗУ confirmed
//   const r = await runAsync(`
//     INSERT INTO bookings
//     (schedule_id, client_name, client_phone, status)
//     VALUES (?, ?, ?, 'confirmed')
//   `, [
//     schedule_id,
//     client_name || "",
//     client_phone
//   ]);

//   // ✅ занимаем слот
//   await runAsync(
//     "UPDATE schedule SET is_taken = 1 WHERE id = ?",
//     [schedule_id]
//   );

//   // 📩 Telegram = основное подтверждение
//   await notifyAdmin(
// `🆕 НОВАЯ ЗАПИСЬ

// Салон: ${slot.salon_name}
// Мастер: ${slot.master_name}
// Дата: ${slot.date}
// Время: ${slot.time}

// Клиент: ${client_name || "—"}
// Телефон: ${client_phone}`
//   );

//   res.json({ ok: true, booking_id: r.lastID });
// });

app.post("/api/book", async (req, res) => {
  const { schedule_id, client_name, client_phone, client_email, comment, services, total_price} = req.body;

  if (!schedule_id || !client_phone) {
    return res.status(400).json({
      error: "schedule_id and client_phone required"
    });
  }

  const slot = await getAsync(`
    SELECT s.id, s.service_id, s.master_id, s.date, s.time,
           s.is_taken, s.is_blocked,
           m.name AS master_name,
           sa.name AS salon_name
    FROM schedule s
    JOIN masters m ON s.master_id = m.id
    JOIN salons sa ON m.salon_id = sa.id
    WHERE s.id = ?
  `, [schedule_id]);

  if (!slot) return res.status(404).json({ error: "Slot not found" });
  if (slot.is_blocked) return res.status(400).json({ error: "Slot is blocked" });
  if (slot.is_taken) return res.status(400).json({ error: "Slot already taken" });

  // СОЗДАЁМ BOOKING С НОРМАЛЬНЫМИ ПОЛЯМИ
  const r = await runAsync(`
    INSERT INTO bookings
    (schedule_id, client_name, client_phone, client_email, comment, status)
    VALUES (?, ?, ?, ?, ?, 'confirmed')
  `, [
    schedule_id,
    client_name || "",
    client_phone,
    client_email || "",
    comment || ""
  ]);

  await runAsync(
    "UPDATE schedule SET is_taken = 1 WHERE id = ?",
    [schedule_id]
  );

  await notifyAdmin(`
🆕 НОВАЯ ЗАПИСЬ

💇 Салон: ${slot.salon_name}
👤 Мастер: ${slot.master_name}
📅 ${slot.date} ${slot.time}

💄 Услуги: ${(services || []).join(", ")}
💰 Итого: ${(total_price || 0).toLocaleString()} сум

🙍 Клиент: ${client_name || "—"}
📞 ${client_phone}
📧 ${client_email || "—"}
💬 ${comment || "—"}
`);

  res.json({ ok: true, booking_id: r.lastID });
});





// BOOK без логина + подтверждение
// app.post("/api/book/confirm", async (req, res) => {
//   const { booking_id, code } = req.body;

//   if (!booking_id || !code) {
//     return res.status(400).json({ error: "booking_id and code required" });
//   }

//   const booking = await getAsync(
//     `SELECT * FROM bookings WHERE id = ?`,
//     [booking_id]
//   );

//   if (!booking) {
//     return res.status(404).json({ error: "Booking not found" });
//   }

//   if (booking.status !== "pending") {
//     return res.status(400).json({ error: "Booking already confirmed" });
//   }

//   if (booking.confirm_code !== code) {
//     return res.status(400).json({ error: "Неверный код" });
//   }

//   if (new Date(booking.confirm_expires_at) < new Date()) {
//     return res.status(400).json({ error: "Код истёк" });
//   }

//   // ✅ подтверждаем
//   await runAsync(
//     "UPDATE bookings SET status = 'confirmed' WHERE id = ?",
//     [booking_id]
//   );

//   // ✅ занимаем слот
//   await runAsync(
//     "UPDATE schedule SET is_taken = 1 WHERE id = ?",
//     [booking.schedule_id]
//   );

//   res.json({ ok: true });
// });





// get bookings for a salon (owner only)
function clientTokenMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.scope !== "client_bookings") throw new Error("bad scope");
    req.clientPhone = payload.phone;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// все доступные слоты салона (публично)
app.get("/api/salons/:id/slots", async (req, res) => {
  const { service } = req.query;

  let sql = `
    SELECT 
      sch.id,
      sch.date,
      sch.time,
      sch.price,
      srv.id   AS service_id,
      srv.name AS service_name,
      m.id     AS master_id,
      m.name   AS master_name
    FROM schedule sch
    JOIN services srv ON sch.service_id = srv.id
    JOIN masters m ON sch.master_id = m.id
    WHERE m.salon_id = ?
      AND sch.is_taken = 0
      AND sch.is_blocked = 0
  `;

  const params = [req.params.id];

  if (service) {
    sql += " AND srv.id = ?";
    params.push(service);
  }

  sql += " ORDER BY sch.date, sch.time";

  const rows = await allAsync(sql, params);
  res.json(rows);
});




app.get("/api/my/bookings", clientTokenMiddleware, async (req, res) => {
  try {
    const rows = await allAsync(`
      SELECT 
        b.id as booking_id, b.status, b.created_at, b.client_name, b.client_phone,
        s.date, s.time,
        m.name as master_name,
        sa.name as salon_name, sa.id as salon_id
      FROM bookings b
      JOIN schedule s ON b.schedule_id = s.id
      JOIN masters m ON s.master_id = m.id
      JOIN salons sa ON m.salon_id = sa.id
      WHERE b.client_phone = ?
      ORDER BY b.created_at DESC
    `, [req.clientPhone]);

    res.json(rows || []);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "DB error" });
  }
});







async function audit(user_id, action, entity, entity_id) {
  await runAsync(
    "INSERT INTO audit_log (user_id, action, entity, entity_id) VALUES (?, ?, ?, ?)",
    [user_id, action, entity, entity_id]
  );
}


// УДАЛЕНИЕ ПОЛЬЗОВАТЕЛЯ (super_admin)
app.delete(
  "/api/admin/users/:id",
  authMiddleware,
  allowRoles("super_admin"),
  async (req, res) => {
    const user_id = req.params.id;

    // ❗ запрещаем удалять самого себя
    if (Number(user_id) === req.user.id) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }

    await runAsync("DELETE FROM users WHERE id = ?", [user_id]);

    // ✅ AUDIT
    await audit(req.user.id, "DELETE", "USER", user_id);

    res.json({ ok: true });
  }
);


// СМЕНА РОЛИ ПОЛЬЗОВАТЕЛЯ (super_admin)
app.put(
  "/api/admin/users/:id/role",
  authMiddleware,
  allowRoles("super_admin"),
  async (req, res) => {
    const { role } = req.body;
    const userId = req.params.id;

    const allowed = ["client", "salon_admin", "master"];
    if (!allowed.includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    await runAsync(
      "UPDATE users SET role = ? WHERE id = ?",
      [role, userId]
    );

    await audit(req.user.id, "UPDATE_ROLE", "USER", userId);

    res.json({ ok: true });
  }
);



// УДАЛЕНИЕ САЛОНА (super_admin)
app.delete(
  "/api/admin/salons/:id",
  authMiddleware,
  allowRoles("super_admin"),
  async (req, res) => {
    const salon_id = req.params.id;

    await runAsync(`
      DELETE FROM bookings
      WHERE schedule_id IN (
        SELECT s.id FROM schedule s
        JOIN masters m ON s.master_id = m.id
        WHERE m.salon_id = ?
      )
    `, [salon_id]);

    await runAsync(`
      DELETE FROM schedule
      WHERE master_id IN (
        SELECT id FROM masters WHERE salon_id = ?
      )
    `, [salon_id]);

    await runAsync("DELETE FROM masters WHERE salon_id = ?", [salon_id]);
    await runAsync("DELETE FROM services WHERE salon_id = ?", [salon_id]);
    await runAsync("DELETE FROM salons WHERE id = ?", [salon_id]);

    // ✅ AUDIT
    await audit(req.user.id, "DELETE", "SALON", salon_id);

    res.json({ ok: true });
  }
);

// УДАЛЕНИЕ ЗАПИСИ (BOOKING) (superadmin)
app.delete(
  "/api/admin/bookings/:id",
  authMiddleware,
  allowRoles("super_admin"),
  async (req, res) => {
    const booking_id = req.params.id;

    const booking = await getAsync(
      "SELECT schedule_id FROM bookings WHERE id = ?",
      [booking_id]
    );

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    // освобождаем слот
    await runAsync(
      "UPDATE schedule SET is_taken = 0 WHERE id = ?",
      [booking.schedule_id]
    );

    await runAsync("DELETE FROM bookings WHERE id = ?", [booking_id]);

    // ✅ AUDIT
    await audit(req.user.id, "DELETE", "BOOKING", booking_id);

    res.json({ ok: true });
  }
);





app.get(
  "/api/admin/bookings",
  authMiddleware,
  allowRoles("super_admin"),
  async (req, res) => {
    try {
      const rows = await allAsync(`
        SELECT
          b.id              AS booking_id,
          b.status,
          b.created_at,
          b.client_name,
          b.client_phone,

          s.date,
          s.time,

          srv.name          AS service_name,
          srv.price         AS service_price,

          m.id              AS master_id,
          m.name            AS master_name,

          sa.id             AS salon_id,
          sa.name           AS salon_name,
          sa.address        AS salon_address,

          u.email           AS salon_owner_email

        FROM bookings b
        JOIN schedule s ON b.schedule_id = s.id
        JOIN services srv ON s.service_id = srv.id
        JOIN masters m  ON s.master_id = m.id
        JOIN salons sa  ON m.salon_id = sa.id
        JOIN users u    ON sa.owner_id = u.id
        

        ORDER BY b.created_at DESC
      `);

      res.json(rows);
    } catch (e) {
      console.error("admin bookings error", e);
      res.status(500).json({ error: "DB error" });
    }
  }
);


// API: заблокировать слот
app.put(
  "/api/admin/schedule/:id/block",
  authMiddleware,
  allowRoles("super_admin"),
  async (req, res) => {
    const slot_id = req.params.id;

    await runAsync(
      "UPDATE schedule SET is_blocked = 1 WHERE id = ?",
      [slot_id]
    );

    // ✅ AUDIT
    await audit(req.user.id, "BLOCK", "SCHEDULE_SLOT", slot_id);

    res.json({ ok: true });
  }
);

// API: разблокировать слот
app.put(
  "/api/admin/schedule/:id/unblock",
  authMiddleware,
  allowRoles("super_admin"),
  async (req, res) => {
    const slot_id = req.params.id;

    await runAsync(
      "UPDATE schedule SET is_blocked = 0 WHERE id = ?",
      [slot_id]
    );

    // ✅ AUDIT
    await audit(req.user.id, "UNBLOCK", "SCHEDULE_SLOT", slot_id);

    res.json({ ok: true });
  }
);

// ФИЛЬТРАЦИЯ СЛОТОВ ДЛЯ КЛИЕНТОВ
app.get("/api/masters/:id/available", async (req, res) => {
  const { id } = req.params;
  const { date, service_id } = req.query;

  const rows = await allAsync(`
    SELECT 
      sch.id,
      sch.time,
      sch.price,
      srv.name AS service_name,
      m.name   AS master_name 
    FROM schedule sch
    JOIN services srv ON sch.service_id = srv.id
    JOIN masters  m   ON sch.master_id = m.id
    WHERE sch.master_id = ?
      AND sch.service_id = ?
      AND sch.date = DATE(?)
      AND sch.is_taken = 0
      AND sch.is_blocked = 0
    ORDER BY sch.time
  `, [id, service_id, date]);

  res.json(rows);
});



app.get("/api/salons/available/today", async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const rows = await allAsync(`
    SELECT DISTINCT sa.*
    FROM salons sa
    JOIN masters m ON m.salon_id = sa.id
    JOIN schedule s ON s.master_id = m.id
    WHERE s.date = ?
      AND s.is_taken = 0
      AND s.is_blocked = 0
  `, [today]);

  res.json(rows);
});


app.get(
  "/api/admin/salons",
  authMiddleware,
  allowRoles("super_admin"),
  async (req, res) => {
    const rows = await allAsync(`
      SELECT 
        s.id,
        s.name,
        s.address,
        s.categories,
        u.id   AS owner_id,
        u.email AS owner_email
      FROM salons s
      JOIN users u ON s.owner_id = u.id
      ORDER BY s.id DESC
    `);

    rows.forEach(r => {
      try {
        r.categories = JSON.parse(r.categories || "[]");
      } catch {
        r.categories = [];
      }
    });

    res.json(rows);
  }
);


app.get("/api/masters/:id/slots", async (req, res) => {
  const { id } = req.params;
  const { service_id } = req.query;

  let sql = `
    SELECT
      sch.id,
      sch.date,
      sch.time,
      sch.price,
      sch.service_id,
      srv.name AS service_name
    FROM schedule sch
    JOIN services srv ON sch.service_id = srv.id
    WHERE sch.master_id = ?
      AND sch.is_taken = 0
      AND sch.is_blocked = 0
      AND datetime(sch.date || ' ' || sch.time) >= datetime('now','localtime')
  `;

  const params = [id];

  if (service_id) {
    sql += " AND sch.service_id = ?";
    params.push(service_id);
  }

  sql += " ORDER BY sch.date, sch.time";

  const rows = await allAsync(sql, params);
  res.json(rows);
});


app.get("/api/schedule/by-date", async (req, res) => {
  const { date, salon_id } = req.query;

  const rows = await allAsync(`
    SELECT
      sch.id,
      sch.date,
      sch.time,
      sch.price,
      srv.name AS service_name,
      srv.duration_minutes,
      m.name AS master_name
    FROM schedule sch
    JOIN services srv ON sch.service_id = srv.id
    JOIN masters m ON sch.master_id = m.id
    WHERE sch.date = ?
      AND m.salon_id = ?
      AND sch.is_taken = 0
      AND sch.is_blocked = 0
    ORDER BY sch.time
  `,[date, salon_id]);

  res.json(rows);
});






app.put(
  "/api/master/bookings/:id/status",
  authMiddleware,
  allowRoles("master"),
  async (req, res) => {
    const { status } = req.body;
    const booking_id = req.params.id;

    if (!["visited", "no_show"].includes(status))
      return res.status(400).json({ error: "Invalid status" });

    const row = await getAsync(`
      SELECT b.id
      FROM bookings b
      JOIN schedule s ON b.schedule_id = s.id
      JOIN masters m ON s.master_id = m.id
      WHERE b.id = ?
        AND m.user_id = ?
    `, [booking_id, req.user.id]);

    if (!row) return res.status(403).json({ error: "Forbidden" });

    await runAsync(
      "UPDATE bookings SET status = ? WHERE id = ?",
      [status, booking_id]
    );

    res.json({ ok: true });
  }
);






if (bot) {
  bot.on("callback_query", async (query) => {
    try {
      const chatId = query.message.chat.id;
      const data = query.data; // confirm_12 / cancel_12

      if (!data) return;

      const [action, bookingId] = data.split("_");
      if (!bookingId) return;

      // Получаем запись + слот
      const booking = await getAsync(`
        SELECT 
          b.id,
          b.schedule_id,
          b.client_name,
          b.client_phone,
          s.date,
          s.time,
          sa.name AS salon_name,
          m.name  AS master_name
        FROM bookings b
        JOIN schedule s ON b.schedule_id = s.id
        JOIN masters m ON s.master_id = m.id
        JOIN salons sa ON m.salon_id = sa.id
        WHERE b.id = ?
      `, [bookingId]);

      if (!booking) {
        await bot.answerCallbackQuery(query.id, {
          text: "❌ Запись не найдена",
          show_alert: true
        });
        return;
      }

      // =======================
      // ✅ ПОДТВЕРЖДЕНИЕ
      // =======================
      if (action === "confirm") {

        await runAsync(
          "UPDATE bookings SET status = 'visited' WHERE id = ?",
          [bookingId]
        );

        await bot.editMessageText(
          `✅ Запись подтверждена

Салон: ${booking.salon_name}
Мастер: ${booking.master_name}
Дата: ${booking.date}
Время: ${booking.time}
Клиент: ${booking.client_name || "—"}
Телефон: ${booking.client_phone}`,
          {
            chat_id: chatId,
            message_id: query.message.message_id
          }
        );

        await bot.answerCallbackQuery(query.id, {
          text: "Запись подтверждена ✅"
        });

        return;
      }

      // =======================
      // ❌ ОТМЕНА
      // =======================
      if (action === "cancel") {

        // освобождаем слот
        await runAsync(
          "UPDATE schedule SET is_taken = 0 WHERE id = ?",
          [booking.schedule_id]
        );

        // удаляем запись
        await runAsync(
          "DELETE FROM bookings WHERE id = ?",
          [bookingId]
        );

        await bot.editMessageText(
          `❌ Запись отменена

Салон: ${booking.salon_name}
Мастер: ${booking.master_name}
Дата: ${booking.date}
Время: ${booking.time}`,
          {
            chat_id: chatId,
            message_id: query.message.message_id
          }
        );

        await bot.answerCallbackQuery(query.id, {
          text: "Запись отменена ❌"
        });

        return;
      }

    } catch (e) {
      console.error("callback_query error:", e);
      try {
        await bot.answerCallbackQuery(query.id, {
          text: "Ошибка обработки",
          show_alert: true
        });
      } catch {}
    }
  });
}



async function ensureSuperAdmin() {
  const email = "superadmin@platform.local";
  const password = "superadmin123";

  const admin = await getAsync(
    "SELECT id FROM users WHERE role = 'super_admin'"
  );

  if (admin) {
    console.log("✅ Super admin already exists");
    return;
  }

  const hash = await bcrypt.hash(password, 10);

  await runAsync(
    "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'super_admin')",
    [email, hash]
  );

  console.log("🔥 SUPER ADMIN CREATED");
  console.log("LOGIN:", email);
  console.log("PASSWORD:", password);
}



// health check
app.get("/api/ping", (req, res) => res.json({ ok: true }));

(async () => {
  try {
    await ensureSuperAdmin();

    app.listen(PORT, () => {
      console.log("🚀 Server listening on", PORT);
    });
  } catch (e) {
    console.error("❌ Startup error:", e);
    process.exit(1);
  }
})();



