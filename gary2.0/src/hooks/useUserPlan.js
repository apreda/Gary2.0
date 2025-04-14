import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';

/**
 * A custom hook that manages a user's subscription plan.
 * Uses localStorage for persistence between sessions.
 * 
 * @returns {Object} An object containing the user's plan, loading state, and functions to update or reset the plan
 */
export function useUserPlan() {
  // Get initial plan from localStorage or default to 'free'
  const [userPlan, setUserPlan] = useState(() => {
    const savedPlan = localStorage.getItem('userPlan');
    return savedPlan || 'free'; // Default to free plan
  });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Update localStorage when plan changes
  useEffect(() => {
    localStorage.setItem('userPlan', userPlan);
  }, [userPlan]);
  
  // Add event listener to detect changes to localStorage from other components
  useEffect(() => {
    const handleStorageChange = () => {
      const currentPlan = localStorage.getItem('userPlan');
      if (currentPlan && currentPlan !== userPlan) {
        setUserPlan(currentPlan);
      }
    };
    
    // Check every second for changes (since storage event only fires across tabs)
    const interval = setInterval(handleStorageChange, 1000);
    
    return () => clearInterval(interval);
  }, [userPlan]);

  useEffect(() => {
    // Fetch user's plan from Supabase
    const fetchUserPlan = async () => {
      try {
        if (user) {
          // User is logged in with Supabase, get their plan from metadata
          const userPlanFromAuth = user.user_metadata?.plan || 'free';
          setUserPlan(userPlanFromAuth);
          localStorage.setItem('userPlan', userPlanFromAuth);
        } else {
          // Not logged in, ensure we're on free plan
          setUserPlan('free');
          localStorage.setItem('userPlan', 'free');
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching user plan:', error);
        setLoading(false);
      }
    };

    fetchUserPlan();
  }, [user]); // Re-run when auth state changes

  // Function to update the user plan
  const updateUserPlan = async (newPlan) => {
    setUserPlan(newPlan);
    localStorage.setItem('userPlan', newPlan);
    
    // If user is logged in, update their metadata in Supabase
    if (user) {
      try {
        await supabase.auth.updateUser({
          data: { plan: newPlan }
        });
      } catch (error) {
        console.error('Error updating user plan in Supabase:', error);
      }
    }
  };

  // Function to reset the user plan to free (used during sign out)
  const resetUserPlan = () => {
    setUserPlan('free');
    localStorage.setItem('userPlan', 'free');
  };

  return { 
    userPlan, 
    loading, 
    updateUserPlan,
    resetUserPlan 
  };
} 