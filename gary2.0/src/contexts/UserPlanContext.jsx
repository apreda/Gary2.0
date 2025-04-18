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
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', user.id)
          .single();
          
        if (!error && data) {
          setUserPlan(data.plan || 'free');
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
