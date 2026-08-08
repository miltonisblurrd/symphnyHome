import { Suspense } from "react";
import OpsScheduleWorkspace from "@/components/inspired-closets/OpsScheduleWorkspace";

export const metadata = {
  title: "Inspired Closets OS · Schedule",
};

export default function InspiredClosetsOpsSchedulePage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem" }}>Loading schedule…</p>}>
      <OpsScheduleWorkspace />
    </Suspense>
  );
}
