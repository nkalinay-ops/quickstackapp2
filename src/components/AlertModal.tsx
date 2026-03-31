import { X, AlertCircle, CheckCircle2, Info } from 'lucide-react';

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: 'error' | 'success' | 'info';
}

export function AlertModal({ isOpen, onClose, title, message, type = 'info' }: AlertModalProps) {
  if (!isOpen) return null;

  const config = {
    error: {
      icon: AlertCircle,
      iconColor: 'text-red-400',
      bgColor: 'bg-red-950',
      borderColor: 'border-red-900',
    },
    success: {
      icon: CheckCircle2,
      iconColor: 'text-green-400',
      bgColor: 'bg-green-950',
      borderColor: 'border-green-900',
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-400',
      bgColor: 'bg-blue-950',
      borderColor: 'border-blue-900',
    },
  };

  const { icon: Icon, iconColor, bgColor, borderColor } = config[type];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-900 rounded-lg max-w-md w-full border border-gray-800">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-2 ${bgColor} rounded-lg border ${borderColor}`}>
              <Icon className={`w-6 h-6 ${iconColor}`} />
            </div>
            <div className="flex-1">
              {title && <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>}
              <p className="text-gray-300">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="border-t border-gray-800 p-4">
          <button
            onClick={onClose}
            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
