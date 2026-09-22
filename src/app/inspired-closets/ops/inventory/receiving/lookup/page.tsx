"use client";

import { useState, type PointerEvent } from "react";
import Link from "next/link";
import payroll from "@/components/inspired-closets/ops-payroll.module.css";
import { extractAndMatch } from "@/lib/inspired-closets-ops-scan-codes";
import { binarize, cropScanBand, readBarcodes } from "@/lib/inspired-closets-ops-scan-camera";

type Hit = {
  id: string;
  item_number: string;
  vendor_sku: string | null;
  container_id: string | null;
  job_name: string | null;
  cust_ref: string | null;
  shipment: { id: string; notice: string | null; ship_date: string | null } | null;
};

export default function ReceivingLookupPage() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [note, setNote] = useState("");

  async function search(code: string) {
    const q = code.trim();
    if (!q) return;
    setNote("Looking…");
    const response = await fetch(`/api/inspired-closets/ops/receiving/lookup?q=${encodeURIComponent(q)}`);
    const payload = (await response.json()) as { ok: boolean; error?: string; hits?: Hit[] };
    if (!payload.ok) {
      setNote(payload.error ?? "Lookup failed.");
      return;
    }
    setHits(payload.hits ?? []);
    setNote((payload.hits ?? []).length ? "" : "No truck has that code.");
  }

  async function holdScan(event: PointerEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
    await video.play();
    const tesseract = await import("tesseract.js");
    const worker = await tesseract.createWorker("eng");
    await worker.setParameters({ tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ " });
    const stop = () => {
      stream.getTracks().forEach((track) => track.stop());
      void worker.terminate();
      button.releasePointerCapture(event.pointerId);
    };
    button.setPointerCapture(event.pointerId);
    const tick = async () => {
      if (!button.hasPointerCapture(event.pointerId)) {
        stop();
        return;
      }
      const cropped = cropScanBand(video, button);
      if (cropped) {
        const codes = await readBarcodes(cropped.canvas);
        binarize(cropped.canvas);
        const read = await worker.recognize(cropped.canvas);
        const text = [...codes, read.data.text || ""].join(" ");
        const matched = extractAndMatch(text, [
          { item_number: query || "000000", qty: 1, received_qty: 0 },
        ]);
        const token = (text.toUpperCase().match(/[0-9A-Z.]{5,}/) ?? [])[0];
        const code = matched && matched !== "000000" ? matched : token;
        if (code) {
          setQuery(code);
          await search(code);
          stop();
          return;
        }
      }
      requestAnimationFrame(() => void tick());
    };
    void tick();
    button.onpointerup = stop;
  }

  return (
    <main className={payroll.page} style={{ padding: "1.25rem" }}>
      <p>
        <Link href="/inspired-closets/ops/inventory/receiving">Receiving</Link>
      </p>
      <h1>Find a piece</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search(query);
        }}
        style={{ display: "flex", gap: "0.5rem" }}
      >
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Item, vendor SKU, or pallet" />
        <button type="submit" className={payroll.buttonPrimary}>
          Search
        </button>
        <button type="button" className={payroll.buttonGhost} onPointerDown={(event) => void holdScan(event)}>
          Hold to scan
        </button>
      </form>
      {note ? <p>{note}</p> : null}
      {hits.map((hit) => (
        <article key={hit.id} className={payroll.panel} style={{ padding: "0.75rem", marginTop: "0.5rem" }}>
          <strong>{hit.cust_ref || hit.job_name || "Unassigned"}</strong>
          <div>
            {hit.shipment?.notice || "Shipment"} {hit.shipment?.ship_date ? `· ${hit.shipment.ship_date}` : ""}
          </div>
          <div>
            #{hit.item_number}
            {hit.vendor_sku ? ` · ${hit.vendor_sku}` : ""}
            {hit.container_id ? ` · pallet ${hit.container_id}` : ""}
          </div>
          {hit.shipment ? (
            <Link href={`/inspired-closets/ops/inventory/receiving/${hit.shipment.id}`}>Open truck</Link>
          ) : null}
        </article>
      ))}
    </main>
  );
}
