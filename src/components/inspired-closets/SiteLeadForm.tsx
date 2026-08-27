"use client";

import { useState } from "react";
import { AREAS_OF_HOME } from "@/lib/inspired-closets-ops-leads";
import type { WebsiteFormType } from "@/lib/inspired-closets-ops-site-leads";
import styles from "./site-forms.module.css";

const CONSULT_AREA_ORDER = [
  "Closet",
  "Garage",
  "Pantry",
  "Laundry",
  "Home Office",
  "Murphy Bed",
  "Entryway",
  "Entertainment",
] as const;

type SiteLeadFormProps = {
  formType: WebsiteFormType;
  title: string;
  intro?: string;
};

export default function SiteLeadForm({ formType, title, intro }: SiteLeadFormProps) {
  const isConsult = formType === "consultation_request";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    zip: "",
    comments: "",
    company: "",
    areas: [] as string[],
  });

  function toggleArea(area: string) {
    setForm((current) => ({
      ...current,
      areas: current.areas.includes(area)
        ? current.areas.filter((item) => item !== area)
        : [...current.areas, area],
    }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/inspired-closets/site/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_type: formType,
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          phone: form.phone,
          zip: form.zip,
          comments: form.comments || null,
          company: form.company,
          areas_of_home: form.areas,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not submit.");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className={styles.hero}>
        <h1>{title}</h1>
        {intro ? <p>{intro}</p> : null}
      </div>
      <div className={styles.formBand}>
        {done ? (
          <div className={styles.success}>
            {isConsult ? (
              <>
                <h2>Thank you. We received your consultation request.</h2>
                <p>
                  An Inspired Closets Las Vegas design expert will call you at the number you
                  entered to set up your free in-home consultation.
                </p>
              </>
            ) : (
              <>
                <h2>Thank you. Here is a look at our Ideas Brochure.</h2>
                <p>
                  A design expert may also follow up by phone. This walkthrough uses a stand-in
                  brochure so we are not hosting the franchise PDF.
                </p>
                <div className={styles.brochureGrid}>
                  {AREAS_OF_HOME.map((area) => (
                    <div key={area} className={styles.brochureCard}>
                      {area}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <form
            className={styles.formCard}
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <p className={styles.requiredNote}>
              <span className={styles.asterisk}>*</span> indicates required fields
            </p>
            {error ? <p className={styles.error}>{error}</p> : null}

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Name <span className={styles.asterisk}>*</span>
              </span>
              <div className={styles.nameRow}>
                <input
                  className={styles.input}
                  required
                  autoComplete="given-name"
                  placeholder="First"
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                />
                <input
                  className={styles.input}
                  required
                  autoComplete="family-name"
                  placeholder="Last"
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                />
              </div>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {isConsult ? "Email Address" : "Email address"}{" "}
                <span className={styles.asterisk}>*</span>
              </span>
              <input
                className={styles.input}
                required
                type="email"
                autoComplete="email"
                placeholder={isConsult ? "Email Address" : "Email address"}
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {isConsult ? "Phone Number" : "Phone"} <span className={styles.asterisk}>*</span>
              </span>
              <input
                className={styles.input}
                required
                type="tel"
                autoComplete="tel"
                placeholder={isConsult ? "Phone Number" : "Phone"}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {isConsult ? "Zip Code" : "Zip code"} <span className={styles.asterisk}>*</span>
              </span>
              <input
                className={styles.input}
                required
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder={isConsult ? "Zip Code" : "Zip code"}
                value={form.zip}
                onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
              />
              {isConsult ? (
                <p className={styles.hint}>
                  Enter the zip code of the location where the installation will occur.
                </p>
              ) : null}
            </label>

            <label className={styles.hp} aria-hidden>
              Company
              <input
                tabIndex={-1}
                autoComplete="off"
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              />
            </label>

            {isConsult ? (
              <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: "0 0 0.95rem" }}>
                <legend className={styles.fieldLabel}>What are you interested in?</legend>
                <div className={styles.checkGrid} style={{ marginTop: "0.45rem" }}>
                  {CONSULT_AREA_ORDER.map((area) => (
                    <label key={area} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={form.areas.includes(area)}
                        onChange={() => toggleArea(area)}
                      />
                      {area}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {isConsult ? (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Comments or Questions</span>
                <textarea
                  className={styles.textarea}
                  value={form.comments}
                  onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
                />
              </label>
            ) : null}

            <button className={styles.submit} type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Submit"}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
