import Link from 'next/link';
import { getAnalysis } from '@/lib/data';
import { DomainProfile, DomainRadar, domainColor } from '@/components/Domain';
import type { Career } from '@/lib/types';

export default async function Home() {
  const a = await getAnalysis();
  const goat = a.goat[0];
  const second = a.goat[1];
  const top = a.goat.slice(0, 10);

  const firstYear = a.years[0].year;
  const lastYear = a.years[a.years.length - 1].year;
  const totalEvents = a.years.reduce((n, y) => n + y.eventCount, 0);

  // Athletes who would podium in every single era, on the transplant model
  const universal = a.goat
    .filter((c) => c.transplants && c.transplantSummary)
    .filter((c) => c.transplantSummary!.wouldPodium === c.transplants!.length)
    .slice(0, 6);

  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div className="eyebrow">The definitive answer</div>
          <h1>Who is the greatest CrossFit Games athlete of all time?</h1>
          <div className="hero-answer">
            <span className="hero-name">{goat.name}</span>
            <span className="badge badge-accent">unanimous #1</span>
          </div>
          <p className="lede">
            Across {a.years.length} Games, {totalEvents} events and {a.allAthletes.length} men, three
            independent rating models — field-normalised percentile, CrossFit&apos;s own points, and
            margin-of-victory z-score — all put {goat.name.split(' ')[0]} first. Put the{' '}
            {a.methodology.transplant.cohort} greatest careers head-to-head in the same year, in every
            year from {firstYear} to {lastYear}, and he wins {goat.transplantSummary!.h2hWins} of{' '}
            {a.years.length}.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="grid grid-4">
            <div className="stat">
              <div className="stat-value">{goat.titles}</div>
              <div className="stat-label">Titles</div>
              <div className="stat-sub">in {goat.appearances} appearances</div>
            </div>
            <div className="stat">
              <div className="stat-value">{goat.eventWins}</div>
              <div className="stat-label">Event wins</div>
              <div className="stat-sub">of {goat.totalEvents} events contested</div>
            </div>
            <div className="stat">
              <div className="stat-value">p{Math.round(goat.meanPercentile * 100)}</div>
              <div className="stat-label">Mean event percentile</div>
              <div className="stat-sub">career average vs the field</div>
            </div>
            <div className="stat">
              <div className="stat-value">
                {goat.transplantSummary!.h2hWins}/{a.years.length}
              </div>
              <div className="stat-label">Head-to-head wins</div>
              <div className="stat-sub">vs the {a.methodology.transplant.cohort} best careers</div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">The case</div>
          <h2>Why {goat.name.split(' ')[0]} and not {second.name.split(' ')[0]}</h2>
          <div className="grid grid-2">
            <div>
              <p className="muted">
                {second.name} is the only athlete close, and on raw dominance in his own era he is
                arguably {goat.name.split(' ')[0]}&apos;s equal — {second.titles} straight titles, and
                dropped alone into any era he projects to podium in all {a.years.length}. Head-to-head
                he finishes second to {goat.name.split(' ')[0]} in every single year.
              </p>
              <p className="muted">
                The separation is breadth and depth of field. {goat.name.split(' ')[0]} competed{' '}
                {goat.appearances} times against progressively deeper fields and has no domain below the{' '}
                {Math.round(Math.min(...Object.values(goat.domains as Record<string, number>)) * 100)}th
                percentile. His weakest discipline would be a top-quartile strength for most champions.
              </p>
              <div className="callout">
                Both men are era-proof. The models disagree about the order only in how much they reward
                longevity against peak dominance — see the{' '}
                <Link href="/goat">full GOAT table</Link>.
              </div>
            </div>
            <div className="card">
              <h3 style={{ marginBottom: '0.8rem' }}>{goat.name} — domain profile</h3>
              <DomainProfile domains={goat.domains} meta={a.domains} exposure={goat.domainExposure} />
              <p className="faint" style={{ marginTop: '0.9rem', marginBottom: 0 }}>
                Career percentile against the field in each domain, weighted by how much the Games
                actually tested it.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">Consensus of three models</div>
          <h2>Top ten, all time</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Athlete</th>
                  <th>Years</th>
                  <th>Titles</th>
                  <th>Podiums</th>
                  <th>Pct</th>
                  <th>Official</th>
                  <th>Z</th>
                  <th>Spread</th>
                  <th>Strongest</th>
                  <th>Weakest</th>
                </tr>
              </thead>
              <tbody>
                {top.map((c) => (
                  <tr key={c.competitorId}>
                    <td className={`rank-cell rank-${c.goatRank}`}>{c.goatRank}</td>
                    <td>
                      <Link href={`/athletes/${c.competitorId}`} className="athlete-link">
                        {c.name}
                      </Link>
                    </td>
                    <td className="num">
                      {c.years[0]}–{c.years[c.years.length - 1]}
                    </td>
                    <td className="num">{c.titles || '—'}</td>
                    <td className="num">{c.podiums || '—'}</td>
                    <td className="num">{c.models!.percentile.rank}</td>
                    <td className="num">{c.models!.official.rank}</td>
                    <td className="num">{c.models!.zscore.rank}</td>
                    <td className="num" style={{ color: c.consensus!.spread > 4 ? 'var(--gold)' : undefined }}>
                      {c.consensus!.spread}
                    </td>
                    <td>
                      <DomainChip career={c} meta={a.domains} pick="best" />
                    </td>
                    <td>
                      <DomainChip career={c} meta={a.domains} pick="worst" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="faint" style={{ marginTop: '0.7rem' }}>
            Pct / Official / Z are each model&apos;s independent ranking. Spread is the gap between the
            most and least favourable — a high spread means the models genuinely disagree about that
            athlete.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <div className="eyebrow">Era transplant</div>
          <h2>Who was era-proof?</h2>
          <p className="lede">
            Each athlete&apos;s career domain profile is projected onto every other year&apos;s actual
            event mix, then scored against that year&apos;s real field. Dropped in alone, these men
            project to a podium in every Games ever held.
          </p>
          <div className="grid grid-3" style={{ marginTop: '1.2rem' }}>
            {universal.map((c) => (
              <div className="card" key={c.competitorId}>
                <Link href={`/athletes/${c.competitorId}`} className="athlete-link">
                  {c.name}
                </Link>
                <div className="faint" style={{ marginBottom: '0.6rem' }}>
                  competed {c.years[0]}–{c.years[c.years.length - 1]}
                </div>
                <div className="pill-row">
                  <span className="pill pill-strong">
                    wins {c.transplantSummary!.wouldWin}/{c.transplants!.length}
                  </span>
                  <span className="pill">mean {c.transplantSummary!.meanFinish}</span>
                </div>
              </div>
            ))}
          </div>
          <p style={{ marginTop: '1.2rem' }}>
            <Link href="/transplant" className="back-link">
              See the full era-transplant grid →
            </Link>
          </p>
        </div>
      </section>

      <section style={{ borderBottom: 'none' }}>
        <div className="wrap">
          <div className="grid grid-2">
            <div>
              <div className="eyebrow">What the Games tested</div>
              <h2>The sport changed underneath them</h2>
              <p className="muted">
                Every era weighted the domains differently — the {firstYear}s leaned on skills tests and
                odd objects, the mid-2010s on swimming and long endurance, the {lastYear} format on
                machines and heavy barbell. That drift is exactly why raw finishing places do not
                compare across years, and why the analysis is built on domains.
              </p>
              <p>
                <Link href="/events" className="back-link">
                  Browse all {totalEvents} events →
                </Link>
              </p>
            </div>
            <div className="card" style={{ display: 'flex', justifyContent: 'center' }}>
              <DomainRadar domains={goat.domains} compare={second.domains} size={280} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/** An athlete's best or worst domain, as a coloured chip. */
function DomainChip({
  career,
  meta,
  pick,
}: {
  career: Career;
  meta: Record<string, { label: string }>;
  pick: 'best' | 'worst';
}) {
  const entries = Object.entries(career.domains) as [string, number][];
  if (!entries.length) return <span className="faint">—</span>;
  const sorted = entries.sort((x, y) => (pick === 'best' ? y[1] - x[1] : x[1] - y[1]));
  const [key, value] = sorted[0];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
      <span className="dot" style={{ background: domainColor(key) }} />
      <span style={{ fontSize: '0.83rem' }}>{meta[key]?.label ?? key}</span>
      <span className="num" style={{ color: 'var(--text-faint)' }}>
        p{Math.round(value * 100)}
      </span>
    </span>
  );
}
