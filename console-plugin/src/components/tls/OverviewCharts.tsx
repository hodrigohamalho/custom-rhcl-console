import * as React from 'react';
import { Tooltip } from '@patternfly/react-core';

/**
 * Two tiny SVG primitives used across the TLS Overview widgets. We do
 * NOT pull in @patternfly/react-charts (or Victory) — those add ~150 KB
 * to the bundle for what we need, which is just a donut with N slices
 * and a discrete horizontal bar chart. Both components accept themed
 * CSS colour tokens so light/dark theme handling is automatic.
 */

export interface DonutSlice {
  label: string;
  value: number;
  /** CSS colour (`var(--pf-t--global--color--status--success--default)` etc). */
  color: string;
}

interface DonutProps {
  segments: DonutSlice[];
  /** Number rendered in the middle of the donut. Skipped when null. */
  centerValue?: React.ReactNode;
  centerLabel?: string;
  /** Total override — when omitted, we sum the segment values. */
  total?: number;
  size?: number;
  strokeWidth?: number;
}

/**
 * Compact donut. Draws each segment as an SVG arc on the same circle.
 * A gray "track" is rendered underneath so a mostly-empty donut still
 * reads as a donut instead of a chevron.
 *
 * `centerValue` is normally the total count and `centerLabel` a short
 * "Total" label below it — matches the mockup on both Overall Health
 * and Top Issuers.
 */
export const Donut: React.FC<DonutProps> = ({
  segments,
  centerValue,
  centerLabel,
  total: totalOverride,
  size = 140,
  strokeWidth = 18,
}) => {
  const total = totalOverride ?? segments.reduce((acc, s) => acc + s.value, 0);
  const r = size / 2 - strokeWidth / 2;
  const circumference = 2 * Math.PI * r;

  // Draw each segment with an offset dash. When total=0 we only render
  // the track — no NaN dash arrays, no empty state ghost.
  let accumulated = 0;
  const paths = segments.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const dashLength = frac * circumference;
    // strokeDasharray "seg gap" plus strokeDashoffset walks around the
    // circle. Small 0.5px gap between segments so they don't merge into
    // a solid ring on very dense donuts.
    const gap = Math.max(circumference - dashLength, 0);
    const offset = -accumulated;
    accumulated += dashLength;
    return { s, dashLength, gap, offset };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block' }}
    >
      {/* rotate so 0deg is at the top instead of the right */}
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--pf-t--global--border--color--default)"
          strokeWidth={strokeWidth}
          opacity={0.4}
        />
        {paths.map(({ s, dashLength, gap, offset }, i) => (
          <Tooltip key={`${s.label}-${i}`} content={`${s.label}: ${s.value}`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${gap}`}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dasharray 300ms ease-out' }}
            />
          </Tooltip>
        ))}
      </g>
      {/* Centre label. `dominantBaseline=central` is the one that
          actually vertically centres text across every browser. */}
      {centerValue != null && (
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontSize: 22,
            fontWeight: 700,
            fill: 'var(--pf-t--global--color--regular)',
          }}
        >
          {centerValue}
        </text>
      )}
      {centerLabel && (
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          dominantBaseline="central"
          style={{
            fontSize: 11,
            fill: 'var(--pf-v5-global--Color--200)',
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          {centerLabel}
        </text>
      )}
    </svg>
  );
};

export interface HBarSlice {
  label: string;
  value: number;
  color: string;
}

interface HistogramProps {
  bars: HBarSlice[];
  /** Height per row in px. */
  height?: number;
  /** Show the numeric value at the end of the bar. Default true. */
  showValues?: boolean;
  /** Total override for the scale — makes N bars share the same 0-max
   *  axis. Otherwise each row scales to its own max, which is not what
   *  operators expect. */
  scaleMax?: number;
}

/**
 * Vertical-columns histogram. Each column is a labelled bar; the total
 * is the sum unless `scaleMax` is passed. Labels below each column.
 *
 * Kept small on purpose — a card-sized viz, not a full chart.
 */
export const Histogram: React.FC<HistogramProps> = ({
  bars,
  height = 180,
  showValues = true,
  scaleMax,
}) => {
  const max = scaleMax ?? Math.max(1, ...bars.map((b) => b.value));
  const chartH = height - 40; // reserve space for value + label
  const columnW = 100 / Math.max(1, bars.length);
  // Fixed `height` prop on the SVG + `maxHeight` in the style is
  // load-bearing here — without them, `preserveAspectRatio="none"`
  // stretches the SVG vertically to fill whatever the container gives
  // it, and PatternFly Cards in a Grid row stretch to match the tallest
  // sibling. Result: a single-tall-bar histogram grew ~500px tall next
  // to a donut card.
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', maxHeight: height }}
    >
      {bars.map((b, i) => {
        const h = max > 0 ? (b.value / max) * chartH : 0;
        const y = chartH - h + 8; // 8px top margin for value labels
        const x = i * columnW + columnW * 0.15;
        const w = columnW * 0.7;
        return (
          <g key={`${b.label}-${i}`}>
            {showValues && (
              <text
                x={x + w / 2}
                y={y - 4}
                textAnchor="middle"
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  fill: 'var(--pf-t--global--color--regular)',
                }}
              >
                {b.value}
              </text>
            )}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={1.5}
              ry={1.5}
              fill={b.color}
              opacity={0.85}
            >
              <title>{`${b.label}: ${b.value}`}</title>
            </rect>
            <text
              x={x + w / 2}
              y={height - 4}
              textAnchor="middle"
              style={{
                fontSize: 6.5,
                fill: 'var(--pf-v5-global--Color--200)',
              }}
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
