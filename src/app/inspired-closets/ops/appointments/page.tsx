import { Suspense } from "react";
import OpsScheduleWorkspace from "@/components/inspired-closets/OpsScheduleWorkspace";

export const metadata = {
  title: "Inspired Closets OS · Calendar",
};

export default function InspiredClosetsOpsAppointmentsPage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem" }}>Loading calendar…</p>}>
      <OpsScheduleWorkspace />
    </Suspense>
  );
}
