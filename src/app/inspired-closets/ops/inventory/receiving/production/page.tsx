"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import payroll from "@/components/inspired-closets/ops-payroll.module.css";

type Row = {
  id: string;
  client: string;
  install_date: string | null;
  installer: string;
  prep_by: string | null;
  stow: { received: number; qty: number };
  hafele: { received: number; qty: number };
  richelieu: { received: number; qty: number };
  status: string;
};

function cell(pair: { received: number; qty: number }) {
  if (pair.qty === 0) return "—";
  return `${pair.received}/${pair.qty}`;
}

export default function ReceivingProductionPage() {
  const [jobs, setJobs] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/inspired-closets/ops/receiving/production");
      const payload = (await response.json()) as { ok: boolean; jobs?: Row[]; error?: string };
      if (!payload.ok) {
        setError(payload.error ?? "Could not load the board.");
        return;
      }
      setJobs(payload.jobs ?? []);
    })();
  }, []);

  return (
    <main className={payroll.page} style={{ padding: "1.25rem" }}>
      <p>
        <Link href="/inspired-closets/ops/inventory/receiving">Receiving</Link>
      </p>
      <h1>Production</h1>
      <p>Prep by is two business days before the install date. Counts come from the trucks and the 40000 lines.</p>
      {error ? <p>{error}</p> : null}
      <table className={payroll.table}>
        <thead>
          <tr>
            <th>Job</th>
            <th>Install</th>
            <th>Installer</th>
            <th>Prep by</th>
            <th>Stow</th>
            <th>Häfele</th>
            <th>Richelieu</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <Link href={`/inspired-closets/ops/projects?id=${job.id}`}>{job.client}</Link>
              </td>
              <td>{job.install_date ?? "—"}</td>
              <td>{job.installer || "—"}</td>
              <td>{job.prep_by ?? "—"}</td>
              <td>{cell(job.stow)}</td>
              <td>{cell(job.hafele)}</td>
              <td>{cell(job.richelieu)}</td>
              <td>{job.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
