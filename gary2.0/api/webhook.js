import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
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
    // Get the raw body as buffer
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const sig = req.headers['stripe-signature'];
    
    console.log('Processing webhook with signature:', sig?.substring(0, 20) + '...');
    
    // Verify the webhook
    try {
      event = stripe.webhooks.constructEvent(
        rawBody,
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
            plan: 'pro', // Changed from PostgreSQL casting to simple string
            stripe_customer_id: customer,
            stripe_subscription_id: subscription,
            subscription_status: 'active',
            subscription_period_start: new Date(subscriptionDetails.current_period_start * 1000).toISOString(),
            subscription_period_end: new Date(subscriptionDetails.current_period_end * 1000).toISOString()
          };
          
          console.log('Supabase URL:', supabaseUrl);
          console.log('User email being processed:', customerEmail);
          
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
            // Log the exact query we're about to run
            console.log('Running Supabase update with email:', customerEmail);
            
            // First check if the user exists
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('id, email')
              .eq('email', customerEmail)
              .single();
              
            if (userError || !userData) {
              console.error('Error finding user by email:', userError || 'No user found');
              console.log('Trying case insensitive search...');
              
              // Try a case-insensitive search as fallback
              const { data: fuzzyUserData } = await supabase
                .from('users')
                .select('id, email')
                .ilike('email', customerEmail);
                
              console.log('Fuzzy email search results:', fuzzyUserData);
            } else {
              console.log('Found user data:', userData);
            }
            
            // Proceed with the update
            const result = await supabase
              .from('users')
              .update(updateData)
              .eq('email', customerEmail);
            
            console.log('Supabase update result:', result);
            
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
      // Extract subscription data from the event
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      const updateData = {
        subscription_status: subscription.status,
        subscription_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        subscription_period_end: new Date(subscription.current_period_end * 1000).toISOString()
      };
      
      try {
        const result = await supabase
          .from('users')
          .update(updateData)
          .eq('stripe_customer_id', customerId);
        
        if (result.error) {
          console.error('Error updating subscription:', result.error);
        } else {
          console.log('Successfully updated subscription status');
        }
      } catch (dbError) {
        console.error('Database update error:', dbError);
      }
    }
    // Handle subscription cancellations
    else if (event.type === 'customer.subscription.deleted') {
      console.log('Processing customer.subscription.deleted event');
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      try {
        // Log the customer ID we're looking for
        console.log('Looking for customer with Stripe ID:', customerId);
        
        const result = await supabase
          .from('users')
          .update({ 
            subscription_status: 'canceled',
            plan: 'free' // Changed from PostgreSQL casting to simple string
          })
          .eq('stripe_customer_id', customerId);
          
        console.log('Supabase update result:', result);
        
        if (result.error) {
          console.error('Error canceling subscription:', result.error);
        } else {
          console.log('Successfully updated subscription to canceled');
        }
      } catch (dbError) {
        console.error('Database update error:', dbError);
      }
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
