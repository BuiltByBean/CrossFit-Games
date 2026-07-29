import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAnalysis, getCareer } from '@/lib/data';
import { DomainBar, DomainProfile, DomainRadar, domainColor } from '@/components/Domain';
import type { DomainKey } from '@/lib/types';

export async function generateStaticParams() {
  const a = await getAnalysis();
  return a.goat.map((c) => ({ id: c.competitorId }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCareer(id);
  return { title: c ? `${c.name} — CrossFit Games` : 'Athlete — CrossFit Games' };
}

export default async function AthletePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await getAnalysis();
  const c = await getCareer(id);
  if (!c) notFound();

  const fieldMean = Object.fromEntries(
    (Object.keys(a.domains) as string[]).map((d) => {
      const vals = a.goat.map((x) => (x.domains as Record<string, number>)[d]).filter((v) => v != null);
      return [d, vals.reduce((p, q) => p + q, 0) / (vals.length || 1)];
    }),
  );

  const entries = Object.entries(c.domains) as [string, number][];
  const strongest = [...entries].sort((x, y) => y[1] - x[1]).slice(0, 3);
  const weakest = [...entries].sort((x, y) => x[1] - y[1]).slice(0, 3);

  return (
    <>
      <section>
        <div className="wrap">
          <Link href="/goat" className="back-link">
            ← All-time table
          </Link>
          <div className="eyebrow" style={{ marginTop: '1rem' }}>
            All-time #{c.goatRank} · consensus of three models
          </div>
          <h1>{c.name}</h1>
          <div className="pill-row" style={{ marginTop: '0.7rem' }}>
            {c.bio?.country && <span className="pill">{c.bio.country}</span>}
            {c.bio?.affiliate && <span className="pill">{c.bio.affiliate}</span>}
            {c.bio?.heightIn && <span className="pill">{c.bio.heightIn} in</span>}
            {c.bio?.weightLb && <span className="pill">{c.bio.weightLb} lb</span>}
            <span className="pill pill-strong">
              {c.years[0]}–{c.years[c.years.length - 1]}
            </span>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="grid grid-4">
            <div className="stat">
              <div className="stat-value">{c.titles}</div>
              <div className="stat-label">Titles</div>
              <div className="stat-sub">
                {c.podiums} podiums · best {c.bestFinish ?? '—'}
              </div>
            </div>
            <div className="stat">
              <div className="stat-value">{c.appearances}</div>
              <div className="stat-label">Appearances</div>
              <div className="stat-sub">{c.totalEvents} events contested</div>
            </div>
            <div className="stat">
              <div className="stat-value">{c.eventWins}</div>
              <div className="stat-label">Event wins</div>
              <div className="stat-sub">
                {((c.eventWins / Math.max(1, c.totalEvents)) * 100).toFixed(0)}% of events
              </div>
            </div>
            <div className="stat">
              <div className="stat-value">p{Math.round(c.meanPercentile * 100)}</div>
              <div className="stat-label">Mean percentile</div>
              <div className="stat-sub">peak season p{Math.round(c.peakPercentile * 100)}</div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">Fitness profile</div>
          <h2>What he was made of</h2>
          <div className="grid grid-2">
            <div className="card">
              <DomainProfile domains={c.domains} meta={a.domains} exposure={c.domainExposure} />
              <p className="faint" style={{ marginTop: '1rem', marginBottom: 0 }}>
                Career percentile vs the field in each domain. Hover a bar for how many events&apos;
                worth of exposure it is based on — a thin record makes a number less trustworthy.
              </p>
            </div>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <DomainRadar domains={c.domains} compare={fieldMean} size={290} />
              <p className="faint" style={{ marginTop: '0.5rem', marginBottom: 0, textAlign: 'center' }}>
                Solid: {c.name.split(' ')[0]}. Dashed: average of all ranked athletes.
              </p>
            </div>
          </div>

          <div className="grid grid-2" style={{ marginTop: '1rem' }}>
            <div className="card">
              <h3>Strengths</h3>
              <div className="pill-row" style={{ marginTop: '0.6rem' }}>
                {strongest.map(([d, v]) => (
                  <span className="pill pill-strong" key={d}>
                    <span
                      className="dot"
                      style={{ background: domainColor(d), display: 'inline-block', marginRight: 6 }}
                    />
                    {a.domains[d as DomainKey]?.label} p{Math.round(v * 100)}
                  </span>
                ))}
              </div>
            </div>
            <div className="card">
              <h3>Weaknesses</h3>
              <div className="pill-row" style={{ marginTop: '0.6rem' }}>
                {weakest.map(([d, v]) => (
                  <span className="pill" key={d}>
                    <span
                      className="dot"
                      style={{ background: domainColor(d), display: 'inline-block', marginRight: 6 }}
                    />
                    {a.domains[d as DomainKey]?.label} p{Math.round(v * 100)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {c.transplants && c.transplantSummary && (
        <section>
          <div className="wrap">
            <div className="eyebrow">Era transplant</div>
            <h2>How he&apos;d do in every other era</h2>
            <p className="muted" style={{ maxWidth: '68ch' }}>
              Projected finish if this profile were dropped into each Games. Would win{' '}
              <strong>{c.transplantSummary.wouldWin}</strong> of {c.transplants.length} and podium in{' '}
              <strong>{c.transplantSummary.wouldPodium}</strong>. Best fit: {c.transplantSummary.bestYear}.
              Worst fit: {c.transplantSummary.worstYear}.
            </p>
            <div className="table-scroll" style={{ marginTop: '1rem' }}>
              <table>
                <thead>
                  <tr>
                    <th>Year</th>
                    <th>Projected</th>
                    <th>Actual</th>
                    <th>Field</th>
                    <th>Best fit events</th>
                    <th>Worst fit events</th>
                  </tr>
                </thead>
                <tbody>
                  {c.transplants.map((t) => (
                    <tr key={t.year}>
                      <td className="num">{t.year}</td>
                      <td className={`num rank-${t.projectedFinish}`} style={{ fontWeight: 700 }}>
                        {t.projectedFinish}
                      </td>
                      <td className="num">
                        {t.actualFinish ??
                          (t.competed ? (
                            <span className="faint">{t.actualStatus === 'DQ' ? 'stripped' : 'no place'}</span>
                          ) : (
                            <span className="faint">did not compete</span>
                          ))}
                      </td>
                      <td className="num faint">{t.fieldSize}</td>
                      <td className="faint" style={{ whiteSpace: 'normal' }}>
                        {t.strongest.map((s) => s.name).join(', ')}
                      </td>
                      <td className="faint" style={{ whiteSpace: 'normal' }}>
                        {t.weakest.map((s) => s.name).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <section style={{ borderBottom: 'none' }}>
        <div className="wrap">
          <div className="eyebrow">Season by season</div>
          <h2>Every event he ever contested</h2>
          {c.seasons.map((s) => (
            <div key={s.year} style={{ marginTop: '1.6rem' }}>
              <h3 style={{ marginBottom: '0.6rem' }}>
                {s.year}{' '}
                <span className="faint" style={{ fontWeight: 400 }}>
                  —{' '}
                  {s.status === 'DQ'
                    ? 'result stripped'
                    : s.finish != null
                      ? `finished ${s.finish} of ${s.fieldSize}`
                      : `did not place`}
                  {s.status === 'CUT' && ' (eliminated at a cut)'}
                  {s.status === 'WD' && ' (withdrew)'} · {s.eventWins} event win
                  {s.eventWins === 1 ? '' : 's'} · mean p{Math.round(s.percentileScore * 100)}
                </span>
                {s.status === 'DQ' && (
                  <span className="badge badge-inferred" style={{ marginLeft: '0.5rem' }}>
                    disqualified
                  </span>
                )}
              </h3>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Event</th>
                      <th>Result</th>
                      <th>Place</th>
                      <th>Pct</th>
                      <th>Domains</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.events.map((e) => (
                      <tr key={e.ordinal}>
                        <td className="num faint">{e.ordinal}</td>
                        <td>{e.name}</td>
                        <td className="num">{e.display ?? '—'}</td>
                        <td className={`num ${e.rank === 1 ? 'rank-1' : ''}`} style={{ fontWeight: e.rank === 1 ? 700 : 400 }}>
                          {e.rank ?? '—'}
                          <span className="faint"> / {e.fieldSize}</span>
                        </td>
                        <td className="num">p{Math.round(e.percentile * 100)}</td>
                        <td style={{ minWidth: 140 }}>
                          <DomainBar domains={e.domains} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
