import type { DomainKey, DomainMeta, DomainWeights } from '@/lib/types';

export const DOMAIN_ORDER: DomainKey[] = [
  'endurance',
  'running',
  'swimming',
  'machine',
  'sprint',
  'strength',
  'weightlifting',
  'gymnastics',
  'strongman',
  'skill',
  'grip',
];

export const domainColor = (d: string) => `var(--d-${d})`;

/** Compact stacked bar showing what an event is made of. */
export function DomainBar({ domains }: { domains: DomainWeights }) {
  const parts = DOMAIN_ORDER.filter((d) => (domains[d] ?? 0) > 0);
  if (!parts.length) return <span className="faint">—</span>;
  return (
    <div className="dbar" title={parts.map((d) => `${d} ${Math.round((domains[d] ?? 0) * 100)}%`).join(', ')}>
      {parts.map((d) => (
        <i key={d} style={{ width: `${(domains[d] ?? 0) * 100}%`, background: domainColor(d) }} />
      ))}
    </div>
  );
}

/** Labelled rows — used for athlete domain profiles, where values are percentiles. */
export function DomainProfile({
  domains,
  meta,
  exposure,
  format = 'percentile',
}: {
  domains: DomainWeights;
  meta: Record<string, DomainMeta>;
  exposure?: DomainWeights;
  format?: 'percentile' | 'share';
}) {
  const rows = DOMAIN_ORDER.filter((d) => domains[d] != null);
  return (
    <div className="dlist">
      {rows.map((d) => {
        const v = domains[d] ?? 0;
        const exp = exposure?.[d];
        return (
          <div className="drow" key={d}>
            <div className="drow-label">
              <span className="dot" style={{ background: domainColor(d) }} />
              {meta[d]?.label ?? d}
            </div>
            <div
              className="dtrack"
              title={exp != null ? `${exp.toFixed(1)} events' worth of exposure` : undefined}
            >
              <div className="dfill" style={{ width: `${v * 100}%`, background: domainColor(d) }} />
            </div>
            <div className="drow-value">
              {format === 'percentile' ? `p${Math.round(v * 100)}` : `${Math.round(v * 100)}%`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Short axis labels for the radar, matching the meta labels used site-wide. */
const RADAR_LABELS: Record<string, string> = {
  running: 'Running',
  swimming: 'Swim',
  machine: 'Machines',
  endurance: 'Endurance',
  sprint: 'Sprint',
  strength: 'Max Str.',
  weightlifting: 'Weightlifting',
  gymnastics: 'Gymnastics',
  strongman: 'Odd Object',
  skill: 'Skill',
  grip: 'Grip',
};

/** Server-rendered radar, no charting dependency. */
export function DomainRadar({
  domains,
  size = 260,
  compare,
}: {
  domains: DomainWeights;
  size?: number;
  compare?: DomainWeights;
}) {
  const axes = DOMAIN_ORDER.filter((d) => domains[d] != null);
  if (axes.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 34;

  const point = (i: number, value: number) => {
    const angle = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
    return [cx + Math.cos(angle) * r * value, cy + Math.sin(angle) * r * value] as const;
  };
  const path = (w: DomainWeights) =>
    axes.map((d, i) => point(i, Math.max(0.02, w[d] ?? 0)).join(',')).join(' ');

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Domain profile radar">
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <polygon
          key={ring}
          points={axes.map((_, i) => point(i, ring).join(',')).join(' ')}
          fill="none"
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}
      {axes.map((d, i) => {
        const [x, y] = point(i, 1);
        return <line key={d} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line-soft)" strokeWidth="1" />;
      })}

      {compare && (
        <polygon points={path(compare)} fill="rgba(153,163,176,0.10)" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="4 3" />
      )}
      <polygon points={path(domains)} fill="rgba(224,50,47,0.18)" stroke="var(--accent)" strokeWidth="2" />

      {axes.map((d, i) => {
        const [x, y] = point(i, 1.19);
        return (
          <text
            key={d}
            x={x}
            y={y}
            fill="var(--text-faint)"
            fontSize="8.5"
            textAnchor={Math.abs(x - cx) < 6 ? 'middle' : x > cx ? 'start' : 'end'}
            dominantBaseline="middle"
          >
            {RADAR_LABELS[d] ?? d}
          </text>
        );
      })}
    </svg>
  );
}
