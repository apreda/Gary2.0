import { supabase } from '../supabaseClient';

/**
 * Debug utility to check user authentication and subscription status
 * Call this from browser console to diagnose issues
 */
export const debugUserStatus = async () => {
  console.log('🔍 DEBUGGING USER STATUS 🔍');
  console.log('================================');
  
  try {
    // 1. Check Supabase connection
    console.log('1. Testing Supabase connection...');
    const { data: testData, error: testError } = await supabase
      .from('daily_picks')
      .select('count')
      .limit(1);
    
    if (testError) {
      console.error('❌ Supabase connection failed:', testError);
      return { success: false, issue: 'supabase_connection', error: testError };
    } else {
      console.log('✅ Supabase connection working');
    }
    
    // 2. Check user authentication
    console.log('\n2. Checking user authentication...');
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error('❌ Auth error:', authError);
      return { success: false, issue: 'auth_error', error: authError };
    }
    
    if (!user) {
      console.log('❌ No user authenticated - this is the problem!');
      console.log('👉 Solution: Sign in to your account');
      return { success: false, issue: 'not_authenticated' };
    }
    
    console.log('✅ User authenticated:', {
      id: user.id,
      email: user.email,
      created_at: user.created_at
    });
    
    // 3. Check user record in database
    console.log('\n3. Checking user record in database...');
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (userError) {
      console.error('❌ Error fetching user data:', userError);
      
      if (userError.code === 'PGRST116') {
        console.log('❌ User record not found in database');
        console.log('👉 Solution: Creating user record...');
        
        // Try to create user record
        const { data: createData, error: createError } = await supabase
          .from('users')
          .insert([{
            id: user.id,
            email: user.email,
            plan: 'pro',
            subscription_status: 'active'
          }]);
        
        if (createError) {
          console.error('❌ Failed to create user record:', createError);
          return { success: false, issue: 'user_creation_failed', error: createError };
        } else {
          console.log('✅ User record created successfully');
          return { success: true, issue: 'user_created', message: 'User record created with pro access' };
        }
      }
      
      return { success: false, issue: 'user_fetch_error', error: userError };
    }
    
    console.log('✅ User record found:', userData);
    
    // 4. Check subscription status
    console.log('\n4. Analyzing subscription status...');
    const plan = userData.plan;
    const subscriptionStatus = userData.subscription_status;
    
    console.log(`Plan: ${plan}`);
    console.log(`Subscription Status: ${subscriptionStatus}`);
    
    if (subscriptionStatus === 'active') {
      console.log('✅ User has active subscription - should see picks');
      return { success: true, issue: 'none', userData };
    } else {
      console.log('❌ User does not have active subscription');
      console.log('👉 Solution: Updating subscription status to active...');
      
      // Update user to have active subscription
      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({
          plan: 'pro',
          subscription_status: 'active'
        })
        .eq('id', user.id);
      
      if (updateError) {
        console.error('❌ Failed to update subscription:', updateError);
        return { success: false, issue: 'update_failed', error: updateError };
      } else {
        console.log('✅ Subscription updated to active');
        console.log('👉 Refresh the page to see picks');
        return { success: true, issue: 'subscription_updated', message: 'Subscription activated - refresh page' };
      }
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    return { success: false, issue: 'unexpected_error', error };
  }
};

/**
 * Quick fix function to force user to pro status
 */
export const forceProAccess = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('❌ Not authenticated');
      return { success: false, message: 'Please sign in first' };
    }
    
    const { error } = await supabase
      .from('users')
      .upsert({
        id: user.id,
        email: user.email,
        plan: 'pro',
        subscription_status: 'active'
      });
    
    if (error) {
      console.error('❌ Failed to force pro access:', error);
      return { success: false, error };
    }
    
    console.log('✅ Forced pro access - refresh the page');
    return { success: true, message: 'Pro access granted - refresh page' };
    
  } catch (error) {
    console.error('❌ Error:', error);
    return { success: false, error };
  }
};

// Make functions available in browser console
if (typeof window !== 'undefined') {
  window.debugUserStatus = debugUserStatus;
  window.forceProAccess = forceProAccess;
} 