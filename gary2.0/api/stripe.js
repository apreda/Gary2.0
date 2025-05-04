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

// Create a checkout session
export async function createCheckoutSession(req, res) {
  try {
    const { priceId, userId, successUrl, cancelUrl } = req.body;

    // Create a checkout session
    const session = await stripe.checkout.sessions.create({
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
      customer_email: req.body.email,
      metadata: {
        userId: userId,
      },
    });

    return { id: session.id, url: session.url };
  } catch (error) {
    console.error('Error creating checkout session:', error);
    throw new Error('Error creating checkout session');
  }
}

// Handle Stripe webhook
export async function handleStripeWebhook(req, res) {
  const signature = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    throw new Error(`Webhook Error: ${error.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      // Extract the customer and subscription IDs
      const { client_reference_id, customer, subscription } = session;
      
      if (client_reference_id) {
        // Update the user's status in Supabase
        const { error } = await supabase
          .from('profiles')
          .update({
            is_subscribed: true,
            stripe_customer_id: customer,
            stripe_subscription_id: subscription,
            subscription_status: 'active',
            subscription_tier: 'pro'
          })
          .eq('id', client_reference_id);
          
        if (error) {
          console.error('Error updating user subscription status:', error);
        }
      }
      break;
    }
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      // Handle subscription updates (e.g., plan changes, payment failures)
      const customerId = subscription.customer;
      const status = subscription.status;
      
      const { data: profiles, error } = await supabase
        .from('profiles')
        .update({
          subscription_status: status,
        })
        .eq('stripe_customer_id', customerId);
        
      if (error) {
        console.error('Error updating subscription status:', error);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      // Update the user's subscription status in your database
      const { error } = await supabase
        .from('profiles')
        .update({
          is_subscribed: false,
          subscription_status: 'canceled',
          subscription_tier: 'free'
        })
        .eq('stripe_customer_id', customerId);
        
      if (error) {
        console.error('Error updating canceled subscription:', error);
      }
      break;
    }
    default:
      // Unexpected event type
      console.log(`Unhandled event type ${event.type}`);
  }

  return { received: true };
}

// Get active subscription for a user
export async function getUserSubscription(userId) {
  try {
    // Get user from Supabase
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('stripe_subscription_id, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error || !profiles.stripe_subscription_id) {
      return null;
    }

    // Get subscription details from Stripe
    const subscription = await stripe.subscriptions.retrieve(
      profiles.stripe_subscription_id
    );

    return subscription;
  } catch (error) {
    console.error('Error fetching user subscription:', error);
    return null;
  }
}

// Cancel subscription
export async function cancelSubscription(userId) {
  try {
    // Get user's subscription ID from your database
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', userId)
      .single();

    if (error || !profile.stripe_subscription_id) {
      throw new Error('Subscription not found');
    }

    // Cancel the subscription at period end
    const canceledSubscription = await stripe.subscriptions.update(
      profile.stripe_subscription_id,
      { cancel_at_period_end: true }
    );

    return { success: true, subscription: canceledSubscription };
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw new Error('Error canceling subscription');
  }
}

// Create a customer portal session for managing subscriptions
export async function createCustomerPortalSession(userId) {
  try {
    // Get user's customer ID from your database
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error || !profile.stripe_customer_id) {
      throw new Error('Customer not found');
    }

    // Create a billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: process.env.STRIPE_PORTAL_RETURN_URL,
    });

    return { url: session.url };
  } catch (error) {
    console.error('Error creating customer portal session:', error);
    throw new Error('Error creating customer portal session');
  }
}
