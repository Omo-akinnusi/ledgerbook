// api/paystack-verify.js
// Security: reference validation, uid validation, idempotency check, CORS, Redis rate limiting

const ALLOWED_ORIGIN = process.env.APP_URL || "https://cashcounter.vbookng.com";
const { increment, ttl } = require("./redis.js");

// Max 10 verify attempts per IP per 10 minutes
const VERIFY_LIMIT  = 10;
const VERIFY_WINDOW = 10 * 60; // 10 minutes in seconds

let admin;
function getDb() {
  if (!admin) admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return admin.firestore();
}

const PLAN_DURATIONS = {
  monthly:    30  * 24 * 60 * 60 * 1000,
  biannually: 183 * 24 * 60 * 60 * 1000,
  annually:   365 * 24 * 60 * 60 * 1000,
};
const BUFFER_MS = 2 * 24 * 60 * 60 * 1000;

function isValidReference(ref) {
  return typeof ref === "string" && ref.length > 5 && ref.length < 200 && /^[a-zA-Z0-9_-]+$/.test(ref);
}

function isValidUid(uid) {
  return typeof uid === "string" && uid.length > 10 && uid.length < 200 && /^[a-zA-Z0-9_-]+$/.test(uid);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store"); // Never cache payment verification

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  // Redis rate limiting — prevent brute force reference scanning
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.socket?.remoteAddress || "unknown";
  try {
    const key   = `rl:verify:${ip}`;
    const count = await increment(key, VERIFY_WINDOW);
    if (count > VERIFY_LIMIT) {
      const remaining = await ttl(key);
      return res.status(429).json({
        error: `Too many requests. Please wait ${Math.ceil(remaining / 60)} minute(s).`
      });
    }
  } catch(e) {
    // Redis down — fail open
    console.error("Rate limit error:", e.message);
  }

  const reference = req.query.reference;
  const uid       = req.query.uid;

  if (!isValidReference(reference)) return res.status(400).json({ error: "Invalid payment reference" });
  if (!isValidUid(uid))             return res.status(400).json({ error: "Invalid session. Please sign in again." });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: "Payment service not configured" });

  try {
    // Verify with Paystack
    const response = await fetch(
      "https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference),
      { headers: { Authorization: "Bearer " + secret, "Content-Type": "application/json" } }
    );
    const data = await response.json();

    if (!data.status || data.data.status !== "success") {
      return res.status(400).json({
        error: "Payment not confirmed",
        paystackStatus: data.data && data.data.status,
      });
    }

    const txData   = data.data;
    const interval = (txData.plan_object && txData.plan_object.interval) || "monthly";
    const planCode = txData.plan;

    // Idempotency — don't double-activate for the same reference
    const db      = getDb();
    const planRef = db.doc("users/" + uid + "/settings/plan");
    const current = await planRef.get();

    if (current.exists && current.data().lastPaymentRef === reference) {
      return res.status(200).json({ success: true, already: true, plan: "pro" });
    }

    const durationMs       = PLAN_DURATIONS[interval] || PLAN_DURATIONS.monthly;
    const expiresAt        = new Date(Date.now() + durationMs + BUFFER_MS).toISOString();
    const subscriptionCode = txData.subscription_code || "";

    await planRef.set({
      plan:             "pro",
      interval:         interval,
      planCode:         planCode,
      subscriptionCode: subscriptionCode,
      expiresAt:        expiresAt,
      activatedAt:      new Date().toISOString(),
      lastPaymentRef:   reference,
      lastPaymentAt:    txData.paid_at || new Date().toISOString(),
      status:           "active",
    }, { merge: true });

    return res.status(200).json({
      success:    true,
      plan:       "pro",
      interval:   interval,
      expiresAt:  expiresAt,
    });
  } catch (err) {
    console.error("paystack-verify error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};
