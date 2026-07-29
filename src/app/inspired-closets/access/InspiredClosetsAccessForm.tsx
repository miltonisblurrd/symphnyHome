"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import styles from "./access.module.css";

const LOGO_SRC = "/inspired-closets/InspiredClosets_Logo_RGB-300x277.png";

export default function InspiredClosetsAccessForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/inspired-closets/gavin";
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
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "Could not sign in.");
        return;
      }

      router.replace(returnTo);
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
          <h1 className={styles.title}>Executive dashboard</h1>
          <p className={styles.lead}>
            This prototype is password-protected. Enter the access code Milton shared with you.
          </p>
        </div>
        <form className={styles.form} onSubmit={onSubmit}>
          <input
            id="access-password"
            className={styles.input}
            type="password"
            autoComplete="current-password"
            aria-label="Access code"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter access code"
            required
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.button} type="submit" disabled={loading || !password.trim()}>
            {loading ? "Checking…" : "View dashboard"}
          </button>
        </form>
      </div>
    </main>
  );
}
