// api/admin-set-plan.js
// Admin-only endpoint to manually set a user's plan.
// Called from the admin dashboard instead of writing directly to Firestore.
// Requires the admin's Firebase ID token — verified server-side.

const cors = require("cors")({ origin: true });

let admin;

function getDb() {
  if (!admin) admin = require("firebase-admin");
  if (!admin.apps.find(a => a.name === "cashcounter")) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    }, "cashcounter");
  }
  return admin.app("cashcounter").firestore();
}

const ADMIN_EMAIL = "v.bookenterprise@gmail.com";

module.exports = async function handler(req, res) {
  cors(req, res, async () => {
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { uid, idToken, plan, interval, activatedAt, expiresAt } = req.body || {};

    // ── Validate inputs ──
    if (!uid || typeof uid !== "string" || uid.length < 10) {
      return res.status(400).json({ error: "Invalid uid" });
    }
    if (!idToken) {
      return res.status(401).json({ error: "Missing idToken" });
    }
    if (!["free","pro"].includes(plan)) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    // ── Verify token and confirm caller is admin ──
    try {
      if (!admin) admin = require("firebase-admin");
      const decoded = await admin.app("cashcounter").auth().verifyIdToken(idToken);
      if (decoded.email !== ADMIN_EMAIL) {
        return res.status(403).json({ error: "Admin access required" });
      }
    } catch (authErr) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // ── Write plan via Admin SDK ──
    try {
      const db      = getDb();
      const planRef = db.doc(`users/${uid}/settings/plan`);

      const planData = plan === "pro" ? {
        plan:           "pro",
        interval:       interval || "monthly",
        status:         "active",
        activatedAt:    activatedAt || new Date().toISOString(),
        expiresAt:      expiresAt   || null,
        lastPaymentAt:  activatedAt || new Date().toISOString(),
        lastPaymentRef: "manual-admin-" + Date.now(),
        manuallySet:    true,
        manualSetBy:    "admin",
        manualSetAt:    new Date().toISOString(),
      } : {
        plan:        "free",
        status:      "manual-downgrade",
        downgradedAt: new Date().toISOString(),
        manuallySet:  true,
        manualSetBy:  "admin",
        manualSetAt:  new Date().toISOString(),
      };

      await planRef.set(planData, { merge: true });

      console.log(`Admin set plan for user ${uid} to ${plan}`);
      return res.status(200).json({ ok: true, plan, uid });

    } catch (err) {
      console.error("admin-set-plan error:", err.message);
      return res.status(500).json({ error: "Internal error" });
    }
  });
};
