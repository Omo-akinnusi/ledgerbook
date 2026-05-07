// api/mono.js
// Consolidated Mono endpoint — routes by action param
// Actions: exchange | sync | disconnect

const cors = require("cors")({ origin: true });

let _admin;

function getAdmin() {
  if (!_admin) _admin = require("firebase-admin");
  if (!_admin.apps.length) {
    _admin.initializeApp({
      credential: _admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  }
  return _admin;
}

function getDb() {
  return getAdmin().app().firestore();
}

// ── Helpers ───────────────────────────────────────────────
async function verifyToken(uid, idToken) {
  const a = getAdmin();
  const decoded = await a.app().auth().verifyIdToken(idToken);
  if (decoded.uid !== uid) throw new Error("Token uid mismatch");
  return decoded;
}

async function assertPro(uid, db) {
  const planSnap = await db.doc(`users/${uid}/settings/plan`).get();
  if (!planSnap.exists || planSnap.data().plan !== "pro") {
    throw Object.assign(new Error("Pro subscription required"), { status: 403 });
  }
}

function mapType(tx) {
  return tx.type === "credit" ? "income" : "expense";
}

function mapCategory(tx, type) {
  const n = (tx.narration || "").toLowerCase();
  if (type === "income") {
    if (n.includes("salary") || n.includes("payroll")) return "Salary";
    if (n.includes("transfer") || n.includes("trf"))   return "Transfer In";
    if (n.includes("refund"))                           return "Refund";
    return "Bank Credit";
  } else {
    if (n.includes("airtime") || n.includes("data"))   return "Airtime & Data";
    if (n.includes("transfer") || n.includes("trf"))   return "Transfer Out";
    if (n.includes("pos") || n.includes("purchase"))   return "Operations";
    if (n.includes("fuel") || n.includes("petrol"))    return "Transport";
    if (n.includes("salary") || n.includes("payroll")) return "Salaries";
    if (n.includes("rent"))                             return "Rent";
    if (n.includes("electricity") || n.includes("nepa") || n.includes("ekedc")) return "Utilities";
    return "Bank Debit";
  }
}

function formatDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split("T")[0];
  // Mono v2 returns full ISO timestamps e.g. "2026-05-07T15:08:55.818Z"
  // Mono v1 returned DD/MM/YYYY
  if (dateStr.includes("T")) return dateStr.slice(0, 10);
  if (dateStr.includes("/")) {
    const [d, m, y] = dateStr.split("/");
    return `${y}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
  }
  return dateStr.slice(0, 10);
}

// ── Actions ───────────────────────────────────────────────
async function exchange(uid, code, db) {
  const monoRes = await fetch("https://api.withmono.com/v2/accounts/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "mono-sec-key": process.env.MONO_SECRET_KEY,
    },
    body: JSON.stringify({ code }),
  });
  const monoData = await monoRes.json();
  if (!monoRes.ok || !monoData.data?.id) {
    throw Object.assign(new Error(monoData.message || "Failed to exchange code"), { status: 400 });
  }

  const accountId = monoData.data.id;
  const detailsRes = await fetch(`https://api.withmono.com/v2/accounts/${accountId}`, {
    headers: { "mono-sec-key": process.env.MONO_SECRET_KEY },
  });
  const details = await detailsRes.json();
  const acct = details.data?.account || {};

  await db.doc(`users/${uid}/settings/mono`).set({
    accountId,
    accountName:   acct.name             || "",
    accountNumber: acct.account_number   || acct.accountNumber || "",
    bankName:      acct.institution?.name|| "",
    accountType:   acct.type             || "",
    currency:      acct.currency         || "NGN",
    balance:       acct.balance          || 0,
    connectedAt:   new Date().toISOString(),
    lastSyncAt:    null,
    status:        "active",
  }, { merge: true });

  console.log(`Mono connected for user ${uid}: ${accountId}`);
  return {
    accountId,
    accountName:   acct.name             || "",
    bankName:      acct.institution?.name|| "",
    accountNumber: acct.account_number   || acct.accountNumber || "",
    balance:       acct.balance          || 0,
  };
}

async function sync(uid, db) {
  const monoSnap = await db.doc(`users/${uid}/settings/mono`).get();
  if (!monoSnap.exists || !monoSnap.data().accountId) {
    throw Object.assign(new Error("No Mono account connected"), { status: 400 });
  }
  const { accountId } = monoSnap.data();

  // Format date as DD/MM/YYYY — required by Mono v2 transactions API
  const monoDate = (d) =>
    `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;

  const end   = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 90);

  const monoRes = await fetch(
    `https://api.withmono.com/v2/accounts/${accountId}/transactions?` +
    `start=${monoDate(start)}&end=${monoDate(end)}&paginate=false`,
    { headers: { "mono-sec-key": process.env.MONO_SECRET_KEY } }
  );
  const monoData = await monoRes.json();
  const monoTxs = monoData.data || [];

  console.log(`Mono sync: fetched ${monoTxs.length} transactions for account ${accountId}`);

  const entriesRef    = db.collection(`users/${uid}/entries`);
  const existingSnap  = await entriesRef.where("source", "==", "mono").get();
  const existingIds   = new Set(existingSnap.docs.map(d => d.data().monoTxId).filter(Boolean));

  const batch = db.batch();
  let imported = 0, skipped = 0;

  for (const tx of monoTxs) {
    const monoTxId = tx._id || tx.id;
    if (existingIds.has(monoTxId)) { skipped++; continue; }
    const amount = Math.abs(tx.amount / 100);
    if (!amount || amount <= 0)   { skipped++; continue; }

    const type     = mapType(tx);
    const category = mapCategory(tx, type);
    const date     = formatDate(tx.date);

    batch.set(entriesRef.doc(), {
      type, amount, category, date,
      note:      tx.narration || "",
      source:    "mono",
      monoTxId,
      createdAt: new Date().toISOString(),
    });
    imported++;
  }

  const balRes = await fetch(`https://api.withmono.com/v2/accounts/${accountId}`,
    { headers: { "mono-sec-key": process.env.MONO_SECRET_KEY } }).catch(() => null);
  const balData = balRes ? await balRes.json() : null;
  const newBal  = balData?.data?.account?.balance ?? monoSnap.data().balance;

  await db.doc(`users/${uid}/settings/mono`).set({
    lastSyncAt: new Date().toISOString(),
    balance:    newBal,
  }, { merge: true });

  if (imported > 0) await batch.commit();
  console.log(`Mono sync for user ${uid}: imported ${imported}, skipped ${skipped}`);
  return { imported, skipped };
}

async function disconnect(uid, db) {
  const monoSnap  = await db.doc(`users/${uid}/settings/mono`).get();
  const accountId = monoSnap.exists ? monoSnap.data().accountId : null;

  if (accountId) {
    await fetch(`https://api.withmono.com/v2/accounts/${accountId}/unlink`, {
      method: "POST",
      headers: { "mono-sec-key": process.env.MONO_SECRET_KEY },
    }).catch(e => console.warn("Mono unlink warning:", e.message));
  }

  await db.doc(`users/${uid}/settings/mono`).delete();

  const monoEntries = await db.collection(`users/${uid}/entries`)
    .where("source", "==", "mono").get();

  if (!monoEntries.empty) {
    const batch = db.batch();
    monoEntries.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  console.log(`Mono disconnected for user ${uid}. Deleted ${monoEntries.size} entries.`);
  return { deleted: monoEntries.size };
}

// ── Main handler ──────────────────────────────────────────
module.exports = async function handler(req, res) {
  cors(req, res, async () => {
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { action, uid, idToken, code } = req.body || {};

    if (!action || !uid || !idToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["exchange", "sync", "disconnect"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    try {
      await verifyToken(uid, idToken);
    } catch (e) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const db = getDb();

    try {
      await assertPro(uid, db);
    } catch (e) {
      return res.status(403).json({ error: e.message });
    }

    try {
      let result;
      if (action === "exchange")   result = await exchange(uid, code, db);
      if (action === "sync")       result = await sync(uid, db);
      if (action === "disconnect") result = await disconnect(uid, db);
      return res.status(200).json({ ok: true, ...result });
    } catch (e) {
      console.error(`mono/${action} error:`, e.message);
      return res.status(e.status || 500).json({ error: e.message || "Internal error" });
    }
  });
};
