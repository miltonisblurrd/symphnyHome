/** Crop, threshold, invert, and rotate. Same steps Modulus uses before Tesseract. */

const WINDOW = 15;
const BIAS = -8;

export function cropScanBand(
  video: HTMLVideoElement,
  host: HTMLElement,
): { canvas: HTMLCanvasElement; crop: { x: number; y: number; w: number; h: number } } | null {
  const videoWidth = video.videoWidth;
  const videoHeight = video.videoHeight;
  if (!videoWidth || !videoHeight) return null;
  const clientWidth = host.clientWidth || videoWidth;
  const clientHeight = host.clientHeight || videoHeight;
  const scale = Math.max(clientWidth / videoWidth, clientHeight / videoHeight);
  const overflowX = (videoWidth * scale - clientWidth) / 2;
  const overflowY = (videoHeight * scale - clientHeight) / 2;
  const x = overflowX / scale;
  const y = (clientHeight * 0.36 + overflowY) / scale;
  const w = clientWidth / scale;
  const h = (clientHeight * 0.28) / scale;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(w * 2));
  canvas.height = Math.max(1, Math.floor(h * 2));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(video, x, y, w, h, 0, 0, canvas.width, canvas.height);
  return { canvas, crop: { x, y, w, h } };
}

export function binarize(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
  }
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let row = 0;
    for (let x = 1; x <= width; x += 1) {
      row += gray[(y - 1) * width + (x - 1)];
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + row;
    }
  }
  const half = Math.floor(WINDOW / 2);
  for (let y = 0; y < height; y += 1) {
    const y1 = Math.max(0, y - half);
    const y2 = Math.min(height - 1, y + half);
    for (let x = 0; x < width; x += 1) {
      const x1 = Math.max(0, x - half);
      const x2 = Math.min(width - 1, x + half);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integral[(y2 + 1) * (width + 1) + (x2 + 1)] -
        integral[y1 * (width + 1) + (x2 + 1)] -
        integral[(y2 + 1) * (width + 1) + x1] +
        integral[y1 * (width + 1) + x1];
      const value = gray[y * width + x] < sum / count + BIAS ? 0 : 255;
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }
  ctx.putImageData(image, 0, 0);
}

export function invertCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = 255 - image.data[i];
    image.data[i + 1] = 255 - image.data[i + 1];
    image.data[i + 2] = 255 - image.data[i + 2];
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function rotateCanvas(source: HTMLCanvasElement, direction: 1 | -1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.height;
  canvas.height = source.width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return source;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((direction * Math.PI) / 2);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

export async function readBarcodes(canvas: HTMLCanvasElement): Promise<string[]> {
  const Detector = (globalThis as { BarcodeDetector?: new (opts: { formats: string[] }) => { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> } }).BarcodeDetector;
  if (!Detector) return [];
  try {
    const detector = new Detector({ formats: ["code_128", "code_39", "ean_13", "qr_code"] });
    const codes = await detector.detect(canvas);
    return codes.map((code) => String(code.rawValue ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}
