"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AboutReveal from "@/components/site/AboutReveal";
import { aboutProof } from "@/data/about-content";
import styles from "./site.module.css";

const { featured, supporting } = aboutProof;

export default function AboutProof() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      video.pause();
      setVideoFailed(true);
      return;
    }

    const tryPlay = async () => {
      try {
        await video.play();
        setVideoReady(true);
      } catch {
        setVideoFailed(true);
      }
    };

    if (video.readyState >= 2) tryPlay();
    else video.addEventListener("loadeddata", tryPlay, { once: true });

    return () => video.removeEventListener("loadeddata", tryPlay);
  }, []);

  const showVideo = videoReady && !videoFailed;

  return (
    <section className={styles.aboutProof} aria-labelledby="about-proof-title">
      <div className={styles.aboutProofMedia} aria-hidden>
        <Image
          src={featured.posterSrc}
          alt=""
          fill
          sizes="100vw"
          className={`${styles.aboutProofPoster} ${showVideo ? styles.aboutProofPosterHidden : ""}`}
          priority={false}
        />
        <video
          ref={videoRef}
          className={`${styles.aboutProofVideo} ${showVideo ? styles.aboutProofVideoVisible : ""}`}
          poster={featured.posterSrc}
          muted
          loop
          playsInline
          autoPlay
          preload="metadata"
          onError={() => setVideoFailed(true)}
        >
          <source src={featured.videoSrc} type="video/mp4" />
        </video>
        <div className={styles.aboutProofMediaScrim} />
        <div className={styles.aboutProofMediaGrain} />
      </div>

      <div className={styles.aboutProofInner}>
        <AboutReveal>
          <p className={styles.aboutEyebrowLight}>{aboutProof.eyebrow}</p>
          <h2 id="about-proof-title" className={styles.aboutProofTitle}>
            {aboutProof.headline}
          </h2>
        </AboutReveal>

        <AboutReveal delay={80}>
          <article className={styles.aboutProofFeature}>
            <div className={styles.aboutProofLogo}>
              {featured.logoSrc ? (
                <Image
                  src={featured.logoSrc}
                  alt={featured.logoText}
                  width={160}
                  height={48}
                  className={styles.aboutProofLogoImg}
                />
              ) : (
                <span className={styles.aboutProofLogoText}>{featured.logoText}</span>
              )}
            </div>

            <blockquote className={styles.aboutProofQuote}>
              <span className={styles.aboutProofQuoteMark} aria-hidden>
                &ldquo;
              </span>
              <p>{featured.quote}</p>
            </blockquote>

            <footer className={styles.aboutProofAttribution}>
              <cite className={styles.aboutProofName}>{featured.attribution}</cite>
              <span className={styles.aboutProofRole}>
                {featured.role}
              </span>
            </footer>

            <ul className={styles.aboutProofStats}>
              {featured.stats.map((stat) => (
                <li key={stat.label} className={styles.aboutProofStat}>
                  <span className={styles.aboutProofStatValue}>{stat.value}</span>
                  <span className={styles.aboutProofStatLabel}>{stat.label}</span>
                </li>
              ))}
            </ul>
          </article>
        </AboutReveal>

        <AboutReveal delay={140}>
          <div className={styles.aboutProofSupporting}>
            {supporting.map((item) => (
              <article key={item.id} className={styles.aboutProofCard}>
                <p className={styles.aboutProofCardType}>{item.clientType}</p>
                <h3 className={styles.aboutProofCardTitle}>{item.title}</h3>
                <p className={styles.aboutProofCardOutcome}>{item.outcome}</p>
              </article>
            ))}
          </div>

          <Link href={aboutProof.caseStudiesHref} className={styles.aboutProofLink}>
            {aboutProof.caseStudiesLabel}
            <span aria-hidden> →</span>
          </Link>
        </AboutReveal>
      </div>
    </section>
  );
}
