// api/auth-rate-limit.js
// Rate limits registration and login attempts by IP.
// Called by the frontend before Firebase createUserWithEmailAndPassword.
// Returns { allowed: true } or { allowed: false, retryAfter: seconds }

const ALLOWED_ORIGIN = process.env.APP_URL || "https://ledgerbook-nu.vercel.app";

// Separate stores for registration vs login
const registrationStore = new Map(); // IP -> { count, windowStart }
const loginStore        = new Map();

// Limits
const REGISTER_LIMIT  = 3;    // max 3 registrations per IP per hour
const REGISTER_WINDOW = 60 * 60 * 1000; // 1 hour

const LOGIN_LIMIT     = 10;   // max 10 failed logins per IP per 15 min
const LOGIN_WINDOW    = 15 * 60 * 1000; // 15 minutes

function check(store, ip, limit, windowMs) {
  const now    = Date.now();
  const record = store.get(ip);

  if (!record || now - record.windowStart > windowMs) {
    // Fresh window
    store.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (record.count >= limit) {
    const retryAfter = Math.ceil((record.windowStart + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  return { allowed: true };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body || {}; // "register" | "login"
  if (!action || !["register","login"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "unknown";

  if (action === "register") {
    const result = check(registrationStore, ip, REGISTER_LIMIT, REGISTER_WINDOW);
    if (!result.allowed) {
      return res.status(429).json({
        allowed: false,
        retryAfter: result.retryAfter,
        message: `Too many registration attempts. Please try again in ${Math.ceil(result.retryAfter / 60)} minute(s).`,
      });
    }
  }

  if (action === "login") {
    const result = check(loginStore, ip, LOGIN_LIMIT, LOGIN_WINDOW);
    if (!result.allowed) {
      return res.status(429).json({
        allowed: false,
        retryAfter: result.retryAfter,
        message: `Too many login attempts. Please wait ${Math.ceil(result.retryAfter / 60)} minute(s) before trying again.`,
      });
    }
  }

  return res.status(200).json({ allowed: true });
};
