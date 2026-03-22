// api/redis.js
// Thin Upstash Redis REST client — no npm package needed.
// Uses INCR + EXPIRE for sliding window rate limiting.

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCommand(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    // Upstash not configured — fail open (allow request)
    return null;
  }
  const res = await fetch(`${REDIS_URL}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result;
}

// Increment a key and set TTL on first increment.
// Returns current count.
async function increment(key, windowSeconds) {
  const count = await redisCommand("INCR", key);
  if (count === 1) {
    // First hit — set expiry for the window
    await redisCommand("EXPIRE", key, String(windowSeconds));
  }
  return count;
}

// Get TTL remaining on a key (seconds until reset)
async function ttl(key) {
  const result = await redisCommand("TTL", key);
  return result || 0;
}

module.exports = { increment, ttl };
