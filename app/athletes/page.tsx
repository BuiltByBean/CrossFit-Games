import Link from 'next/link';
import { getAnalysis } from '@/lib/data';
import { domainColor } from '@/components/Domain';
import type { DomainKey } from '@/lib/types';

export const metadata = { title: 'Athletes — CrossFit Games' };

export default async function AthletesPage() {
  const a = await getAnalysis();
  const athletes = [...a.allAthletes].sort(
    (x, y) =>
      (x.goatRank ?? 9999) - (y.goatRank ?? 9999) ||
      (x.bestFinish ?? 9999) - (y.bestFinish ?? 9999) ||
      y.appearances - x.appearances,
  );

  return (
    <>
      <section>
        <div className="wrap">
          <div className="eyebrow">{a.division.name}</div>
          <h1>Every man to make the Games</h1>
          <p className="lede">
            {a.allAthletes.length} athletes across {a.years.length} Games. Athletes with{' '}
            {a.methodology.minAppearances}+ appearances carry an all-time rank; single-appearance
            athletes are listed but not ranked, since one Games is not enough to rate a career.
          </p>
        </div>
      </section>

      <section style={{ borderBottom: 'none' }}>
        <div className="wrap">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>All-time</th>
                  <th>Athlete</th>
                  <th>Country</th>
                  <th>Career</th>
                  <th>Apps</th>
                  <th>Best</th>
                  <th>Titles</th>
                  <th>Ev wins</th>
                  <th title="Mean season percentile, adjusted for the strength of each year's field">Mean pct*</th>
                  <th>Strongest</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map((c) => {
                  const entries = Object.entries(c.domains) as [string, number][];
                  const best = entries.sort((x, y) => y[1] - x[1])[0];
                  const ranked = c.goatRank != null;
                  return (
                    <tr key={c.competitorId}>
                      <td className={`rank-cell ${ranked ? `rank-${c.goatRank}` : ''}`}>
                        {ranked ? c.goatRank : <span className="faint">—</span>}
                      </td>
                      <td>
                        {ranked ? (
                          <Link href={`/athletes/${c.competitorId}`} className="athlete-link">
                            {c.name}
                          </Link>
                        ) : (
                          <span>{c.name}</span>
                        )}
                      </td>
                      <td className="faint">{c.bio?.country ?? '—'}</td>
                      <td className="num">
                        {c.years[0]}
                        {c.years.length > 1 ? `–${c.years[c.years.length - 1]}` : ''}
                      </td>
                      <td className="num">{c.appearances}</td>
                      <td className="num">{c.bestFinish ?? '—'}</td>
                      <td className="num">{c.titles || '—'}</td>
                      <td className="num">{c.eventWins || '—'}</td>
                      <td className="num">p{Math.round(c.meanPercentile * 100)}</td>
                      <td>
                        {best ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span className="dot" style={{ background: domainColor(best[0]) }} />
                            <span style={{ fontSize: '0.83rem' }}>{a.domains[best[0] as DomainKey]?.label}</span>
                          </span>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ marginTop: '0.7rem' }}>
            * Mean season percentile, adjusted for the strength of each year&apos;s field — see the{' '}
            <Link href="/methodology">methodology</Link>.
          </p>
        </div>
      </section>
    </>
  );
}
