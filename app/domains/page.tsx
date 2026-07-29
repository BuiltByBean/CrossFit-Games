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
    return { key: d as DomainKey, byYear, ranked, totalShare };
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
            what makes a 2011 sandbag carry and a 2024 machine interval comparable: they are not the
            same event, but they draw on measurable proportions of the same underlying qualities.
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

                <div className="faint" style={{ marginBottom: '0.3rem' }}>
                  Share of the test by year
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 46 }}>
                  {p.byYear.map((b) => (
                    <div
                      key={b.year}
                      title={`${b.year}: ${(b.share * 100).toFixed(0)}% of the year's test`}
                      style={{
                        flex: 1,
                        height: `${Math.max(2, (b.share / maxShare) * 100)}%`,
                        background: domainColor(p.key),
                        opacity: b.share > 0 ? 0.85 : 0.15,
                        borderRadius: 2,
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }} className="faint">
                  <span>{a.years[0].year}</span>
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
