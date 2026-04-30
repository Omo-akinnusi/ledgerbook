// api/downgrade-expired.js
// Called by the client when it detects a user's Pro subscription has expired.
// Uses Firebase Admin SDK to write the plan downgrade — the client cannot do
// this directly because Firestore rules restrict plan writes to Admin SDK only.

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

module.exports = async function handler(req, res) {
  cors(req, res, async () => {
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // ── Validate request body ──
    const { uid, idToken } = req.body || {};

    if (!uid || typeof uid !== "string" || uid.length < 10 || uid.length > 200) {
      return res.status(400).json({ error: "Invalid uid" });
    }

    // ── Verify the Firebase ID token so we know this request came from
    //    the real authenticated user — not an impersonator sending any uid ──
    if (!idToken || typeof idToken !== "string") {
      return res.status(401).json({ error: "Missing idToken" });
    }

    try {
      if (!admin) admin = require("firebase-admin");
      const decoded = await admin.app("cashcounter").auth().verifyIdToken(idToken);

      // The token must belong to the same uid being downgraded
      if (decoded.uid !== uid) {
        return res.status(403).json({ error: "Token uid mismatch" });
      }
    } catch (authErr) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // ── Verify the plan is actually expired before downgrading ──
    // Don't trust the client — re-check server-side
    try {
      const db      = getDb();
      const planRef = db.doc(`users/${uid}/settings/plan`);
      const planSnap = await planRef.get();

      if (!planSnap.exists) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const planData  = planSnap.data();
      const expiresAt = planData.expiresAt;

      // Only downgrade if currently Pro and actually expired
      if (planData.plan !== "pro") {
        return res.status(200).json({ ok: true, plan: planData.plan, message: "Already on free plan" });
      }

      if (!expiresAt || new Date(expiresAt) >= new Date()) {
        return res.status(200).json({ ok: true, plan: "pro", message: "Subscription still active" });
      }

      // ── Write the downgrade via Admin SDK ──
      await planRef.set({
        plan:       "free",
        status:     "expired",
        expiredAt:  new Date().toISOString(),
      }, { merge: true });

      console.log(`Downgraded user ${uid} from pro to free (expired: ${expiresAt})`);
      return res.status(200).json({ ok: true, plan: "free" });

    } catch (err) {
      console.error("downgrade-expired error:", err.message);
      return res.status(500).json({ error: "Internal error" });
    }
  });
};
