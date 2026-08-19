import Link from 'next/link';
import { getAnalysis } from '@/lib/data';
import { DomainBar } from '@/components/Domain';
import { StackedBars } from '@/components/StackedBars';

export const metadata = { title: 'Movements — CrossFit Games' };

const CATEGORY_ORDER = ['barbell', 'gymnastics', 'monostructural', 'oddobject', 'dumbbell', 'other'];

export default async function MovementsPage() {
  const a = await getAnalysis();
  const years = a.years.map((y) => y.year);

  const series = CATEGORY_ORDER.filter((k) => a.movementCategories[k]).map((k) => ({
    key: k,
    label: a.movementCategories[k].label,
    color: a.movementCategories[k].color,
  }));

  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    meta: a.movementCategories[cat],
    items: a.movements.filter((m) => m.category === cat),
  })).filter((g) => g.items.length);

  // sparkline bars plot a single year's count, so they scale against the
  // largest per-year count anywhere — not a movement's total career count,
  // which flattened every bar to a 3%-tall sliver
  const maxPerYear = Math.max(
    ...a.movements.flatMap((m) => Object.values(m.byYear)),
    1,
  );
  const totalTags = a.movements.reduce((n, m) => n + m.eventCount, 0);
  // athlete pages exist only for ranked (2+ appearance) careers
  const linkable = new Set(a.goat.map((c) => c.competitorId));

  return (
    <>
      <section>
        <div className="wrap">
          <div className="eyebrow">Movement analysis</div>
          <h1>Every movement ever tested</h1>
          <p className="lede">
            {a.movements.length} distinct movements parsed from the published workout descriptions
            across {a.years.length} Games — {totalTags} movement appearances in{' '}
            {a.years.reduce((n, y) => n + y.eventCount, 0)} events. For each one: how often the Games
            has asked for it, what kind of test it belongs to, and which men were best at it.
          </p>
          <p className="faint">
            An athlete&apos;s standing in a movement is their mean percentile across the events that
            contained it, adjusted for the strength of each year&apos;s field. A minimum of{' '}
            {a.movementMinEvents} such events is required to be ranked, so a single good day cannot
            make someone the all-time best — and only events where at least half the year&apos;s field
            was still competing count, so a spot in a small post-cut final cannot buy an elite score
            by attendance.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">Composition by year</div>
          <h2>What the Games has asked for</h2>
          <p className="lede">
            Each column is one Games, split by the share of its movement appearances belonging to each
            family. The barbell share is remarkably stable; monostructural work and odd objects are
            what swing between eras.
          </p>
          <div style={{ marginTop: '1.4rem' }}>
            <StackedBars
              columns={a.movementMixByYear.map((m) => ({
                label: String(m.year),
                sublabel: `${m.total}`,
                mix: m.mix,
              }))}
              series={series}
              height={260}
              caption="Sublabel is the number of movement appearances that year. Hover a segment for its exact share."
            />
          </div>
        </div>
      </section>

      {byCategory.map((group) => (
        <section key={group.cat} style={group.cat === byCategory[byCategory.length - 1].cat ? { borderBottom: 'none' } : undefined}>
          <div className="wrap">
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <span
                className="dot"
                style={{ background: group.meta.color, width: 11, height: 11 }}
              />
              {group.meta.label}
              <span className="faint" style={{ fontWeight: 400, fontSize: '0.85rem' }}>
                {group.items.length} movements
              </span>
            </h2>

            <div className="mv-grid" style={{ marginTop: '1rem' }}>
              {group.items.map((m) => (
                <div className="mv-card" key={m.key}>
                  <div className="mv-head">
                    <span className="mv-title">{m.label}</span>
                    <span className="mv-count">
                      {m.eventCount} event{m.eventCount === 1 ? '' : 's'} · {m.firstYear}–{m.lastYear}
                    </span>
                  </div>

                  <div className="faint" style={{ fontSize: '0.72rem' }}>
                    appearances by year
                  </div>
                  <div className="mv-spark" title={`Peak ${Math.max(...Object.values(m.byYear))} in one year`}>
                    {years.map((y) => {
                      const v = m.byYear[y] ?? 0;
                      return (
                        <i
                          key={y}
                          title={`${y}: ${v} event${v === 1 ? '' : 's'}`}
                          style={{
                            height: `${Math.max(3, (v / maxPerYear) * 100)}%`,
                            background: group.meta.color,
                            opacity: v ? 0.9 : 0.14,
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="faint" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem' }}>
                    <span>{years[0]}</span>
                    <span>{years[years.length - 1]}</span>
                  </div>

                  <div className="faint" style={{ fontSize: '0.72rem', marginTop: '0.7rem' }}>
                    domains of the events containing it
                  </div>
                  <div style={{ marginTop: '0.3rem' }}>
                    <DomainBar domains={m.domainMix} />
                  </div>

                  {m.leaders.length > 0 && (
                    <>
                      <div className="faint" style={{ fontSize: '0.72rem', marginTop: '0.9rem' }}>
                        best of all time ({m.rankedCount} qualified)
                      </div>
                      <div className="mv-leaders">
                        {m.leaders.slice(0, 5).map((l, i) => (
                          <div className="mv-leader" key={l.competitorId}>
                            <span className="mv-leader-rank">{i + 1}</span>
                            {linkable.has(l.competitorId) ? (
                              <Link href={`/athletes/${l.competitorId}`} className="athlete-link">
                                {l.name}
                              </Link>
                            ) : (
                              <span>{l.name}</span>
                            )}
                            <span className="num" style={{ color: 'var(--text-dim)' }}>
                              p{Math.round(l.meanPercentile * 100)}
                              <span className="faint"> ·{l.events}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {m.leaders.length === 0 && (
                    <div className="faint" style={{ marginTop: '0.9rem' }}>
                      Too few events for anyone to qualify for a ranking.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </>
  );
}
