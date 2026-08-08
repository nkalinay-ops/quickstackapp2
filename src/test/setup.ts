import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Canvas stub — jsdom has no canvas implementation
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
  putImageData: vi.fn(),
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  scale: vi.fn(),
  filter: '',
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/jpeg;base64,FAKE');

// URL.createObjectURL stub
if (typeof URL.createObjectURL === 'undefined') {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock') });
}
