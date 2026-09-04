import styles from "./field-vehicle.module.css";

export default function PromasterPortrait({
  color = "#f4f1ea",
  compact,
}: {
  color?: string;
  compact?: boolean;
}) {
  const paint = color.trim() || "#f4f1ea";
  return (
    <div className={`${styles.truckStage} ${compact ? styles.truckStageCompact : ""}`} aria-hidden>
      <svg className={styles.truckSvg} viewBox="0 0 280 150" fill="none">
        <ellipse cx="140" cy="136" rx="88" ry="8" fill="rgba(0,0,0,0.08)" />
        <path
          d="M38 108h28l8-28h92c18 0 28 8 36 20l18 8h22v28H38V108Z"
          fill="#1c1c1c"
        />
        <path
          d="M48 104V52c0-8 6-14 14-14h118c10 0 18 6 22 16l18 42H48Z"
          fill={paint}
          stroke="rgba(0,0,0,0.18)"
          strokeWidth="1.2"
        />
        <path d="M182 40h16c8 0 14 5 17 13l12 29h-28l-8-18c-2-6-7-10-13-10h-4V40Z" fill="#9ec4d4" opacity="0.85" />
        <path d="M62 48h108v8H62z" fill="rgba(0,0,0,0.08)" />
        <rect x="58" y="62" width="36" height="28" rx="3" fill="rgba(0,0,0,0.08)" />
        <rect x="102" y="62" width="36" height="28" rx="3" fill="rgba(0,0,0,0.08)" />
        <rect x="146" y="62" width="28" height="28" rx="3" fill="rgba(0,0,0,0.08)" />
        <circle cx="86" cy="118" r="16" fill="#1a1a1a" />
        <circle cx="86" cy="118" r="8" fill="#c8c8c8" />
        <circle cx="200" cy="118" r="16" fill="#1a1a1a" />
        <circle cx="200" cy="118" r="8" fill="#c8c8c8" />
        <path d="M48 88h28" stroke="rgba(0,0,0,0.2)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}
