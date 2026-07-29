import Link from 'next/link';
import { getAnalysis } from '@/lib/data';

export const metadata = { title: 'GOAT Table — CrossFit Games' };

export default async function GoatPage() {
  const a = await getAnalysis();
  const { weights, minAppearances } = a.methodology;

  // Where the three models disagree most, among careers with a real claim to
  // the top. Spread across the whole field is dominated by mid-pack athletes
  // with two appearances, which is noise rather than a contested verdict.
  const contested = [...a.goat]
    .slice(0, 30)
    .sort((x, y) => y.consensus!.spread - x.consensus!.spread)
    .slice(0, 5);

  return (
    <>
      <section>
        <div className="wrap">
          <div className="eyebrow">All-time ranking</div>
          <h1>The GOAT table</h1>
          <p className="lede">
            {a.goat.length} men with at least {minAppearances} Games appearances, rated by three
            independent models and ranked by their consensus. Each model blends quality (
            {Math.round(weights.quality * 100)}%), accumulated volume ({Math.round(weights.volume * 100)}
            %) and hardware ({Math.round(weights.hardware * 100)}%) — they differ only in how an
            individual season is rated.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>Where the models fight</h2>
          <p className="muted" style={{ maxWidth: '68ch' }}>
            A large spread means the three models rate the same career very differently — usually a
            long, consistent career without titles (favoured by percentile) versus a short, dominant one
            (favoured by z-score and official points).
          </p>
          <div className="grid grid-3" style={{ marginTop: '1rem' }}>
            {contested.map((c) => (
              <div className="card" key={c.competitorId}>
                <Link href={`/athletes/${c.competitorId}`} className="athlete-link">
                  {c.name}
                </Link>
                <div className="faint">consensus #{c.goatRank}</div>
                <div className="pill-row" style={{ marginTop: '0.6rem' }}>
                  <span className="pill">pct #{c.models!.percentile.rank}</span>
                  <span className="pill">official #{c.models!.official.rank}</span>
                  <span className="pill">z #{c.models!.zscore.rank}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ borderBottom: 'none' }}>
        <div className="wrap">
          <h2>Full ranking</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Athlete</th>
                  <th>Career</th>
                  <th>Apps</th>
                  <th>Best</th>
                  <th>Titles</th>
                  <th>Pod</th>
                  <th>Ev wins</th>
                  <th>Mean pct</th>
                  <th>Peak pct</th>
                  <th>Pct #</th>
                  <th>Off #</th>
                  <th>Z #</th>
                  <th>Spread</th>
                </tr>
              </thead>
              <tbody>
                {a.goat.map((c) => (
                  <tr key={c.competitorId}>
                    <td className={`rank-cell rank-${c.goatRank}`}>{c.goatRank}</td>
                    <td>
                      <Link href={`/athletes/${c.competitorId}`} className="athlete-link">
                        {c.name}
                      </Link>
                      {c.bio?.countryCode && (
                        <span className="faint" style={{ marginLeft: '0.45rem' }}>
                          {c.bio.countryCode}
                        </span>
                      )}
                    </td>
                    <td className="num">
                      {c.years[0]}–{c.years[c.years.length - 1]}
                    </td>
                    <td className="num">{c.appearances}</td>
                    <td className="num">{c.bestFinish ?? '—'}</td>
                    <td className="num">{c.titles || '—'}</td>
                    <td className="num">{c.podiums || '—'}</td>
                    <td className="num">{c.eventWins || '—'}</td>
                    <td className="num">p{Math.round(c.meanPercentile * 100)}</td>
                    <td className="num">p{Math.round(c.peakPercentile * 100)}</td>
                    <td className="num">{c.models!.percentile.rank}</td>
                    <td className="num">{c.models!.official.rank}</td>
                    <td className="num">{c.models!.zscore.rank}</td>
                    <td className="num" style={{ color: c.consensus!.spread > 6 ? 'var(--gold)' : undefined }}>
                      {c.consensus!.spread}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
