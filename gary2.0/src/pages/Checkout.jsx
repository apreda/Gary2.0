import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import '../styles/dimensional.css';

// Stripe embedded checkout script URL
const STRIPE_EMBED_SCRIPT = "https://js.stripe.com/v3/stripe-embed.js";

// Stripe Embedded Checkout component
function StripeEmbeddedCheckout({ priceId, userId, email }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkoutSessionId, setCheckoutSessionId] = useState(null);
  const checkoutElementRef = useRef(null);
  
  // Load Stripe embed script
  useEffect(() => {
    if (!document.querySelector(`script[src="${STRIPE_EMBED_SCRIPT}"]`)) {
      const script = document.createElement('script');
      script.src = STRIPE_EMBED_SCRIPT;
      script.async = true;
      document.body.appendChild(script);
      
      return () => {
        document.body.removeChild(script);
      };
    }
  }, []);
  
  // Create checkout session and initialize embedded checkout
  useEffect(() => {
    // Don't try to initialize if no user info or if we already have a session
    if (!userId || !email || checkoutSessionId) return;
    
    const createCheckoutSession = async () => {
      try {
        const response = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            priceId: priceId,
            userId: userId,
            email: email,
            successUrl: `${window.location.origin}/checkout/success`,
            cancelUrl: `${window.location.origin}/checkout/cancel`,
            uiMode: 'embedded', // Required for embedded checkout
          }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to create checkout session');
        }
        
        const data = await response.json();
        // For embedded checkout, we need the clientSecret, not the id
        setCheckoutSessionId(data.clientSecret);
      } catch (err) {
        console.error('Error creating checkout session:', err);
        setError('Unable to initialize checkout. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    createCheckoutSession();
  }, [priceId, userId, email, checkoutSessionId]);
  
  // Initialize Stripe Embedded Checkout when sessionId becomes available
  useEffect(() => {
    if (!checkoutSessionId || !window.Stripe) return;
    
    // Clean up any previous instance
    if (checkoutElementRef.current?.innerHTML) {
      checkoutElementRef.current.innerHTML = '';
    }
    
    // Initialize new checkout
    const stripe = window.Stripe('pk_live_51REDaOKIQvF46lkOGskP0wAg7YfZK3mwpKA78i7tq1VOPSNU828a1l87vom6spat0Vzb6Gj7SOfbspqb4zlHsom600hhNxsv3v');
    const options = {
      clientSecret: checkoutSessionId,
      appearance: {
        theme: 'night',
        variables: {
          colorPrimary: '#d4af37',
          colorBackground: '#111111',
          colorText: '#ffffff',
          colorDanger: '#ff5252',
          fontFamily: 'Inter, system-ui, sans-serif',
          borderRadius: '8px',
        },
      },
    };
    
    try {
      stripe.initEmbeddedCheckout(options).mount(checkoutElementRef.current);
    } catch (err) {
      console.error('Error mounting Stripe Checkout:', err);
      setError('Failed to load checkout form. Please refresh the page.');
    }
    
    return () => {
      stripe.cancelEmbeddedCheckout();
    };
  }, [checkoutSessionId]);
  
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
  
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#d4af37]"></div>
        <p className="text-gray-400">Initializing checkout...</p>
      </div>
    );
  }
  
  return (
    <div
      ref={checkoutElementRef}
      className="w-full min-h-[400px] rounded-lg overflow-hidden"
    />
  );
}

// Main Checkout Page Component
export function Checkout() {
  const [loading, setLoading] = useState(true);
  const [priceId, setPriceId] = useState('price_1RL6F2KIQvF46lkOjqnjUPE1'); // Pro Membership Price ID
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Check if user is authenticated, if not redirect to login
  useEffect(() => {
    if (!user) {
      navigate('/login?redirect=checkout');
    } else {
      // Simulate loading content
      const timer = setTimeout(() => {
        setLoading(false);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-black bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-900 via-black to-black text-white p-6">
      <div className="max-w-5xl mx-auto pt-16 pb-24">
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
                
                {/* Stripe Embedded Checkout */}
                {user && (
                  <StripeEmbeddedCheckout 
                    priceId={priceId}
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
  );
}
