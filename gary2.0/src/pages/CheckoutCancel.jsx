import React from 'react';
import { Link } from 'react-router-dom';

export function CheckoutCancel() {
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
        {/* Cancel content */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-500/20 text-gray-400 mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          
          <h1 className="text-3xl font-bold text-white mb-4">
            Payment Cancelled
          </h1>
          
          <div className="h-1 w-16 bg-gray-700 mx-auto mb-6"></div>
          
          <div className="text-gray-300 mb-8 max-w-lg mx-auto">
            <p className="mb-4">
              Your payment process was cancelled and you have not been charged.
            </p>
            <p>
              If you encountered any issues during the checkout process or have any questions,
              please don't hesitate to contact our support team.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
            <Link to="/pricing" className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-black bg-[#d4af37] hover:bg-[#c4a127] transition-colors duration-200">
              Return to Pricing
            </Link>
            <Link to="/picks" className="inline-flex items-center justify-center px-6 py-3 border border-[#d4af37]/30 text-base font-medium rounded-md shadow-sm text-[#d4af37] hover:bg-[#d4af37]/10 transition-colors duration-200">
              Browse Free Picks
            </Link>
          </div>
        </div>
        
        {/* Help card */}
        <div className="bg-[#111]/80 backdrop-blur-sm rounded-xl overflow-hidden p-8 border border-gray-800 max-w-md mx-auto mt-12">
          <h2 className="text-xl font-medium text-white mb-6">Need Help?</h2>
          
          <p className="text-gray-400 mb-6">
            If you need assistance with your purchase or have questions about our Pro Membership,
            our support team is here to help you.
          </p>
          
          <div className="flex items-center justify-center">
            <a href="mailto:support@betwithgary.com" className="text-[#d4af37] hover:underline flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              support@betwithgary.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
