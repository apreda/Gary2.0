import { supabase } from '../supabaseClient';

/**
 * Manually check and update a user's plan status
 * This can be used for debugging or fixing plan status issues
 */
export const checkAndUpdatePlanStatus = async () => {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('No authenticated user found');
      return { success: false, message: 'Not authenticated' };
    }
    
    // Get the user's data from the users table
    const { data, error } = await supabase
      .from('users')
      .select('id, plan, subscription_status')
      .eq('id', user.id)
      .single();
    
    if (error) {
      console.error('Error fetching user data:', error);
      return { success: false, message: 'Failed to fetch user data', error };
    }
    
    console.log('Current user data:', data);
    
    // Check if the user should have pro access
    const isPro = data.plan === 'pro' || data.subscription_status === 'active';
    
    // If the user should have pro access but doesn't, update it
    if (isPro && data.plan !== 'pro') {
      const { error: updateError } = await supabase
        .from('users')
        .update({ plan: 'pro' })
        .eq('id', user.id);
      
      if (updateError) {
        console.error('Error updating user plan:', updateError);
        return { success: false, message: 'Failed to update user plan', error: updateError };
      }
      
      return { 
        success: true, 
        message: 'User plan updated to pro', 
        userPlan: 'pro',
        userData: data
      };
    }
    
    // Return the current status
    return { 
      success: true, 
      message: `User plan is ${isPro ? 'pro' : 'free'}`,
      userPlan: isPro ? 'pro' : 'free',
      userData: data
    };
  } catch (error) {
    console.error('Error in checkAndUpdatePlanStatus:', error);
    return { success: false, message: 'Unexpected error', error };
  }
};

/**
 * Force update user plan to 'pro'
 * Only use this for authenticated users who should have pro access
 */
export const forceUpdateToPro = async () => {
  try {
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.error('No authenticated user found');
      return { success: false, message: 'Not authenticated' };
    }
    
    // Update the user's plan to pro
    const { error } = await supabase
      .from('users')
      .update({ 
        plan: 'pro',
        subscription_status: 'active' 
      })
      .eq('id', user.id);
    
    if (error) {
      console.error('Error updating user plan:', error);
      return { success: false, message: 'Failed to update user plan', error };
    }
    
    return { success: true, message: 'User plan forced to pro' };
  } catch (error) {
    console.error('Error in forceUpdateToPro:', error);
    return { success: false, message: 'Unexpected error', error };
  }
};
