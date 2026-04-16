// api/ninja-admin.js
// Server-side API for admin panel to read/write Ninja data
// Uses Admin SDK — bypasses Firestore rules
// Protected by ADMIN_SECRET env var

const ALLOWED_ORIGIN = process.env.APP_URL || "https://cashcounter.vbookng.com";
const ADMIN_SECRET   = process.env.ADMIN_SECRET;
const { sendEmail, applicationApprovedHTML, applicationRejectedHTML } = require("./ninja-notify.js");

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

// Also need Cash Counter Admin SDK for webhook sharing
function getCCDb() {
  if (!admin) admin = require("firebase-admin");
  try { admin.app("cashcounter"); } catch(e) {
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
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Auth check — admin secret in Authorization header
  const authHeader = req.headers["authorization"];
  if (!ADMIN_SECRET || authHeader !== `Bearer ${ADMIN_SECRET}`) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const { action, ninjaId, status, ninjaIdPayout } = req.method === "POST"
    ? (req.body || {})
    : req.query;

  try {
    const db = getNinjaDb();

    // ── GET all ninjas ──
    if (req.method === "GET" && action === "list") {
      const snap = await db.collection("ninjas").orderBy("appliedAt", "desc").get();
      const ninjas = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        appliedAt:     d.data().appliedAt?.toDate?.()?.toISOString() || null,
        bankName:      d.data().bankName      || "",
        accountNumber: d.data().accountNumber || "",
        accountName:   d.data().accountName   || "",
      }));
      return res.status(200).json({ ninjas });
    }

    // ── GET CSV report ──
    if (req.method === "GET" && action === "csv") {
      const snap = await db.collection("ninjas").orderBy("appliedAt", "desc").get();
      const rows = [
        ["Name","Email","Phone","State","Status","Total Signups","Paid Users","Total Earned","Paid Out","Pending","Bank Name","Account Number","Account Name","Applied At"].join(","),
        ...snap.docs.map(d => {
          const n = d.data();
          const pending = (n.totalEarnings||0) - (n.paidEarnings||0);
          const appliedAt = n.appliedAt?.toDate?.()?.toLocaleDateString("en-NG") || "";
          return [
            `"${n.name||""}"`,
            `"${n.email||""}"`,
            `"${n.phone||""}"`,
            `"${n.state||""}"`,
            `"${n.status||""}"`,
            n.totalUsers||0,
            n.paidUsers||0,
            n.totalEarnings||0,
            n.paidEarnings||0,
            pending,
            `"${n.bankName||""}"`,
            `"${n.accountNumber||""}"`,
            `"${n.accountName||""}"`,
            `"${appliedAt}"`,
          ].join(",");
        })
      ].join("
");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=ninja-report.csv");
      return res.status(200).send(rows);
    }

    // ── GET commissions for a ninja ──
    if (req.method === "GET" && action === "commissions" && ninjaId) {
      const snap = await db.collection("ninjas").doc(ninjaId)
        .collection("commissions").orderBy("createdAt", "desc").limit(50).get();
      const commissions = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.()?.toISOString() || null,
        paidAt:    d.data().paidAt || null,
      }));
      return res.status(200).json({ commissions });
    }

    // ── POST update ninja status ──
    if (req.method === "POST" && action === "updateStatus" && ninjaId && status) {
      await db.collection("ninjas").doc(ninjaId).update({ status });

      // Send email notification
      try {
        const ninjaDoc = await db.collection("ninjas").doc(ninjaId).get();
        if (ninjaDoc.exists) {
          const ninja = ninjaDoc.data();
          if (status === "active") {
            await sendEmail(
              ninja.email,
              "You're approved! Welcome to the Cash Counter Ninja programme 🥷",
              applicationApprovedHTML(ninja.name.split(" ")[0], ninja.referralCode)
            );
          } else if (status === "rejected") {
            await sendEmail(
              ninja.email,
              "Your Cash Counter Ninja application — update",
              applicationRejectedHTML(ninja.name.split(" ")[0])
            );
          }
        }
      } catch(e) {
        console.error("Email send error:", e.message);
      }

      return res.status(200).json({ success: true });
    }

    // ── POST mark payout paid ──
    if (req.method === "POST" && action === "markPaid" && ninjaId) {
      const ninjaDoc = await db.collection("ninjas").doc(ninjaId).get();
      if (!ninjaDoc.exists) return res.status(404).json({ error: "Ninja not found" });

      const ninja   = ninjaDoc.data();
      const pending = (ninja.totalEarnings || 0) - (ninja.paidEarnings || 0);
      if (pending <= 0) return res.status(400).json({ error: "No pending payout" });

      // Mark all pending commissions as paid
      const comSnap = await db.collection("ninjas").doc(ninjaId)
        .collection("commissions").where("status", "==", "pending").get();
      const batch = db.batch();
      comSnap.docs.forEach(d => batch.update(d.ref, {
        status: "paid",
        paidAt: new Date().toISOString()
      }));
      await batch.commit();

      // Update paidEarnings
      await db.collection("ninjas").doc(ninjaId).update({
        paidEarnings: admin.firestore.FieldValue.increment(pending),
      });

      return res.status(200).json({ success: true, amount: pending, name: ninja.name });
    }

    return res.status(400).json({ error: "Invalid action" });

  } catch(e) {
    console.error("ninja-admin error:", e.message);
    return res.status(500).json({ error: e.message });
  }
};
