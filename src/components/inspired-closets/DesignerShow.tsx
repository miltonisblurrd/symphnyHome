"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import field from "./field.module.css";
import styles from "./show-gallery.module.css";

type ShowPhoto = {
  id: string;
  url: string | null;
  caption: string | null;
  isCover: boolean;
  sortOrder: number;
};

type ShowProject = {
  id: string;
  clientName: string;
  label: string;
  defaultLabel: string;
  stageLabel: string;
  installDate: string | null;
  visible: boolean;
  photos: ShowPhoto[];
};

function formatDay(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function QuietField({
  value,
  placeholder,
  disabled,
  ariaLabel,
  onCommit,
}: {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  onCommit: (next: string) => void | boolean | Promise<void | boolean>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft.trim() === value.trim()) return;
        void Promise.resolve(onCommit(draft)).then((saved) => {
          if (saved === false) setDraft(value);
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

export default function DesignerShow() {
  const [projects, setProjects] = useState<ShowProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const touchX = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/inspired-closets/designers/show");
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string | null;
        projects?: ShowProject[];
      };
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not load show.");
      setProjects(payload.projects ?? []);
      if (payload.error) setError(payload.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load show.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPhotoIndex(0);
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  async function postJson(body: Record<string, unknown>) {
    const response = await fetch("/api/inspired-closets/designers/show", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not save.");
  }

  async function mutate(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await postJson(body);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
      return false;
    } finally {
      setBusyId((current) => (current === id ? null : current));
    }
  }

  async function upload(projectId: string, list: FileList | null) {
    const files = list ? [...list] : [];
    if (files.length === 0) return;
    setBusyId(projectId);
    setError(null);
    try {
      for (let index = 0; index < files.length; index += 1) {
        setNote(`Saving photo ${index + 1} of ${files.length}…`);
        const form = new FormData();
        form.set("id", projectId);
        form.set("file", files[index]);
        const response = await fetch("/api/inspired-closets/designers/show", { method: "POST", body: form });
        const payload = (await response.json()) as { ok?: boolean; error?: string };
        if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not save the photo.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the photo.");
      await load();
    } finally {
      setNote(null);
      setBusyId((current) => (current === projectId ? null : current));
    }
  }

  const openProject = projects.find((project) => project.id === openId) ?? null;
  const openPhotos = openProject?.photos ?? [];
  const safeIndex = Math.min(photoIndex, Math.max(openPhotos.length - 1, 0));
  const currentPhoto = openPhotos[safeIndex] ?? null;

  return (
    <div>
      <div className={styles.head}>
        <div>
          <p className={field.colLabel}>Show</p>
          <h2>Photos for leads</h2>
          <p className={styles.intro}>
            Every job is a card. Open one to add photos, rename it, or turn Show this project on for a lead.
          </p>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {note ? <p className={styles.note}>{note}</p> : null}
      {loading && projects.length === 0 ? <p className={field.empty}>Loading jobs…</p> : null}
      {!loading && projects.length === 0 && !error ? (
        <p className={field.empty}>No jobs assigned to you yet. When the office assigns one, it shows up here.</p>
      ) : null}

      <div className={styles.board}>
        {projects.map((project) => {
          const cover = project.photos.find((photo) => photo.isCover) ?? project.photos[0] ?? null;
          return (
            <button key={project.id} type="button" className={styles.tile} onClick={() => setOpenId(project.id)}>
              {cover?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.tileImg} src={cover.url} alt="" />
              ) : (
                <span className={styles.tileEmpty}>Add a cover photo</span>
              )}
              {project.visible ? <span className={styles.tileFlag}>Showing</span> : null}
              <span className={styles.tileShade}>
                <span className={styles.tileLabel}>{project.label}</span>
              </span>
            </button>
          );
        })}
      </div>

      {openProject ? (
        <div className={styles.backdrop} onClick={() => setOpenId(null)}>
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label={openProject.label}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sheetBar}>
              <div>
                <p className={styles.client}>{openProject.clientName}</p>
                <p className={styles.meta}>
                  {[
                    openProject.stageLabel,
                    formatDay(openProject.installDate)
                      ? `Install ${formatDay(openProject.installDate)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button type="button" className={styles.done} onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>

            <div
              className={styles.hero}
              onTouchStart={(event) => {
                touchX.current = event.changedTouches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const start = touchX.current;
                const end = event.changedTouches[0]?.clientX;
                touchX.current = null;
                if (start == null || end == null || openPhotos.length < 2) return;
                const delta = end - start;
                if (delta < -40) setPhotoIndex((current) => Math.min(current + 1, openPhotos.length - 1));
                if (delta > 40) setPhotoIndex((current) => Math.max(current - 1, 0));
              }}
            >
              {currentPhoto?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentPhoto.url} alt={currentPhoto.caption || openProject.label} />
              ) : (
                <span className={styles.tileEmpty}>Add a cover photo</span>
              )}
              {openPhotos.length > 1 ? (
                <p className={styles.heroCount}>
                  {safeIndex + 1} / {openPhotos.length}
                </p>
              ) : null}
            </div>

            {openPhotos.length > 1 ? (
              <div className={styles.film}>
                {openPhotos.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    className={index === safeIndex ? styles.filmOn : styles.filmBtn}
                    onClick={() => setPhotoIndex(index)}
                  >
                    {photo.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo.url} alt="" />
                    ) : (
                      <span>No preview</span>
                    )}
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.sheetBody}>
              <button
                type="button"
                className={openProject.visible ? styles.toggleOn : styles.toggle}
                aria-pressed={openProject.visible}
                disabled={busyId === openProject.id}
                onClick={() =>
                  void mutate(openProject.id, {
                    action: "visibility",
                    id: openProject.id,
                    visible: !openProject.visible,
                  })
                }
              >
                <span className={styles.toggleTrack} aria-hidden>
                  <span className={styles.toggleKnob} />
                </span>
                Show this project
              </button>

              {currentPhoto ? (
                <div className={styles.photoTools}>
                  {currentPhoto.isCover ? (
                    <span className={styles.coverMark}>Thumbnail</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.textBtn}
                      disabled={busyId === openProject.id}
                      onClick={() => void mutate(openProject.id, { action: "cover", photoId: currentPhoto.id })}
                    >
                      Use as thumbnail
                    </button>
                  )}
                  <QuietField
                    value={currentPhoto.caption ?? ""}
                    placeholder="Caption"
                    ariaLabel={`Caption for ${openProject.clientName}`}
                    disabled={busyId === openProject.id}
                    onCommit={(next) =>
                      mutate(openProject.id, { action: "caption", photoId: currentPhoto.id, caption: next })
                    }
                  />
                  <button
                    type="button"
                    className={styles.removeBtn}
                    disabled={busyId === openProject.id}
                    onClick={() => void mutate(openProject.id, { action: "delete", photoId: currentPhoto.id })}
                  >
                    Remove
                  </button>
                </div>
              ) : null}

              <label className={styles.field}>
                <span>Name on the card</span>
                <QuietField
                  value={openProject.label}
                  ariaLabel={`Name on the card for ${openProject.clientName}`}
                  disabled={busyId === openProject.id}
                  onCommit={(next) => mutate(openProject.id, { action: "label", id: openProject.id, label: next })}
                />
              </label>
              <p className={styles.hint}>Leads see this name, not the address.</p>

              <label className={styles.addBtn} aria-disabled={busyId === openProject.id}>
                {busyId === openProject.id ? "Saving…" : openPhotos.length === 0 ? "Add photos" : "Add more photos"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={busyId === openProject.id}
                  onChange={(event) => {
                    const files = event.target.files;
                    event.target.value = "";
                    void upload(openProject.id, files);
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
