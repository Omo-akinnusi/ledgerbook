// api/paystack-webhook.js
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const secret    = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers["x-paystack-signature"];
  const rawBody   = JSON.stringify(req.body);
  const hash      = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");

  if (hash !== signature) {
    console.warn("Paystack webhook: invalid signature");
    return res.status(401).send("Invalid signature");
  }

  const event = req.body;
  console.log("Paystack webhook event:", event.event);

  try {
    const db = getDb();

    if (event.event === "charge.success") {
      const data             = event.data;
      const uid              = data.metadata && data.metadata.uid;
      const planCode         = data.plan;
      const interval         = data.plan_object && data.plan_object.interval;
      const subscriptionCode = data.subscription_code || "";

      if (!uid) {
        console.warn("charge.success: no uid in metadata, ref:", data.reference);
        return res.status(200).send("OK");
      }

      const durationMs = PLAN_DURATIONS[interval] || PLAN_DURATIONS.monthly;
      const expiresAt  = new Date(Date.now() + durationMs + BUFFER_MS).toISOString();

      await db.doc("users/" + uid + "/settings/plan").set({
        plan: "pro", interval: interval, planCode: planCode,
        subscriptionCode: subscriptionCode,
        expiresAt: expiresAt, activatedAt: new Date().toISOString(),
        lastPaymentRef: data.reference,
        lastPaymentAt:  data.paid_at || new Date().toISOString(),
        status: "active",
      }, { merge: true });

      console.log("Pro activated uid=" + uid + " expires=" + expiresAt);
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("paystack-webhook error:", err);
    return res.status(200).send("OK");
  }
};
