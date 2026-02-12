const { sendTelegram } = require("./telegram");

async function notifyClient(phone, text) {
  // пока не используем
  console.log("CLIENT:", phone, text);
}

async function notifyAdmin(text) {
  await sendTelegram(text);
}

module.exports = {
  notifyClient,
  notifyAdmin
};
