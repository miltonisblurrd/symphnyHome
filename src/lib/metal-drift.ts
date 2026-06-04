/** Shared with hero CSS animation — keep in sync with page.tsx @keyframes metalDrift */
export const METAL_DRIFT_DURATION_MS = 34000;

export type MetalTransform = {
  scale: number;
  tx: number;
  ty: number;
  rot: number;
};

const KEYFRAMES: Array<MetalTransform & { t: number }> = [
  { t: 0, scale: 1.04, tx: -2.8, ty: -2.2, rot: -0.45 },
  { t: 0.22, scale: 1.09, tx: 1.4, ty: -1.1, rot: 0.2 },
  { t: 0.48, scale: 1.13, tx: 2.8, ty: 1.9, rot: 0.42 },
  { t: 0.72, scale: 1.1, tx: -1.2, ty: 2.4, rot: -0.18 },
  { t: 1, scale: 1.04, tx: -2.8, ty: -2.2, rot: -0.45 },
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Approximate cubic-bezier(0.42, 0, 0.58, 1) */
function easeDrift(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function getMetalTransform(progress: number): MetalTransform {
  const p = ((progress % 1) + 1) % 1;
  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    const a = KEYFRAMES[i];
    const b = KEYFRAMES[i + 1];
    if (p >= a.t && p <= b.t) {
      const local = b.t === a.t ? 0 : (p - a.t) / (b.t - a.t);
      const eased = easeDrift(local);
      return {
        scale: lerp(a.scale, b.scale, eased),
        tx: lerp(a.tx, b.tx, eased),
        ty: lerp(a.ty, b.ty, eased),
        rot: lerp(a.rot, b.rot, eased),
      };
    }
  }
  return KEYFRAMES[0];
}

export function drawMetalCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  transform: MetalTransform
) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate((transform.rot * Math.PI) / 180);
  ctx.scale(transform.scale, transform.scale);
  ctx.translate(
    -width / 2 + (width * transform.tx) / 100,
    -height / 2 + (height * transform.ty) / 100
  );

  const coverScale = Math.max(width / img.width, height / img.height) * 1.15;
  const drawW = img.width * coverScale;
  const drawH = img.height * coverScale;
  ctx.drawImage(img, width / 2 - drawW / 2, height / 2 - drawH / 2, drawW, drawH);
  ctx.restore();
}
