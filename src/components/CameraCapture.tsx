import { useState, useRef, useEffect } from 'react';
import { Camera, X, RotateCcw } from 'lucide-react';
import { ImageCrop } from './ImageCrop';

type CameraCaptureProps = {
  onCapture: (imageDataUrl: string) => void;
  onClose: () => void;
};

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [showFlash, setShowFlash] = useState(false);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [facingMode]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
      setError('');
    } catch (err) {
      console.error('Camera error:', err);
      setError('Unable to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || capturing) return;

    setCapturing(true);
    setShowFlash(true);

    // Hide the flash overlay after a short animation, then grab the frame.
    // The delay lets the hand movement from tapping settle before the frame
    // is grabbed, so edge detection works on a stable image.
    setTimeout(() => {
      setShowFlash(false);

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) {
        setCapturing(false);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext('2d');
      if (!context) {
        setCapturing(false);
        return;
      }

      context.drawImage(video, 0, 0);
      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      stopCamera();
      setCapturedImage(imageDataUrl);
      setCapturing(false);
    }, 600);
  };

  const handleCropComplete = (croppedImageDataUrl: string) => {
    onCapture(croppedImageDataUrl);
  };

  const handleCropCancel = () => {
    setCapturedImage(null);
    startCamera();
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  if (capturedImage) {
    return (
      <ImageCrop
        imageDataUrl={capturedImage}
        onCropComplete={handleCropComplete}
        onCancel={handleCropCancel}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 bg-gray-900">
        <button
          onClick={onClose}
          className="p-2 text-white hover:text-gray-300 transition-colors"
        >
          <X size={24} />
        </button>
        <h2 className="text-lg font-semibold text-white">Scan Comic Cover</h2>
        <button
          onClick={switchCamera}
          className="p-2 text-white hover:text-gray-300 transition-colors"
        >
          <RotateCcw size={24} />
        </button>
      </div>

      <div className="flex-1 relative overflow-hidden bg-black">
        {error ? (
          <div className="flex items-center justify-center h-full p-6">
            <div className="text-center">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md aspect-[2/3] border-2 border-blue-500 rounded-lg shadow-lg">
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6 text-center">
              {capturing ? (
                <p className="text-blue-300 text-sm font-medium animate-pulse">Hold still…</p>
              ) : (
                <p className="text-white text-sm mb-2">Position comic cover within frame</p>
              )}
            </div>
            {showFlash && (
              <div className="absolute inset-0 bg-white animate-[flash_0.3s_ease-out_forwards] pointer-events-none" />
            )}
          </>
        )}
      </div>

      {!error && (
        <div className="p-6 bg-gray-900 flex justify-center">
          <button
            onClick={capturePhoto}
            disabled={capturing}
            className="w-20 h-20 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors shadow-lg"
          >
            <Camera size={32} className="text-white" />
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
