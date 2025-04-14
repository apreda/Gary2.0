import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import garyLogo from '../assets/images/gary3.png';
import '../styles/dimensional.css';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [appearAnimation, setAppearAnimation] = useState(false);
  const navigate = useNavigate();
  const { signIn } = useAuth();

  useEffect(() => {
    // Trigger appear animation after mount
    const timer = setTimeout(() => {
      setAppearAnimation(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Reset animation when switching between sign in and sign up
  useEffect(() => {
    setAppearAnimation(false);
    const timer = setTimeout(() => {
      setAppearAnimation(true);
    }, 50);
    return () => clearTimeout(timer);
  }, [isSignUp]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      
      if (isSignUp) {
        // Handle sign up with Supabase
        const { data, error: signupError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              plan: 'free'
            },
            emailRedirectTo: window.location.origin + '/signin'
          }
        });
        
        if (signupError) throw signupError;
        
        console.log("✅ Signup successful:", data);
        // Verify user creation in auth.users table
        if (data?.user?.id) {
          console.log("User ID created:", data.user.id);
          console.log("User's email:", data.user.email);
          console.log("User metadata:", data.user.user_metadata);
          console.log("Email confirmed:", data.user.email_confirmed_at ? 'Yes' : 'No');
          console.log("Session present:", data.session ? 'Yes' : 'No');
          
          // Create a record in the custom users table
          try {
            console.log("Creating record in custom users table for:", data.user.id);
            
            // Get the actual structure of the users table
            const { data: tableData, error: tableError } = await supabase
              .from('users')
              .select()
              .limit(1);
              
            // Log table structure for debugging
            if (tableData && tableData.length > 0) {
              console.log("Users table structure:", Object.keys(tableData[0]));
            } else {
              console.log("Could not determine users table structure.");
            }
            
            // Create a minimal user record with just the ID and plan
            // This approach is most likely to work regardless of table schema
            const { data: insertData, error: insertError } = await supabase
              .from('users')
              .insert([{ 
                id: data.user.id,
                plan: 'free'
              }]);
              
            if (insertError) {
              console.error("Error creating user record in database:", insertError);
            } else {
              console.log("Successfully created user record in database!");
              
              // Now try to create user stats record if needed
              try {
                console.log("Creating user_stats record...");
                
                // First check the structure of user_stats table
                const { data: statsSchema, error: schemaError } = await supabase
                  .from('user_stats')
                  .select()
                  .limit(1);
                  
                // Log available fields
                if (statsSchema && statsSchema.length > 0) {
                  console.log("Stats table structure:", Object.keys(statsSchema[0]));
                }
                
                // Create minimal stats record with just user_id
                // This approach avoids specifying fields that might not exist
                const { data: statsData, error: statsError } = await supabase
                  .from('user_stats')
                  .insert([{ 
                    user_id: data.user.id
                  }]);
                  
                if (statsError) {
                  console.error("Error creating stats:", statsError);
                } else {
                  console.log("Successfully created user stats!");
                }
              } catch (statsError) {
                console.error("Unexpected error creating stats:", statsError);
              }
            }
          } catch (dbError) {
            console.error("Unexpected error creating user record:", dbError);
          }
          
          // Try to get the user to verify creation
          const { data: userData, error: userError } = await supabase.auth.getUser();
          console.log("Retrieved user after signup:", userData);
          if (userError) console.error("Error getting user:", userError);
        } else {
          console.warn("No user ID returned from Supabase signup!");
        }
        
        // Check if email confirmation is needed
        if (data?.user && !data?.session) {
          // Email confirmation required
          console.log("Email confirmation sent to", email);
          setSignupComplete(true);
        } else if (data?.session) {
          // Auto-confirm enabled, user is logged in
          localStorage.setItem('username', email.split('@')[0]);
          localStorage.setItem('userPlan', 'free');
          navigate('/');
        }
        // Don't navigate if confirmation required - show confirmation message
      } else {
        // Handle sign in with Supabase
        const { data, error } = await signIn(email, password);
        
        if (error) throw error;
        
        // Set user information if authentication succeeds
        localStorage.setItem('username', email.split('@')[0]);
        
        // Get user plan from Supabase user metadata or set default to 'free'
        const userPlan = data?.user?.user_metadata?.plan || 'free';
        localStorage.setItem('userPlan', userPlan);
        
        // Initialize betting tracking if not exists
        if (!localStorage.getItem('garyBetTracking')) {
          const initialTracking = {
            betsWithGary: 0,
            betsAgainstGary: 0,
            totalBets: 0,
            correctDecisions: 0,
            currentStreak: 0,
            picks: []
          };
          localStorage.setItem('garyBetTracking', JSON.stringify(initialTracking));
        }
        
        // Navigate to home page
        navigate('/');
      }
    } catch (err) {
      console.error(isSignUp ? 'Sign up error:' : 'Sign in error:', err);
      setError(err.message || (isSignUp ? 'Failed to create account' : 'Failed to sign in'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black py-8 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Dimensional Background */}
      <div className="dimension-bg" style={{ opacity: 0.8 }}>
        <div className="left-wall side-wall" style={{ opacity: 0.2, background: 'linear-gradient(to right, #1a1a1a, transparent)' }}></div>
        <div className="right-wall side-wall" style={{ opacity: 0.2, background: 'linear-gradient(to left, #1a1a1a, transparent)' }}></div>
      </div>
      
      {/* Floor grid */}
      <div className="perspective-floor" style={{ opacity: 0.3, height: '70%' }}></div>
      
      {/* Decorative background elements with enhanced depth */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#d4af37]/5 rounded-full blur-3xl animate-pulse-glow" style={{ animationDuration: '8s' }}></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-[#c0c0c0]/10 rounded-full blur-3xl animate-pulse-glow" style={{ animationDuration: '12s' }}></div>
      
      {/* Tech grid patterns */}
      <div className="absolute inset-0 opacity-10" style={{ 
        backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100%25\' height=\'100%25\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'grid\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M 40 0 L 0 0 0 40\' fill=\'none\' stroke=\'%23d4af37\' stroke-width=\'0.5\' stroke-opacity=\'0.05\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'100%25\' height=\'100%25\' fill=\'url(%23grid)\' /%3E%3C/svg%3E")',
        backgroundSize: '40px 40px'
      }}></div>
      
      {/* Authentication Container */}
      <div className={`w-[400px] mx-auto relative z-10 transform transition-transform duration-500 ease-out ${appearAnimation ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
        <div className="bg-black rounded-xl overflow-hidden p-6 pb-3 relative">
          {/* Logo and title section - conditionally show Gary logo only on sign-up */}
          {isSignUp ? (
            <div className="flex flex-col items-center mb-8">
              <div className="relative mb-4">
                <div className="absolute inset-0 rounded-full bg-[#d4af37]/20 blur-lg transform scale-150 animate-pulse-slow" style={{ animationDuration: '4s' }}></div>
                <img src={garyLogo} alt="Gary The Bear" className="w-48 h-48 mx-auto object-contain relative z-10" />
              </div>
              <h1 className="text-3xl font-bold text-white tracking-wide text-center">THE BEAR'S DEN</h1>
            </div>
          ) : (
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-white tracking-wide text-center">THE BEAR'S DEN</h1>
              <div className="h-[2px] w-40 mx-auto mt-2 bg-[#333333]"></div>
            </div>
          )}

          {/* Auth forms */}
          {isSignUp ? (
            signupComplete ? (
              /* Signup success message */
              <div className="space-y-6 text-center mb-6">
                <h2 className="text-xl font-bold text-green-500">✅ Account Created!</h2>
                <p className="text-[#9CA3AF]">A confirmation email has been sent to <span className="font-semibold text-white">{email}</span>.</p>
                <p className="text-sm text-[#9CA3AF]">Please check your inbox and spam folder for the confirmation link.</p>
                <p className="text-xs text-[#9CA3AF] mt-2 p-2 bg-zinc-900 rounded">If you don't receive the email in a few minutes, you can try signing in directly - for development purposes, email confirmation might be disabled.</p>
                <div className="flex justify-center space-x-4 mt-6">
                  <button 
                    onClick={() => {
                      setIsSignUp(false);
                      setSignupComplete(false);
                      // Keep the email but clear password
                      setPassword('');
                    }}
                    className="text-[#d4af37] hover:text-[#d4af37]/80 font-medium border border-[#d4af37] px-4 py-2 rounded-md"
                  >
                    Return to sign in
                  </button>
                  <button
                    onClick={() => window.location.href = 'mailto:support@garyai.com?subject=Account%20Confirmation%20Issue&body=I%20didn\'t%20receive%20my%20confirmation%20email%20for%20account:%20' + encodeURIComponent(email)}
                    className="text-zinc-400 hover:text-white font-medium border border-zinc-700 px-4 py-2 rounded-md"
                  >
                    Contact Support
                  </button>
                </div>
              </div>
            ) : (
              /* Sign-up form */
              <form onSubmit={handleSubmit} className="mb-6">
                {error && (
                  <div className="bg-red-500/10 text-red-500 p-3 rounded-lg mb-4 border border-red-200">{error}</div>
                )}

                <div className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-base font-medium text-[#9CA3AF] mb-2">Email address</label>
                    <input
                      id="email"
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
                    <label htmlFor="password" className="block text-base font-medium text-[#9CA3AF] mb-2">Password</label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      className="appearance-none relative block w-full px-4 py-4 border border-[#333333] rounded-md focus:outline-none focus:ring-1 focus:ring-[#d4af37] bg-white text-black text-base"
                      style={{color: '#000000'}}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex justify-center py-4 px-4 border border-transparent text-lg font-bold uppercase rounded-md text-black bg-[#d4af37] hover:bg-[#c4a127] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                  >
                    {loading ? 'Creating Account...' : 'CREATE ACCOUNT'}
                  </button>
                </div>
              </form>
            )
          ) : (
            /* Sign-in form */
            <form onSubmit={handleSubmit} className="mb-6">
              {error && (
                <div className="bg-red-500/10 text-red-500 p-3 rounded-lg mb-4 border border-red-200">{error}</div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="email" className="block text-base font-medium text-[#9CA3AF] mb-2">Email address</label>
                  <input
                    id="email"
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
                  <label htmlFor="password" className="block text-base font-medium text-[#9CA3AF] mb-2">Password</label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="appearance-none relative block w-full px-4 py-4 border border-[#333333] rounded-md focus:outline-none focus:ring-1 focus:ring-[#d4af37] bg-white text-black text-base"
                    style={{color: '#000000'}}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      className="h-4 w-4 text-[#d4af37] rounded border-gray-600 focus:ring-0"
                    />
                    <label htmlFor="remember-me" className="ml-2 block text-sm text-[#9CA3AF]">
                      Remember me
                    </label>
                  </div>

                  <div className="text-sm">
                    <a href="#" className="font-medium text-[#d4af37] hover:text-[#d4af37]/80">
                      Forgot password?
                    </a>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-4 px-4 border border-transparent text-lg font-bold uppercase rounded-md text-black bg-[#d4af37] hover:bg-[#c4a127] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                >
                  {loading ? 'Signing in...' : 'SIGN IN'}
                </button>
              </div>
            </form>
          )}
          
          {/* Account toggle */}
          <div className="text-center my-4">
            {!isSignUp ? (
              <p className="text-[#9CA3AF]">
                Don't have an account?{' '}
                <button 
                  onClick={() => setIsSignUp(true)}
                  className="text-[#d4af37] hover:text-[#d4af37]/80 font-medium"
                >
                  Sign up here
                </button>
              </p>
            ) : (
              <p className="text-[#9CA3AF]">
                Already have an account?{' '}
                <button 
                  onClick={() => setIsSignUp(false)}
                  className="text-[#d4af37] hover:text-[#d4af37]/80 font-medium"
                >
                  Sign in here
                </button>
              </p>
            )}
          </div>
          
          {/* Footer */}
          <div className="mt-4 pt-4 border-t border-[#333333] text-center">
            <p className="text-xs text-[#9CA3AF]">
              By signing in, you agree to Gary's{' '}
              <Link to="/terms" className="text-[#d4af37] hover:text-[#d4af37]/80">Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy" className="text-[#d4af37] hover:text-[#d4af37]/80">Privacy Policy</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
