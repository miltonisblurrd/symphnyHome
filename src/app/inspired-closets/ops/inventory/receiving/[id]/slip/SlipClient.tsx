"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import OpsSlipPdf from "@/components/inspired-closets/OpsSlipPdf";
import payroll from "@/components/inspired-closets/ops-payroll.module.css";

export default function SlipClient() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const path = search.get("path");
  const file = `/api/inspired-closets/ops/receiving/shipments/${id}/file${
    path ? `?path=${encodeURIComponent(path)}` : ""
  }`;
  const download = `${file}${path ? "&" : "?"}download=1`;

  return (
    <div className={payroll.page} style={{ maxWidth: "56rem", margin: "0 auto" }}>
      <div className={payroll.header}>
        <div>
          <h1 className={payroll.title}>Packing slip</h1>
          <p className={payroll.subtitle}>White page so vendor print PDFs stay readable.</p>
        </div>
        <div className={payroll.actions}>
          <Link href={`/inspired-closets/ops/inventory/receiving/${id}`} className={payroll.buttonGhost}>
            Back to shipment
          </Link>
          <a href={download} className={payroll.buttonPrimary}>
            Download
          </a>
        </div>
      </div>
      <div className={payroll.panel} style={{ background: "#fff" }}>
        <OpsSlipPdf src={file} title="Packing slip" mode="pages" />
      </div>
    </div>
  );
}
