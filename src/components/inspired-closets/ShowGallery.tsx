"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./show-gallery.module.css";

export type ShowGalleryPhoto = {
  id: string;
  url: string | null;
  caption: string | null;
};

export type ShowGalleryProject = {
  id: string;
  label: string;
  detail?: string | null;
  photos: ShowGalleryPhoto[];
};

function usablePhotos(project: ShowGalleryProject): ShowGalleryPhoto[] {
  return project.photos.filter((photo) => photo.url);
}

export default function ShowGallery({ projects }: { projects: ShowGalleryProject[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const openProject = projects.find((project) => project.id === openId) ?? null;
  const photos = openProject ? usablePhotos(openProject) : [];
  const photo = photos[index] ?? null;

  useEffect(() => {
    if (!openId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenId(null);
        return;
      }
      if (event.key === "ArrowRight") setIndex((current) => Math.min(current + 1, photos.length - 1));
      if (event.key === "ArrowLeft") setIndex((current) => Math.max(current - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [openId, photos.length]);

  function open(project: ShowGalleryProject) {
    if (usablePhotos(project).length === 0) return;
    setOpenId(project.id);
    setIndex(0);
  }

  return (
    <>
      <div className={styles.grid}>
        {projects.map((project) => {
          const shots = usablePhotos(project);
          const cover = shots[0];
          const count =
            shots.length === 1 ? "1 photo" : shots.length > 1 ? `${shots.length} photos` : "No preview";
          if (!cover?.url) {
            return (
              <div key={project.id} className={styles.cardStatic}>
                <span className={styles.coverEmpty}>No preview</span>
                <span className={styles.tileShade}>
                  <span className={styles.label}>{project.label}</span>
                  {project.detail ? <span className={styles.detail}>{project.detail}</span> : null}
                </span>
              </div>
            );
          }
          return (
            <button key={project.id} type="button" className={styles.card} onClick={() => open(project)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.cover} src={cover.url} alt="" />
              <span className={styles.tileShade}>
                <span className={styles.label}>{project.label}</span>
                {project.detail ? <span className={styles.detail}>{project.detail}</span> : null}
                <span className={styles.count}>{count}</span>
              </span>
            </button>
          );
        })}
      </div>

      {openProject && photo?.url ? (
        <div className={styles.slider} role="dialog" aria-modal="true" aria-label={openProject.label}>
          <div className={styles.sliderBar}>
            <div>
              <p className={styles.sliderKicker}>
                {index + 1} / {photos.length}
              </p>
              <h3 className={styles.sliderTitle}>{openProject.label}</h3>
            </div>
            <button ref={closeRef} type="button" className={styles.sliderClose} onClick={() => setOpenId(null)}>
              Close
            </button>
          </div>
          <div
            className={styles.sliderStage}
            onTouchStart={(event) => {
              touchX.current = event.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const start = touchX.current;
              const end = event.changedTouches[0]?.clientX;
              touchX.current = null;
              if (start == null || end == null) return;
              const delta = end - start;
              if (delta < -40) setIndex((current) => Math.min(current + 1, photos.length - 1));
              if (delta > 40) setIndex((current) => Math.max(current - 1, 0));
            }}
          >
            <button
              type="button"
              className={styles.sliderNav}
              aria-label="Previous photo"
              disabled={index === 0}
              onClick={() => setIndex((current) => Math.max(current - 1, 0))}
            >
              ‹
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={photo.caption || openProject.label} />
            <button
              type="button"
              className={styles.sliderNav}
              aria-label="Next photo"
              disabled={index >= photos.length - 1}
              onClick={() => setIndex((current) => Math.min(current + 1, photos.length - 1))}
            >
              ›
            </button>
          </div>
          <div className={styles.sliderFoot}>
            {photo.caption && photo.caption !== openProject.label ? (
              <p className={styles.sliderCaption}>{photo.caption}</p>
            ) : photos.length > 1 ? (
              <p className={styles.sliderCaption}>Swipe for the next photo.</p>
            ) : null}
            {photos.length > 1 && photos.length <= 12 ? (
              <div className={styles.dots} aria-label="Photos">
                {photos.map((shot, shotIndex) => (
                  <button
                    key={shot.id}
                    type="button"
                    className={shotIndex === index ? styles.dotOn : styles.dot}
                    aria-label={`Photo ${shotIndex + 1}`}
                    onClick={() => setIndex(shotIndex)}
                  />
                ))}
              </div>
            ) : (
              <p className={styles.sliderCount}>
                {index + 1} of {photos.length}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
