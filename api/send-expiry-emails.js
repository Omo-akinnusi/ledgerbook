// api/send-expiry-emails.js
// Runs daily at 7am UTC (8am WAT) via Vercel cron.
// Finds Pro users with subscriptions expiring in 7 days, 1 day, or today
// and sends them a reminder email via Resend.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL     = "Cash Counter <noreply@cashcounter.vbookng.com>";
const APP_URL        = process.env.APP_URL || "https://cashcounter.vbookng.com";
const CRON_SECRET    = process.env.CRON_SECRET; // optional security token

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

async function sendEmail(to, subject, html) {
  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Resend error");
  return data;
}

function expiryEmailHTML({ name, daysLeft, expiresAt, interval }) {
  const intervalLabel = { monthly:"Monthly", biannually:"6-Month", annually:"Annual" }[interval] || "Pro";
  const expireDate    = new Date(expiresAt).toLocaleDateString("en-NG", { day:"numeric", month:"long", year:"numeric" });

  const isExpired  = daysLeft <= 0;
  const isUrgent   = daysLeft === 1;

  const headline = isExpired
    ? "Your Pro plan has expired"
    : isUrgent
      ? "Your Pro plan expires tomorrow"
      : `Your Pro plan expires in ${daysLeft} days`;

  const bodyText = isExpired
    ? `Your Cash Counter Pro (${intervalLabel}) plan expired on ${expireDate}. Your account has been moved to the free plan. You can still access all your existing data.`
    : `Your Cash Counter Pro (${intervalLabel}) plan expires on ${expireDate}. Renew now to keep unlimited entries, budget tracking, and an ad-free experience.`;

  const ctaText  = isExpired ? "Resubscribe to Pro" : "Renew My Plan";
  const ctaColor = isExpired ? "#c62828" : "#075E54";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:${ctaColor};padding:28px 36px;text-align:center;">
            <div style="font-size:36px;margin-bottom:8px;">💰</div>
            <div style="color:#ffffff;font-size:22px;font-weight:900;letter-spacing:-0.5px;">Cash Counter</div>
            <div style="color:rgba(255,255,255,0.7);font-size:12px;margin-top:4px;">by VBook Enterprise</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px;">
            <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">Hi ${name},</p>
            <h2 style="font-size:20px;font-weight:900;color:${ctaColor};margin:0 0 16px;letter-spacing:-0.3px;">
              ${headline}
            </h2>
            <p style="font-size:15px;color:#444;line-height:1.65;margin:0 0 24px;">
              ${bodyText}
            </p>

            ${!isExpired ? `
            <!-- What you'll lose -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:14px;margin-bottom:24px;">
              <tr><td style="padding:18px 20px;">
                <p style="font-size:12px;font-weight:800;color:#999;text-transform:uppercase;letter-spacing:1px;margin:0 0 12px;">Pro features you currently enjoy</p>
                ${["Unlimited entries (free plan: 20/month)", "Budget tracking & alerts", "Ad-free experience", "Edit entries", "PDF & CSV reports"].map(f =>
                  `<p style="font-size:14px;color:#333;margin:0 0 6px;">✅ ${f}</p>`
                ).join("")}
              </td></tr>
            </table>
            ` : ""}

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <a href="${APP_URL}" style="display:inline-block;background:${ctaColor};color:#ffffff;
                  text-decoration:none;font-size:16px;font-weight:900;padding:16px 40px;
                  border-radius:14px;letter-spacing:-0.2px;">
                  ${ctaText} →
                </a>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 36px 28px;border-top:1px solid #f0f0f0;">
            <p style="font-size:12px;color:#aaa;text-align:center;margin:0;line-height:1.6;">
              You're receiving this because you have a Cash Counter Pro subscription.<br/>
              <a href="${APP_URL}/privacy" style="color:#aaa;">Privacy Policy</a> &middot;
              <a href="${APP_URL}/terms" style="color:#aaa;">Terms of Service</a><br/>
              VBook Enterprise · Nigeria
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  // Security — only allow Vercel cron or requests with the correct secret
  const authHeader = req.headers["authorization"];
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!RESEND_API_KEY) {
    console.error("RESEND_API_KEY not set");
    return res.status(500).json({ error: "Email service not configured" });
  }

  try {
    const db    = getDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Build date targets: today, today+1, today+7
    const targets = [0, 1, 7].map(d => {
      const t = new Date(today);
      t.setDate(t.getDate() + d);
      return t.toISOString().split("T")[0]; // YYYY-MM-DD
    });

    // Query all Pro users
    const usersSnap = await db.collection("users").get();
    const results   = { sent: 0, skipped: 0, errors: [] };

    await Promise.all(usersSnap.docs.map(async (userDoc) => {
      const uid     = userDoc.id;
      const profile = userDoc.data();
      const email   = profile.email;
      const name    = profile.name || profile.businessName || "there";

      if (!email) return;

      try {
        const planSnap = await db.doc(`users/${uid}/settings/plan`).get();
        if (!planSnap.exists()) return;

        const plan = planSnap.data();
        if (plan.plan !== "pro" || !plan.expiresAt) return;

        const expiresAt  = new Date(plan.expiresAt);
        const expireDate = expiresAt.toISOString().split("T")[0];
        const daysLeft   = Math.ceil((expiresAt - today) / 86400000);

        // Only send on the target days
        if (!targets.includes(expireDate) && daysLeft > 0) return;
        if (daysLeft > 7) return;

        // Avoid duplicate emails — check lastReminderSent
        const reminderKey = `reminder_${daysLeft <= 0 ? "expired" : daysLeft}`;
        if (plan.lastReminderSent === reminderKey) {
          results.skipped++;
          return;
        }

        const subject = daysLeft <= 0
          ? "Your Cash Counter Pro plan has expired"
          : daysLeft === 1
            ? "Your Cash Counter Pro plan expires tomorrow ⏰"
            : `Your Cash Counter Pro plan expires in ${daysLeft} days`;

        const html = expiryEmailHTML({
          name,
          daysLeft,
          expiresAt: plan.expiresAt,
          interval:  plan.interval || "monthly",
        });

        await sendEmail(email, subject, html);

        // Mark as sent to avoid duplicates
        await db.doc(`users/${uid}/settings/plan`).set(
          { lastReminderSent: reminderKey, lastReminderAt: new Date().toISOString() },
          { merge: true }
        );

        results.sent++;
        console.log(`Sent ${reminderKey} to ${email}`);
      } catch(e) {
        results.errors.push({ uid, error: e.message });
        console.error(`Failed for ${uid}:`, e.message);
      }
    }));

    return res.status(200).json({
      success: true,
      date:    today.toISOString().split("T")[0],
      ...results,
    });

  } catch(e) {
    console.error("send-expiry-emails error:", e);
    return res.status(500).json({ error: e.message });
  }
};
