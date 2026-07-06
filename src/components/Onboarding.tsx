import { useState } from 'react';
import { Camera, MessageCircle, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isNativePlatform } from '../lib/capacitorSetup';

const DISCORD_INVITE_URL = 'https://discord.gg/7Jwzdv5xJS';

interface Props {
  userId: string;
  onComplete: (displayName: string | null) => void;
}

export function Onboarding({ userId, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleOpenDiscord = async () => {
    if (isNativePlatform()) {
      window.open(DISCORD_INVITE_URL, '_system');
    } else {
      window.open(DISCORD_INVITE_URL, '_blank', 'noopener,noreferrer');
    }
    await handleFinish();
  };

  const handleFinish = async () => {
    setSaving(true);
    const trimmedName = name.trim() || null;
    await supabase
      .from('user_profiles')
      .update({
        display_name: trimmedName,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', userId);
    setSaving(false);
    onComplete(trimmedName);
  };

  const steps = [
    <NameScreen key="name" name={name} onChange={setName} onNext={() => setStep(1)} />,
    <ScanScreen key="scan" onNext={() => setStep(2)} />,
    <DiscordScreen key="discord" saving={saving} onJoin={handleOpenDiscord} onFinish={handleFinish} />,
  ];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <div className="flex-1 flex flex-col">
        {steps[step]}
      </div>
      <div className="flex justify-center gap-2 pb-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === step ? 'bg-indigo-500' : 'bg-gray-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function NameScreen({
  name,
  onChange,
  onNext,
}: {
  name: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-between px-8 pt-16 pb-4">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm gap-8">
        <img
          src="/ChatGPT_Image_Mar_18,_2026,_09_08_29_PM copy.png"
          alt="QuickStack"
          className="w-40 h-auto"
        />
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">Welcome to QuickStack</h1>
          <p className="text-gray-400">What should we call you?</p>
        </div>
        <input
          type="text"
          value={name}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your name"
          maxLength={50}
          className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center text-lg"
        />
      </div>
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={onNext}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          Let's Go <ChevronRight size={18} />
        </button>
        <button
          onClick={onNext}
          className="w-full py-2 text-gray-500 hover:text-gray-400 text-sm transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function ScanScreen({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-between px-8 pt-16 pb-4">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm gap-8">
        <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center">
          <Camera className="text-indigo-400" size={40} />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">Adding a comic takes seconds</h1>
          <p className="text-gray-400">Your phone reads the cover for you.</p>
        </div>
        <div className="w-full space-y-4">
          {[
            { num: 1, text: 'Tap the + button at the bottom of the screen' },
            { num: 2, text: 'Point your camera at the comic cover' },
            { num: 3, text: 'Review the details and tap Save' },
          ].map(({ num, text }) => (
            <div key={num} className="flex items-start gap-4">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-white text-sm font-bold">{num}</span>
              </div>
              <p className="text-gray-300 text-base leading-snug">{text}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={onNext}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          Next <ChevronRight size={18} />
        </button>
        <button
          onClick={onNext}
          className="w-full py-2 text-gray-500 hover:text-gray-400 text-sm transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

function DiscordScreen({
  saving,
  onJoin,
  onFinish,
}: {
  saving: boolean;
  onJoin: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-between px-8 pt-16 pb-4">
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm gap-8">
        <div className="w-20 h-20 rounded-full bg-indigo-500/10 flex items-center justify-center">
          <MessageCircle className="text-indigo-400" size={40} />
        </div>
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-white">Join the community</h1>
          <p className="text-gray-400">
            Connect with other collectors, share your finds, and get tips from fellow comic fans.
          </p>
        </div>
      </div>
      <div className="w-full max-w-sm space-y-3">
        <button
          onClick={onJoin}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <MessageCircle size={18} />
          Join Discord
        </button>
        <button
          onClick={onFinish}
          disabled={saving}
          className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Loading…' : 'Go to my collection'}
        </button>
      </div>
    </div>
  );
}
