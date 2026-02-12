const { runAsync, allAsync } = require("./db");

async function cleanupPendingBookings() {
  console.log("🧹 Cleaning expired pending bookings...");

  // 1. освобождаем слоты
  await runAsync(`
    UPDATE schedule
    SET is_taken = 0
    WHERE id IN (
      SELECT schedule_id
      FROM bookings
      WHERE status = 'pending'
        AND confirm_expires_at < datetime('now')
    )
  `);

  // 2. удаляем брони
  await runAsync(`
    DELETE FROM bookings
    WHERE status = 'pending'
      AND confirm_expires_at < datetime('now')
  `);

  console.log("✅ Cleanup done");
}

(async () => {
  await cleanupPendingBookings();
  process.exit(0);
})();
