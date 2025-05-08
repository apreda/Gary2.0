import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Create context
const UserPlanContext = createContext();

// Provider component
export const UserPlanProvider = ({ children }) => {
  const [userPlan, setUserPlan] = useState('free');
  const [subscriptionStatus, setSubscriptionStatus] = useState('inactive');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [planLoading, setPlanLoading] = useState(true); // Add loading state
  
  // Function to refresh plan status manually
  const refreshUserPlan = () => {
    console.log('UserPlanContext: Manually refreshing user plan');
    setRefreshTrigger(prev => prev + 1);
  };
  
  // Load user plan from supabase when authenticated or when refresh is triggered
  useEffect(() => {
    const loadUserPlan = async () => {
      // Get current auth user
      const { data: { user } } = await supabase.auth.getUser();
      console.log('UserPlanContext: Current auth user:', user?.id);
      
      if (user) {
        // Use cache-busting options to ensure fresh data
        const timestamp = new Date().getTime();
        
        // Try first from the users table - with no-cache headers
        const { data, error } = await supabase
          .from('users')
          .select('plan, subscription_status, id, stripe_customer_id')
          .eq('id', user.id)
          .single()
          .abortSignal(new AbortController().signal); // Forces a new request
        
        console.log(`UserPlanContext: User data from Supabase (refresh #${refreshTrigger}):`, data);
        console.log('UserPlanContext: Error fetching user plan:', error);
        
        if (!error && data) {
          // Log ALL relevant fields for debugging
          console.log('UserPlanContext: Plan loading complete');
          console.log('UserPlanContext: Debug info - refreshTrigger:', refreshTrigger, 'timestamp:', new Date().toISOString());
          console.log('UserPlanContext: Plan =', data.plan);
          console.log('UserPlanContext: Subscription Status =', data.subscription_status);
          console.log('UserPlanContext: Has stripe customer ID =', !!data.stripe_customer_id);
          
          // Always set the subscription status directly from the database value
          const status = data.subscription_status || 'inactive';
          setSubscriptionStatus(status);
          console.log('UserPlanContext: Setting subscription status to:', status);
          
          // For backward compatibility, still set the plan based on subscription status
          if (status === 'active') {
            console.log('UserPlanContext: Setting user plan to pro based on active subscription');
            setUserPlan('pro');
          } else {
            console.log('UserPlanContext: Setting user plan to free based on inactive subscription');
            setUserPlan('free');
          }
          
          // Plan loading is complete
          setPlanLoading(false);
        } else {
          // As a fallback, check the user metadata
          const metadata = user.user_metadata || {};
          
          // Check subscription status from metadata
          const metaStatus = metadata.subscription_status || 'inactive';
          setSubscriptionStatus(metaStatus);
          console.log('UserPlanContext: Setting subscription status from metadata to:', metaStatus);
          
          // Set plan based on metadata subscription status
          if (metaStatus === 'active') {
            console.log('UserPlanContext: Setting user plan to pro based on metadata');
            setUserPlan('pro');
          } else {
            console.log('UserPlanContext: No active subscription found in metadata, setting to free');
            setUserPlan('free');
          }
        }
      } else {
        // Not logged in, set to free plan and inactive subscription
        console.log('UserPlanContext: User not logged in, setting to free plan and inactive subscription');
        setUserPlan('free');
        setSubscriptionStatus('inactive');
      }
    };
    
    loadUserPlan();
    
    // Set up a recheck interval (every minute) to ensure plan status is current
    const intervalId = setInterval(() => {
      console.log('UserPlanContext: Performing automatic plan refresh check');
      loadUserPlan();
    }, 60000); // Check every minute
    
    // Subscribe to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          loadUserPlan();
        } else if (event === 'SIGNED_OUT') {
          setUserPlan('free');
        }
      }
    );
    
    return () => {
      clearInterval(intervalId);
      authListener?.subscription?.unsubscribe();
    };
  }, [refreshTrigger]); // Add refreshTrigger as a dependency
  
  const updateUserPlan = (plan) => {
    setUserPlan(plan);
  };
  
  return (
    <UserPlanContext.Provider value={{ 
      userPlan, 
      updateUserPlan, 
      refreshUserPlan, 
      planLoading, 
      subscriptionStatus, // Expose subscription status to components
    }}>
      {children}
    </UserPlanContext.Provider>
  );
};

// Hook for using the user plan context
export const useUserPlan = () => {
  const context = useContext(UserPlanContext);
  if (!context) {
    throw new Error('useUserPlan must be used within a UserPlanProvider');
  }
  return context;
};

export default UserPlanContext;
