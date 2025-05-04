import React, { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function CheckoutSuccess() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();

  useEffect(() => {
    // Redirect to home if no user is logged in
    if (!user) {
      navigate('/');
      return;
    }

    // Refresh user data to get updated subscription status
    refreshUser && refreshUser();
  }, [user, navigate, refreshUser]);

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-visible">
      {/* Background styling */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-[#f7f4ed]/20 via-transparent to-transparent" />
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#d4af37]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#d4af37]/10 blur-3xl" />
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#18181b]/80 to-black/95 opacity-95" />
      </div>
      
      <div className="max-w-3xl mx-auto relative z-10 pt-10 text-center px-4">
        {/* Success content */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-500/20 text-green-500 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#d4af37] to-yellow-300 mb-4">
            Payment Successful!
          </h1>
          
          <div className="h-1 w-16 bg-[#d4af37]/30 mx-auto mb-6"></div>
          
          <div className="text-gray-300 mb-8 max-w-lg mx-auto">
            <p className="mb-4">
              Thank you for your purchase! Your Pro Membership is now active.
            </p>
            <p>
              You now have access to all premium picks and features. Start exploring
              all the Pro benefits right away!
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Link to="/picks" className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-black bg-[#d4af37] hover:bg-[#c4a127] transition-colors duration-200">
              View Today's Picks
            </Link>
            <Link to="/account" className="inline-flex items-center justify-center px-6 py-3 border border-[#d4af37]/30 text-base font-medium rounded-md shadow-sm text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors duration-200">
              Manage Subscription
            </Link>
          </div>
        </div>
        
        {/* Card with membership details */}
        <div className="bg-[#111]/80 backdrop-blur-sm rounded-xl overflow-hidden p-8 border border-[#d4af37]/20 max-w-md mx-auto mt-12">
          <h2 className="text-xl font-medium text-white mb-6">Pro Membership</h2>
          
          <div className="mb-4">
            <span className="text-2xl font-light text-white">$29</span>
            <span className="text-gray-500">/month</span>
          </div>
          
          <ul className="space-y-3 mb-4 text-sm text-left">
            <li className="flex items-center text-white">
              <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">✓</span>
              <span>All Daily Picks</span>
            </li>
            <li className="flex items-center text-white">
              <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">✓</span>
              <span>Pro-Only Analysis</span>
            </li>
            <li className="flex items-center text-white">
              <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">✓</span>
              <span>Parlay of the Day</span>
            </li>
          </ul>
          
          <div className="border-t border-gray-800 pt-4 text-center">
            <span className="text-gray-400 text-sm">Your next billing date will be shown in your account settings</span>
          </div>
        </div>
      </div>
    </div>
  );
}
