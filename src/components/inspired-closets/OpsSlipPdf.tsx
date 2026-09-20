"use client";

import { useEffect, useRef, useState } from "react";

type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
};

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
};

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => {
    promise: Promise<void>;
  };
};

async function loadPdfjs(): Promise<PdfJs> {
  const existing = (window as Window & { pdfjsLib?: PdfJs }).pdfjsLib;
  if (existing) return existing;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/pdfjs/pdf.min.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the PDF viewer."));
    document.head.appendChild(script);
  });
  const pdfjs = (window as Window & { pdfjsLib?: PdfJs }).pdfjsLib;
  if (!pdfjs) throw new Error("Could not load the PDF viewer.");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.js";
  return pdfjs;
}

type Props = {
  src: string;
  title: string;
  mode?: "thumb" | "pages";
};

export default function OpsSlipPdf({ src, title, mode = "thumb" }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();
    setError(null);

    async function draw(canvasHost: HTMLDivElement) {
      try {
        const pdfjs = await loadPdfjs();
        const bytes = await fetch(src).then((response) => {
          if (!response.ok) throw new Error("Could not load the slip.");
          return response.arrayBuffer();
        });
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        const last = mode === "thumb" ? 1 : pdf.numPages;
        for (let n = 1; n <= last; n += 1) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const width = mode === "thumb" ? 280 : Math.min(860, canvasHost.clientWidth || 860);
          const viewport = page.getViewport({ scale: width / base.width });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.style.display = "block";
          canvas.style.background = "#fff";
          if (mode === "pages" && n > 1) canvas.style.marginTop = "1rem";
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Could not draw the slip.");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: context, viewport }).promise;
          if (cancelled) return;
          canvasHost.appendChild(canvas);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not preview this PDF.");
        }
      }
    }

    void draw(host);
    return () => {
      cancelled = true;
    };
  }, [src, mode]);

  return (
    <div>
      <div ref={hostRef} aria-label={title} />
      {error ? <p style={{ margin: "0.5rem 0 0", fontSize: "0.78rem" }}>{error}</p> : null}
    </div>
  );
}
