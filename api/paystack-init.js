// api/paystack-init.js
// Security: CORS, input validation, rate limiting via in-memory store

const ALLOWED_ORIGIN = process.env.APP_URL || "https://ledgerbook-nu.vercel.app";

// Simple in-memory rate limiter (resets on cold start — good enough for serverless)
const rateLimitMap = new Map();
const RATE_LIMIT    = 5;    // max requests
const RATE_WINDOW   = 60000; // per 60 seconds

function isRateLimited(ip) {
  const now    = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - record.start > RATE_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return false;
  }
  if (record.count >= RATE_LIMIT) return true;
  record.count++;
  rateLimitMap.set(ip, record);
  return false;
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 254;
}

function isValidPlanCode(code) {
  return typeof code === "string" && /^PLN_[a-zA-Z0-9]+$/.test(code);
}

function isValidUid(uid) {
  return typeof uid === "string" && uid.length > 10 && uid.length < 200 && /^[a-zA-Z0-9_-]+$/.test(uid);
}

// Amount map in kobo — prevents clients from sending arbitrary amounts
const PLAN_AMOUNTS = {
  PLN_gh2mcit6fixix9k: 150000,   // Monthly  ₦1,500
  PLN_gxtrrhn8z2tfqmf: 750000,   // 6-Month  ₦7,500
  PLN_87ghrcbnb4p8aaa: 1350000,  // Annual   ₦13,500
};

module.exports = async function handler(req, res) {
  // CORS — only allow requests from the app itself
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Rate limiting by IP
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Please wait a moment." });
  }

  // Input validation
  const { email, planCode, uid } = req.body || {};

  if (!isValidEmail(email))    return res.status(400).json({ error: "Invalid email address" });
  if (!isValidPlanCode(planCode)) return res.status(400).json({ error: "Invalid plan selected" });
  if (!isValidUid(uid))        return res.status(400).json({ error: "Invalid session. Please sign in again." });

  // Validate plan code is one of our actual plans
  const amount = PLAN_AMOUNTS[planCode];
  if (!amount) return res.status(400).json({ error: "Invalid plan selected" });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: "Payment service not configured" });

  const appUrl = process.env.APP_URL || "https://ledgerbook-nu.vercel.app";

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + secret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email:        email,
        plan:         planCode,
        amount:       amount,
        callback_url: appUrl + "/subscription-success?uid=" + encodeURIComponent(uid),
        metadata: {
          uid: uid,
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
  } catch (err) {
    console.error("paystack-init error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};
