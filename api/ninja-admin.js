// api/ninja-admin.js
// Server-side API for admin panel to read/write Ninja data
// Uses Admin SDK — bypasses Firestore rules
// Protected by ADMIN_SECRET env var

const ALLOWED_ORIGIN = process.env.APP_URL || "https://cashcounter.vbookng.com";
const ADMIN_SECRET   = process.env.ADMIN_SECRET;
// ── Email functions (inlined) ───────────────────────────────────
// api/ninja-notify.js
// Sends email notifications to Ninja applicants via Resend
// Called by ninja-admin API when status changes

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = "Cash Counter Ninja <noreply@cashcounter.vbookng.com>";
const NINJA_URL      = "https://ninja.vbookng.com";

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not set — skipping email");
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const data = await res.json();
    console.error("Resend error:", data.message);
  }
}

function applicationReceivedHTML(name) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f7f9fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <tr><td style="background:linear-gradient(135deg,#205361,#5CB1CB);padding:32px 36px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">🥷</div>
          <div style="color:#fff;font-size:22px;font-weight:900">Cash Counter Ninja</div>
          <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px">by VBook Enterprise</div>
        </td></tr>
        <tr><td style="padding:32px 36px">
          <p style="font-size:16px;color:#1a1a1a;margin:0 0 16px">Hi ${name},</p>
          <h2 style="font-size:20px;font-weight:900;color:#205361;margin:0 0 16px">We've received your application! ✅</h2>
          <p style="font-size:15px;color:#444;line-height:1.65;margin:0 0 16px">
            Thank you for applying to the Cash Counter Ninja programme. We've received your application and our team will review it within <strong>5 business days</strong>.
          </p>
          <p style="font-size:15px;color:#444;line-height:1.65;margin:0 0 24px">
            You can sign in to <a href="${NINJA_URL}" style="color:#205361;font-weight:700">ninja.vbookng.com</a> at any time to check your application status.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="${NINJA_URL}" style="display:inline-block;background:#205361;color:#fff;text-decoration:none;font-size:15px;font-weight:900;padding:14px 32px;border-radius:12px">
                Check Application Status →
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 36px 28px;border-top:1px solid #f0f0f0">
          <p style="font-size:12px;color:#aaa;text-align:center;margin:0">
            Cash Counter Ninja · VBook Enterprise · <a href="${NINJA_URL}" style="color:#aaa">ninja.vbookng.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function applicationApprovedHTML(name, referralCode) {
  const referralLink = `https://cashcounter.vbookng.com?ref=${referralCode}`;
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f7f9fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <tr><td style="background:linear-gradient(135deg,#205361,#5CB1CB);padding:32px 36px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">🥷</div>
          <div style="color:#fff;font-size:22px;font-weight:900">You're in, Ninja!</div>
          <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:4px">Cash Counter Ninja Programme</div>
        </td></tr>
        <tr><td style="padding:32px 36px">
          <p style="font-size:16px;color:#1a1a1a;margin:0 0 16px">Hi ${name},</p>
          <h2 style="font-size:20px;font-weight:900;color:#205361;margin:0 0 16px">Your application has been approved! 🎉</h2>
          <p style="font-size:15px;color:#444;line-height:1.65;margin:0 0 20px">
            Welcome to the Cash Counter Ninja team. You're officially ready to start earning. Here's your unique referral link:
          </p>
          <div style="background:#f0f7fa;border:2px solid #5CB1CB;border-radius:12px;padding:16px 20px;text-align:center;margin:0 0 20px">
            <div style="font-size:11px;font-weight:800;color:#5CB1CB;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Your Referral Link</div>
            <div style="font-size:13px;font-weight:700;color:#205361;word-break:break-all">${referralLink}</div>
          </div>
          <p style="font-size:15px;color:#444;line-height:1.65;margin:0 0 8px"><strong>Your earnings:</strong></p>
          <ul style="font-size:14px;color:#444;line-height:1.8;margin:0 0 20px;padding-left:20px">
            <li>₦1,000 per Monthly subscription</li>
            <li>₦5,400 per 6-Month subscription</li>
            <li>₦10,000 per Annual subscription</li>
            <li>₦30,000 bonus for 40+ paid users in a month</li>
          </ul>
          <p style="font-size:14px;color:#666;line-height:1.65;margin:0 0 20px">
            Please sign in to add your bank details so we can process your weekly payments.
          </p>
          <div style="background:#f0f7fa;border:2px solid #5CB1CB;border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center">
            <div style="font-size:11px;font-weight:800;color:#5CB1CB;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Join the Ninja Community</div>
            <p style="font-size:14px;color:#444;margin:0 0 14px;line-height:1.6">
              Join our Telegram channel for updates, tips, and resources to help you succeed as a Ninja.
            </p>
            <a href="https://t.me/+MS7YnNGEDJAxYzdk" style="display:inline-block;background:#229ED9;color:#fff;text-decoration:none;font-size:14px;font-weight:900;padding:11px 28px;border-radius:10px">
              Join Telegram Channel →
            </a>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding-bottom:12px">
              <a href="${NINJA_URL}" style="display:inline-block;background:#205361;color:#fff;text-decoration:none;font-size:15px;font-weight:900;padding:14px 32px;border-radius:12px">
                Go to Your Dashboard →
              </a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 36px 28px;border-top:1px solid #f0f0f0">
          <p style="font-size:12px;color:#aaa;text-align:center;margin:0">
            Cash Counter Ninja · VBook Enterprise · <a href="${NINJA_URL}" style="color:#aaa">ninja.vbookng.com</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function applicationRejectedHTML(name) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f7f9fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        <tr><td style="background:#205361;padding:32px 36px;text-align:center">
          <div style="font-size:36px;margin-bottom:8px">🥷</div>
          <div style="color:#fff;font-size:22px;font-weight:900">Cash Counter Ninja</div>
        </td></tr>
        <tr><td style="padding:32px 36px">
          <p style="font-size:16px;color:#1a1a1a;margin:0 0 16px">Hi ${name},</p>
          <h2 style="font-size:20px;font-weight:900;color:#c62828;margin:0 0 16px">Application update</h2>
          <p style="font-size:15px;color:#444;line-height:1.65;margin:0 0 16px">
            Thank you for your interest in the Cash Counter Ninja programme. After reviewing your application, we're unable to move forward at this time.
          </p>
          <p style="font-size:15px;color:#444;line-height:1.65;margin:0 0 24px">
            You're welcome to reapply in 30 days. In the meantime, you can still use <a href="https://cashcounter.vbookng.com" style="color:#205361;font-weight:700">Cash Counter</a> free to manage your own business finances.
          </p>
        </td></tr>
        <tr><td style="padding:20px 36px 28px;border-top:1px solid #f0f0f0">
          <p style="font-size:12px;color:#aaa;text-align:center;margin:0">
            Cash Counter Ninja · VBook Enterprise
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

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
      ].join("\n");

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
