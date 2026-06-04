"use client";

import Link from "next/link";
import { useState } from "react";
import { contact } from "@/data/studio-data";
import { siteConfig } from "@/lib/site-config";
import styles from "./site.module.css";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setFeedback("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, message }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };

      if (!res.ok) {
        setStatus("error");
        setFeedback(data.error ?? "Something went wrong.");
        return;
      }

      setStatus("success");
      setFeedback(data.message ?? "Message sent.");
      setName("");
      setEmail("");
      setCompany("");
      setMessage("");
    } catch {
      setStatus("error");
      setFeedback(`Unable to send. Email us at ${contact.email}.`);
    }
  };

  return (
    <form className={styles.siteContactForm} onSubmit={handleSubmit}>
      <div className={styles.siteContactFormRow}>
        <label className={styles.siteContactLabel}>
          Name
          <input
            className={styles.siteContactInput}
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label className={styles.siteContactLabel}>
          Email
          <input
            className={styles.siteContactInput}
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
      </div>
      <label className={styles.siteContactLabel}>
        Company
        <input
          className={styles.siteContactInput}
          name="company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          autoComplete="organization"
        />
      </label>
      <label className={styles.siteContactLabel}>
        What should we orchestrate?
        <textarea
          className={styles.siteContactTextarea}
          name="message"
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Handoffs, visibility gaps, tools that don't talk, AI governance…"
        />
      </label>
      <p className={styles.siteContactLegal}>
        By submitting, you agree to our{" "}
        <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <div className={styles.siteContactFormActions}>
        <button
          type="submit"
          className={styles.siteCtaPrimary}
          disabled={status === "loading"}
        >
          {status === "loading" ? "Sending…" : "Send message"}
        </button>
        <a href={siteConfig.bookingUrl} className={styles.siteContactEmail}>
          Or book on calendar →
        </a>
      </div>
      {feedback ? (
        <p
          className={
            status === "success" ? styles.siteContactSuccess : styles.siteContactError
          }
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
