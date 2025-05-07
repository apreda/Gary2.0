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
  if (req.method === 'POST') {
    const buf = await buffer(req);
    const sig = req.headers['stripe-signature'];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        buf.toString(),
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        // Extract the customer and subscription IDs
        const { client_reference_id, customer, subscription } = session;
        
        if (client_reference_id && subscription) {
          // Fetch the subscription details to get period start/end dates
          try {
            // Get subscription details from Stripe
            const subscriptionDetails = await stripe.subscriptions.retrieve(subscription);
            
            // Update the user's status in Supabase with all required fields
            const { error } = await supabase
              .from('users')
              .update({
                plan: 'pro',
                stripe_customer_id: customer,
                stripe_subscription_id: subscription,
                subscription_status: 'active',
                subscription_period_start: new Date(subscriptionDetails.current_period_start * 1000).toISOString(),
                subscription_period_end: new Date(subscriptionDetails.current_period_end * 1000).toISOString()
              })
              .eq('id', client_reference_id);
              
            if (error) {
              console.error('Error updating user subscription status:', error);
            } else {
              console.log('Successfully updated subscription for user:', client_reference_id);
            }
          } catch (subscriptionError) {
            console.error('Error fetching subscription details:', subscriptionError);
          }
        } else {
          console.error('Missing client_reference_id or subscription in checkout.session.completed event');
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscriptionObj = event.data.object;
        // Handle subscription updates (e.g., plan changes, payment failures)
        const customerId = subscriptionObj.customer;
        const status = subscriptionObj.status;
        
        // Get subscription period dates
        const periodStart = subscriptionObj.current_period_start 
          ? new Date(subscriptionObj.current_period_start * 1000).toISOString() 
          : null;
        const periodEnd = subscriptionObj.current_period_end 
          ? new Date(subscriptionObj.current_period_end * 1000).toISOString() 
          : null;
        
        // Prepare update data
        const updateData = {
          subscription_status: status
        };
        
        // Only include period dates if they exist
        if (periodStart) updateData.subscription_period_start = periodStart;
        if (periodEnd) updateData.subscription_period_end = periodEnd;
        
        // Update the user record
        const { error } = await supabase
          .from('users')
          .update(updateData)
          .eq('stripe_customer_id', customerId);
          
        if (error) {
          console.error('Error updating subscription status:', error);
        } else {
          console.log('Successfully updated subscription status for customer:', customerId);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;
        
        // Update the user's subscription status in your database
        const { error } = await supabase
          .from('users')
          .update({
            plan: 'free',
            subscription_status: 'inactive',
            subscription_end: new Date().toISOString()
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

    // Return a response to acknowledge receipt of the event
    res.json({ received: true });
  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}
