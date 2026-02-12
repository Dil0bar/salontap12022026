async function sendSms(phone, text) {
  if (process.env.NODE_ENV === "development") {
    console.log("📩 SMS (DEV):", phone, text);
    return true;
  }

  // 👉 сюда PlayMobile / SMS.ru
}

module.exports = { sendSms };
