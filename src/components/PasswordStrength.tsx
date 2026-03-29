interface PasswordStrengthProps {
  password: string;
}

interface PasswordRequirement {
  met: boolean;
  label: string;
}

export function PasswordStrength({ password }: PasswordStrengthProps) {
  const requirements: PasswordRequirement[] = [
    { met: password.length >= 8, label: 'At least 8 characters' },
    { met: /[0-9]/.test(password), label: 'Contains at least 1 number' },
  ];

  const metCount = requirements.filter(req => req.met).length;
  const strength = metCount === 2 ? 'strong' : metCount >= 1 ? 'medium' : 'weak';

  const getStrengthColor = () => {
    if (strength === 'strong') return 'bg-green-500';
    if (strength === 'medium') return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStrengthLabel = () => {
    if (strength === 'strong') return 'Strong password';
    if (strength === 'medium') return 'Medium strength';
    return 'Weak password';
  };

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${getStrengthColor()}`}
            style={{ width: `${(metCount / 2) * 100}%` }}
          />
        </div>
        <span className={`text-xs font-medium ${
          strength === 'strong' ? 'text-green-400' :
          strength === 'medium' ? 'text-yellow-400' :
          'text-red-400'
        }`}>
          {getStrengthLabel()}
        </span>
      </div>

      <ul className="space-y-1 text-xs">
        {requirements.map((req, index) => (
          <li
            key={index}
            className={`flex items-center gap-2 ${
              req.met ? 'text-green-400' : 'text-gray-500'
            }`}
          >
            <span className="w-4 h-4 flex items-center justify-center">
              {req.met ? '✓' : '○'}
            </span>
            {req.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function validatePassword(password: string): { isValid: boolean; error?: string } {
  if (password.length < 8) {
    return { isValid: false, error: 'Password must be at least 8 characters long' };
  }
  if (!/[0-9]/.test(password)) {
    return { isValid: false, error: 'Password must contain at least one number' };
  }
  return { isValid: true };
}
