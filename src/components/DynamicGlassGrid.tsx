"use client";

import {
  METAL_DRIFT_DURATION_MS,
  drawMetalCover,
  getMetalTransform,
} from "@/lib/metal-drift";
import { useEffect, useRef } from "react";

const CELL_W = 61;
const CELL_H = 57;
const CELL_RADIUS = 2;

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function cellLuminance(
  data: Uint8ClampedArray,
  sw: number,
  sh: number,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(sw, Math.ceil(x + w));
  const y1 = Math.min(sh, Math.ceil(y + h));
  let sum = 0;
  let count = 0;
  const step = 3;

  for (let py = y0; py < y1; py += step) {
    for (let px = x0; px < x1; px += step) {
      const i = (py * sw + px) * 4;
      if (i + 2 >= data.length) continue;
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      count++;
    }
  }

  return count === 0 ? 0.5 : sum / count / 255;
}

export default function DynamicGlassGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const visibleRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = window.innerWidth <= 768;
    const cellW = isMobile ? 48 : CELL_W;
    const cellH = isMobile ? 45 : CELL_H;

    const img = new Image();
    img.src = "/hero-liquid-metal.jpg";

    const sampleCanvas = document.createElement("canvas");
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
    const ctx = canvas.getContext("2d");
    if (!sampleCtx || !ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      sampleCanvas.width = canvas.width;
      sampleCanvas.height = canvas.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sampleCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const onVisibility = () => {
      visibleRef.current = document.visibilityState === "visible";
      if (visibleRef.current) {
        startRef.current = 0;
        rafRef.current = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const draw = (timestamp: number) => {
      if (!visibleRef.current) return;

      if (!startRef.current) startRef.current = timestamp;
      const elapsed = reducedMotion ? 0 : timestamp - startRef.current;
      const progress = (elapsed % METAL_DRIFT_DURATION_MS) / METAL_DRIFT_DURATION_MS;
      const transform = getMetalTransform(progress);

      if (img.complete && img.naturalWidth > 0) {
        drawMetalCover(sampleCtx, img, width, height, transform);
      }

      const imageData = sampleCtx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imageData;
      const sw = canvas.width;
      const sh = canvas.height;

      ctx.clearRect(0, 0, width, height);

      const cols = Math.ceil(width / cellW) + 1;
      const rows = Math.ceil(height / cellH) + 1;
      const offsetX = (width - (cols - 1) * cellW) / 2;
      const offsetY = (height - (rows - 1) * cellH) / 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = offsetX + col * cellW;
          const y = offsetY + row * cellH;
          const lum = cellLuminance(
            data,
            sw,
            sh,
            x * dpr,
            y * dpr,
            cellW * dpr,
            cellH * dpr
          );

          const inset = 0.5;
          const iw = cellW - inset * 2;
          const ih = cellH - inset * 2;
          const ix = x + inset;
          const iy = y + inset;

          const fillAlpha = 0.015 + lum * 0.085;
          const strokeLight = 0.05 + lum * 0.16;
          const strokeDark = 0.03 + (1 - lum) * 0.07;
          const bevelTop = lum * 0.14;
          const bevelBottom = (1 - lum) * 0.08;

          roundRectPath(ctx, ix, iy, iw, ih, CELL_RADIUS);
          ctx.fillStyle = `rgba(255, 255, 255, ${fillAlpha})`;
          ctx.fill();

          const bevel = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
          bevel.addColorStop(0, `rgba(255, 255, 255, ${bevelTop})`);
          bevel.addColorStop(0.35, "rgba(255, 255, 255, 0)");
          bevel.addColorStop(0.65, "rgba(0, 0, 0, 0)");
          bevel.addColorStop(1, `rgba(0, 0, 0, ${bevelBottom})`);
          ctx.fillStyle = bevel;
          ctx.fill();

          roundRectPath(ctx, ix, iy, iw, ih, CELL_RADIUS);
          ctx.strokeStyle = `rgba(255, 255, 255, ${strokeLight})`;
          ctx.lineWidth = 1;
          ctx.stroke();

          roundRectPath(ctx, ix + 0.5, iy + 0.5, iw - 1, ih - 1, CELL_RADIUS - 0.5);
          ctx.strokeStyle = `rgba(0, 0, 0, ${strokeDark})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const start = () => {
      cancelAnimationFrame(rafRef.current);
      startRef.current = 0;
      rafRef.current = requestAnimationFrame(draw);
    };

    if (img.complete) start();
    else img.onload = start;

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        pointerEvents: "none",
      }}
    />
  );
}
