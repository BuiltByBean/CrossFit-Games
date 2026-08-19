import Link from 'next/link';
import { getAnalysis } from '@/lib/data';

export const metadata = { title: 'Era Transplant — CrossFit Games' };

/**
 * Green for a win, fading through amber to red the further down the field
 * they land. The ramp runs to place 40 (places 20-38 used to share one
 * identical color), and dark cells get light text — the old fixed near-black
 * text sat at 2.5:1 contrast on every cell from place 17 down.
 */
function finishStyle(finish: number) {
  const t = Math.min(1, (finish - 1) / 39);
  const hue = 152 - t * 152; // teal -> red
  const light = 62 - t * 30;
  return {
    background: `hsl(${hue} 42% ${light}%)`,
    color: light < 48 ? '#f3f4f6' : '#0b0d10',
  };
}

export default async function TransplantPage() {
  const a = await getAnalysis();
  const years = a.years.map((y) => y.year);
  const athletes = a.goat
    .filter((c) => c.transplants?.length)
    .slice(0, a.methodology.transplant.cohort);
  const top = athletes[0];
  const runnerUp = athletes[1];
  const topAlwaysAhead =
    top && runnerUp
      ? years.every((y) => {
          const t1 = top.transplants!.find((t) => t.year === y)?.headToHeadFinish ?? 99;
          const t2 = runnerUp.transplants!.find((t) => t.year === y)?.headToHeadFinish ?? 99;
          return t1 < t2;
        })
      : false;

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
                            tabIndex={0}
                            aria-label={
                              `${c.name}, ${y}: head-to-head ${place} of ${t.poolSize ?? t.fieldSize}; ` +
                              `solo ${t.projectedFinish} of ${t.fieldSize}` +
                              (competed && t.actualFinish != null ? `; actually finished ${t.actualFinish}` : '')
                            }
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
                              ...finishStyle(place),
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
                <strong>Solo</strong> swaps one athlete into a year&apos;s real field on their own,
                with their own actual season removed so no one competes against themselves. It is the
                better measure of era fit, but it is computed per athlete, so two men who would both
                have beaten everyone who actually competed each come out first — they are never
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
              <h3>{topAlwaysAhead ? 'Why the top rows are flat' : 'How to read the top rows'}</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                {topAlwaysAhead ? (
                  <>
                    That is the result, not a rounding artefact. {top.name.split(' ')[0]} out-projects{' '}
                    {runnerUp.name.split(' ')[0]} in every year, and the pair sit far enough clear of
                    everyone else that no era&apos;s event mix reorders them.
                  </>
                ) : (
                  <>
                    Even the top pair trade places as the event mix changes — era fit is doing real
                    work at the very top of the table.
                  </>
                )}{' '}
                Era fit bites harder further down: {a.goat[2].name} swings between{' '}
                {Math.min(...a.goat[2].transplants!.map((t) => t.headToHeadFinish ?? 99))} and{' '}
                {Math.max(...a.goat[2].transplants!.map((t) => t.headToHeadFinish ?? 0))} depending on
                the year&apos;s event mix.
              </p>
            </div>
            <div className="card">
              <h3>The honest caveat</h3>
              <p className="muted" style={{ marginBottom: 0 }}>
                A career profile is built from the events an athlete actually faced. Someone who never
                swam at the Games has no swimming record, so their projection into a swim-heavy year
                leans on their other domains and counts for less in the projected score. Head-to-head
                places also depend on who is in the cohort — it is the top{' '}
                {a.methodology.transplant.cohort} careers, and the rest of each field keeps its real
                season scores, so a career-smoothed projection is always racing someone&apos;s best
                actual year. The model is checked against reality on the methodology page.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
