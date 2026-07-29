import Link from 'next/link';
import { getAnalysis } from '@/lib/data';

export const metadata = { title: 'Era Transplant — CrossFit Games' };

/** Green for a win, fading to grey the further down the field they land. */
function finishColor(finish: number, fieldSize: number) {
  const t = Math.min(1, (finish - 1) / Math.max(1, Math.min(fieldSize, 20) - 1));
  const hue = 152 - t * 152; // teal -> red
  const light = 62 - t * 24;
  return `hsl(${hue} 42% ${light}%)`;
}

export default async function TransplantPage() {
  const a = await getAnalysis();
  const years = a.years.map((y) => y.year);
  const athletes = a.goat.filter((c) => c.transplants?.length).slice(0, 25);

  return (
    <>
      <section>
        <div className="wrap">
          <div className="eyebrow">Cross-era simulation</div>
          <h1>Drop them in any year</h1>
          <p className="lede">
            Every athlete carries a career profile of percentile strength in {Object.keys(a.domains).length}{' '}
            fitness domains. Project that profile onto another year&apos;s actual event mix — weighting
            each event by the domains it tested — and you get an expected score for that era.
          </p>
          <p className="lede">
            The grid below is the <strong>head-to-head</strong>: all {a.methodology.transplant.cohort}{' '}
            of these careers competing in the same year at once, against whatever is left of that
            year&apos;s real field. Exactly one athlete can win a given year.
          </p>
          <p className="faint">
            A ringed cell is a year the athlete actually competed in, so you can read the model against
            reality. Hover any cell for the solo projection too. The model deliberately smooths over
            form, injury and tactics — it answers &ldquo;does this athlete&apos;s shape of fitness fit
            that year&apos;s test&rdquo;, not &ldquo;what would have happened on the day&rdquo;.
          </p>
        </div>
      </section>

      <section style={{ borderBottom: 'none' }}>
        <div className="wrap">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, zIndex: 2 }}>Athlete</th>
                  {years.map((y) => (
                    <th key={y} style={{ textAlign: 'center', padding: '0.7rem 0.3rem' }}>
                      {String(y).slice(2)}
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>Mean</th>
                  <th style={{ textAlign: 'center' }}>Wins</th>
                </tr>
              </thead>
              <tbody>
                {athletes.map((c) => (
                  <tr key={c.competitorId}>
                    <td
                      style={{
                        position: 'sticky',
                        left: 0,
                        background: 'var(--bg-raised)',
                        zIndex: 1,
                        minWidth: 190,
                      }}
                    >
                      <span className="faint" style={{ marginRight: '0.5rem' }}>
                        {c.goatRank}
                      </span>
                      <Link href={`/athletes/${c.competitorId}`} className="athlete-link">
                        {c.name}
                      </Link>
                    </td>
                    {years.map((y) => {
                      const t = c.transplants!.find((x) => x.year === y);
                      if (!t)
                        return (
                          <td key={y} style={{ textAlign: 'center' }} className="faint">
                            —
                          </td>
                        );
                      const competed = t.competed;
                      const place = t.headToHeadFinish ?? t.projectedFinish;
                      return (
                        <td key={y} style={{ padding: '0.28rem 0.2rem', textAlign: 'center' }}>
                          <span
                            title={
                              `${c.name} — ${y}\n` +
                              `Head-to-head: ${place} of ${t.poolSize ?? t.fieldSize}\n` +
                              `Solo vs that year's field: ${t.projectedFinish} of ${t.fieldSize}` +
                              (competed
                                ? t.actualFinish != null
                                  ? `\nActually finished: ${t.actualFinish}`
                                  : `\nCompeted, no official place (${t.actualStatus})`
                                : '') +
                              `\nStrongest: ${t.strongest.map((s) => s.name).join(', ')}` +
                              `\nWeakest: ${t.weakest.map((s) => s.name).join(', ')}`
                            }
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 30,
                              height: 26,
                              borderRadius: 5,
                              background: finishColor(place, 20),
                              color: '#0b0d10',
                              fontWeight: 700,
                              fontSize: '0.76rem',
                              fontVariantNumeric: 'tabular-nums',
                              outline: competed ? '2px solid var(--text-faint)' : 'none',
                              outlineOffset: competed ? '-2px' : undefined,
                            }}
                          >
                            {place}
                          </span>
                        </td>
                      );
                    })}
                    <td className="num" style={{ textAlign: 'center' }}>
                      {c.transplantSummary!.meanHeadToHead}
                    </td>
                    <td className="num" style={{ textAlign: 'center' }}>
                      {c.transplantSummary!.h2hWins}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-3" style={{ marginTop: '1.6rem' }}>
            <div className="card">
              <h3>Two ways to ask the question</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                <strong>Solo</strong> swaps one athlete into a year&apos;s real field on their own. It
                is the better measure of era fit, but it is computed per athlete, so two men who would
                both have beaten everyone who actually competed each come out first — they are never
                measured against each other. <strong>Head-to-head</strong>, shown in the grid, runs the
                whole cohort in the same year at once, so exactly one athlete wins.
              </p>
            </div>
            <div className="card">
              <h3>How to read a disagreement</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                When the projection is far better than the actual finish, the athlete&apos;s fitness fit
                that year but something else went wrong — a bad single event, an injury, a tactical
                error, or a cut format that ended their competition early. When it is far worse, they
                over-performed their profile.
              </p>
            </div>
            <div className="card">
              <h3>Why the top two rows are flat</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                That is the result, not a rounding artefact. {a.goat[0].name.split(' ')[0]} out-projects{' '}
                {a.goat[1].name.split(' ')[0]} in all {a.years.length} years, and the pair sit far
                enough clear of everyone else that no era&apos;s event mix reorders them. Era fit bites
                hard further down: {a.goat[2].name} swings between{' '}
                {Math.min(...a.goat[2].transplants!.map((t) => t.headToHeadFinish ?? 99))} and{' '}
                {Math.max(...a.goat[2].transplants!.map((t) => t.headToHeadFinish ?? 0))} depending on
                how much water and endurance the year demanded.
              </p>
            </div>
            <div className="card">
              <h3>The honest caveat</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                A career profile is built from the events an athlete actually faced. Someone who never
                swam at the Games has no swimming record, so their projection into a swim-heavy year
                leans on their other domains and is less certain. Coverage is reported per projection in
                the underlying data. Head-to-head places also depend on who is in the cohort — it is the
                top {a.methodology.transplant.cohort} careers, so a 26th man entering would shift places
                below him.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
