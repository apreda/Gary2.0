import React from 'react';
import { Link } from 'react-router-dom';

export function Contact() {
  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white px-6 py-10">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="text-[#B8953F] hover:underline text-sm">
          Back to Home
        </Link>

        <h1 className="text-4xl font-bold mt-4 mb-6">Contact Support</h1>

        <div className="bg-[#151515] border border-[#2b2b2b] rounded-xl p-6">
          <p className="text-white/80 mb-4">
            Need help with the Gary app, picks, or Gary Fantasy (DFS)?
          </p>
          <p className="text-white/80 mb-4">
            Email us at{' '}
            <a href="mailto:support@betwithgary.ai" className="text-[#B8953F] hover:underline">
              support@betwithgary.ai
            </a>
            .
          </p>
          <p className="text-white/60 text-sm">
            We usually reply within 1-2 business days.
          </p>
        </div>
      </div>
    </div>
  );
}
