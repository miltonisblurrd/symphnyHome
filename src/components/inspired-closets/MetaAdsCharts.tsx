import type { DailyPoint } from "@/lib/meta-ads/analytics/review";
import type { MetricValue } from "@/lib/meta-ads/types";
import styles from "./ops-meta-ads.module.css";

const INK = "#1a1a1a";
const MUTED = "rgba(0, 0, 0, 0.22)";
const LINE = "rgba(0, 0, 0, 0.1)";

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** Leads per day for both comparison weeks. Previous week is muted, current week is solid. */
export function DailyLeadsChart({ points }: { points: DailyPoint[] }) {
  const width = 720;
  const height = 190;
  const top = 18;
  const bottom = 34;
  const left = 30;
  const plotHeight = height - top - bottom;
  const max = Math.max(1, ...points.map((point) => point.leads));
  const niceMax = Math.ceil(max / 2) * 2;
  const slot = (width - left) / points.length;
  const barWidth = slot * 0.62;
  const splitIndex = points.findIndex((point) => point.period === "current");
  const splitX = left + slot * splitIndex;
  const compact = points.length > 20;
  const labelEvery = points.length > 80 ? 14 : points.length > 40 ? 7 : 1;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={styles.chartSvg}
      role="img"
      aria-label="Leads per day, previous week compared with last week"
    >
      {[0, niceMax / 2, niceMax].map((tick) => {
        const y = top + plotHeight - (tick / niceMax) * plotHeight;
        return (
          <g key={tick}>
            <line x1={left} x2={width} y1={y} y2={y} stroke={LINE} />
            <text x={left - 8} y={y + 4} textAnchor="end" className={styles.axisText}>
              {tick}
            </text>
          </g>
        );
      })}
      {splitIndex > 0 ? (
        <line x1={splitX} x2={splitX} y1={top - 8} y2={top + plotHeight} stroke="rgba(0,0,0,0.3)" strokeDasharray="3 4" />
      ) : null}
      {points.map((point, index) => {
        const barHeight = (point.leads / niceMax) * plotHeight;
        const x = left + slot * index + (slot - barWidth) / 2;
        const y = top + plotHeight - barHeight;
        return (
          <g key={point.date}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, 1)}
              rx={3}
              fill={point.period === "current" ? INK : MUTED}
            >
              <title>{`${point.label}: ${point.leads} leads, ${money(point.spend)} spend`}</title>
            </rect>
            {compact ? null : (
              <text x={x + barWidth / 2} y={y - 5} textAnchor="middle" className={styles.barValue}>
                {point.leads}
              </text>
            )}
            {index % labelEvery === 0 ? (
              <text x={x + barWidth / 2} y={height - 14} textAnchor="middle" className={styles.axisText}>
                {point.label.replace("Sep ", "").replace("Aug ", "").replace("Jul ", "").replace("Oct ", "")}
              </text>
            ) : null}
          </g>
        );
      })}
      <text x={left} y={height - 1} className={styles.axisText}>
        Leads per day
      </text>
    </svg>
  );
}

/** CTR by day. The shaded half is the previous week. */
export function CtrSparkline({ values }: { values: MetricValue[] }) {
  const width = 260;
  const height = 64;
  const pad = 6;
  const present = values.filter((value): value is number => value != null);
  if (present.length < 2) {
    return <p className={styles.chartEmpty}>Not enough days to draw a trend yet.</p>;
  }
  const min = Math.min(...present) * 0.9;
  const max = Math.max(...present) * 1.1;
  const x = (index: number) => pad + (index / (values.length - 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
  const path = values
    .map((value, index) => (value == null ? null : `${x(index).toFixed(1)},${y(value).toFixed(1)}`))
    .filter(Boolean)
    .join(" L ");
  const lastIndex = values.length - 1 - [...values].reverse().findIndex((value) => value != null);
  const last = values[lastIndex];
  const split = x(values.length / 2 - 0.5);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.sparkSvg} role="img" aria-label="Click-through rate by day">
      <rect x={0} y={0} width={split} height={height} fill="rgba(0,0,0,0.035)" rx={6} />
      <path d={`M ${path}`} fill="none" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
      {last != null ? <circle cx={x(lastIndex)} cy={y(last)} r={3.6} fill={INK} /> : null}
    </svg>
  );
}

/** Previous and current cost per lead on one track, with the target marked. */
export function CplTargetBar({
  previous,
  current,
  target,
}: {
  previous: MetricValue;
  current: MetricValue;
  target: number | null;
}) {
  const max = Math.max(target ?? 0, previous ?? 0, current ?? 0, 1) * 1.18;
  const position = (value: number) => `${Math.min(100, (value / max) * 100)}%`;
  const better = target != null && current != null && current <= target;
  const worse = target != null && current != null && current > target;

  return (
    <div className={styles.cplTrack} aria-label="Cost per lead compared with last week">
      {target != null ? <div className={styles.cplGood} style={{ width: position(target) }} /> : null}
      {target != null ? (
        <div className={styles.cplTarget} style={{ left: position(target) }}>
          <span>Target {money(target)}</span>
        </div>
      ) : null}
      {previous != null ? (
        <div className={styles.cplPrevious} style={{ left: position(previous) }} title={`Last week ${money(previous)}`} />
      ) : null}
      {current != null ? (
        <div
          className={`${styles.cplCurrent} ${better ? styles.cplCurrentGood : worse ? styles.cplCurrentBad : styles.freqCurrent}`}
          style={{ left: position(current) }}
          title={`This week ${money(current)}`}
        />
      ) : null}
    </div>
  );
}

/** Average times each person has seen the ad. The shaded zone is where fatigue becomes worth watching. */
export function FrequencyMeter({
  previous,
  current,
  watchAt,
}: {
  previous: MetricValue;
  current: MetricValue;
  watchAt: number;
}) {
  const max = 8;
  const position = (value: number) => `${Math.min(100, (value / max) * 100)}%`;

  return (
    <div className={styles.freqTrack} aria-label="Frequency">
      <div className={styles.freqWatch} style={{ left: position(watchAt) }} />
      {previous != null ? <div className={styles.freqPrevious} style={{ left: position(previous) }} /> : null}
      {current != null ? <div className={styles.freqCurrent} style={{ left: position(current) }} /> : null}
    </div>
  );
}
