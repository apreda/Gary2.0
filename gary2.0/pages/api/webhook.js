// Import required libraries
import Stripe from 'stripe';
import { buffer } from 'micro';
import { createClient } from '@supabase/supabase-js';

// Disable the default body parser
export const config = {
  api: {
    bodyParser: false,
  },
};

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  console.log('Webhook handler received request:', {
    method: req.method,
    url: req.url,
    headers: Object.keys(req.headers),
  });

  // Only allow POST requests for this endpoint
  if (req.method !== 'POST') {
    console.log('Method not allowed:', req.method);
    return res.status(405).end('Method Not Allowed - Only POST is supported');
  }

  let event;
  
  try {
    // Get the raw body
    const rawBody = await buffer(req);
    const sig = req.headers['stripe-signature'];
    
    console.log('Processing webhook with signature:', sig?.substring(0, 20) + '...');
    
    // Verify the webhook
    try {
      event = stripe.webhooks.constructEvent(
        rawBody.toString(),
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
      console.log('Event constructed successfully:', event.type);
    } catch (verifyError) {
      console.error('Webhook signature verification failed:', verifyError.message);
      return res.status(400).send(`Webhook Error: ${verifyError.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      console.log('Processing checkout.session.completed event');
      
      const session = event.data.object;
      const { client_reference_id, customer, subscription } = session;
      const customerEmail = session.customer_details?.email;
      
      console.log('Session data:', { 
        customer, 
        subscription, 
        client_reference_id,
        customerEmail 
      });
      
      // Only proceed if we have a subscription
      if (subscription) {
        try {
          // Get subscription details
          const subscriptionDetails = await stripe.subscriptions.retrieve(subscription);
          console.log('Subscription details retrieved');
          
          // Prepare the update data
          const updateData = {
            plan: '"pro"::text',
            stripe_customer_id: customer,
            stripe_subscription_id: subscription,
            subscription_status: 'active',
            subscription_period_start: new Date(subscriptionDetails.current_period_start * 1000).toISOString(),
            subscription_period_end: new Date(subscriptionDetails.current_period_end * 1000).toISOString()
          };
          
          console.log('Update data prepared:', updateData);
          
          // Try to update by client_reference_id if available
          if (client_reference_id) {
            console.log('Updating user by client_reference_id:', client_reference_id);
            const result = await supabase
              .from('users')
              .update(updateData)
              .eq('id', client_reference_id);
            
            if (result.error) {
              console.error('Error updating by client_reference_id:', result.error);
            } else {
              console.log('Successfully updated subscription for user by ID');
            }
          } 
          // Otherwise try to find user by email
          else if (customerEmail) {
            console.log('Looking up user by email:', customerEmail);
            const result = await supabase
              .from('users')
              .update(updateData)
              .eq('email', customerEmail);
            
            if (result.error) {
              console.error('Error updating by email:', result.error);
            } else {
              console.log('Successfully updated subscription for user by email');
            }
          } else {
            console.error('Cannot update user: Both client_reference_id and email are missing');
          }
        } catch (subscriptionError) {
          console.error('Error processing subscription details:', subscriptionError);
        }
      } else {
        console.error('Missing subscription in checkout.session.completed event');
      }
    } 
    // Handle subscription updates
    else if (event.type === 'customer.subscription.updated') {
      console.log('Processing customer.subscription.updated event');
      // ... similar implementation to handle subscription updates
    }
    // Handle subscription cancellations
    else if (event.type === 'customer.subscription.deleted') {
      console.log('Processing customer.subscription.deleted event');
      // ... similar implementation to handle subscription cancellations
    }
    else {
      console.log(`Unhandled event type: ${event.type}`);
    }

    // Return success
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Unexpected error in webhook handler:', err);
    return res.status(500).send(`Webhook Error: ${err.message}`);
  }
}
