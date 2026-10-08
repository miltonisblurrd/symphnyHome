"use client";

import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { HELP_PRIORITIES, type HelpPriority } from "@/lib/inspired-closets-help";
import styles from "./help-request.module.css";

type HelpRequestButtonProps = {
  portal: string;
  className?: string;
  label?: string;
  icon?: string;
  onOpen?: () => void;
  /** Must not unmount this button while the dialog is open; close parent menus here instead. */
  onClose?: () => void;
};

type Status = "idle" | "sending" | "sent";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadFile(file: File) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : file.type.split("/")[1];
  const prepareRes = await fetch("/api/inspired-closets/help", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "prepare", ext }),
  });
  const prepared = (await prepareRes.json()) as { ok: boolean; path?: string; signedUrl?: string; error?: string };
  if (!prepared.ok || !prepared.path || !prepared.signedUrl) {
    throw new Error(prepared.error ?? `Could not upload ${file.name}.`);
  }
  const put = await fetch(prepared.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!put.ok) throw new Error(`Could not upload ${file.name}.`);
  return { path: prepared.path, name: file.name, mime_type: file.type || null, bytes: file.size };
}

export default function HelpRequestButton({
  portal,
  className,
  label = "Help",
  icon,
  onOpen,
  onClose,
}: HelpRequestButtonProps) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<HelpPriority>("medium");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && status !== "sending") {
        setOpen(false);
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, status, onClose]);

  function reset() {
    setFiles([]);
    setSubject("");
    setMessage("");
    setPriority("medium");
    setStatus("idle");
    setProgress("");
    setError(null);
  }

  function openDialog() {
    onOpen?.();
    reset();
    setOpen(true);
  }

  function close() {
    if (status === "sending") return;
    setOpen(false);
    onClose?.();
  }

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setFiles((current) => [...current, ...Array.from(list)]);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!subject.trim()) {
      setError("Add a subject so we know what needs fixing.");
      return;
    }
    setStatus("sending");
    setError(null);
    try {
      const attachments = [];
      for (const [index, file] of files.entries()) {
        setProgress(`Uploading ${index + 1} of ${files.length}…`);
        attachments.push(await uploadFile(file));
      }
      setProgress("Sending…");
      const response = await fetch("/api/inspired-closets/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          subject,
          message,
          priority,
          portal,
          page_url: window.location.href,
          attachments,
        }),
      });
      const payload = (await response.json()) as { ok: boolean; error?: string };
      if (!payload.ok) throw new Error(payload.error ?? "Could not send your request.");
      setStatus("sent");
    } catch (submitError) {
      setStatus("idle");
      setError(submitError instanceof Error ? submitError.message : "Could not send your request.");
    } finally {
      setProgress("");
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={openDialog}>
        {icon ? (
          <span aria-hidden style={{ width: "1.1rem", flex: "0 0 auto", textAlign: "center" }}>
            {icon}
          </span>
        ) : null}
        {label}
      </button>

      {open ? createPortal(
        <div className={styles.overlay} onClick={close}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-request-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.header}>
              <h2 id="help-request-title" className={styles.title}>
                Request a fix
              </h2>
              <button type="button" className={styles.closeBtn} aria-label="Close" onClick={close}>
                ×
              </button>
            </div>

            {status === "sent" ? (
              <div className={styles.sent}>
                <p className={styles.sentTitle}>Thanks, your request was sent.</p>
                <p className={styles.muted}>You’ll hear back once it’s been looked at.</p>
                <button type="button" className={styles.primaryBtn} onClick={close}>
                  Done
                </button>
              </div>
            ) : (
              <form className={styles.form} onSubmit={submit}>
                <div
                  className={`${styles.drop} ${dragging ? styles.dropActive : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  <p className={styles.dropTitle}>Photos or videos</p>
                  <p className={styles.muted}>Show us what’s wrong. Screenshots help a lot.</p>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => fileInput.current?.click()}
                    disabled={status === "sending"}
                  >
                    Add photo or video
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    hidden
                    onChange={(event) => {
                      addFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                  {files.length ? (
                    <ul className={styles.fileList}>
                      {files.map((file, index) => (
                        <li key={`${file.name}-${index}`} className={styles.fileRow}>
                          <span className={styles.fileName}>{file.name}</span>
                          <span className={styles.muted}>{formatBytes(file.size)}</span>
                          <button
                            type="button"
                            className={styles.removeBtn}
                            aria-label={`Remove ${file.name}`}
                            disabled={status === "sending"}
                            onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <label className={styles.field}>
                  <span className={styles.label}>Subject</span>
                  <input
                    className={styles.input}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    placeholder="What needs to be fixed?"
                    maxLength={200}
                    required
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>Details</span>
                  <textarea
                    className={`${styles.input} ${styles.textarea}`}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="What happened, what you expected, and how to make it happen again."
                    rows={5}
                  />
                </label>

                <label className={styles.field}>
                  <span className={styles.label}>How important is this?</span>
                  <select
                    className={styles.input}
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as HelpPriority)}
                  >
                    {HELP_PRIORITIES.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>

                {error ? <p className={styles.error}>{error}</p> : null}

                <div className={styles.actions}>
                  <button type="button" className={styles.secondaryBtn} onClick={close} disabled={status === "sending"}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.primaryBtn} disabled={status === "sending"}>
                    {status === "sending" ? progress || "Sending…" : "Send request"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
