"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { isInstallerRole } from "@/lib/inspired-closets-ops-field";

/** Blocks installers from ops modules unless they leave driver mode. */
export default function OpsRoleGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "blocked" | "allowed">("checking");
  const [driverName, setDriverName] = useState("driver");

  useEffect(() => {
    const cookies = document.cookie.split("; ").filter(Boolean);
    const role = cookies
      .find((row) => row.startsWith("ic-staff-role="))
      ?.split("=")
      .slice(1)
      .join("=");
    const name = cookies
      .find((row) => row.startsWith("ic-staff-name="))
      ?.split("=")
      .slice(1)
      .join("=");

    if (role && isInstallerRole(decodeURIComponent(role))) {
      setDriverName(decodeURIComponent(name || "driver"));
      setState("blocked");
      return;
    }
    setState("allowed");
  }, []);

  async function leaveDriverMode() {
    await fetch("/api/inspired-closets/ops/session", { method: "DELETE" });
    window.location.reload();
  }

  if (state === "checking") {
    return (
      <div style={{ padding: "2rem", fontFamily: "Lato, system-ui", color: "#555" }}>
        Checking access…
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div
        style={{
          minHeight: "100vh",
          padding: "2rem 1.25rem",
          fontFamily: "Lato, system-ui",
          background: "#efe9e5",
          color: "#111",
        }}
      >
        <p style={{ margin: 0, color: "#821f2d", fontWeight: 800, fontSize: "0.75rem" }}>
          INSPIRED CLOSETS OS
        </p>
        <h1 style={{ margin: "0.5rem 0 0", fontSize: "1.5rem" }}>An installer is signed in on this browser</h1>
        <p style={{ margin: "0.5rem 0 1.25rem", color: "rgba(0,0,0,0.6)", maxWidth: "28rem" }}>
          This tab thinks you’re <strong>{driverName}</strong> in Installers. Office tools stay on the
          desk login (Gavin, Craig, Des). Clear this leftover cookie — Installers in the other tab
          stays signed in.
        </p>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void leaveDriverMode()}
            style={{
              background: "#821f2d",
              color: "#fff",
              border: 0,
              borderRadius: "0.65rem",
              padding: "0.75rem 1rem",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Use office tools
          </button>
          <Link
            href="/inspired-closets/installers"
            style={{
              background: "#fff",
              color: "#111",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: "0.65rem",
              padding: "0.75rem 1rem",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            Back to Installers
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
