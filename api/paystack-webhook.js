// api/paystack-webhook.js
// Receives Paystack webhook events and updates Firestore accordingly.
// Events handled:
//   charge.success          → payment confirmed, activate Pro
//   subscription.disable    → subscription cancelled, downgrade to free
//   subscription.not_renew  → same
//   invoice.payment_failed  → charge failed, mark attention needed

import crypto from "crypto";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore }                  from "firebase-admin/firestore";

// ── Firebase Admin init (runs once per cold start) ─────────────
function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Vercel stores multi-line secrets as escaped \n — fix that here
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

// ── Plan interval → expiry duration (ms) ──────────────────────
const PLAN_DURATIONS = {
  monthly:     30  * 24 * 60 * 60 * 1000,
  biannually:  183 * 24 * 60 * 60 * 1000,  // 6 months
  annually:    365 * 24 * 60 * 60 * 1000,
};

// Add a buffer of 2 days so users aren't cut off on the exact renewal day
const BUFFER_MS = 2 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  // ── Verify Paystack signature ──────────────────────────────
  const secret    = process.env.PAYSTACK_SECRET_KEY;
  const signature = req.headers["x-paystack-signature"];
  const rawBody   = JSON.stringify(req.body); // Vercel parses JSON by default

  const hash = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  if (hash !== signature) {
    console.warn("Paystack webhook: invalid signature");
    return res.status(401).send("Invalid signature");
  }

  const event = req.body;
  console.log("Paystack webhook event:", event.event);

  const db = getDb();

  try {
    // ── charge.success ─────────────────────────────────────
    if (event.event === "charge.success") {
      const data     = event.data;
      const uid      = data.metadata?.uid;
      const planCode = data.plan;           // plan_code e.g. PLN_xxx
      const interval = data.plan_object?.interval; // monthly | biannually | annually

      if (!uid) {
        console.warn("charge.success: no uid in metadata, reference:", data.reference);
        return res.status(200).send("OK");  // Still return 200 to Paystack
      }

      const durationMs    = PLAN_DURATIONS[interval] || PLAN_DURATIONS.monthly;
      const expiresAt     = new Date(Date.now() + durationMs + BUFFER_MS).toISOString();
      const subscriptionCode = data.subscription_code || "";

      await db.doc(`users/${uid}/settings/plan`).set({
        plan:             "pro",
        interval,
        planCode,
        subscriptionCode,
        expiresAt,
        activatedAt:      new Date().toISOString(),
        lastPaymentRef:   data.reference,
        lastPaymentAt:    data.paid_at || new Date().toISOString(),
        status:           "active",
      }, { merge: true });

      console.log(`✅ Pro activated for uid=${uid}, expires=${expiresAt}`);
    }

    // ── subscription.disable / subscription.not_renew ──────
    if (
      event.event === "subscription.disable" ||
      event.event === "subscription.not_renew"
    ) {
      const data             = event.data;
      const customerEmail    = data.customer?.email;
      const subscriptionCode = data.subscription_code;

      // Find the user by scanning plan docs — only if we stored subscriptionCode
      // More reliable: store subscriptionCode in a top-level index
      const snapshot = await db
        .collectionGroup("plan")  // not available without index — use direct lookup
        .where("subscriptionCode", "==", subscriptionCode)
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const docRef = snapshot.docs[0].ref;
        await docRef.set({
          status:    event.event === "subscription.disable" ? "cancelled" : "non_renewing",
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        console.log(`📴 Subscription ${event.event} for code=${subscriptionCode}`);
      } else {
        console.warn("subscription.disable: no matching user found for", subscriptionCode);
      }
    }

    // ── invoice.payment_failed ──────────────────────────────
    if (event.event === "invoice.payment_failed") {
      const data             = event.data;
      const subscriptionCode = data.subscription?.subscription_code;
      if (subscriptionCode) {
        const snapshot = await db
          .collectionGroup("plan")
          .where("subscriptionCode", "==", subscriptionCode)
          .limit(1)
          .get();
        if (!snapshot.empty) {
          await snapshot.docs[0].ref.set({
            status:    "attention",
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }
      }
    }

    return res.status(200).send("OK");
  } catch (err) {
    console.error("paystack-webhook handler error:", err);
    // Still return 200 so Paystack doesn't retry endlessly
    return res.status(200).send("OK");
  }
}
