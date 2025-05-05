import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's subscription details from your database
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('is_subscribed, subscription_status, subscription_tier, stripe_subscription_id, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'User not found' });
    }

    // If user has a subscription, fetch more details from Stripe
    if (profile.is_subscribed && profile.stripe_subscription_id) {
      // Initialize Stripe with your secret key
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      
      try {
        const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
        
        return res.status(200).json({
          active: subscription.status === 'active',
          status: subscription.status,
          tier: profile.subscription_tier,
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
        });
      } catch (stripeError) {
        console.error('Error fetching subscription from Stripe:', stripeError);
        
        // Return the database info if Stripe fetch fails
        return res.status(200).json({
          active: profile.is_subscribed,
          status: profile.subscription_status,
          tier: profile.subscription_tier,
        });
      }
    }

    // Return subscription status from database
    return res.status(200).json({
      active: profile.is_subscribed,
      status: profile.subscription_status || 'inactive',
      tier: profile.subscription_tier || 'free',
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
}
