export interface OptimizedImage {
  dataUrl: string;
  originalSize: number;
  optimizedSize: number;
  savingsPercent: number;
}

export async function optimizeImageForOCR(
  imageDataUrl: string,
  maxWidth: number = 1024,
  quality: number = 0.85
): Promise<OptimizedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onerror = () => reject(new Error('Failed to load image'));

    img.onload = () => {
      const canvas = document.createElement('canvas');
      let { width, height } = img;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const minWidth = 800;
      if (width < minWidth) {
        width = minWidth;
        height = Math.round((img.height * minWidth) / img.width);
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const contrast = 1.2;
        data[i] = Math.min(255, Math.max(0, (r - 128) * contrast + 128));
        data[i + 1] = Math.min(255, Math.max(0, (g - 128) * contrast + 128));
        data[i + 2] = Math.min(255, Math.max(0, (b - 128) * contrast + 128));
      }

      ctx.putImageData(imageData, 0, 0);

      const kernel = [
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
      ];
      const tempImageData = ctx.getImageData(0, 0, width, height);
      const tempData = tempImageData.data;
      const output = new Uint8ClampedArray(tempData.length);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          for (let c = 0; c < 3; c++) {
            let sum = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                const kernelIdx = (ky + 1) * 3 + (kx + 1);
                sum += tempData[idx] * kernel[kernelIdx];
              }
            }
            const idx = (y * width + x) * 4 + c;
            output[idx] = Math.min(255, Math.max(0, sum));
          }
          const alphaIdx = (y * width + x) * 4 + 3;
          output[alphaIdx] = tempData[alphaIdx];
        }
      }

      const sharpenedImageData = new ImageData(output, width, height);
      ctx.putImageData(sharpenedImageData, 0, 0);

      const optimizedDataUrl = canvas.toDataURL('image/jpeg', quality);

      const originalSize = Math.round((imageDataUrl.length * 3) / 4);
      const optimizedSize = Math.round((optimizedDataUrl.length * 3) / 4);
      const savingsPercent = Math.round(((originalSize - optimizedSize) / originalSize) * 100);

      resolve({
        dataUrl: optimizedDataUrl,
        originalSize,
        optimizedSize,
        savingsPercent,
      });
    };

    img.src = imageDataUrl;
  });
}
