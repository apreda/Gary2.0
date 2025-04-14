import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUserPlan } from '../hooks/useUserPlan';

export function SignOut() {
  const { signOut } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(true);
  const [error, setError] = useState('');
  const { resetUserPlan } = useUserPlan();

  useEffect(() => {
    const performSignOut = async () => {
      try {
        // Sign out from auth system
        await signOut();
        
        // Clear any user data from localStorage
        localStorage.removeItem('userToken');
        localStorage.removeItem('username');
        
        // Reset user plan
        if (resetUserPlan) {
          resetUserPlan();
        }
        
        // Clear bet tracking data
        localStorage.removeItem('garyBetTracking');
        
        // Small delay to ensure all sign-out processes complete
        setTimeout(() => {
          setIsSigningOut(false);
        }, 500);
      } catch (err) {
        console.error('Error signing out:', err);
        setError('Failed to sign out properly');
        setIsSigningOut(false);
      }
    };

    performSignOut();
  }, [signOut, resetUserPlan]);

  // If there was an error, we'll show it briefly before redirecting
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="bg-red-900/20 text-red-300 p-4 rounded-lg mb-4">
          {error}
        </div>
        <Navigate to="/signin" replace />
      </div>
    );
  }

  // While signing out, show a loading spinner
  if (isSigningOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black">
        <div className="animate-spin w-10 h-10 border-4 border-[#d4af37] border-t-transparent rounded-full mb-4"></div>
        <p className="text-[#d4af37]">Signing out...</p>
      </div>
    );
  }

  // Once sign out is complete, redirect to sign in page
  return <Navigate to="/signin" replace />;
}
