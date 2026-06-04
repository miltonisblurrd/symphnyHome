"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./site.module.css";

type AboutPageShellProps = {
  children: ReactNode;
};

export default function AboutPageShell({ children }: AboutPageShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onScroll = () => {
      const pastHero = window.scrollY > window.innerHeight * 0.55;
      root.dataset.scrolled = pastHero ? "true" : "false";
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div ref={rootRef} className={styles.aboutPage}>
      {children}
    </div>
  );
}
