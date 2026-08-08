"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { isInstallerRole } from "@/lib/inspired-closets-ops-field";

/** Blocks installers from ops modules; they belong in /field only. */
export default function OpsRoleGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const role = document.cookie
      .split("; ")
      .find((row) => row.startsWith("ic-staff-role="))
      ?.split("=")[1];
    if (role && isInstallerRole(decodeURIComponent(role))) {
      router.replace("/inspired-closets/field");
      return;
    }
    setAllowed(true);
  }, [router]);

  if (!allowed) {
    return (
      <div style={{ padding: "2rem", fontFamily: "Lato, system-ui", color: "#555" }}>
        Checking access…
      </div>
    );
  }

  return <>{children}</>;
}
