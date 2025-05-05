import Stripe from 'stripe';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Initialize Stripe with your secret key
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    
    const { priceId, userId, email, successUrl, cancelUrl } = req.body;

    // Create a checkout session with embedded checkout support
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || 'https://betwithgary.ai/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancelUrl || 'https://betwithgary.ai/checkout/cancel?session_id={CHECKOUT_SESSION_ID}',
      client_reference_id: userId,
      customer_email: email,
      metadata: {
        userId: userId,
      },
      // Support for embedded checkout
      ui_mode: req.body.uiMode || 'hosted',
    });

    // For embedded checkout, we need to return the client_secret
    return res.status(200).json({
      id: session.id,
      url: session.url,
      clientSecret: session.client_secret
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
