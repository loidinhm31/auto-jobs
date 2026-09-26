export interface DecodedReportPdfImage {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly format: 'PNG' | 'JPEG';
}

function isSafeLocalImageUrl(src: string): boolean {
  if (src.startsWith('data:image/')) return true;
  if (src.startsWith('//') || src.includes('\\')) return false;
  if (/^[a-z]+:/i.test(src) && !/^https?:\/\//i.test(src)) return false;

  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(src, window.location.href);
      return parsed.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  return !/^https?:\/\//i.test(src) && !/^[a-z]+:/i.test(src);
}

function detectImageFormat(dataUrlOrContentType: string): 'PNG' | 'JPEG' {
  if (/jpeg|jpg/i.test(dataUrlOrContentType)) return 'JPEG';
  return 'PNG';
}

function arrayBufferToBase64DataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

export async function loadReportImage(src: string): Promise<DecodedReportPdfImage> {
  if (!isSafeLocalImageUrl(src)) {
    throw new Error(`Unsafe or external image source rejected for PDF export: ${src}`);
  }

  let dataUrl = src;
  let format: 'PNG' | 'JPEG' = 'PNG';

  if (!src.startsWith('data:image/')) {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to load evidence screenshot: ${src} (HTTP ${response.status})`);
    }
    const contentType = response.headers.get('content-type') ?? 'image/png';
    format = detectImageFormat(contentType);
    const arrayBuffer = await response.arrayBuffer();
    dataUrl = arrayBufferToBase64DataUrl(arrayBuffer, contentType);
  } else {
    format = detectImageFormat(src.slice(0, 30));
  }

  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.src = dataUrl;
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      const { promise, resolve, reject } = Promise.withResolvers<void>();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to decode image data: ${src}`));
      await promise;
    }
    const width = img.naturalWidth || img.width || 100;
    const height = img.naturalHeight || img.height || 100;
    return { dataUrl, width, height, format };
  }

  return { dataUrl, width: 800, height: 600, format };
}
