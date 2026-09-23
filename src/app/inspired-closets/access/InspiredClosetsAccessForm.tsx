"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { IC_INVENTORY_HOME, IC_OPS_HOME, isInventoryRole } from "@/lib/inspired-closets-ops-roles";
import styles from "./access.module.css";

const LOGO_SRC = "/inspired-closets/InspiredClosets_Logo_RGB-300x277.png";

export default function InspiredClosetsAccessForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? IC_OPS_HOME;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/inspired-closets/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim() || undefined,
          password,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        redirectTo?: string;
        staff?: { role?: string };
        mode?: string;
      };

      if (!response.ok) {
        setError(payload.error ?? "Could not sign in.");
        return;
      }

      let next = payload.redirectTo ?? returnTo;
      if (isInventoryRole(payload.staff?.role)) {
        // Inventory users always land on their module, even if returnTo was elsewhere.
        next = IC_INVENTORY_HOME;
      } else if (payload.mode === "prototype" && returnTo.startsWith("/inspired-closets")) {
        next = returnTo;
      }

      router.replace(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brandBlock}>
            <Image
              src={LOGO_SRC}
              alt="Inspired Closets"
              width={88}
              height={81}
              className={styles.logo}
              priority
              unoptimized
            />
            <p className={styles.eyebrow}>Inspired Closets · private preview</p>
          </div>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.lead}>
            Office login with your username and password. Shared access code still works — leave
            username blank and enter the code Milton shared.
          </p>
        </div>
        <form className={styles.form} onSubmit={onSubmit}>
          <input
            id="access-username"
            className={styles.input}
            type="text"
            autoComplete="username"
            aria-label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username (optional for access code)"
          />
          <input
            id="access-password"
            className={styles.input}
            type="password"
            autoComplete="current-password"
            aria-label="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password or access code"
            required
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.button} type="submit" disabled={loading || !password.trim()}>
            {loading ? "Checking…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
