// api/paystack-verify.js
// Called after the user is redirected back from Paystack checkout.
// Verifies the transaction reference and immediately activates Pro in Firestore.
// Query params: ?reference=xxx&uid=xxx

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore }                  from "firebase-admin/firestore";

function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

const PLAN_DURATIONS = {
  monthly:    30  * 24 * 60 * 60 * 1000,
  biannually: 183 * 24 * 60 * 60 * 1000,
  annually:   365 * 24 * 60 * 60 * 1000,
};
const BUFFER_MS = 2 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { reference, uid } = req.query;

  if (!reference || !uid) {
    return res.status(400).json({ error: "Missing reference or uid" });
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;

  try {
    // Verify transaction with Paystack
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (!data.status || data.data?.status !== "success") {
      return res.status(400).json({
        error: "Transaction not successful",
        paystackStatus: data.data?.status,
      });
    }

    const txData   = data.data;
    const interval = txData.plan_object?.interval || "monthly";
    const planCode = txData.plan;

    // Guard against double-activation using reference idempotency
    const db      = getDb();
    const planRef = db.doc(`users/${uid}/settings/plan`);
    const current = await planRef.get();

    if (current.exists() && current.data()?.lastPaymentRef === reference) {
      // Already activated by webhook — just return success
      return res.status(200).json({ success: true, already: true });
    }

    const durationMs       = PLAN_DURATIONS[interval] || PLAN_DURATIONS.monthly;
    const expiresAt        = new Date(Date.now() + durationMs + BUFFER_MS).toISOString();
    const subscriptionCode = txData.subscription_code || "";

    await planRef.set({
      plan:             "pro",
      interval,
      planCode,
      subscriptionCode,
      expiresAt,
      activatedAt:      new Date().toISOString(),
      lastPaymentRef:   reference,
      lastPaymentAt:    txData.paid_at || new Date().toISOString(),
      status:           "active",
    }, { merge: true });

    console.log(`✅ Verify-activated Pro for uid=${uid}, interval=${interval}, expires=${expiresAt}`);

    return res.status(200).json({
      success:    true,
      plan:       "pro",
      interval,
      expiresAt,
    });
  } catch (err) {
    console.error("paystack-verify error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
