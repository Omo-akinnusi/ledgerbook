// api/mono-disconnect.js
// Revokes Mono access and deletes all imported bank data for a user.

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

    const { idToken, uid } = req.body || {};

    if (!idToken || !uid) {
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

    const db = getDb();

    // ── Get account ID before deleting ───────────────────
    const monoSnap = await db.doc(`users/${uid}/settings/mono`).get();
    const accountId = monoSnap.exists ? monoSnap.data().accountId : null;

    // ── Unlink account from Mono ──────────────────────────
    if (accountId) {
      try {
        await fetch(`https://api.withmono.com/accounts/${accountId}/unlink`, {
          method: "POST",
          headers: { "mono-sec-key": process.env.MONO_SECRET_KEY },
        });
      } catch (e) {
        // Non-fatal — continue with local cleanup even if Mono unlink fails
        console.warn("Mono unlink warning:", e.message);
      }
    }

    // ── Delete Mono settings doc ──────────────────────────
    await db.doc(`users/${uid}/settings/mono`).delete();

    // ── Delete all bank-imported entries ──────────────────
    const entriesRef  = db.collection(`users/${uid}/entries`);
    const monoEntries = await entriesRef.where("source", "==", "mono").get();

    if (!monoEntries.empty) {
      const batch = db.batch();
      monoEntries.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
    }

    console.log(`Mono disconnected for user ${uid}. Deleted ${monoEntries.size} imported entries.`);
    return res.status(200).json({
      ok:      true,
      deleted: monoEntries.size,
    });
  });
};
