import { Suspense } from "react";
import OpsScheduleWorkspace from "@/components/inspired-closets/OpsScheduleWorkspace";

export const metadata = {
  title: "Inspired Closets OS · Calendar",
};

export default function InspiredClosetsOpsInstallsPage() {
  return (
    <Suspense fallback={<p style={{ padding: "2rem" }}>Loading installs…</p>}>
      <OpsScheduleWorkspace forcedTab="installs" />
    </Suspense>
  );
}
