// api/paystack-webhook.js
// Security: signature verification, no sensitive logging, input validation
const crypto = require("crypto");

let admin;

// Cash Counter Firebase (main app)
function getDb() {
  if (!admin) admin = require("firebase-admin");
  if (!admin.apps.length) {
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

// Ninja Firebase (separate project)
function getNinjaDb() {
  if (!admin) admin = require("firebase-admin");
  const ninjaProjectId   = process.env.NINJA_FIREBASE_PROJECT_ID;
  const ninjaClientEmail = process.env.NINJA_FIREBASE_CLIENT_EMAIL;
  const ninjaPrivateKey  = (process.env.NINJA_FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!ninjaProjectId || !ninjaClientEmail || !ninjaPrivateKey) {
    console.warn("Ninja Firebase credentials not configured — skipping commission tracking");
    return null;
  }

  try {
    admin.app("ninja");
  } catch(e) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   ninjaProjectId,
        clientEmail: ninjaClientEmail,
        privateKey:  ninjaPrivateKey,
      }),
    }, "ninja");
  }
  return admin.app("ninja").firestore();
}

const PLAN_DURATIONS = {
  monthly:    30  * 24 * 60 * 60 * 1000,
  biannually: 183 * 24 * 60 * 60 * 1000,
  annually:   365 * 24 * 60 * 60 * 1000,
};
const BUFFER_MS = 2 * 24 * 60 * 60 * 1000;

// Commission rates — 20% of first payment in naira
const COMMISSION_RATES = {
  monthly:    1000,   // 20% of ₦5,000
  biannually: 5400,   // 20% of ₦27,000
  annually:   10000,  // 20% of ₦50,000
};

function isValidUid(uid) {
  return typeof uid === "string" && uid.length > 10 && uid.length < 200 && /^[a-zA-Z0-9_-]+$/.test(uid);
}

async function processCommission(db, uid, interval, userEmail, reference) {
  try {
    // Get referred ninja code from Cash Counter user profile
    const userDoc = await db.doc("users/" + uid).get();
    if (!userDoc.exists) return;

    const referredBy = userDoc.data().referredBy;
    if (!referredBy) return;

    // Write commission to Ninja Firestore (separate project)
    const ninjaDb = getNinjaDb();
    if (!ninjaDb) return;

    // Find ninja by referral code in Ninja project
    const ninjaSnap = await ninjaDb.collection("ninjas")
      .where("referralCode", "==", referredBy).limit(1).get();
    if (ninjaSnap.empty) {
      console.warn("No ninja found for referral code:", referredBy);
      return;
    }

    const ninjaDoc = ninjaSnap.docs[0];
    const ninjaId  = ninjaDoc.id;

    // Check idempotency — don't double commission for same payment
    const existingSnap = await ninjaDb.collection("ninjas").doc(ninjaId)
      .collection("commissions")
      .where("paymentRef", "==", reference).limit(1).get();
    if (!existingSnap.empty) return;

    const commissionAmount = COMMISSION_RATES[interval] || COMMISSION_RATES.monthly;

    // Add commission record to Ninja project
    await ninjaDb.collection("ninjas").doc(ninjaId)
      .collection("commissions").add({
        userId:       uid,
        userEmail:    userEmail || "",
        interval:     interval,
        commission:   commissionAmount,
        paymentRef:   reference,
        status:       "pending",
        createdAt:    admin.firestore.FieldValue.serverTimestamp(),
      });

    // Update ninja totals in Ninja project
    await ninjaDb.doc("ninjas/" + ninjaId).set({
      paidUsers:     admin.firestore.FieldValue.increment(1),
      totalEarnings: admin.firestore.FieldValue.increment(commissionAmount),
    }, { merge: true });

    console.log("Commission logged for ninja:", ninjaId, "amount:", commissionAmount);
  } catch(e) {
    console.error("Commission processing error:", e.message);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // ── Verify Paystack signature ──
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
      const metaInterval     = data.metadata && data.metadata.interval;
      const planCode         = data.plan || null;
      const interval         = metaInterval ||
                               (data.plan_object && data.plan_object.interval) ||
                               "monthly";
      const subscriptionCode = data.subscription_code || "";
      const userEmail        = data.customer && data.customer.email;

      if (!isValidUid(uid)) {
        console.warn("Webhook charge.success: invalid or missing uid");
        return res.status(200).send("OK");
      }

      const durationMs = PLAN_DURATIONS[interval] || PLAN_DURATIONS.monthly;
      const expiresAt  = new Date(Date.now() + durationMs + BUFFER_MS).toISOString();

      // Check if this is the first payment (for commission — only on first payment)
      const planRef     = db.doc("users/" + uid + "/settings/plan");
      const existingPlan = await planRef.get();
      const isFirstPayment = !existingPlan.exists || existingPlan.data().plan !== "pro";

      await planRef.set({
        plan:             "pro",
        interval:         interval,
        planCode:         planCode || "",
        subscriptionCode: subscriptionCode,
        expiresAt:        expiresAt,
        activatedAt:      new Date().toISOString(),
        lastPaymentRef:   data.reference,
        lastPaymentAt:    data.paid_at || new Date().toISOString(),
        status:           "active",
      }, { merge: true });

      // Process commission only on first payment
      if (isFirstPayment) {
        await processCommission(db, uid, interval, userEmail, data.reference);

        // Increment ninja total signups if referred
        const userDoc = await db.doc("users/" + uid).get();
        if (userDoc.exists && userDoc.data().referredBy) {
          // totalUsers already incremented at signup — paidUsers incremented in processCommission
        }
      }
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
    return res.status(200).send("OK");
  }
};
