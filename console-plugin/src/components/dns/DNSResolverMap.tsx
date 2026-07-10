import * as React from 'react';
import { Tooltip } from '@patternfly/react-core';
import { DnsResolver, STATUS_META } from './types';
import { DEFAULT_RESOLVERS } from './useDnsProber';

/**
 * Small equirectangular world map that plots one dot per resolver at
 * its HQ lat/lng, coloured by the IP it returned. Dots that return the
 * same IP share the same colour — the "multi-site" visual: when a
 * hostname is served from two clusters (say us-east and eu-west), the
 * geo-map paints Cloudflare / Google / OpenDNS in one colour and
 * AdGuard / Yandex in another, and the operator sees which resolvers
 * are landing on which cluster.
 *
 * We deliberately draw simple polygon continent silhouettes rather
 * than embed a proper world atlas — the SVG stays tiny (<1KB of path
 * data) and the plot's job is "position + colour", not cartography.
 */

interface Props {
  resolvers: DnsResolver[];
}

/** Equirectangular projection into an 800×360 viewBox. */
function projX(lng: number): number {
  return ((lng + 180) / 360) * 800;
}
function projY(lat: number): number {
  return ((90 - lat) / 180) * 360;
}

/**
 * Deterministic distinct-colour picker for the set of unique returned
 * targets. Uses a small hand-picked palette that renders cleanly on
 * both light and dark themes; the same target string always maps to
 * the same colour across renders (so the legend below is stable).
 */
const IP_PALETTE = [
  '#3E8FE0', // blue
  '#F5A742', // orange
  '#5EBE7A', // green
  '#C160E0', // purple
  '#E86D6D', // red-pink
  '#4ECDC4', // teal
  '#F4C542', // yellow
];

function colorForTarget(target: string, uniqueSortedTargets: string[]): string {
  const idx = uniqueSortedTargets.indexOf(target);
  if (idx < 0) return 'var(--pf-t--global--color--nonstatus--gray--default)';
  return IP_PALETTE[idx % IP_PALETTE.length];
}

/**
 * Extract the "answer" that identifies the cluster — for A records
 * that's the IP, for CNAME the target hostname. Anything that starts
 * with "A " or "CNAME " gets the value after the prefix; NXDOMAIN /
 * SERVFAIL etc. get kept as-is so unhealthy dots still cluster.
 */
function normalisedTarget(r: DnsResolver): string {
  const s = r.result || '';
  const spaceIdx = s.indexOf(' ');
  if (spaceIdx > 0 && s.length > spaceIdx + 1) return s.slice(spaceIdx + 1).trim();
  return s;
}

const DNSResolverMap: React.FC<Props> = ({ resolvers }) => {
  // Merge the coordinate metadata onto each row. If a row's resolver
  // isn't in DEFAULT_RESOLVERS (customer sent a non-default ladder),
  // silently drop it from the map — the table still shows it.
  const points = resolvers
    .map((r) => {
      const meta = DEFAULT_RESOLVERS.find((d) => d.name === r.name);
      if (!meta) return null;
      return {
        r,
        lat: meta.lat,
        lng: meta.lng,
        target: normalisedTarget(r),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  // Sort unique targets alphabetically for stable colour assignment.
  const uniqueTargets = [...new Set(points.map((p) => p.target))].sort();

  return (
    <div className="rhcl-dns-map-wrap">
      <svg
        className="rhcl-dns-map-svg"
        viewBox="0 0 800 360"
        role="img"
        aria-label="World map of public DNS resolver responses"
      >
        {/*
          Rough continent silhouettes. Path data is hand-approximated —
          the map exists to give geographic context, not to be
          cartographically accurate. Fill is a muted gray that reads on
          both light and dark themes.
        */}
        <rect x="0" y="0" width="800" height="360" fill="var(--pf-t--global--background--color--secondary--default)" />
        <g fill="var(--pf-t--global--background--color--floating--default)" stroke="var(--pf-t--global--border--color--default)" strokeWidth="0.5">
          {/* North America */}
          <path d="M 90,60 Q 140,45 200,55 L 245,90 Q 260,120 250,150 L 235,175 Q 210,180 190,175 L 170,185 L 155,175 Q 130,145 115,120 Q 100,95 90,60 Z" />
          {/* Central America + Caribbean */}
          <path d="M 200,175 L 220,195 L 235,215 L 230,240 L 220,235 Q 205,225 195,205 Z" />
          {/* South America */}
          <path d="M 240,215 Q 260,215 270,240 L 280,285 Q 275,320 260,340 L 245,345 Q 235,335 235,310 L 235,265 Z" />
          {/* Europe */}
          <path d="M 380,70 Q 410,60 445,75 L 460,100 Q 455,115 445,120 Q 430,125 415,120 L 395,110 Q 385,95 380,70 Z" />
          {/* Africa */}
          <path d="M 395,130 Q 430,130 460,150 L 475,200 Q 470,240 445,270 L 425,285 Q 405,275 395,245 L 385,200 Q 385,165 395,130 Z" />
          {/* Middle East */}
          <path d="M 470,120 L 495,130 L 500,155 L 485,165 L 470,150 Z" />
          {/* Russia + Central Asia */}
          <path d="M 460,55 Q 540,45 640,60 L 700,85 Q 710,100 690,110 L 620,105 L 540,100 L 480,90 Z" />
          {/* East Asia */}
          <path d="M 620,120 Q 660,115 690,130 L 710,165 Q 700,190 680,195 L 655,185 L 630,165 Q 620,145 620,120 Z" />
          {/* India */}
          <path d="M 555,150 L 585,155 L 590,190 L 570,210 L 555,195 Z" />
          {/* Southeast Asia + Indonesia */}
          <path d="M 660,200 L 700,210 L 720,225 L 710,240 L 685,235 L 665,220 Z" />
          {/* Australia */}
          <path d="M 705,255 Q 735,250 755,265 L 760,285 Q 745,295 720,290 L 700,275 Z" />
        </g>

        {/* Latitude / longitude grid — very subtle, gives depth. */}
        <g stroke="var(--pf-t--global--border--color--default)" strokeWidth="0.3" opacity="0.4">
          {[0, 90, 180, 270, 360].map((y) => (
            <line key={`h${y}`} x1="0" y1={y * (360 / 360)} x2="800" y2={y * (360 / 360)} />
          ))}
          {[0, 200, 400, 600, 800].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="360" />
          ))}
        </g>

        {/*
          Resolver dots. Slight halo so they read on top of continent
          fills; the halo colour matches the dot's IP colour at reduced
          opacity so the "same cluster" cue still comes through even at
          a glance.
        */}
        {points.map((p) => {
          const x = projX(p.lng);
          const y = projY(p.lat);
          const color = colorForTarget(p.target, uniqueTargets);
          const statusColor = STATUS_META[p.r.status].color;
          return (
            <Tooltip
              key={p.r.name}
              content={
                <div style={{ fontSize: 12 }}>
                  <strong>{p.r.name}</strong> · {p.r.location}
                  <br />
                  {p.r.result}
                  {p.r.latencyMs != null ? ` · ${p.r.latencyMs} ms` : ''}
                </div>
              }
            >
              <g style={{ cursor: 'help' }}>
                {/* Halo */}
                <circle cx={x} cy={y} r={10} fill={color} opacity={0.25} />
                {/* Dot */}
                <circle cx={x} cy={y} r={5} fill={color} stroke={statusColor} strokeWidth={1.5} />
              </g>
            </Tooltip>
          );
        })}
      </svg>

      {/* Legend: one row per distinct answer, with the colour swatch
          and how many resolvers returned it. Empty when the prober is
          still probing. */}
      <div className="rhcl-dns-map-legend">
        {uniqueTargets.map((t) => {
          const count = points.filter((p) => p.target === t).length;
          return (
            <span key={t} className="rhcl-dns-map-legend-item">
              <span
                className="rhcl-dns-map-legend-swatch"
                style={{ background: colorForTarget(t, uniqueTargets) }}
              />
              <span title={t}>{t || '—'}</span>
              <span className="rhcl-dns-map-legend-count">×{count}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default DNSResolverMap;
