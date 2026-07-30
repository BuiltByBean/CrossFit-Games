import Link from 'next/link';
import { getAnalysis } from '@/lib/data';
import { DomainBar, DOMAIN_ORDER, domainColor } from '@/components/Domain';

export const metadata = { title: 'Events — CrossFit Games' };

function duration(seconds: number | null) {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`;
}

export default async function EventsPage() {
  const a = await getAnalysis();
  const totalEvents = a.years.reduce((n, y) => n + y.eventCount, 0);

  return (
    <>
      <section>
        <div className="wrap">
          <div className="eyebrow">The test itself</div>
          <h1>Every event, {a.years[0].year}–{a.years[a.years.length - 1].year}</h1>
          <p className="lede">
            {totalEvents} individual men&apos;s events, each tagged with the fitness domains it
            actually tested. The coloured bar shows the mix. Tags are hand-curated from the workout
            descriptions; the few derived automatically are marked.
          </p>
          <p className="faint">
            <strong>In</strong> is how many athletes were still in the competition for that event,
            highlighted when it is fewer than the field that started. It makes cut formats visible —
            and the 2020 Games, where all 30 men contested the seven online Stage 1 events and only
            the top five went on to the twelve at the Ranch.
          </p>
          <div className="pill-row" style={{ marginTop: '1rem' }}>
            {DOMAIN_ORDER.map((d) => (
              <span className="pill" key={d}>
                <span
                  className="dot"
                  style={{ background: domainColor(d), display: 'inline-block', marginRight: 6 }}
                />
                {a.domains[d]?.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {a.years.map((y) => (
        <section key={y.year} style={y.year === a.years[a.years.length - 1].year ? { borderBottom: 'none' } : undefined}>
          <div className="wrap">
            <h2 style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem', flexWrap: 'wrap' }}>
              {y.year}
              <span className="faint" style={{ fontWeight: 400, fontSize: '0.85rem' }}>
                {y.eventCount} events · {y.fieldSize} men · field strength{' '}
                {y.fieldStrength > 0 ? '+' : ''}
                {y.fieldStrength.toFixed(2)}
                {y.champion && (
                  <>
                    {' '}
                    · champion{' '}
                    <Link href={`/athletes/${y.champion.competitorId}`} className="athlete-link">
                      {y.champion.name}
                    </Link>
                  </>
                )}
              </span>
            </h2>

            <div style={{ margin: '0.4rem 0 1rem', maxWidth: 620 }}>
              <div className="faint" style={{ marginBottom: '0.3rem' }}>
                What this year tested
              </div>
              <DomainBar domains={y.domainMix} />
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Event</th>
                    <th>In</th>
                    <th>Scored</th>
                    <th>Median</th>
                    <th>Winner</th>
                    <th style={{ minWidth: 160 }}>Domain mix</th>
                    <th>Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {y.events.map((e) => (
                    <tr key={e.ordinal} style={e.exclude ? { opacity: 0.45 } : undefined}>
                      <td className="num faint">{e.ordinal}</td>
                      <td>
                        {e.name}
                        {e.note && (
                          <div
                            className="faint"
                            style={{ whiteSpace: 'normal', maxWidth: 420, marginTop: '0.15rem' }}
                          >
                            {e.note}
                          </div>
                        )}
                      </td>
                      <td
                        className="num faint"
                        title={`${e.participants} of ${y.fieldSize} still in the competition`}
                        style={e.participants < y.fieldSize ? { color: 'var(--gold)' } : undefined}
                      >
                        {e.participants}
                      </td>
                      <td className="faint">{e.exclude ? '—' : e.scoreFormat}</td>
                      <td className="num faint">{e.exclude ? '—' : duration(e.medianSeconds)}</td>
                      <td>{e.winner ?? <span className="faint">—</span>}</td>
                      <td>{e.exclude ? <span className="faint">not an event</span> : <DomainBar domains={e.domains} />}</td>
                      <td>
                        {e.tagSource === 'curated' && <span className="badge badge-curated">curated</span>}
                        {e.tagSource === 'inferred' && <span className="badge badge-inferred">inferred</span>}
                        {e.tagSource === 'excluded' && <span className="badge">excluded</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
