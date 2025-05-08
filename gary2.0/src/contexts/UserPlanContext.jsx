import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Create context
const UserPlanContext = createContext();

// Provider component
export const UserPlanProvider = ({ children }) => {
  const [userPlan, setUserPlan] = useState('free');
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
          console.log('UserPlanContext: Setting plan status to:', userPlan);
          console.log('UserPlanContext: Debug info - refreshTrigger:', refreshTrigger, 'timestamp:', new Date().toISOString());
          setPlanLoading(false);
          console.log('UserPlanContext: Plan =', data.plan);
          console.log('UserPlanContext: Subscription Status =', data.subscription_status);
          console.log('UserPlanContext: Has stripe customer ID =', !!data.stripe_customer_id);
          
          // Check if plan is explicitly 'pro' or subscription_status is 'active'
          if (data.plan === 'pro' || data.subscription_status === 'active') {
            console.log('UserPlanContext: Setting user plan to pro');
            setUserPlan('pro');
          } else {
            console.log('UserPlanContext: Setting user plan to free');
            setUserPlan('free');
          }
        } else {
          // As a fallback, check the user metadata
          const metadata = user.user_metadata || {};
          if (metadata.plan === 'pro' || metadata.subscription_status === 'active') {
            console.log('UserPlanContext: Setting user plan to pro based on metadata');
            setUserPlan('pro');
          } else {
            console.log('UserPlanContext: No plan found, setting to free');
            setUserPlan('free');
          }
        }
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
    <UserPlanContext.Provider value={{ userPlan, updateUserPlan, refreshUserPlan, planLoading }}>
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
