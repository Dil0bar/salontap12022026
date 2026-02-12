const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./salon.db');

db.all("PRAGMA table_info(services);", (err, rows) => {
  console.log(rows);
  db.close();
});
