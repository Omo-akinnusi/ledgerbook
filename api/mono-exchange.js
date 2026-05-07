// api/mono-exchange.js
// Exchanges the Mono auth code returned by Mono Connect widget
// for an account ID. Called immediately after the user completes
// the Mono Connect flow on the client side.

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

    const { code, idToken, uid } = req.body || {};

    if (!code || !idToken || !uid) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // ── Verify Firebase ID token ──────────────────────────
    try {
      if (!admin) admin = require("firebase-admin");
      const decoded = await admin.app("cashcounter").auth().verifyIdToken(idToken);
      if (decoded.uid !== uid) {
        return res.status(403).json({ error: "Token uid mismatch" });
      }
    } catch (e) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // ── Verify user is Pro ────────────────────────────────
    const db = getDb();
    const planSnap = await db.doc(`users/${uid}/settings/plan`).get();
    if (!planSnap.exists || planSnap.data().plan !== "pro") {
      return res.status(403).json({ error: "Pro subscription required" });
    }

    // ── Exchange code for account ID with Mono ────────────
    try {
      const monoRes = await fetch("https://api.withmono.com/account/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "mono-sec-key": process.env.MONO_SECRET_KEY,
        },
        body: JSON.stringify({ code }),
      });

      const monoData = await monoRes.json();

      if (!monoRes.ok || !monoData.id) {
        console.error("Mono exchange error:", monoData);
        return res.status(400).json({ error: monoData.message || "Failed to exchange code" });
      }

      const accountId = monoData.id;

      // ── Fetch account details from Mono ──────────────────
      const detailsRes = await fetch(`https://api.withmono.com/accounts/${accountId}`, {
        headers: { "mono-sec-key": process.env.MONO_SECRET_KEY },
      });
      const details = await detailsRes.json();

      // ── Save account info to Firestore ───────────────────
      await db.doc(`users/${uid}/settings/mono`).set({
        accountId,
        accountName:   details.account?.name    || "",
        accountNumber: details.account?.accountNumber || "",
        bankName:      details.account?.institution?.name || "",
        accountType:   details.account?.type    || "",
        currency:      details.account?.currency || "NGN",
        balance:       details.account?.balance  || 0,
        connectedAt:   new Date().toISOString(),
        lastSyncAt:    null,
        status:        "active",
      }, { merge: true });

      console.log(`Mono account connected for user ${uid}: ${accountId}`);
      return res.status(200).json({
        ok: true,
        accountId,
        accountName:   details.account?.name || "",
        bankName:      details.account?.institution?.name || "",
        accountNumber: details.account?.accountNumber || "",
        balance:       details.account?.balance || 0,
      });

    } catch (e) {
      console.error("mono-exchange error:", e.message);
      return res.status(500).json({ error: "Internal error" });
    }
  });
};
