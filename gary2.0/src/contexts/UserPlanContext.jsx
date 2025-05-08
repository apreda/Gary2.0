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
    // Set loading state at the beginning of the check
    setPlanLoading(true);
    console.log('UserPlanContext: Setting planLoading to true, beginning check');
    
    let isLatestRequest = true; // Flag to prevent race conditions
    
    const loadUserPlan = async () => {
      // Get current auth user
      const { data: { user } } = await supabase.auth.getUser();
      
      // If this request is no longer the latest, abort
      if (!isLatestRequest) {
        console.log('UserPlanContext: Aborting outdated plan check');
        return;
      }
      
      console.log('UserPlanContext: Current auth user:', user?.id);
      
      if (user) {
        try {
          // Query Supabase for the user's subscription status
          const { data, error } = await supabase
            .from('users')
            .select('plan, subscription_status, id, stripe_customer_id')
            .eq('id', user.id)
            .single();
          
          // If this request is no longer the latest, abort
          if (!isLatestRequest) {
            console.log('UserPlanContext: Aborting outdated subscription data handling');
            return;
          }
          
          console.log(`UserPlanContext: User data from Supabase (refresh #${refreshTrigger}):`, data);
          
          if (!error && data) {
            // Always set the subscription status directly from the database value
            const status = data.subscription_status || 'inactive';
            setSubscriptionStatus(status);
            console.log('UserPlanContext: Setting subscription status to:', status);
            
            // For backward compatibility, set the plan based on subscription status
            if (status === 'active') {
              console.log('UserPlanContext: Setting user plan to pro based on active subscription');
              setUserPlan('pro');
            } else {
              console.log('UserPlanContext: Setting user plan to free based on inactive subscription');
              setUserPlan('free');
            }
          } else {
            // As a fallback for error cases, check the user metadata
            console.log('UserPlanContext: Error fetching from Supabase, using fallback');
            const metadata = user.user_metadata || {};
            const metaStatus = metadata.subscription_status || 'inactive';
            
            setSubscriptionStatus(metaStatus);
            setUserPlan(metaStatus === 'active' ? 'pro' : 'free');
          }
        } catch (err) {
          console.error('UserPlanContext: Error checking plan status:', err);
          // Set defaults in case of error
          setUserPlan('free');
          setSubscriptionStatus('inactive');
        }
      } else {
        // Not logged in, set to free plan and inactive subscription
        console.log('UserPlanContext: User not logged in, setting to free plan');
        setUserPlan('free');
        setSubscriptionStatus('inactive');
      }
      
      // Plan loading is complete
      if (isLatestRequest) {
        console.log('UserPlanContext: Plan loading complete');
        setPlanLoading(false);
      }
    };
    
    // Initial plan check at component mount
    loadUserPlan();
    
    // Set up a recheck interval (every 2 minutes) to ensure plan status is current
    // This less frequent interval reduces the chance of race conditions
    const intervalId = setInterval(() => {
      console.log('UserPlanContext: Performing automatic plan refresh check');
      loadUserPlan();
    }, 120000); // Check every 2 minutes
    
    // Subscribe to auth changes with cleaner handling
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          console.log('UserPlanContext: User signed in, checking plan status');
          loadUserPlan();
        } else if (event === 'SIGNED_OUT') {
          console.log('UserPlanContext: User signed out, setting to free plan');
          // Set defaults on sign out
          setUserPlan('free');
          setSubscriptionStatus('inactive');
          setPlanLoading(false); // Ensure loading state is reset
        }
      }
    );
    
    return () => {
      // When the component unmounts or the effect re-runs
      isLatestRequest = false; // Prevent stale updates
      clearInterval(intervalId);
      authListener?.subscription?.unsubscribe();
      console.log('UserPlanContext: Cleaned up interval and auth listener');
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
