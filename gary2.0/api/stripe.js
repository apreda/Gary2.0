import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables with priority for production environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Initialize Stripe with the secret key from environment variables
console.log('Initializing Stripe with environment key');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// For production, we'll skip the Supabase integration for now and focus on Stripe
let supabase = null;

// Log environment mode
console.log(`Running in ${process.env.NODE_ENV || 'development'} mode`);
console.log('Stripe initialized successfully.');

// Create a checkout session
export async function createCheckoutSession(req, res) {
  try {
    const { priceId, userId, successUrl, cancelUrl } = req.body;
    
    console.log('Creating checkout session with:', { priceId, userId });

    // Create a checkout session with the provided price ID
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
      // Enable automatic tax calculation if needed
      // automatic_tax: { enabled: true }
    });

    console.log('Checkout session created successfully:', session.id);
    return { id: session.id, url: session.url };
  } catch (error) {
    console.error('Error creating checkout session:', error.message);
    throw new Error(`Error creating checkout session: ${error.message}`);
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

  // Log all webhook events for now
  console.log(`Received webhook event: ${event.type}`);
  
  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      // Extract the customer and subscription IDs
      const { client_reference_id, customer, subscription } = session;
      
      console.log(`Checkout completed for user ${client_reference_id}`);
      console.log(`Customer: ${customer}, Subscription: ${subscription}`);
      
      // In production, you'd store this in your database
      // For now we'll just log it
      break;
    }
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const status = subscription.status;
      
      console.log(`Subscription ${subscription.id} updated for customer ${customerId}`);
      console.log(`New status: ${status}`);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      console.log(`Subscription ${subscription.id} deleted for customer ${customerId}`);
      break;
    }
    default:
      // Log other events
      console.log(`Received unhandled event type: ${event.type}`);
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
