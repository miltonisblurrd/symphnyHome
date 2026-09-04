import Image from "next/image";
import styles from "./field-vehicle.module.css";

export default function PromasterPortrait({
  compact,
}: {
  color?: string;
  compact?: boolean;
}) {
  return (
    <div className={`${styles.truckStage} ${compact ? styles.truckStageCompact : ""}`} aria-hidden>
      <Image
        src="/inspired-closets/promaster-2500-3d.png"
        alt=""
        width={960}
        height={540}
        className={styles.truckSvg}
        priority={!compact}
      />
    </div>
  );
}
