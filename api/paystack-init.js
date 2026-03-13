// api/paystack-init.js
// Amount map in kobo (Paystack requires amount > 0 even when using a plan code)
const PLAN_AMOUNTS = {
  PLN_gh2mcit6fixix9k: 150000,   // Monthly  ₦1,500
  PLN_gxtrrhn8z2tfqmf: 750000,   // 6-Month  ₦7,500
  PLN_87ghrcbnb4p8aaa: 1350000,  // Annual   ₦13,500
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, planCode, uid } = req.body || {};
  if (!email || !planCode || !uid) return res.status(400).json({ error: 'Missing required fields: email, planCode, uid' });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(500).json({ error: 'Paystack secret key not configured' });

  const appUrl  = process.env.APP_URL || 'https://ledgerbook-nu.vercel.app';
  const amount  = PLAN_AMOUNTS[planCode] || 150000;

  try {
    const payload = {
      email:        email,
      plan:         planCode,
      amount:       amount,
      callback_url: appUrl + '/subscription-success?uid=' + uid,
      metadata: {
        uid: uid,
        custom_fields: [{ display_name: 'User ID', variable_name: 'uid', value: uid }],
      },
    };

    console.log('Paystack payload:', JSON.stringify(payload));

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + secret,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log('Paystack response:', JSON.stringify(data));

    if (!data.status) {
      console.error('Paystack init failed:', data);
      return res.status(400).json({ error: data.message || 'Failed to initialize transaction' });
    }

    return res.status(200).json({
      authorization_url: data.data.authorization_url,
      access_code:       data.data.access_code,
      reference:         data.data.reference,
    });
  } catch (err) {
    console.error('paystack-init error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
