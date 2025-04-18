import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Create context
const UserStatsContext = createContext();

// Provider component
export const UserStatsProvider = ({ children }) => {
  const [userStats, setUserStats] = useState({
    totalBets: 0,
    totalBetAmount: 0,
    wins: 0,
    losses: 0
  });
  
  // Load user stats from supabase when authenticated
  useEffect(() => {
    const loadUserStats = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('users')
          .select('stats')
          .eq('id', user.id)
          .single();
          
        if (!error && data && data.stats) {
          setUserStats(data.stats);
        }
      }
    };
    
    loadUserStats();
    
    // Subscribe to auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          loadUserStats();
        } else if (event === 'SIGNED_OUT') {
          setUserStats({
            totalBets: 0,
            totalBetAmount: 0,
            wins: 0,
            losses: 0
          });
        }
      }
    );
    
    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, []);
  
  const updateUserStats = async (stats) => {
    setUserStats(stats);
    
    // Also update in Supabase if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('users')
        .update({ stats })
        .eq('id', user.id);
    }
  };
  
  return (
    <UserStatsContext.Provider value={{ userStats, updateUserStats }}>
      {children}
    </UserStatsContext.Provider>
  );
};

// Hook for using the user stats context
export const useUserStats = () => {
  const context = useContext(UserStatsContext);
  if (!context) {
    throw new Error('useUserStats must be used within a UserStatsProvider');
  }
  return context;
};

export default UserStatsContext;
