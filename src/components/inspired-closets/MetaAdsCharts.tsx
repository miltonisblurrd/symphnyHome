import type { DailyPoint } from "@/lib/meta-ads/analytics/review";
import type { MetricValue } from "@/lib/meta-ads/types";
import styles from "./ops-meta-ads.module.css";

const INK = "#1a1a1a";
const MUTED = "rgba(0, 0, 0, 0.22)";
const LINE = "rgba(0, 0, 0, 0.1)";

function money(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

type TrendBucket = { label: string; spend: number; leads: number; cpl: number | null };

function trendBuckets(points: DailyPoint[]): TrendBucket[] {
  const weekly = points.length > 16;
  const groups: DailyPoint[][] = [];
  if (weekly) {
    for (let index = 0; index < points.length; index += 7) groups.push(points.slice(index, index + 7));
  } else {
    for (const point of points) groups.push([point]);
  }
  return groups.map((group) => {
    const spend = group.reduce((total, point) => total + point.spend, 0);
    const leads = group.reduce((total, point) => total + point.leads, 0);
    const label = weekly ? (group[0]?.label ?? "") : (group[0]?.label ?? "").replace(/^[A-Za-z]+ /, "");
    return {
      label,
      spend: Math.round(spend * 100) / 100,
      leads,
      cpl: leads > 0 ? spend / leads : null,
    };
  });
}

/** Spend, leads, and cost per lead, with the previous period as a comparison line. */
export function PerformanceTrend({ points }: { points: DailyPoint[] }) {
  const current = trendBuckets(points.filter((point) => point.period === "current"));
  const previous = trendBuckets(points.filter((point) => point.period === "previous"));
  const weekly = points.filter((point) => point.period === "current").length > 16;
  return (
    <div className={styles.trendStack}>
      <p className={styles.vizNote}>{weekly ? "Weekly totals. The line is the previous period, aligned from the start of each window." : "Daily totals. The line is the previous period, aligned day by day."}</p>
      <TrendRow title="Spend" current={current} previous={previous} pick={(bucket) => bucket.spend} format={(value) => money(value)} />
      <TrendRow title="Leads" current={current} previous={previous} pick={(bucket) => bucket.leads} format={(value) => String(Math.round(value))} />
      <TrendRow title="Cost per lead" current={current} previous={previous} pick={(bucket) => bucket.cpl} format={(value) => money(value)} lines />
    </div>
  );
}

function TrendRow({
  title,
  current,
  previous,
  pick,
  format,
  lines = false,
}: {
  title: string;
  current: TrendBucket[];
  previous: TrendBucket[];
  pick: (bucket: TrendBucket) => number | null;
  format: (value: number) => string;
  lines?: boolean;
}) {
  const width = 720;
  const height = 132;
  const top = 16;
  const bottom = 28;
  const left = 36;
  const count = Math.max(current.length, previous.length, 1);
  const slot = (width - left) / count;
  const values = [...current, ...previous].map(pick).filter((value): value is number => value != null);
  const max = Math.max(1, ...values);
  const yOf = (value: number) => top + (height - top - bottom) * (1 - value / max);
  const xOf = (index: number) => left + slot * index + slot / 2;
  const line = (series: TrendBucket[]) =>
    series
      .map((bucket, index) => {
        const value = pick(bucket);
        return value == null ? null : `${xOf(index).toFixed(1)},${yOf(value).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(" L ");
  const previousLine = line(previous);
  const currentLine = line(current);
  const labelEvery = count > 20 ? 4 : count > 12 ? 2 : 1;

  return (
    <div>
      <p className={styles.vizLabel}>{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className={styles.chartSvg} role="img" aria-label={`${title}, current period compared with the previous period`}>
        <line x1={left} x2={width} y1={height - bottom} y2={height - bottom} stroke={LINE} />
        {lines
          ? null
          : current.map((bucket, index) => {
              const value = pick(bucket) ?? 0;
              const barWidth = slot * 0.55;
              const barHeight = (value / max) * (height - top - bottom);
              const x = left + slot * index + (slot - barWidth) / 2;
              const y = height - bottom - barHeight;
              return (
                <rect key={bucket.label + index} x={x} y={y} width={barWidth} height={Math.max(barHeight, 0)} rx={3} fill={INK}>
                  <title>{`${bucket.label}: ${format(value)}`}</title>
                </rect>
              );
            })}
        {previousLine ? (
          <path d={`M ${previousLine}`} fill="none" stroke={MUTED} strokeWidth={2} strokeDasharray="5 4" />
        ) : null}
        {lines && currentLine ? (
          <path d={`M ${currentLine}`} fill="none" stroke={INK} strokeWidth={2.2} />
        ) : null}
        {current.map((bucket, index) =>
          index % labelEvery === 0 ? (
            <text key={bucket.label + index} x={xOf(index)} y={height - 8} textAnchor="middle" className={styles.axisText}>
              {bucket.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
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
