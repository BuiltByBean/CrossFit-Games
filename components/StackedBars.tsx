import { domainColor } from './Domain';

export interface StackedSeries {
  key: string;
  label: string;
  color: string;
}

export interface StackedColumn {
  label: string;
  /** series key -> share of this column, expected to sum to ~1 */
  mix: Record<string, number>;
  /** optional caption under the bar, e.g. an event count */
  sublabel?: string;
}

/**
 * Vertical 100% stacked bars, one column per period.
 *
 * Every column sums to the full height, so this reads as composition over time
 * rather than volume — a taller segment means a larger share of that year's
 * test, not more of it in absolute terms. Absolute counts go in the sublabel.
 */
export function StackedBars({
  columns,
  series,
  height = 240,
  caption,
}: {
  columns: StackedColumn[];
  series: StackedSeries[];
  height?: number;
  caption?: string;
}) {
  return (
    <figure className="stack-fig">
      <div className="stack-scroll">
        <div className="stack" style={{ height }}>
          {columns.map((col) => {
            const total = series.reduce((n, s) => n + (col.mix[s.key] ?? 0), 0) || 1;
            return (
              <div className="stack-col" key={col.label}>
                <div className="stack-bar">
                  {series
                    .filter((s) => (col.mix[s.key] ?? 0) > 0)
                    .map((s) => {
                      const share = (col.mix[s.key] ?? 0) / total;
                      return (
                        <div
                          key={s.key}
                          className="stack-seg"
                          style={{ height: `${share * 100}%`, background: s.color }}
                          title={`${col.label} — ${s.label}: ${(share * 100).toFixed(1)}%`}
                        />
                      );
                    })}
                </div>
                <div className="stack-x">{col.label}</div>
                {col.sublabel && <div className="stack-x stack-x-sub">{col.sublabel}</div>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="stack-legend">
        {series.map((s) => (
          <span key={s.key} className="stack-key">
            <span className="dot" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      {caption && <figcaption className="faint">{caption}</figcaption>}
    </figure>
  );
}

/** Convenience wrapper for the fitness-domain palette. */
export function domainSeries(
  domains: Record<string, { label: string }>,
  order: string[],
): StackedSeries[] {
  return order
    .filter((k) => domains[k])
    .map((k) => ({ key: k, label: domains[k].label, color: domainColor(k) }));
}
