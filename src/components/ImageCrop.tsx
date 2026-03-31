import { useState, useRef, useEffect } from 'react';
import { Check, X } from 'lucide-react';

type Point = { x: number; y: number };

type ImageCropProps = {
  imageDataUrl: string;
  onCropComplete: (croppedImageDataUrl: string) => void;
  onCancel: () => void;
};

export function ImageCrop({ imageDataUrl, onCropComplete, onCancel }: ImageCropProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<Point[]>([
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [detecting, setDetecting] = useState(true);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      updateCanvasSize(img);
      detectEdges(img);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  const detectEdges = (img: HTMLImageElement) => {
    setDetecting(true);

    const detectionCanvas = document.createElement('canvas');
    const ctx = detectionCanvas.getContext('2d');
    if (!ctx) {
      setDetecting(false);
      return;
    }

    const maxSize = 800;
    const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
    detectionCanvas.width = img.width * scale;
    detectionCanvas.height = img.height * scale;

    ctx.drawImage(img, 0, 0, detectionCanvas.width, detectionCanvas.height);

    const imageData = ctx.getImageData(0, 0, detectionCanvas.width, detectionCanvas.height);
    const data = imageData.data;
    const w = detectionCanvas.width;
    const h = detectionCanvas.height;

    const gray = new Uint8Array(w * h);
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      gray[i / 4] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const blurred = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        blurred[idx] = Math.floor(
          (gray[idx - w - 1] + gray[idx - w] + gray[idx - w + 1] +
           gray[idx - 1] + gray[idx] + gray[idx + 1] +
           gray[idx + w - 1] + gray[idx + w] + gray[idx + w + 1]) / 9
        );
      }
    }

    const edges = new Uint8Array(w * h);
    const threshold = 20;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const gx =
          -blurred[idx - w - 1] - 2 * blurred[idx - 1] - blurred[idx + w - 1] +
          blurred[idx - w + 1] + 2 * blurred[idx + 1] + blurred[idx + w + 1];
        const gy =
          -blurred[idx - w - 1] - 2 * blurred[idx - w] - blurred[idx - w + 1] +
          blurred[idx + w - 1] + 2 * blurred[idx + w] + blurred[idx + w + 1];
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[idx] = magnitude > threshold ? 255 : 0;
      }
    }

    const margin = 5;
    let minX = margin;
    let maxX = w - margin;
    let minY = margin;
    let maxY = h - margin;

    const minEdgePercentage = 0.03;
    const minEdgesVertical = Math.floor((h - 2 * margin) * minEdgePercentage);
    const minEdgesHorizontal = Math.floor((w - 2 * margin) * minEdgePercentage);

    for (let x = margin; x < w / 2; x++) {
      let edgeCount = 0;
      for (let y = margin; y < h - margin; y++) {
        if (edges[y * w + x] > 0) edgeCount++;
      }
      if (edgeCount > minEdgesVertical) {
        minX = x;
        break;
      }
    }

    for (let x = w - margin; x > w / 2; x--) {
      let edgeCount = 0;
      for (let y = margin; y < h - margin; y++) {
        if (edges[y * w + x] > 0) edgeCount++;
      }
      if (edgeCount > minEdgesVertical) {
        maxX = x;
        break;
      }
    }

    for (let y = margin; y < h / 2; y++) {
      let edgeCount = 0;
      for (let x = margin; x < w - margin; x++) {
        if (edges[y * w + x] > 0) edgeCount++;
      }
      if (edgeCount > minEdgesHorizontal) {
        minY = y;
        break;
      }
    }

    for (let y = h - margin; y > h / 2; y--) {
      let edgeCount = 0;
      for (let x = margin; x < w - margin; x++) {
        if (edges[y * w + x] > 0) edgeCount++;
      }
      if (edgeCount > minEdgesHorizontal) {
        maxY = y;
        break;
      }
    }

    const extensionPadding = 5;
    minX = Math.max(0, minX - extensionPadding);
    maxX = Math.min(w, maxX + extensionPadding);
    minY = Math.max(0, minY - extensionPadding);
    maxY = Math.min(h, maxY + extensionPadding);

    setPoints([
      { x: minX / w, y: minY / h },
      { x: maxX / w, y: minY / h },
      { x: maxX / w, y: maxY / h },
      { x: minX / w, y: maxY / h },
    ]);

    setDetecting(false);
  };

  useEffect(() => {
    const handleResize = () => {
      if (image) {
        updateCanvasSize(image);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [image]);

  useEffect(() => {
    if (image && canvasRef.current) {
      drawCanvas();
    }
  }, [image, points, canvasSize]);

  const updateCanvasSize = (img: HTMLImageElement) => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const maxWidth = container.clientWidth;
    const maxHeight = container.clientHeight;

    const scale = Math.min(
      maxWidth / img.width,
      maxHeight / img.height,
      1
    );

    const width = img.width * scale;
    const height = img.height * scale;

    setCanvasSize({ width, height });
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvasSize.width, canvasSize.height);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = point.x * canvasSize.width;
      const y = point.y * canvasSize.height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.clip();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvasSize.width, canvasSize.height);
    ctx.restore();

    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((point, index) => {
      const x = point.x * canvasSize.width;
      const y = point.y * canvasSize.height;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.stroke();

    points.forEach((point, index) => {
      const x = point.x * canvasSize.width;
      const y = point.y * canvasSize.height;
      const isActive = draggingIndex === index;

      ctx.fillStyle = isActive ? '#10B981' : '#3B82F6';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, isActive ? 20 : 16, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `bold ${isActive ? 16 : 14}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((index + 1).toString(), x, y);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    });
  };

  const getCanvasCoordinates = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const coord = getCanvasCoordinates(e.clientX, e.clientY);

    const clickedIndex = points.findIndex(point => {
      const dx = (point.x - coord.x) * rect.width;
      const dy = (point.y - coord.y) * rect.height;
      return Math.sqrt(dx * dx + dy * dy) < 40;
    });

    if (clickedIndex !== -1) {
      setDraggingIndex(clickedIndex);
      canvas.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (draggingIndex === null) return;

    const coord = getCanvasCoordinates(e.clientX, e.clientY);

    setPoints(prev => {
      const newPoints = [...prev];
      newPoints[draggingIndex] = coord;
      return newPoints;
    });
  };

  const handlePointerUp = () => {
    setDraggingIndex(null);
  };

  const handleCropConfirm = async () => {
    if (!image) return;

    const cropCanvas = document.createElement('canvas');
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return;

    const imagePoints = points.map(p => ({
      x: p.x * image.width,
      y: p.y * image.height,
    }));

    const minX = Math.min(...imagePoints.map(p => p.x));
    const maxX = Math.max(...imagePoints.map(p => p.x));
    const minY = Math.min(...imagePoints.map(p => p.y));
    const maxY = Math.max(...imagePoints.map(p => p.y));

    const cropWidth = maxX - minX;
    const cropHeight = maxY - minY;

    const targetWidth = 1200;
    const targetHeight = (cropHeight / cropWidth) * targetWidth;

    cropCanvas.width = targetWidth;
    cropCanvas.height = targetHeight;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

    ctx.save();
    ctx.beginPath();
    imagePoints.forEach((point, index) => {
      const x = ((point.x - minX) / cropWidth) * targetWidth;
      const y = ((point.y - minY) / cropHeight) * targetHeight;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.closePath();
    ctx.clip();

    const sx = minX;
    const sy = minY;
    const sWidth = cropWidth;
    const sHeight = cropHeight;
    const dx = 0;
    const dy = 0;
    const dWidth = targetWidth;
    const dHeight = targetHeight;

    ctx.drawImage(image, sx, sy, sWidth, sHeight, dx, dy, dWidth, dHeight);
    ctx.restore();

    const croppedDataUrl = cropCanvas.toDataURL('image/jpeg', 0.95);
    onCropComplete(croppedDataUrl);
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 bg-gray-900">
        <button
          onClick={onCancel}
          className="p-2 text-white hover:text-gray-300 transition-colors"
        >
          <X size={24} />
        </button>
        <h2 className="text-lg font-semibold text-white">Adjust Crop Area</h2>
        <button
          onClick={handleCropConfirm}
          className="p-2 text-green-400 hover:text-green-300 transition-colors"
        >
          <Check size={24} />
        </button>
      </div>

      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-4 overflow-hidden"
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="touch-none"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            cursor: draggingIndex !== null ? 'grabbing' : 'grab',
          }}
        />
      </div>

      <div className="p-4 bg-gray-900">
        {detecting ? (
          <p className="text-center text-blue-400 text-sm animate-pulse">
            Detecting comic borders...
          </p>
        ) : (
          <>
            <p className="text-center text-gray-300 text-sm">
              Borders detected! Drag corners to adjust if needed
            </p>
            <p className="text-center text-gray-500 text-xs mt-1">
              Position all 4 points around the comic cover edges
            </p>
          </>
        )}
      </div>
    </div>
  );
}
