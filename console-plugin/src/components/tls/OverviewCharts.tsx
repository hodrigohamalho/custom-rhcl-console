import * as React from 'react';

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
 * Compact donut. Each segment is a proper SVG arc `path` computed with
 * the standard start/end/large-arc formula. Solid-fill on top of a
 * very-faint track — no stroke-dasharray tricks (which were fine on
 * partial slices but rendered the 100% single-segment case as a muted
 * gray-green blend on Firefox, because the segment's dash length hit
 * the exact circumference and the browser treated the ring's "gap" as
 * invisible-first, leaving the underlying track visible for one frame
 * during transitions and permanently on some vendor prefixes).
 *
 * `centerValue` is normally the total count; `centerLabel` a short
 * "Total" beneath — matches the mockup on both Overall Health and Top
 * Issuers.
 *
 * Native SVG `<title>` on each path handles hover (browser default,
 * theme-inert). No PatternFly Tooltip wrapper — it clones its child
 * with focus handlers that don't reliably work on SVG elements and
 * added an extra `<g opacity>` wrapper on some PatternFly versions
 * that dimmed the whole ring.
 */
function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngleRad: number,
  endAngleRad: number,
): string {
  // Full-circle special case — two half-arcs so the browser draws a
  // proper ring instead of collapsing the arc.
  const twoPi = 2 * Math.PI;
  const isFull = Math.abs(endAngleRad - startAngleRad) >= twoPi - 0.0001;
  if (isFull) {
    // Ring: outer circle CW + inner circle CCW = donut with fill-rule
    // evenodd handled by the surrounding <path> attribute.
    return [
      `M ${cx + rOuter} ${cy}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx - rOuter} ${cy}`,
      `A ${rOuter} ${rOuter} 0 1 1 ${cx + rOuter} ${cy}`,
      `Z`,
      `M ${cx + rInner} ${cy}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy}`,
      `A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy}`,
      `Z`,
    ].join(' ');
  }
  const largeArc = endAngleRad - startAngleRad > Math.PI ? 1 : 0;
  const x1 = cx + rOuter * Math.cos(startAngleRad);
  const y1 = cy + rOuter * Math.sin(startAngleRad);
  const x2 = cx + rOuter * Math.cos(endAngleRad);
  const y2 = cy + rOuter * Math.sin(endAngleRad);
  const x3 = cx + rInner * Math.cos(endAngleRad);
  const y3 = cy + rInner * Math.sin(endAngleRad);
  const x4 = cx + rInner * Math.cos(startAngleRad);
  const y4 = cy + rInner * Math.sin(startAngleRad);
  return [
    `M ${x1} ${y1}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4} ${y4}`,
    `Z`,
  ].join(' ');
}

export const Donut: React.FC<DonutProps> = ({
  segments,
  centerValue,
  centerLabel,
  total: totalOverride,
  size = 140,
  strokeWidth = 18,
}) => {
  const total = totalOverride ?? segments.reduce((acc, s) => acc + s.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 1;
  const rInner = rOuter - strokeWidth;

  // Compute each slice's start/end angle in radians. `-π/2` shifts the
  // zero mark from the 3 o'clock position to 12 o'clock, matching how
  // humans read a pie chart.
  const START_OFFSET = -Math.PI / 2;
  let accumulated = 0;
  const paths = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = total > 0 ? s.value / total : 0;
      const startA = START_OFFSET + accumulated * 2 * Math.PI;
      accumulated += frac;
      const endA = START_OFFSET + accumulated * 2 * Math.PI;
      return { s, startA, endA };
    });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ display: 'block' }}
    >
      {/* Faint track — barely there, just to hint the ring shape when
          nothing is drawn on top. */}
      <path
        d={arcPath(cx, cy, rOuter, rInner, 0, Math.PI * 2)}
        fill="var(--pf-t--global--border--color--default)"
        opacity={0.18}
        fillRule="evenodd"
      />
      {paths.map(({ s, startA, endA }, i) => (
        <path
          key={`${s.label}-${i}`}
          d={arcPath(cx, cy, rOuter, rInner, startA, endA)}
          fill={s.color}
          fillRule="evenodd"
        >
          <title>{`${s.label}: ${s.value}`}</title>
        </path>
      ))}
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
