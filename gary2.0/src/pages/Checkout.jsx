import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from '../contexts/AuthContext';
import '../styles/dimensional.css';

// Initialize Stripe with your publishable key
const stripePromise = loadStripe('pk_live_51REDaOKIQvF46lkOGskP0wAg7YfZK3mwpKA78i7tq1VOPSNU828a1l87vom6spat0Vzb6Gj7SOfbspqb4zlHsom600hhNxsv3v');

// The actual checkout form that handles payment submission
function CheckoutForm({ priceId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js has not yet loaded.
      // Make sure to disable form submission until Stripe.js has loaded.
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Create a checkout session on your server
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId: priceId, // The price ID for Pro subscription
          userId: user.id,
          email: user.email,
          successUrl: `${window.location.origin}/checkout/success`,
          cancelUrl: `${window.location.origin}/checkout/cancel`,
        }),
      });

      const session = await response.json();

      // Redirect to Stripe Checkout
      const result = await stripe.redirectToCheckout({
        sessionId: session.id,
      });

      if (result.error) {
        setError(result.error.message);
      }
    } catch (err) {
      console.error('Error during checkout:', err);
      setError('An error occurred during checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-black/50 p-4 rounded-md">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#ffffff',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
              invalid: {
                color: '#fa755a',
                iconColor: '#fa755a',
              },
            },
          }}
          className="p-3 border border-gray-700 rounded-md"
        />
      </div>
      
      {error && (
        <div className="text-red-500 text-sm mt-2">
          {error}
        </div>
      )}
      
      <button
        type="submit"
        disabled={loading || !stripe}
        className="w-full py-4 px-6 bg-[#d4af37] text-black font-medium rounded-md transition-all duration-300 hover:bg-[#c4a127] disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </div>
        ) : (
          'Complete Purchase'
        )}
      </button>
    </form>
  );
}

// Main Checkout Page Component
export function Checkout() {
  const [loading, setLoading] = useState(true);
  const [priceId, setPriceId] = useState('price_1RL6F2KIQvF46lkOjqnjUPE1'); // Pro Membership Price ID
  const { user } = useAuth();
  const navigate = useNavigate();
  
  useEffect(() => {
    // Redirect to sign in if no user is logged in
    if (!user) {
      navigate('/signin?redirect=checkout');
    } else {
      setLoading(false);
    }
  }, [user, navigate]);
  
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden overflow-y-visible">
      {/* GaryHero-style immersive background */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        {/* Subtle cream/white haze gradients */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#f7f4ed]/20 via-transparent to-transparent" />
        <div className="absolute top-0 left-0 w-full h-1/3 bg-gradient-to-br from-[#fffbe9]/15 via-transparent to-transparent" />
        {/* Faint cream highlight behind main content */}
        <div className="absolute bottom-24 left-0 w-full h-24 bg-gradient-to-t from-[#f7f4ed]/15 via-transparent to-transparent blur-2xl opacity-60" />
        {/* Gold vignette corners */}
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full bg-[#d4af37]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-[600px] h-[600px] rounded-full bg-[#d4af37]/10 blur-3xl" />
        {/* Subtle grid/noise overlay */}
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-10 mix-blend-soft-light" />
        {/* Radial vignette for cinematic depth */}
        <div className="absolute inset-0 bg-gradient-radial from-transparent via-[#18181b]/80 to-black/95 opacity-95" />
      </div>
      
      {/* Background depth elements */}
      <div className="absolute inset-0 z-0 overflow-hidden opacity-20">
        <div className="absolute top-0 -left-40 w-80 h-80 bg-[#d4af37]/10 rounded-full filter blur-[100px]"></div>
        <div className="absolute bottom-40 -right-40 w-80 h-80 bg-[#d4af37]/10 rounded-full filter blur-[100px]"></div>
        <div className="absolute inset-0 bg-[url('/src/assets/images/grid.svg')] bg-repeat opacity-10"></div>
      </div>
      
      <div className="max-w-3xl mx-auto relative z-10 pt-10">
        {/* Header */}
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
                
                {/* Stripe Elements wrapper */}
                <Elements stripe={stripePromise}>
                  <CheckoutForm priceId={priceId} />
                </Elements>
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
  );
}
