const fs = require("fs");
const path = require("path");

function backupDB() {
  const src = path.join(__dirname, "salon.db");
  const dir = path.join(__dirname, "backups");

  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  const name = `salon_${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.db`;

  fs.copyFileSync(src, path.join(dir, name));
  console.log("💾 DB backup created:", name);
}

module.exports = backupDB;
