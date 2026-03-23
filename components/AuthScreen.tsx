'use client';

import React, { useState } from 'react';
import { Chrome, Mail, ArrowRight, Loader2, ChevronRight, Lock, Eye, EyeOff, Sparkles, UserCheck, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthScreenProps {
  onLogin: (method: 'google' | 'phone') => void;
  onSkip: () => void;
}

type AuthMode = 'main' | 'magic-link' | 'signup' | 'signin' | 'forgot-password';

// --- LOCAL AUTH (runs when Supabase is NOT configured) ---
const LOCAL_USERS_KEY = 'clothstryon_local_users';
const LOCAL_SESSION_KEY = 'clothstryon_local_session';

const getLocalUsers = (): Record<string, { email: string; password: string; name: string }> => {
  try { return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY) || '{}'); } catch { return {}; }
};

const localSignUp = (email: string, password: string): { error?: string; success?: string } => {
  const users = getLocalUsers();
  if (users[email.toLowerCase()]) return { error: 'An account with this email already exists. Please sign in.' };
  users[email.toLowerCase()] = { email, password, name: email.split('@')[0] };
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  return { success: 'Account created! You can now sign in.' };
};

const localSignIn = (email: string, password: string): { error?: string; user?: any } => {
  const users = getLocalUsers();
  const user = users[email.toLowerCase()];
  if (!user) return { error: 'No account found with this email. Please create an account first.' };
  if (user.password !== password) return { error: 'Incorrect password. Please try again.' };
  const session = { email: user.email, name: user.name, id: `local-${btoa(email)}`, isLocal: true };
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
  localStorage.setItem('authSession', 'guest'); // reuse guest session flow
  return { user: session };
};

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, onSkip }) => {
  const [mode, setMode] = useState<AuthMode>('main');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isSupabaseConfigured = !!supabase;

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setMessage(null);
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setMessage({ type: 'error', text: 'Google login requires Supabase. Please use Email/Password instead.' });
      return;
    }
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined },
    });
    if (error) { console.error(error); setIsLoading(false); }
  };

  const handleMagicLink = async () => {
    if (!supabase) {
      setMessage({ type: 'error', text: 'Magic link requires Supabase. Please use Email/Password instead.' });
      return;
    }
    if (!email) return;
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined },
    });
    setIsLoading(false);
    if (error) setMessage({ type: 'error', text: error.message });
    else setMessage({ type: 'success', text: 'Check your email for the magic link!' });
  };

  const handleSignUp = async () => {
    if (!email || !password) { setMessage({ type: 'error', text: 'Please fill in all fields.' }); return; }
    if (password !== confirmPassword) { setMessage({ type: 'error', text: "Passwords don't match." }); return; }
    if (password.length < 6) { setMessage({ type: 'error', text: 'Password must be at least 6 characters.' }); return; }

    setIsLoading(true);

    if (!supabase) {
      // LOCAL MODE: store in localStorage
      const result = localSignUp(email, password);
      setIsLoading(false);
      if (result.error) setMessage({ type: 'error', text: result.error });
      else { setMessage({ type: 'success', text: result.success! }); setTimeout(() => { setMode('signin'); setMessage(null); setEmail(email); setPassword(''); }, 1500); }
      return;
    }

    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined },
    });
    setIsLoading(false);
    if (error) setMessage({ type: 'error', text: error.message });
    else setMessage({ type: 'success', text: 'Check your email to confirm your account!' });
  };

  const handleSignIn = async () => {
    if (!email || !password) { setMessage({ type: 'error', text: 'Please enter your email and password.' }); return; }

    setIsLoading(true);

    if (!supabase) {
      // LOCAL MODE: verify against localStorage
      const result = localSignIn(email, password);
      setIsLoading(false);
      if (result.error) { setMessage({ type: 'error', text: result.error }); return; }
      // Trigger onSkip to enter the app as "guest" (local session)
      onSkip();
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    if (error) setMessage({ type: 'error', text: error.message });
    // Successful login triggers auth state change in App.tsx
  };

  const handleForgotPassword = async () => {
    if (!supabase) {
      setMessage({ type: 'error', text: 'Password reset requires Supabase. Create a new account instead.' });
      return;
    }
    if (!email) { setMessage({ type: 'error', text: 'Please enter your email address.' }); return; }
    setIsLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/auth/reset-password` : undefined,
    });
    setIsLoading(false);
    if (error) setMessage({ type: 'error', text: error.message });
    else setMessage({ type: 'success', text: 'Check your email for the password reset link!' });
  };

  const renderNoSupabaseBanner = () => (
    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2">
      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-amber-400 text-xs font-mono">
        Running in <strong>Local Mode</strong> — accounts saved on this device only.
        Add Supabase keys to <code>.env.local</code> for cloud sync.
      </p>
    </div>
  );

  const renderMainOptions = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {!isSupabaseConfigured && renderNoSupabaseBanner()}

      {/* Google Login */}
      <button
        onClick={handleGoogleLogin}
        disabled={isLoading || !isSupabaseConfigured}
        className={`w-full py-4 px-6 border text-white font-mono text-xs uppercase tracking-widest transition-all rounded-sm group shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] flex items-center justify-center gap-3 relative overflow-hidden
          ${isSupabaseConfigured
            ? 'bg-zinc-900 border-white/20 hover:bg-white hover:text-black hover:border-white hover:shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] hover:translate-x-[1px] hover:translate-y-[1px]'
            : 'bg-zinc-900/40 border-white/10 opacity-40 cursor-not-allowed'
          }`}
      >
        <Chrome className="w-5 h-5 group-hover:text-blue-600 transition-colors" />
        <span>Continue with Google</span>
        {isSupabaseConfigured && <ArrowRight className="w-4 h-4 absolute right-6 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />}
      </button>

      {/* Email/Password Sign In */}
      <button
        onClick={() => { setMode('signin'); resetForm(); }}
        className="w-full py-4 px-6 bg-accent text-white font-mono text-sm uppercase tracking-widest rounded-lg flex items-center justify-center gap-3 hover:bg-orange-600 transition-colors group shadow-lg"
      >
        <Lock className="w-5 h-5" />
        <span>Sign In with Email</span>
        <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
      </button>

      {/* Create Account */}
      <button
        onClick={() => { setMode('signup'); resetForm(); }}
        className="w-full py-4 px-6 bg-zinc-800 border border-white/20 text-white font-mono text-sm uppercase tracking-widest rounded-lg flex items-center justify-center gap-3 hover:border-accent hover:text-accent transition-colors group"
      >
        <UserCheck className="w-5 h-5" />
        <span>Create Account</span>
      </button>

      {/* Magic Link */}
      <button
        onClick={() => { setMode('magic-link'); resetForm(); }}
        disabled={!isSupabaseConfigured}
        className={`w-full py-3 px-6 border text-white font-medium rounded-lg flex items-center justify-center gap-3 transition-colors group text-sm
          ${isSupabaseConfigured ? 'bg-black border-white/20 hover:border-accent hover:text-accent' : 'bg-black/30 border-white/10 opacity-40 cursor-not-allowed'}`}
      >
        <Sparkles className="w-4 h-4" />
        <span className="font-mono text-xs uppercase tracking-wide">Use Magic Link</span>
        {!isSupabaseConfigured && <span className="text-xs text-gray-600 ml-1">(needs Supabase)</span>}
      </button>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-zinc-900/40 px-2 text-gray-500 font-mono">Or</span>
        </div>
      </div>

      <button
        onClick={onSkip}
        className="w-full py-3 text-gray-400 hover:text-white text-xs font-mono uppercase tracking-widest transition-colors border border-white/10 rounded-lg hover:border-white/30"
      >
        Continue as Guest (no account)
      </button>
    </div>
  );

  const renderMagicLink = () => (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
      <button onClick={() => { setMode('main'); resetForm(); }} className="flex items-center gap-2 text-gray-500 hover:text-white font-mono text-[10px] uppercase tracking-widest mb-6">
        <ChevronRight className="w-3 h-3 rotate-180" /> Back
      </button>
      <div className="space-y-6">
        <div>
          <h3 className="font-serif text-2xl text-white">Magic Link ✨</h3>
          <p className="text-gray-500 text-sm mt-1">We&apos;ll send you a login link.</p>
        </div>
        {message ? (
          <div className={`p-3 ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'} border text-sm rounded`}>{message.text}</div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-gray-500">Email Address</label>
              <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white font-mono focus:border-accent focus:outline-none transition-colors" />
            </div>
            <button onClick={handleMagicLink} disabled={isLoading || !email}
              className="w-full py-4 bg-accent text-white font-bold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Magic Link'}
            </button>
          </>
        )}
      </div>
    </div>
  );

  const renderSignIn = () => (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
      <button onClick={() => { setMode('main'); resetForm(); }} className="flex items-center gap-2 text-gray-500 hover:text-white font-mono text-[10px] uppercase tracking-widest mb-6">
        <ChevronRight className="w-3 h-3 rotate-180" /> Back
      </button>
      <div className="space-y-6">
        <div>
          <h3 className="font-serif text-2xl text-white">Welcome Back 👋</h3>
          <p className="text-gray-500 text-sm mt-1">
            {isSupabaseConfigured ? 'Sign in to your account' : 'Sign in with your local account'}
          </p>
        </div>
        {!isSupabaseConfigured && renderNoSupabaseBanner()}
        {message && (
          <div className={`p-3 ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'} border text-sm rounded`}>{message.text}</div>
        )}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase text-gray-500">Email Address</label>
            <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white font-mono focus:border-accent focus:outline-none transition-colors" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase text-gray-500">Password</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white font-mono focus:border-accent focus:outline-none transition-colors pr-12" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
        <button onClick={handleSignIn} disabled={isLoading || !email || !password}
          className="w-full py-4 bg-accent text-white font-bold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center">
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
        </button>
        <div className="flex justify-between text-sm">
          <button onClick={() => { setMode('forgot-password'); setMessage(null); }} className="text-gray-500 hover:text-accent transition-colors font-mono text-xs">
            Forgot password?
          </button>
          <button onClick={() => { setMode('signup'); resetForm(); }} className="text-gray-500 hover:text-white transition-colors font-mono text-xs">
            Create account →
          </button>
        </div>
      </div>
    </div>
  );

  const renderSignUp = () => (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
      <button onClick={() => { setMode('signin'); resetForm(); }} className="flex items-center gap-2 text-gray-500 hover:text-white font-mono text-[10px] uppercase tracking-widest mb-6">
        <ChevronRight className="w-3 h-3 rotate-180" /> Back
      </button>
      <div className="space-y-6">
        <div>
          <h3 className="font-serif text-2xl text-white">Create Account 🎉</h3>
          <p className="text-gray-500 text-sm mt-1">
            {isSupabaseConfigured ? 'Join the virtual styling revolution' : 'Create a local account on this device'}
          </p>
        </div>
        {!isSupabaseConfigured && renderNoSupabaseBanner()}
        {message ? (
          <div className={`p-3 ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'} border text-sm rounded`}>{message.text}</div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase text-gray-500">Email Address</label>
                <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white font-mono focus:border-accent focus:outline-none transition-colors" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase text-gray-500">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Min 6 characters" value={password} onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white font-mono focus:border-accent focus:outline-none transition-colors pr-12" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase text-gray-500">Confirm Password</label>
                <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white font-mono focus:border-accent focus:outline-none transition-colors" />
              </div>
            </div>
            <button onClick={handleSignUp} disabled={isLoading || !email || !password || !confirmPassword}
              className="w-full py-4 bg-accent text-white font-bold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
            </button>
          </>
        )}
        <div className="text-center">
          <button onClick={() => { setMode('signin'); resetForm(); }} className="text-gray-500 hover:text-white transition-colors font-mono text-xs">
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  );

  const renderForgotPassword = () => (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
      <button onClick={() => { setMode('signin'); setMessage(null); }} className="flex items-center gap-2 text-gray-500 hover:text-white font-mono text-[10px] uppercase tracking-widest mb-6">
        <ChevronRight className="w-3 h-3 rotate-180" /> Back
      </button>
      <div className="space-y-6">
        <div>
          <h3 className="font-serif text-2xl text-white">Reset Password 🔑</h3>
          <p className="text-gray-500 text-sm mt-1">
            {isSupabaseConfigured ? "We'll send you a reset link" : "Create a new account instead"}
          </p>
        </div>
        {message ? (
          <div className={`p-3 ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-red-500/10 border-red-500/20 text-red-500'} border text-sm rounded`}>{message.text}</div>
        ) : isSupabaseConfigured ? (
          <>
            <div className="space-y-2">
              <label className="text-[10px] font-mono uppercase text-gray-500">Email Address</label>
              <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-white font-mono focus:border-accent focus:outline-none transition-colors" />
            </div>
            <button onClick={handleForgotPassword} disabled={isLoading || !email}
              className="w-full py-4 bg-accent text-white font-bold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center">
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
            </button>
          </>
        ) : (
          <div className="text-center space-y-4">
            <p className="text-gray-400 text-sm">In Local Mode, there is no email-based password reset.</p>
            <button onClick={() => { setMode('signup'); resetForm(); }}
              className="w-full py-4 bg-accent text-white font-bold rounded-lg hover:bg-orange-600 transition-colors">
              Create a New Account
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent/5 blur-[100px] rounded-full pointer-events-none"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-12">
          <div className="inline-block w-12 h-12 bg-accent rounded-sm shadow-[0_0_20px_rgba(249,115,22,0.5)] mb-2 rotate-3"></div>
          <h1 className="font-serif text-5xl mb-6 tracking-tight italic font-bold">ClothsTryOn</h1>
          <p className="font-mono text-xs text-gray-500 uppercase tracking-widest">AI Virtual Stylist • Global Access</p>
        </div>

        <div className="bg-zinc-900/40 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl relative">
          {mode === 'main' && renderMainOptions()}
          {mode === 'magic-link' && renderMagicLink()}
          {mode === 'signin' && renderSignIn()}
          {mode === 'signup' && renderSignUp()}
          {mode === 'forgot-password' && renderForgotPassword()}
        </div>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-gray-600 font-mono">
            By continuing you agree to our{' '}
            <a href="/terms" className="text-accent hover:underline">Terms of Service</a>
            {' '}&{' '}
            <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
};