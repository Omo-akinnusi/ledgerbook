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
          <p style="font-size:14px;color:#666;line-height:1.65;margin:0 0 24px">
            Please sign in to add your bank details so we can process your weekly payments.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
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

module.exports = { sendEmail, applicationReceivedHTML, applicationApprovedHTML, applicationRejectedHTML };
