import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function EmailConfirmed() {
  const [signingOut, setSigningOut] = useState(false);

  const handleGoToLogin = async () => {
    setSigningOut(true);
    await supabase.auth.signOut({ scope: 'global' });
    window.history.replaceState({}, '', '/');
    window.dispatchEvent(new CustomEvent('navigate', { detail: 'auth' }));
  };

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
