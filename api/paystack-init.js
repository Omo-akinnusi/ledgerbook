// api/paystack-init.js
// Initializes a Paystack transaction for a subscription plan.
// Called by the frontend with { email, planCode, uid, currency }
// Returns { authorization_url, reference }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, planCode, uid, currency = "NGN" } = req.body || {};

  if (!email || !planCode || !uid) {
    return res.status(400).json({ error: "Missing required fields: email, planCode, uid" });
  }

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return res.status(500).json({ error: "Paystack secret key not configured" });
  }

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        plan: planCode,
        currency,
        // Embed uid in metadata so webhook can look up the user in Firestore
        metadata: {
          uid,
          custom_fields: [
            { display_name: "User ID", variable_name: "uid", value: uid },
          ],
        },
        // After payment, redirect back to the app's subscription success page
        callback_url: `${process.env.APP_URL || "https://ledgerbook-nu.vercel.app"}/subscription-success`,
      }),
    });

    const data = await response.json();

    if (!data.status) {
      return res.status(400).json({ error: data.message || "Failed to initialize transaction" });
    }

    return res.status(200).json({
      authorization_url: data.data.authorization_url,
      access_code:       data.data.access_code,
      reference:         data.data.reference,
    });
  } catch (err) {
    console.error("paystack-init error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
