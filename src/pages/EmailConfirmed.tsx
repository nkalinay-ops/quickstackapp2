import { useState, useEffect } from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

function detectConfirmationError(): boolean {
  const hash = window.location.hash.slice(1);
  const hashParams = new URLSearchParams(hash);
  if (hashParams.get('error') || hashParams.get('error_code') || hashParams.get('error_description')) {
    return true;
  }
  const queryParams = new URLSearchParams(window.location.search);
  if (queryParams.get('error') || queryParams.get('error_code')) {
    return true;
  }
  return false;
}

export function EmailConfirmed() {
  const [signingOut, setSigningOut] = useState(false);
  const hasError = detectConfirmationError();

  // Supabase automatically creates a session when the confirmation link is clicked.
  // Sign out immediately on mount so the original tab does not auto-login the user.
  useEffect(() => {
    supabase.auth.signOut({ scope: 'global' });
  }, []);

  const handleGoToLogin = () => {
    setSigningOut(true);
    window.history.replaceState({}, '', '/');
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'auth' }));
  };

  if (hasError) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center flex flex-col items-center">
            <img
              src="/ChatGPT_Image_Mar_18,_2026,_09_08_29_PM copy.png"
              alt="QuickStack"
              className="w-64 h-auto mb-6"
            />
            <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-900 rounded-full mb-4">
              <AlertTriangle className="text-amber-400" size={32} />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Wrong browser</h1>
            <p className="text-gray-400 mb-2">
              This confirmation link must be opened in the <span className="text-white font-medium">same browser</span> you used to sign up.
            </p>
            <p className="text-gray-400 mb-8">
              Please go back to that browser and click the link again. If the link has expired, sign up again to receive a new one.
            </p>
          </div>

          <button
            disabled={signingOut}
            onClick={handleGoToLogin}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {signingOut ? 'Please wait...' : 'Go to Sign Up'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center flex flex-col items-center">
          <img
            src="/ChatGPT_Image_Mar_18,_2026,_09_08_29_PM copy.png"
            alt="QuickStack"
            className="w-64 h-auto mb-6"
          />
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-900 rounded-full mb-4">
            <CheckCircle className="text-green-400" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Email confirmed</h1>
          <p className="text-gray-400 mb-8">
            Your account is ready. Sign in with your email and password to get started.
          </p>
        </div>

        <button
          disabled={signingOut}
          onClick={handleGoToLogin}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {signingOut ? 'Please wait...' : 'Go to Sign In'}
        </button>
      </div>
    </div>
  );
}
