// api/ninja-track-signup.js
// Called when a referred user signs up on Cash Counter.
// Increments totalUsers on the Ninja's doc in the vbook-ninja Firebase project.

const ALLOWED_ORIGIN = process.env.APP_URL || "https://cashcounter.vbookng.com";

let admin;
function getNinjaDb() {
  if (!admin) admin = require("firebase-admin");
  try { admin.app("ninja"); } catch(e) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.NINJA_FIREBASE_PROJECT_ID,
        clientEmail: process.env.NINJA_FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.NINJA_FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    }, "ninja");
  }
  return admin.app("ninja").firestore();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")    return res.status(405).json({ error: "Method not allowed" });

  const { referralCode, uid } = req.body || {};

  if (!referralCode || !uid) {
    return res.status(400).json({ error: "Missing referralCode or uid" });
  }

  try {
    const db = getNinjaDb();

    // Find ninja by referral code
    const snap = await db.collection("ninjas")
      .where("referralCode", "==", referralCode)
      .limit(1)
      .get();

    if (snap.empty) {
      console.warn("No ninja found for referral code:", referralCode);
      return res.status(200).json({ success: false, reason: "ninja_not_found" });
    }

    const ninjaDoc = snap.docs[0];

    // Check idempotency — don't double count same user
    const alreadyTracked = ninjaDoc.data().trackedUsers || [];
    if (alreadyTracked.includes(uid)) {
      return res.status(200).json({ success: true, already: true });
    }

    // Increment totalUsers and store uid to prevent duplicates
    await ninjaDoc.ref.update({
      totalUsers:   admin.firestore.FieldValue.increment(1),
      trackedUsers: admin.firestore.FieldValue.arrayUnion(uid),
    });

    console.log("Ninja signup tracked:", ninjaDoc.id, "referred uid:", uid);
    return res.status(200).json({ success: true });

  } catch(e) {
    console.error("ninja-track-signup error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
