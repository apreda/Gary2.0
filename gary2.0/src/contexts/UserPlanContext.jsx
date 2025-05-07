import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Create context
const UserPlanContext = createContext();

// Provider component
export const UserPlanProvider = ({ children }) => {
  const [userPlan, setUserPlan] = useState('free');
  
  // Load user plan from supabase when authenticated
  useEffect(() => {
    const loadUserPlan = async () => {
      // Get current auth user
      const { data: { user } } = await supabase.auth.getUser();
      console.log('UserPlanContext: Current auth user:', user?.id);
      
      if (user) {
        // Try first from the users table
        const { data, error } = await supabase
          .from('users')
          .select('plan, subscription_status, id')
          .eq('id', user.id)
          .single();
        
        console.log('UserPlanContext: User data from Supabase:', data);
        console.log('UserPlanContext: Error fetching user plan:', error);
        
        if (!error && data) {
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
      authListener?.subscription?.unsubscribe();
    };
  }, []);
  
  const updateUserPlan = (plan) => {
    setUserPlan(plan);
  };
  
  return (
    <UserPlanContext.Provider value={{ userPlan, updateUserPlan }}>
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
