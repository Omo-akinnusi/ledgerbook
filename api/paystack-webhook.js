// api/paystack-webhook.js
// Security: signature verification, no sensitive logging, input validation
const crypto = require("crypto");

let admin;
function getDb() {
  if (!admin) admin = require("firebase-admin");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return admin.firestore();
}

const PLAN_DURATIONS = {
  monthly:    30  * 24 * 60 * 60 * 1000,
  biannually: 183 * 24 * 60 * 60 * 1000,
  annually:   365 * 24 * 60 * 60 * 1000,
};
const BUFFER_MS = 2 * 24 * 60 * 60 * 1000;

// Validate uid format before writing to Firestore
function isValidUid(uid) {
  return typeof uid === "string" && uid.length > 10 && uid.length < 200 && /^[a-zA-Z0-9_-]+$/.test(uid);
}

module.exports = async function handler(req, res) {
  // Webhooks only — no CORS needed, Paystack calls this server-to-server
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // ── Verify Paystack signature (critical security check) ──
  const secret    = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers["x-paystack-signature"];
  if (!signature) return res.status(401).send("Missing signature");

  const hash = crypto.createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== signature) {
    console.warn("Webhook: invalid signature rejected");
    return res.status(401).send("Invalid signature");
  }

  const event = req.body;

  try {
    const db = getDb();

    if (event.event === "charge.success") {
      const data             = event.data;
      const uid              = data.metadata && data.metadata.uid;
      const planCode         = data.plan;
      const interval         = data.plan_object && data.plan_object.interval;
      const subscriptionCode = data.subscription_code || "";

      if (!isValidUid(uid)) {
        console.warn("Webhook charge.success: invalid or missing uid");
        return res.status(200).send("OK");
      }

      const durationMs = PLAN_DURATIONS[interval] || PLAN_DURATIONS.monthly;
      const expiresAt  = new Date(Date.now() + durationMs + BUFFER_MS).toISOString();

      await db.doc("users/" + uid + "/settings/plan").set({
        plan:             "pro",
        interval:         interval,
        planCode:         planCode,
        subscriptionCode: subscriptionCode,
        expiresAt:        expiresAt,
        activatedAt:      new Date().toISOString(),
        lastPaymentRef:   data.reference,
        lastPaymentAt:    data.paid_at || new Date().toISOString(),
        status:           "active",
      }, { merge: true });
    }

    if (event.event === "subscription.disable" || event.event === "subscription.not_renew") {
      const subscriptionCode = event.data && event.data.subscription_code;
      if (subscriptionCode) {
        const snap = await db.collectionGroup("plan")
          .where("subscriptionCode", "==", subscriptionCode).limit(1).get();
        if (!snap.empty) {
          await snap.docs[0].ref.set({
            status:    event.event === "subscription.disable" ? "cancelled" : "non_renewing",
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }
      }
    }

    if (event.event === "invoice.payment_failed") {
      const subscriptionCode = event.data && event.data.subscription && event.data.subscription.subscription_code;
      if (subscriptionCode) {
        const snap = await db.collectionGroup("plan")
          .where("subscriptionCode", "==", subscriptionCode).limit(1).get();
        if (!snap.empty) {
          await snap.docs[0].ref.set({
            status:    "attention",
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook handler error:", err.message);
    return res.status(200).send("OK"); // Always 200 to prevent Paystack retries
  }
};
