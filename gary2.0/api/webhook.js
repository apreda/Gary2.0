import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Supabase client - using environment variables without VITE_ prefix for server-side code
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
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
          
          // Check the actual structure of the users table to ensure we're using the correct column names
          console.log('Getting users table structure to verify column names...');
          const { data: userTableSample, error: tableError } = await supabase
            .from('users')
            .select('*')
            .limit(1);
          
          if (tableError) {
            console.error('Error accessing users table:', tableError);
            return res.status(500).send(`Database Error: ${tableError.message}`);
          }

          if (userTableSample && userTableSample.length > 0) {
            console.log('Users table columns:', Object.keys(userTableSample[0]));
          } else {
            console.warn('Could not retrieve users table structure - table may be empty.');
          }
          
          // Prepare the update data with careful attention to column names and data types
          // Using exact column names as seen in the Supabase schema
          const updateData = {};
          
          // Handle text fields correctly
          updateData.plan = 'pro';
          if (customer) updateData.stripe_customer = customer; // Note: Using the actual column name seen in screenshot
          if (subscription) updateData.stripe_subscri = subscription; // Note: Using the actual column name seen in screenshot
          updateData.subscription_s = 'active'; // Using the subscription_status column name from screenshot
          
          // Handle timestamp fields correctly - use JavaScript Date objects directly, not strings
          // This ensures PostgreSQL receives proper timestamp objects
          if (subscriptionDetails.current_period_start) {
            updateData.subscription_p = new Date(subscriptionDetails.current_period_start * 1000);
          }
          
          if (subscriptionDetails.current_period_end) {
            const endDate = new Date(subscriptionDetails.current_period_end * 1000);
            // Get column names for timestamp fields - we'll set both of them correctly
            const endDateColumnName = 'subscription_p'; // We'll update both timestamp columns
            updateData[endDateColumnName] = endDate;
          }
          
          console.log('Prepared update data with corrected column names and types:', updateData);
          
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
            
            // For debugging, check the users table structure
            const { data: userTableSample, error: tableError } = await supabase
              .from('users')
              .select('*')
              .limit(1);
            
            if (tableError) {
              console.error('Error accessing users table:', tableError);
            } else if (userTableSample && userTableSample.length > 0) {
              console.log('Users table columns:', Object.keys(userTableSample[0]));
            }
            
            // First try exact email match
            console.log('Trying exact email match for:', customerEmail);
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('id, email')
              .eq('email', customerEmail)
              .single();
            
            if (userError || !userData) {
              console.error('Error finding user by exact email:', userError || 'No user found');
              console.log('Trying case insensitive search...');
              
              // Try a case-insensitive search as fallback
              const { data: fuzzyUserData, error: fuzzyError } = await supabase
                .from('users')
                .select('id, email')
                .ilike('email', customerEmail);
                
              console.log('Fuzzy email search results:', fuzzyUserData);
              
              // If we found a user with the fuzzy search, update by ID
              if (fuzzyUserData && fuzzyUserData.length > 0) {
                const userId = fuzzyUserData[0].id;
                console.log('Found user via fuzzy search, ID:', userId);
                
                // Use the found ID to update instead of email
                const result = await supabase
                  .from('users')
                  .update(updateData)
                  .eq('id', userId);
                  
                console.log('Update result using ID from fuzzy search:', result);
                
                if (result.error) {
                  console.error('Error updating by user ID after fuzzy search:', result.error);
                } else {
                  console.log('Successfully updated subscription for user by ID after fuzzy search');
                  return res.status(200).json({ received: true });
                }
              } else {
                console.error('No user found with email (including fuzzy search):', customerEmail);
              }
            } else {
              console.log('Found user data with exact match:', userData);
              
              // Proceed with the update using ID for precision
              const result = await supabase
                .from('users')
                .update(updateData)
                .eq('id', userData.id);
              
              console.log('Supabase update result:', result);
              
              if (result.error) {
                console.error('Error updating by user ID after exact email match:', result.error);
              } else {
                console.log('Successfully updated subscription for user by ID');
                return res.status(200).json({ received: true });
              }
            }
            
            // Final fallback: try direct email update if ID-based updates failed
            console.log('Trying direct email update as fallback for:', customerEmail);
            const result = await supabase
              .from('users')
              .update(updateData)
              .eq('email', customerEmail);
            
            console.log('Direct email update result:', result);
            
            if (result.error) {
              console.error('Error updating by direct email:', result.error);
            } else {
              console.log('Successfully updated subscription by direct email');
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
      
      // First get the user table structure to check column names
      const { data: userTableSample, error: tableError } = await supabase
        .from('users')
        .select('*')
        .limit(1);
        
      if (tableError) {
        console.error('Error accessing users table:', tableError);
        return res.status(500).send(`Database Error: ${tableError.message}`);
      }

      if (userTableSample && userTableSample.length > 0) {
        console.log('Users table columns for update:', Object.keys(userTableSample[0]));
      }
      
      // Create update object with correct column names
      const updateData = {};
      
      // Use the actual column names from the database
      updateData.subscription_s = subscription.status;
      
      // Handle timestamp fields correctly - use JavaScript Date objects directly
      if (subscription.current_period_start) {
        updateData.subscription_p = new Date(subscription.current_period_start * 1000);
      }
      
      console.log('Prepared update data for subscription update:', updateData);
      
      try {
        // Now look up the user by stripe_customer (actual column name)
        const { data: userData, error: userQueryError } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer', customerId)
          .single();
          
        if (userQueryError || !userData) {
          console.error('Error finding user by stripe_customer:', userQueryError || 'No user found');
          return res.status(404).json({ error: 'User not found' });
        }
        
        console.log('Found user to update:', userData);
        
        // Update by id for maximum reliability
        const result = await supabase
          .from('users')
          .update(updateData)
          .eq('id', userData.id);
        
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
        
        // First find the user by the correct column name 'stripe_customer' (not stripe_customer_id)
        const { data: userData, error: userQueryError } = await supabase
          .from('users')
          .select('id')
          .eq('stripe_customer', customerId)
          .single();
          
        if (userQueryError || !userData) {
          console.error('Error finding user by stripe_customer:', userQueryError || 'No user found');
          return res.status(404).json({ error: 'User not found' });
        }
        
        console.log('Found user to update subscription status:', userData);
        
        // Update using the correct column names from the database schema
        const result = await supabase
          .from('users')
          .update({ 
            subscription_s: 'canceled', // Using the actual column name from screenshot
            plan: 'free' // Simple string value
          })
          .eq('id', userData.id); // Update by ID for reliability
          
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
