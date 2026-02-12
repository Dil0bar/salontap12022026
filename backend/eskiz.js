const TEST_MODE = true;

async function notifyClient(phone, text) {
  if (TEST_MODE) {
    console.log("🧪 TEST SMS");
    console.log("📞", phone);
    console.log("✉️", text);
    return true;
  }

  // потом будет реальный Eskiz
}
