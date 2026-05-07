// api/ninja.js
// Consolidated Ninja endpoint — routes by action param
// Actions: track-signup | apply-notify | admin

const cors = require("cors")({ origin: true });

let adminApp;

function getNinjaDb() {
  if (!adminApp) {
    const firebase = require("firebase-admin");
    if (!firebase.apps.find(a => a.name === "ninja")) {
      adminApp = firebase.initializeApp({
        credential: firebase.credential.cert({
          projectId:   process.env.NINJA_FIREBASE_PROJECT_ID,
          clientEmail: process.env.NINJA_FIREBASE_CLIENT_EMAIL,
          privateKey:  (process.env.NINJA_FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
        }),
      }, "ninja");
    } else {
      adminApp = firebase.app("ninja");
    }
  }
  return adminApp.firestore();
}

async function trackSignup({ referralCode, newUserEmail, newUserName }) {
  if (!referralCode) return { ok: true, message: "No referral code" };
  const db = getNinjaDb();

  const ninjaSnap = await db.collection("ninjas")
    .where("referralCode", "==", referralCode).limit(1).get();

  if (ninjaSnap.empty) return { ok: true, message: "Ninja not found" };

  const ninjaDoc  = ninjaSnap.docs[0];
  const ninjaData = ninjaDoc.data();
  const ninjaId   = ninjaDoc.id;

  const now = new Date().toISOString();
  const ref = db.collection(`ninjas/${ninjaId}/referrals`).doc();
  await ref.set({
    email:       newUserEmail || "",
    name:        newUserName  || "",
    signedUpAt:  now,
    plan:        "free",
    converted:   false,
    commission:  0,
  });

  await ninjaDoc.ref.update({
    totalReferrals: (ninjaData.totalReferrals || 0) + 1,
    lastReferralAt: now,
  });

  return { ok: true, ninjaId, referralCode };
}

async function applyNotify({ name, email, instagram, whatsapp, reason }) {
  const { Resend } = require("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);

  // Notify admin
  await resend.emails.send({
    from:    "Cash Counter Ninja <noreply@cashcounter.vbookng.com>",
    to:      "v.bookenterprise@gmail.com",
    subject: `New Ninja Application — ${name}`,
    html: `
      <h2>New Ninja Application</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Instagram:</strong> ${instagram || "—"}</p>
      <p><strong>WhatsApp:</strong> ${whatsapp || "—"}</p>
      <p><strong>Reason:</strong> ${reason || "—"}</p>
    `,
  });

  return { ok: true };
}

async function adminAction({ adminSecret, action, ninjaId, data }) {
  if (adminSecret !== process.env.ADMIN_SECRET) {
    throw Object.assign(new Error("Unauthorized"), { status: 403 });
  }

  const db = getNinjaDb();

  if (action === "approve") {
    await db.doc(`ninjas/${ninjaId}`).update({
      status:     "approved",
      approvedAt: new Date().toISOString(),
      ...data,
    });
    return { ok: true, action: "approved", ninjaId };
  }

  if (action === "reject") {
    await db.doc(`ninjas/${ninjaId}`).update({
      status:     "rejected",
      rejectedAt: new Date().toISOString(),
    });
    return { ok: true, action: "rejected", ninjaId };
  }

  if (action === "pay") {
    await db.doc(`ninjas/${ninjaId}`).update({
      totalPaid:  data.amount || 0,
      lastPaidAt: new Date().toISOString(),
    });
    return { ok: true, action: "paid", ninjaId };
  }

  if (action === "list") {
    const snap = await db.collection("ninjas").get();
    return { ok: true, ninjas: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
  }

  throw Object.assign(new Error("Unknown admin action"), { status: 400 });
}

// ── Main handler ──────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(req, res, async () => {
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { action } = req.body || {};

    if (!action) {
      return res.status(400).json({ error: "Missing action" });
    }

    try {
      let result;

      if (action === "track-signup") {
        result = await trackSignup(req.body);
      } else if (action === "apply-notify") {
        result = await applyNotify(req.body);
      } else if (action === "admin") {
        result = await adminAction(req.body);
      } else {
        return res.status(400).json({ error: "Invalid action" });
      }

      return res.status(200).json(result);
    } catch (e) {
      console.error(`ninja/${action} error:`, e.message);
      return res.status(e.status || 500).json({ error: e.message || "Internal error" });
    }
  });
};
