import { useState, useRef, useEffect } from 'react';
import { Camera, X, RotateCcw } from 'lucide-react';
import { ImageCrop } from './ImageCrop';
import { Capacitor } from '@capacitor/core';
import { Camera as CapCamera, CameraResultType, CameraSource, CameraDirection } from '@capacitor/camera';

type CameraCaptureProps = {
  onCapture: (imageDataUrl: string) => void;
  onClose: () => void;
};

const isNative = Capacitor.isNativePlatform();

export function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative) {
      startBrowserCamera();
      return () => stopBrowserCamera();
    }
  }, [facingMode]);

  const startBrowserCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
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

  const stopBrowserCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const captureNative = async () => {
    try {
      const photo = await CapCamera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        quality: 95,
        direction: facingMode === 'environment' ? CameraDirection.Rear : CameraDirection.Front,
        saveToGallery: false,
        allowEditing: false,
        width: 1920,
        height: 1080,
        correctOrientation: true,
      });

      if (photo.dataUrl) {
        setCapturedImage(photo.dataUrl);
      }
    } catch (err) {
      console.error('Native camera error:', err);
      setError('Unable to access camera. Please check permissions.');
    }
  };

  const captureBrowser = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.drawImage(video, 0, 0);
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.95);
    stopBrowserCamera();
    setCapturedImage(imageDataUrl);
  };

  const capturePhoto = () => {
    if (isNative) {
      captureNative();
    } else {
      captureBrowser();
    }
  };

  const handleCropComplete = (croppedImageDataUrl: string) => {
    onCapture(croppedImageDataUrl);
  };

  const handleCropCancel = () => {
    setCapturedImage(null);
    if (!isNative) {
      startBrowserCamera();
    }
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
                onClick={isNative ? captureNative : startBrowserCamera}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : (
          <>
            {!isNative && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            )}
            {isNative && (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-400 text-sm">Tap the button below to open the camera</p>
              </div>
            )}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-md aspect-[2/3] border-2 border-blue-500 rounded-lg shadow-lg">
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
              </div>
            </div>
            {!isNative && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6 text-center">
                <p className="text-white text-sm mb-2">Position comic cover within frame</p>
              </div>
            )}
          </>
        )}
      </div>

      {!error && (
        <div className="p-6 bg-gray-900 flex justify-center">
          <button
            onClick={capturePhoto}
            className="w-20 h-20 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center transition-colors shadow-lg"
          >
            <Camera size={32} className="text-white" />
          </button>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
