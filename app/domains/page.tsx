import Link from 'next/link';
import { getAnalysis } from '@/lib/data';
import { DOMAIN_ORDER, domainColor } from '@/components/Domain';
import type { DomainKey } from '@/lib/types';

export const metadata = { title: 'Domains — CrossFit Games' };

export default async function DomainsPage() {
  const a = await getAnalysis();

  // How much each era leaned on each domain, and who owned it all-time
  const perDomain = DOMAIN_ORDER.map((d) => {
    const byYear = a.years.map((y) => ({ year: y.year, share: y.domainMix[d] ?? 0 }));
    const ranked = a.goat
      .filter((c) => c.domains[d] != null && (c.domainExposure[d] ?? 0) >= 2)
      .sort((x, y) => (y.domains[d] ?? 0) - (x.domains[d] ?? 0))
      .slice(0, 3);
    const totalShare = byYear.reduce((n, b) => n + b.share, 0) / byYear.length;
    const peak = byYear.reduce((best, b) => (b.share > best.share ? b : best), byYear[0]);
    return { key: d as DomainKey, byYear, ranked, totalShare, peak };
  });

  const maxShare = Math.max(...perDomain.flatMap((p) => p.byYear.map((b) => b.share)));

  return (
    <>
      <section>
        <div className="wrap">
          <div className="eyebrow">Taxonomy</div>
          <h1>The eleven domains</h1>
          <p className="lede">
            Every event is decomposed into the domains it tests, with weights summing to one. That is
            what makes a 2011 sandbag carry and a 2026 machine interval comparable: they are not the
            same event, but they draw on measurable proportions of the same underlying qualities.
          </p>
          <p className="lede">
            Each chart below shows what share of that year&apos;s test the domain made up. All eleven
            are drawn on the <strong>same {Math.round(maxShare * 100)}% axis</strong>, so the cards can
            be read against each other — a short bar really is a small share, not a rescaled one. The
            dashed line is that domain&apos;s own all-time average.
          </p>
        </div>
      </section>

      <section style={{ borderBottom: 'none' }}>
        <div className="wrap">
          <div className="grid grid-2">
            {perDomain.map((p) => (
              <div className="card" key={p.key}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="dot" style={{ background: domainColor(p.key), width: 10, height: 10 }} />
                  {a.domains[p.key]?.label}
                  <span className="faint" style={{ fontWeight: 400, marginLeft: 'auto', fontSize: '0.78rem' }}>
                    {(p.totalShare * 100).toFixed(1)}% of all events
                  </span>
                </h3>
                <p className="muted" style={{ fontSize: '0.88rem', margin: '0.5rem 0 0.9rem' }}>
                  {a.domains[p.key]?.blurb}
                </p>

                <div className="spark-head faint">
                  <span>Share of the test by year</span>
                  <span>
                    peak {(p.peak.share * 100).toFixed(0)}% in {p.peak.year}
                  </span>
                </div>

                <div className="spark">
                  <div className="spark-axis faint">
                    <span>{Math.round(maxShare * 100)}%</span>
                    <span>0</span>
                  </div>
                  <div className="spark-plot">
                    {/* dashed line marks this domain's own all-time average */}
                    <div
                      className="spark-avg"
                      style={{ bottom: `${(p.totalShare / maxShare) * 100}%` }}
                      title={`All-time average ${(p.totalShare * 100).toFixed(1)}% of a year's test`}
                    />
                    <div className="spark-bars">
                      {p.byYear.map((b) => (
                        <div
                          key={b.year}
                          className="spark-bar"
                          title={`${b.year}: ${(b.share * 100).toFixed(1)}% of that year's test`}
                          style={{
                            height: `${Math.max(1.5, (b.share / maxShare) * 100)}%`,
                            background: domainColor(p.key),
                            opacity: b.share > 0 ? 0.85 : 0.18,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="spark-foot faint">
                  <span>{a.years[0].year}</span>
                  <span className="spark-avg-key">— — average {(p.totalShare * 100).toFixed(1)}%</span>
                  <span>{a.years[a.years.length - 1].year}</span>
                </div>

                {p.ranked.length > 0 && (
                  <>
                    <div className="faint" style={{ margin: '0.9rem 0 0.35rem' }}>
                      All-time best
                    </div>
                    <div className="dlist">
                      {p.ranked.map((c) => (
                        <div className="drow" key={c.competitorId} style={{ gridTemplateColumns: '1fr 3.2rem' }}>
                          <Link href={`/athletes/${c.competitorId}`} className="athlete-link" style={{ fontSize: '0.86rem' }}>
                            {c.name}
                          </Link>
                          <div className="drow-value">p{Math.round((c.domains[p.key] ?? 0) * 100)}</div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
