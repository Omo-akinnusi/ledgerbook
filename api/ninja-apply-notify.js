// api/ninja-apply-notify.js
// Sends confirmation email when a ninja application is submitted
// Called from the ninja site after successful Firestore write

const ALLOWED_ORIGIN = "https://ninja.vbookng.com";
const { sendEmail, applicationReceivedHTML } = require("./ninja-notify.js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*"); // allow from ninja site
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, email } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: "Missing name or email" });

  try {
    await sendEmail(
      email,
      "We've received your Cash Counter Ninja application ✅",
      applicationReceivedHTML(name.split(" ")[0])
    );
    return res.status(200).json({ success: true });
  } catch(e) {
    console.error("Apply notify error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
