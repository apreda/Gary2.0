import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Create context
const UserPlanContext = createContext();

// Provider component
export const UserPlanProvider = ({ children }) => {
  const [userPlan, setUserPlan] = useState('free');
  const [subscriptionStatus, setSubscriptionStatus] = useState('inactive');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [planLoading, setPlanLoading] = useState(true);
  
  // Function to refresh plan status manually
  const refreshUserPlan = () => {
    console.log('UserPlanContext: Manually refreshing user plan');
    setRefreshTrigger(prev => prev + 1);
  };
  
  // Load user plan from Supabase when component mounts or refreshTrigger changes
  useEffect(() => {
    // Start with loading state
    setPlanLoading(true);
    console.log('UserPlanContext: Checking subscription status');
    
    const checkSubscription = async () => {
      try {
        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          console.log('UserPlanContext: No authenticated user, using free plan');
          setUserPlan('free');
          setSubscriptionStatus('inactive');
          setPlanLoading(false);
          return;
        }
        
        console.log('UserPlanContext: Checking subscription for user:', user.id);
        
        // Get subscription data from Supabase
        const { data, error } = await supabase
          .from('users')
          .select('subscription_status')
          .eq('id', user.id)
          .single();
        
        if (error) {
          console.log('UserPlanContext: Error checking subscription, using free plan');
          setUserPlan('free');
          setSubscriptionStatus('inactive');
        } else {
          // Simply use the subscription_status from the database
          const status = data?.subscription_status || 'inactive';
          console.log('UserPlanContext: Found subscription status:', status);
          
          setSubscriptionStatus(status);
          setUserPlan(status === 'active' ? 'pro' : 'free');
        }
      } catch (err) {
        console.error('UserPlanContext: Unexpected error:', err);
        setUserPlan('free');
        setSubscriptionStatus('inactive');
      } finally {
        setPlanLoading(false);
      }
    };
    
    // Check subscription on mount and when refresh is triggered
    checkSubscription();
    
    // Set up auth listener for sign out
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        console.log('UserPlanContext: User signed out');
        setUserPlan('free');
        setSubscriptionStatus('inactive');
        setPlanLoading(false);
      }
    });
    
    // Cleanup function
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [refreshTrigger]);
  
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
