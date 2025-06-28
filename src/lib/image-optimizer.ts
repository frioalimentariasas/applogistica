'use client';

const MAX_SIZE_MB = 0.4;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_DIMENSION = 1024; // Max width or height

// Helper to get byte size from base64 string.
// This is an approximation.
function getByteSizeFromBase64(base64: string): number {
    return base64.length * (3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

export function optimizeImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    // If it's not a data URL, reject
    if (!dataUrl.startsWith('data:image')) {
        return reject(new Error('Invalid data URL'));
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        return reject(new Error('Could not get canvas context'));
      }

      let { width, height } = img;

      // Resize if dimensions are too large
      if (width > height) {
        if (width > MAX_DIMENSION) {
          height = Math.round((height * MAX_DIMENSION) / width);
          width = MAX_DIMENSION;
        }
      } else {
        if (height > MAX_DIMENSION) {
          width = Math.round((width * MAX_DIMENSION) / height);
          height = MAX_DIMENSION;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      let quality = 0.9;
      let compressedDataUrl: string;

      // Iteratively reduce quality to meet size requirement
      do {
        // Always convert to JPEG for best compression for photos
        compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        quality -= 0.1;
      } while (getByteSizeFromBase64(compressedDataUrl.split(',')[1]) > MAX_SIZE_BYTES && quality > 0.1);
      
      resolve(compressedDataUrl);
    };
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}
