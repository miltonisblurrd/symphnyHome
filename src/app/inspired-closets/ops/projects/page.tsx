import { Suspense } from "react";
import OpsJobsWorkspace from "@/components/inspired-closets/OpsJobsWorkspace";

export const metadata = {
  title: "Inspired Closets OS · Projects",
};

export default function InspiredClosetsOpsProjectsPage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem" }}>Loading projects…</p>}>
      <OpsJobsWorkspace />
    </Suspense>
  );
}
