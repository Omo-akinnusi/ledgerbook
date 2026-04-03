// api/auth-rate-limit.js
// Rate limits registration, login and password reset attempts by IP using Upstash Redis.
// Falls back to allowing requests if Redis is unavailable.

const ALLOWED_ORIGIN = process.env.APP_URL || "https://cashcounter.vbookng.com";
const { increment, ttl } = require("./redis.js");

// Limits
const REGISTER_LIMIT   = 3;        // max 3 registrations per IP per hour
const REGISTER_WINDOW  = 60 * 60;  // 1 hour in seconds

const LOGIN_LIMIT      = 10;       // max 10 attempts per IP per 15 min
const LOGIN_WINDOW     = 15 * 60;  // 15 minutes in seconds

const FORGOT_LIMIT     = 5;        // max 5 reset emails per IP per hour
const FORGOT_WINDOW    = 60 * 60;  // 1 hour in seconds

function getIP(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "unknown";
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  const { action } = req.body || {};
  if (!action || !["register", "login", "forgot"].includes(action)) {
    return res.status(400).json({ error: "Invalid action" });
  }

  const ip = getIP(req);

  try {
    if (action === "register") {
      const key   = `rl:register:${ip}`;
      const count = await increment(key, REGISTER_WINDOW);
      if (count > REGISTER_LIMIT) {
        const remaining = await ttl(key);
        return res.status(429).json({
          allowed:    false,
          retryAfter: remaining,
          message:    `Too many registration attempts. Please try again in ${Math.ceil(remaining / 60)} minute(s).`,
        });
      }
    }

    if (action === "login") {
      const key   = `rl:login:${ip}`;
      const count = await increment(key, LOGIN_WINDOW);
      if (count > LOGIN_LIMIT) {
        const remaining = await ttl(key);
        return res.status(429).json({
          allowed:    false,
          retryAfter: remaining,
          message:    `Too many login attempts. Please wait ${Math.ceil(remaining / 60)} minute(s) before trying again.`,
        });
      }
    }

    if (action === "forgot") {
      const key   = `rl:forgot:${ip}`;
      const count = await increment(key, FORGOT_WINDOW);
      if (count > FORGOT_LIMIT) {
        const remaining = await ttl(key);
        return res.status(429).json({
          allowed:    false,
          retryAfter: remaining,
          message:    `Too many password reset attempts. Please try again in ${Math.ceil(remaining / 60)} minute(s).`,
        });
      }
    }

    return res.status(200).json({ allowed: true });

  } catch(err) {
    // If Redis is down, fail open — don't block legitimate users
    console.error("Rate limit Redis error:", err.message);
    return res.status(200).json({ allowed: true });
  }
};
