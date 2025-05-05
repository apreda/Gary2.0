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

// Use the specific Product and Price IDs
const PRODUCT_ID = 'prod_SFbRcQEyjcOfYH';
const PRICE_ID = 'price_1RL6F2KIQvF46lkOjqnjUPE1';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, email, successUrl, cancelUrl, uiMode } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Configure session based on UI mode
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: PRICE_ID, // Use the specific Price ID
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || process.env.STRIPE_SUCCESS_URL || `${process.env.NEXT_PUBLIC_URL}/checkout/success`,
      cancel_url: cancelUrl || process.env.STRIPE_CANCEL_URL || `${process.env.NEXT_PUBLIC_URL}/checkout/cancel`,
      client_reference_id: userId,
      customer_email: email,
      metadata: {
        userId: userId,
        productId: PRODUCT_ID
      },
    };

    // For embedded checkout, we need to set UI mode
    if (uiMode === 'embedded') {
      sessionConfig.ui_mode = 'embedded';
      sessionConfig.return_url = successUrl || process.env.STRIPE_SUCCESS_URL || `${process.env.NEXT_PUBLIC_URL}/checkout/success`;
    }

    console.log('Creating checkout session with config:', JSON.stringify(sessionConfig, null, 2));

    // Create a checkout session
    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log('Checkout session created:', session.id);

    // Return different data based on UI mode
    if (uiMode === 'embedded') {
      return res.status(200).json({ clientSecret: session.client_secret });
    } else {
      return res.status(200).json({ id: session.id, url: session.url });
    }
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: `Error creating checkout session: ${error.message}` });
  }
}
