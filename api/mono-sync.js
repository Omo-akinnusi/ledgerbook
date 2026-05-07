// api/mono-sync.js
// Fetches transactions from Mono and imports them as Cash Counter entries.
// Deduplicates against existing entries using Mono transaction IDs.
// Pro users only.

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

// Map Mono transaction type to Cash Counter type
function mapType(tx) {
  // Mono: "debit" = money out = expense, "credit" = money in = income
  return tx.type === "credit" ? "income" : "expense";
}

// Map Mono category to Cash Counter category
function mapCategory(tx, type) {
  const narration = (tx.narration || "").toLowerCase();
  const category  = (tx.category  || "").toLowerCase();

  if (type === "income") {
    if (narration.includes("salary") || narration.includes("payroll")) return "Salary";
    if (narration.includes("transfer") || narration.includes("trf"))    return "Transfer In";
    if (narration.includes("refund"))                                    return "Refund";
    return "Bank Credit";
  } else {
    if (narration.includes("airtime") || narration.includes("data"))    return "Airtime & Data";
    if (narration.includes("transfer") || narration.includes("trf"))    return "Transfer Out";
    if (narration.includes("pos") || narration.includes("purchase"))    return "Operations";
    if (narration.includes("fuel") || narration.includes("petrol"))     return "Transport";
    if (narration.includes("salary") || narration.includes("payroll"))  return "Salaries";
    if (narration.includes("rent"))                                      return "Rent";
    if (narration.includes("electricity") || narration.includes("nepa") || narration.includes("ekedc")) return "Utilities";
    return "Bank Debit";
  }
}

// Format Mono date (DD/MM/YYYY or ISO) to YYYY-MM-DD
function formatDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  if (dateStr.includes("/")) {
    const [d, m, y] = dateStr.split("/");
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  return dateStr.slice(0, 10);
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

    // ── Verify user is Pro ────────────────────────────────
    const planSnap = await db.doc(`users/${uid}/settings/plan`).get();
    if (!planSnap.exists || planSnap.data().plan !== "pro") {
      return res.status(403).json({ error: "Pro subscription required" });
    }

    // ── Get Mono account ID from Firestore ────────────────
    const monoSnap = await db.doc(`users/${uid}/settings/mono`).get();
    if (!monoSnap.exists || !monoSnap.data().accountId) {
      return res.status(400).json({ error: "No Mono account connected" });
    }

    const { accountId } = monoSnap.data();

    // ── Fetch last 90 days of transactions from Mono ──────
    const end   = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 90);

    const monoUrl = `https://api.withmono.com/accounts/${accountId}/transactions?` +
      `start=${start.toISOString().split("T")[0]}&end=${end.toISOString().split("T")[0]}&paginate=false`;

    let monoTxs = [];
    try {
      const monoRes = await fetch(monoUrl, {
        headers: { "mono-sec-key": process.env.MONO_SECRET_KEY },
      });
      const monoData = await monoRes.json();
      monoTxs = monoData.data || [];
    } catch (e) {
      console.error("Mono fetch error:", e.message);
      return res.status(500).json({ error: "Failed to fetch transactions from Mono" });
    }

    if (monoTxs.length === 0) {
      return res.status(200).json({ ok: true, imported: 0, skipped: 0 });
    }

    // ── Get existing Mono transaction IDs to deduplicate ──
    const entriesRef = db.collection(`users/${uid}/entries`);
    const existingSnap = await entriesRef
      .where("source", "==", "mono")
      .get();
    const existingMonoIds = new Set(existingSnap.docs.map(d => d.data().monoTxId).filter(Boolean));

    // ── Import new transactions as entries ────────────────
    const batch   = db.batch();
    let imported  = 0;
    let skipped   = 0;

    for (const tx of monoTxs) {
      const monoTxId = tx._id || tx.id;

      // Skip if already imported
      if (existingMonoIds.has(monoTxId)) { skipped++; continue; }

      // Skip zero-amount transactions
      const amount = Math.abs(tx.amount / 100); // Mono returns amount in kobo
      if (!amount || amount <= 0) { skipped++; continue; }

      const type     = mapType(tx);
      const category = mapCategory(tx, type);
      const date     = formatDate(tx.date);

      const entryRef = entriesRef.doc();
      batch.set(entryRef, {
        type,
        amount,
        category,
        date,
        note:      tx.narration || "",
        source:    "mono",           // marks this as a bank import
        monoTxId,                    // for deduplication
        createdAt: new Date().toISOString(),
      });

      imported++;
    }

    // ── Update account balance and last sync time ─────────
    const balanceRes = await fetch(`https://api.withmono.com/accounts/${accountId}`, {
      headers: { "mono-sec-key": process.env.MONO_SECRET_KEY },
    }).catch(() => null);

    const newBalance = balanceRes
      ? (await balanceRes.json()).account?.balance || 0
      : monoSnap.data().balance;

    await db.doc(`users/${uid}/settings/mono`).set({
      lastSyncAt: new Date().toISOString(),
      balance:    newBalance,
    }, { merge: true });

    if (imported > 0) await batch.commit();

    console.log(`Mono sync for user ${uid}: imported ${imported}, skipped ${skipped}`);
    return res.status(200).json({ ok: true, imported, skipped });
  });
};
