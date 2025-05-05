import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Stripe with your secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { priceId, userId, email, successUrl, cancelUrl, uiMode } = req.body;

    if (!priceId || !userId || !email) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Configure session based on UI mode
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || process.env.STRIPE_SUCCESS_URL,
      cancel_url: cancelUrl || process.env.STRIPE_CANCEL_URL,
      client_reference_id: userId,
      customer_email: email,
      metadata: {
        userId: userId,
      },
    };

    // For embedded checkout, we need to set UI mode
    if (uiMode === 'embedded') {
      sessionConfig.ui_mode = 'embedded';
      sessionConfig.return_url = successUrl || process.env.STRIPE_SUCCESS_URL;
    }

    // Create a checkout session
    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Return different data based on UI mode
    if (uiMode === 'embedded') {
      return res.status(200).json({ clientSecret: session.client_secret });
    } else {
      return res.status(200).json({ id: session.id, url: session.url });
    }
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: 'Error creating checkout session' });
  }
}
