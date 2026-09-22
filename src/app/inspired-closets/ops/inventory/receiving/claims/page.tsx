"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import payroll from "@/components/inspired-closets/ops-payroll.module.css";

type Claim = {
  id: string;
  shipment_id: string;
  claim_type: string;
  description: string;
  so_number?: string | null;
  status: string;
  photo_url: string | null;
  created_at: string;
};

const STUDIO = "https://studio.inspiredclosets.com/store/ccf/add/";

function photos(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [value];
  } catch {
    return [value];
  }
}

export default function ReceivingClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [note, setNote] = useState("");

  async function load() {
    const response = await fetch("/api/inspired-closets/ops/receiving/claims");
    const payload = (await response.json()) as { ok: boolean; claims?: Claim[]; error?: string };
    if (!payload.ok) {
      setNote(payload.error ?? "Could not load claims.");
      return;
    }
    setClaims(payload.claims ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function mark(id: string) {
    await fetch("/api/inspired-closets/ops/receiving/claims", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "submitted" }),
    });
    await load();
  }

  return (
    <main className={payroll.page} style={{ padding: "1.25rem" }}>
      <p>
        <Link href="/inspired-closets/ops/inventory/receiving">Receiving</Link>
      </p>
      <h1>Claims</h1>
      {note ? <p>{note}</p> : null}
      {claims.length === 0 ? <p>No claims yet.</p> : null}
      {claims.map((claim) => (
        <article key={claim.id} className={payroll.panel} style={{ padding: "0.75rem", marginTop: "0.5rem" }}>
          <strong>
            {claim.claim_type} · {claim.status}
          </strong>
          <p>{claim.description}</p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {["draft", "draft_notified"].includes(claim.status) ? (
              <button type="button" className={payroll.buttonPrimary} onClick={() => void mark(claim.id)}>
                Mark submitted
              </button>
            ) : null}
            <a href={`/api/inspired-closets/ops/receiving/claims/${claim.id}/photos`}>Download photos</a>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(claim.so_number || claim.description)}
            >
              Copy note
            </button>
            <a href={STUDIO} target="_blank" rel="noreferrer">
              Open Studio credit
            </a>
            <Link href={`/inspired-closets/ops/inventory/receiving/${claim.shipment_id}`}>Job truck</Link>
          </div>
          {photos(claim.photo_url).map((url) => (
            <a key={url} href={url}>
              Photo
            </a>
          ))}
        </article>
      ))}
    </main>
  );
}
