import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/dimensional.css';

// Stripe Checkout Component with direct Stripe integration
function StripeCheckout({ userId, email }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Direct redirect to your live Stripe payment link
      // This is the most reliable method - no API calls needed
      window.location.href = 'https://buy.stripe.com/dR603v2UndMebrq144';
      
      // Log for tracking
      console.log('Redirecting to Stripe product page with email:', email);
    } catch (err) {
      console.error('Error during checkout redirect:', err);
      setError('Unable to redirect to checkout. Please try again.');
      setLoading(false);
    }
  };
  
  if (error) {
    return (
      <div className="p-6 bg-red-900/20 border border-red-500/30 rounded-lg text-center">
        <p className="text-red-400 mb-3">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-red-500/30 hover:bg-red-500/40 text-white rounded-md transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }
  
  return (
    <div className="w-full">
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full py-4 bg-[#d4af37] hover:bg-[#c5a030] text-black font-medium rounded-md transition-colors flex items-center justify-center focus:ring-2 focus:ring-[#d4af37]/50 focus:outline-none"
      >
        {loading ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-black mr-3"></div>
            Processing...
          </>
        ) : (
          <>Proceed to Checkout</>  
        )}
      </button>
      <div className="mt-4 flex items-center justify-center space-x-2">
        <img src="/secure-badge.svg" alt="Secure" className="h-5 w-auto" />
        <span className="text-sm text-gray-400">Secure payment via Stripe</span>
      </div>
    </div>
  );
}

// Main Checkout Page Component
export function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  
  // Redirect to login if not authenticated
  useEffect(() => {
    if (user === null) {
      navigate('/login', { state: { from: '/checkout' } });
    } else {
      setLoading(false);
    }
  }, [user, navigate]);
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-[#121212]">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#d4af37] to-yellow-300 mb-2">
              Upgrade to Pro
            </h1>
            <div className="h-1 w-16 bg-[#d4af37]/30 mx-auto mb-4"></div>
            <p className="text-gray-400">
              Complete your purchase to unlock all premium features
            </p>
          </div>
          
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#d4af37]"></div>
            </div>
          ) : (
            <div className="grid md:grid-cols-5 gap-8">
              {/* Checkout Form */}
              <div className="md:col-span-3">
                <div className="bg-[#111]/80 backdrop-blur-sm rounded-xl overflow-hidden p-8 border border-[#d4af37]/20">
                  <h2 className="text-xl font-medium text-white mb-6">Payment Details</h2>
                  
                  {/* Stripe Checkout */}
                  {user && (
                    <StripeCheckout 
                      userId={user.id}
                      email={user.email}
                    />
                  )}
                </div>
              </div>
              
              {/* Order Summary */}
              <div className="md:col-span-2">
                <div className="bg-[#111]/80 backdrop-blur-sm rounded-xl overflow-hidden p-8 border border-[#d4af37]/20 sticky top-4">
                  <h2 className="text-xl font-medium text-white mb-6">Pro Plan</h2>
                  
                  <div className="mb-4">
                    <span className="text-3xl font-light text-white">$29</span>
                    <span className="text-gray-500">/month</span>
                  </div>
                  
                  <ul className="space-y-3 mb-8 text-sm">
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
                    <li className="flex items-center text-white">
                      <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">✓</span>
                      <span>PrimeTime Picks</span>
                    </li>
                    <li className="flex items-center text-white">
                      <span className="w-5 h-5 mr-3 flex items-center justify-center text-xs text-[#d4af37]">✓</span>
                      <span>Cancel anytime</span>
                    </li>
                  </ul>
                  
                  <div className="border-t border-gray-800 pt-4">
                    <div className="flex items-center text-gray-400 text-sm mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-[#d4af37]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Secure checkout
                    </div>
                    <Link to="/pricing" className="text-sm text-[#d4af37] hover:underline inline-block">
                      Return to pricing
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
