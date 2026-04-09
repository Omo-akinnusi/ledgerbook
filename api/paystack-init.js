// api/paystack-init.js
// Security: CORS, input validation, Redis rate limiting

const ALLOWED_ORIGIN = process.env.APP_URL || "https://cashcounter.vbookng.com";
const { increment, ttl } = require("./redis.js");

// 5 checkout attempts per IP per minute
const RATE_LIMIT  = 5;
const RATE_WINDOW = 60; // seconds

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 254;
}
function isValidPlanCode(code) {
  return typeof code === "string" && /^PLN_[a-zA-Z0-9]+$/.test(code);
}
function isValidUid(uid) {
  return typeof uid === "string" && uid.length > 10 && uid.length < 200 && /^[a-zA-Z0-9_-]+$/.test(uid);
}

// Amount map in kobo — server-side, users cannot manipulate prices
const PLAN_AMOUNTS = {
  PLN_riztufvgcixap7k: 500000,   // Monthly  ₦5,000
  PLN_lr0mhzc8n3wa28h: 2700000,  // 6-Month  ₦27,000
  PLN_cizrk6zouo32rjs: 5000000,  // Annual   ₦50,000
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  // Redis rate limiting
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.socket?.remoteAddress || "unknown";

  try {
    const key   = `rl:paystack:${ip}`;
    const count = await increment(key, RATE_WINDOW);
    if (count > RATE_LIMIT) {
      const remaining = await ttl(key);
      return res.status(429).json({
        error: `Too many requests. Please wait ${remaining} seconds.`
      });
    }
  } catch(err) {
    // Redis down — fail open
    console.error("Rate limit error:", err.message);
  }

  // Input validation
  const { email, planCode, uid } = req.body || {};
  if (!isValidEmail(email))       return res.status(400).json({ error: "Invalid email address" });
  if (!isValidPlanCode(planCode)) return res.status(400).json({ error: "Invalid plan selected" });
  if (!isValidUid(uid))           return res.status(400).json({ error: "Invalid session. Please sign in again." });

  const amount = PLAN_AMOUNTS[planCode];
  if (!amount) return res.status(400).json({ error: "Invalid plan selected" });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: "Payment service not configured" });

  const appUrl = process.env.APP_URL || "https://cashcounter.vbookng.com";

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        plan:         planCode,
        amount,
        callback_url: `${appUrl}/subscription-success?uid=${encodeURIComponent(uid)}`,
        metadata: {
          uid,
          custom_fields: [{ display_name: "User ID", variable_name: "uid", value: uid }],
        },
      }),
    });

    const data = await response.json();
    if (!data.status) {
      console.error("Paystack init failed:", data.message);
      return res.status(400).json({ error: data.message || "Failed to initialize transaction" });
    }

    return res.status(200).json({
      authorization_url: data.data.authorization_url,
      access_code:       data.data.access_code,
      reference:         data.data.reference,
    });
  } catch(err) {
    console.error("paystack-init error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};
