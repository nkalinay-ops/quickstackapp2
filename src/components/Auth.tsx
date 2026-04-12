import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Eye, EyeOff } from 'lucide-react';
import { PasswordStrength, validatePassword } from './PasswordStrength';

export function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [betaKey, setBetaKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        if (!betaKey.trim()) {
          setError('Beta key is required to sign up');
          setLoading(false);
          return;
        }

        const passwordValidation = validatePassword(password);
        if (!passwordValidation.isValid) {
          setError(passwordValidation.error || 'Password does not meet requirements');
          setLoading(false);
          return;
        }

        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-beta-key`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            keyCode: betaKey,
            email,
            password,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          setError(result.error || 'Failed to validate beta key');
          setLoading(false);
          return;
        }

        if (result.session) {
          const { error: sessionError } = await supabase.auth.setSession(result.session);
          if (sessionError) {
            console.error('Error setting session:', sessionError);
            setError('Account created but failed to sign in. Please sign in manually.');
          }
        }
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center flex flex-col items-center">
          <img
            src="/logo.svg"
            alt="QuickStack"
            className="w-64 h-auto mb-1"
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 bg-gray-900 p-6 rounded-lg">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={12}
                className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                placeholder="••••••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 focus:outline-none z-10 cursor-pointer"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {isSignUp && <PasswordStrength password={password} />}
          </div>

          {isSignUp && (
            <div>
              <label htmlFor="betaKey" className="block text-sm font-medium text-gray-300 mb-1">
                Beta Key
              </label>
              <input
                id="betaKey"
                type="text"
                value={betaKey}
                onChange={(e) => setBetaKey(e.target.value)}
                required={isSignUp}
                className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                placeholder="BETA-XXXX-XXXX-XXXX"
                maxLength={24}
              />
              <p className="text-xs text-gray-500 mt-1">
                Enter your beta key to create an account
              </p>
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm bg-red-950 p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>

          <div className="space-y-2">
            {!isSignUp && (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'forgot-password' }))}
                className="w-full text-gray-400 hover:text-white transition-colors text-sm"
              >
                Forgot your password?
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="w-full text-gray-400 hover:text-white transition-colors text-sm"
            >
              {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
