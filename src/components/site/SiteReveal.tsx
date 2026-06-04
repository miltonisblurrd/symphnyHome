"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./site.module.css";

type SiteRevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

export default function SiteReveal({
  children,
  className = "",
  delay = 0,
}: SiteRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.siteReveal} ${visible ? styles.siteRevealVisible : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
