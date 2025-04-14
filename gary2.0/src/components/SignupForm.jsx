import { useState } from "react";
import { supabase } from "../supabaseClient";

export function SignupForm({ onAuthSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
  
    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            plan: 'free'
          }
        }
      });
    
      if (signupError) {
        console.error("❌ Signup error:", signupError);
        setError(signupError.message);
        return;
      }
    
      console.log("✅ Signup response:", data);
      setSignupComplete(true);
      setError(null);
    } catch (err) {
      console.error("Unexpected error during signup:", err);
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };  

  if (signupComplete) {
    return (
      <div className="space-y-6 text-center">
        <h2 className="text-xl font-bold text-green-500">✅ Account Created!</h2>
        <p className="text-[#9CA3AF]">Please check your email to confirm your account.</p>
        <p className="text-sm text-[#9CA3AF]">After confirming, you can sign in with your credentials.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-500/10 text-red-500 p-3 rounded-lg mb-4 border border-red-200">{error}</div>}
      
      <div className="space-y-4">
        <div>
          <label htmlFor="signup-email" className="block text-base font-medium text-[#9CA3AF] mb-2">Email address</label>
          <input
            id="signup-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="appearance-none relative block w-full px-4 py-4 border border-[#333333] rounded-md focus:outline-none focus:ring-1 focus:ring-[#d4af37] bg-white text-black text-base"
            style={{color: '#000000'}}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="signup-password" className="block text-base font-medium text-[#9CA3AF] mb-2">Password</label>
          <input
            id="signup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="appearance-none relative block w-full px-4 py-4 border border-[#333333] rounded-md focus:outline-none focus:ring-1 focus:ring-[#d4af37] bg-white text-black text-base"
            style={{color: '#000000'}}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      
      <button
        type="button"
        onClick={handleSignup}
        disabled={loading}
        className="w-full flex justify-center py-4 px-4 border border-transparent text-lg font-bold uppercase rounded-md text-black bg-[#d4af37] hover:bg-[#c4a127] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed mt-6"
      >
        {loading ? 'Creating Account...' : 'CREATE ACCOUNT'}
      </button>
    </div>
  );
}

