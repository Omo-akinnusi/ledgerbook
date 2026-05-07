// api/paystack-init.js
// Handles two payment types:
//   "card"     — recurring subscription via Paystack plan (card only)
//   "transfer" — one-time charge supporting all channels including bank transfer

const ALLOWED_ORIGIN = process.env.APP_URL || "https://cashcounter.vbookng.com";
const { increment, ttl } = require("./redis.js");

const RATE_LIMIT  = 5;
const RATE_WINDOW = 60;

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length < 254;
}
function isValidPlanCode(code) {
  return typeof code === "string" && /^PLN_[a-zA-Z0-9]+$/.test(code);
}
function isValidInterval(interval) {
  return ["monthly", "biannually", "annually"].includes(interval);
}
function isValidUid(uid) {
  return typeof uid === "string" && uid.length > 10 && uid.length < 200 && /^[a-zA-Z0-9_-]+$/.test(uid);
}

// Amount map in kobo — server-side, users cannot manipulate prices
// Includes both live and test plan codes
const PLAN_AMOUNTS = {
  PLN_riztufvgcixap7k: 500000,   // Live Monthly  ₦5,000
  PLN_lr0mhzc8n3wa28h: 2700000,  // Live 6-Month  ₦27,000
  PLN_cizrk6zouo32rjs: 5000000,  // Live Annual   ₦50,000
  PLN_gh2mcit6fixix9k: 500000,   // Test Monthly  ₦5,000
  PLN_gxtrrhn8z2tfqmf: 2700000,  // Test 6-Month  ₦27,000
  PLN_87ghrcbnb4p8aaa: 5000000,  // Test Annual   ₦50,000
};

// Amounts for one-time charges (same prices, keyed by interval)
const TRANSFER_AMOUNTS = {
  monthly:    500000,   // ₦5,000
  biannually: 2700000,  // ₦27,000
  annually:   5000000,  // ₦50,000
};

const INTERVAL_LABELS = {
  monthly:    "Monthly Plan — ₦5,000",
  biannually: "6-Month Plan — ₦27,000",
  annually:   "Annual Plan — ₦50,000",
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
      return res.status(429).json({ error: `Too many requests. Please wait ${remaining} seconds.` });
    }
  } catch(err) {
    console.error("Rate limit error:", err.message);
  }

  const { email, planCode, uid, paymentType = "card", interval } = req.body || {};

  console.log("paystack-init called:", { email, planCode, uid, paymentType, interval });
  console.log("PLAN_AMOUNTS keys:", Object.keys(PLAN_AMOUNTS));
  console.log("planCode match:", planCode, "->", PLAN_AMOUNTS[planCode]);

  if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email address" });
  if (!isValidUid(uid))     return res.status(400).json({ error: "Invalid session. Please sign in again." });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: "Payment service not configured" });

  const appUrl = process.env.APP_URL || "https://cashcounter.vbookng.com";

  try {
    let paystackBody;

    if (paymentType === "transfer") {
      // ── One-time charge — supports all payment channels including bank transfer ──
      if (!isValidInterval(interval)) return res.status(400).json({ error: "Invalid plan selected" });
      const amount = TRANSFER_AMOUNTS[interval];
      if (!amount) return res.status(400).json({ error: "Invalid plan selected" });

      paystackBody = {
        email,
        amount,
        callback_url: `${appUrl}/subscription-success?uid=${encodeURIComponent(uid)}&type=transfer&interval=${interval}`,
        label:        INTERVAL_LABELS[interval],
        channels:     ["card", "bank", "bank_transfer", "ussd", "qr"],
        metadata: {
          uid,
          paymentType: "transfer",
          interval,
          custom_fields: [
            { display_name: "User ID",      variable_name: "uid",          value: uid },
            { display_name: "Payment Type", variable_name: "payment_type", value: "transfer" },
            { display_name: "Interval",     variable_name: "interval",     value: interval },
          ],
        },
      };
    } else {
      // ── Recurring subscription via plan — card only ──
      if (!isValidPlanCode(planCode)) return res.status(400).json({ error: "Invalid plan selected" });
      const amount = PLAN_AMOUNTS[planCode];
      if (!amount) return res.status(400).json({ error: "Invalid plan selected" });

      paystackBody = {
        email,
        plan:         planCode,
        amount,
        callback_url: `${appUrl}/subscription-success?uid=${encodeURIComponent(uid)}`,
        metadata: {
          uid,
          paymentType: "card",
          custom_fields: [{ display_name: "User ID", variable_name: "uid", value: uid }],
        },
      };
    }

    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" },
      body: JSON.stringify(paystackBody),
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
