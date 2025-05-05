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
        
        const { error } = await supabase
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

    // Return a response to acknowledge receipt of the event
    res.json({ received: true });
  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}
