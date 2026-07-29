import Link from 'next/link';
import { getAnalysis } from '@/lib/data';

export const metadata = { title: 'Methodology — CrossFit Games' };

export default async function MethodologyPage() {
  const a = await getAnalysis();
  const curated = a.years.flatMap((y) => y.events).filter((e) => e.tagSource === 'curated').length;
  const inferred = a.years.flatMap((y) => y.events).filter((e) => e.tagSource === 'inferred').length;

  return (
    <>
      <section>
        <div className="wrap">
          <div className="eyebrow">How this was built</div>
          <h1>Methodology</h1>
          <p className="lede">
            Everything here is reproducible from three scripts and one editable file of judgement calls.
            Where interpretation was required, it is isolated and labelled rather than buried.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>1. The data</h2>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            Pulled from the same public API that powers games.crossfit.com — the competition workouts
            feed for event names, and the v2 leaderboard feed for placings and scores, paginated where
            needed. {a.years.length} Games, {a.allAthletes.length} men, every event score, plus athlete
            height, weight, age, country and affiliate.
          </p>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            The fetch asserts that the number of events for a year matches the number of leaderboard
            score columns, and aborts if they ever disagree — otherwise every score would silently
            attach to the wrong event.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>2. Domain tagging</h2>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            The API gives event names but not workout descriptions, so tagging is a hybrid.{' '}
            <strong>{curated}</strong> of {curated + inferred} events are hand-curated from the published
            workout descriptions and stored in a single editable file;{' '}
            <strong>{inferred}</strong> fall through to an automatic classifier that reads the event name
            and score format. Every event on the <Link href="/events">events page</Link> shows which it
            is.
          </p>
          <div className="card" style={{ maxWidth: 640, marginTop: '1rem' }}>
            <div className="faint" style={{ marginBottom: '0.5rem' }}>
              data/event-domains.overrides.json
            </div>
            <pre
              style={{
                margin: 0,
                fontFamily: 'var(--mono)',
                fontSize: '0.8rem',
                color: 'var(--text-dim)',
                overflowX: 'auto',
              }}
            >{`"2015|Murph": {
  "endurance": 0.35,
  "gymnastics": 0.35,
  "running": 0.30
}`}</pre>
          </div>
          <p className="muted" style={{ maxWidth: '70ch', marginTop: '1rem' }}>
            Weights are normalised to sum to 1.0, so every event contributes exactly one event&apos;s
            worth of signal spread across what it tested. Disagree with a tag? Edit the file and re-run{' '}
            <code>npm run build:data</code> — the whole analysis regenerates.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>3. Three models, one consensus</h2>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            Rather than pick a single definition of greatness, three are computed independently. They
            are built on deliberately different information, so agreement is meaningful and disagreement
            is shown rather than hidden.
          </p>
          <div className="grid grid-3" style={{ marginTop: '1.2rem' }}>
            {(Object.entries(a.methodology.models) as [string, string][]).map(([k, v]) => (
              <div className="card" key={k}>
                <h3 style={{ textTransform: 'capitalize' }}>{k}</h3>
                <p className="muted" style={{ fontSize: '0.88rem', marginBottom: 0, marginTop: '0.4rem' }}>
                  {v}
                </p>
              </div>
            ))}
          </div>
          <p className="muted" style={{ maxWidth: '70ch', marginTop: '1.2rem' }}>
            Each model blends quality ({Math.round(a.methodology.weights.quality * 100)}%), accumulated
            volume ({Math.round(a.methodology.weights.volume * 100)}%) and hardware —titles, podiums and
            event wins— ({Math.round(a.methodology.weights.hardware * 100)}%). Volume is what stops a
            single brilliant season outranking a decade; hardware is what stops a metronomic
            fourth-place career outranking a champion. {a.methodology.consensus}
          </p>
          <div className="callout" style={{ marginTop: '1rem' }}>
            One subtlety worth knowing: the z-score model measures margin on the raw score, so it
            rewards winning by a minute rather than by a second. Because points events at the Games have
            scored both high-is-good and low-is-good, the direction is inferred per event from how the
            scores track against finishing rank, not assumed.
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>4. The era transplant</h2>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            An athlete&apos;s career gives a percentile in each domain. For any target year, each event
            is scored by combining that athlete&apos;s domain percentiles in the proportions the event
            tested, and the resulting season score is ranked against that year&apos;s real field.
          </p>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            This answers a specific question — does the <em>shape</em> of this athlete&apos;s fitness fit
            that year&apos;s test — and deliberately not &ldquo;what would have happened on the day&rdquo;.
            It has no model of form, injury, tactics, heat structure, or the cut formats that ended some
            athletes&apos; competitions early.
          </p>
        </div>
      </section>

      <section style={{ borderBottom: 'none' }}>
        <div className="wrap">
          <h2>Known limitations</h2>
          <ul className="muted" style={{ maxWidth: '70ch', paddingLeft: '1.1rem' }}>
            <li>
              Field depth is not equalised. A p90 in 2011 came against a shallower field than a p90 in
              2024; the models measure position within the field of the day, not absolute standard.
            </li>
            <li>
              Domain weights are informed judgement, not measurement. They are the single largest
              subjective input, which is why they live in one editable file.
            </li>
            <li>
              An athlete with no exposure to a domain has no score in it, so their transplant into a
              year that leans on that domain rests on their other domains and is less certain.
            </li>
            <li>
              A disqualified season is reported by the API with no finishing place. It is treated as
              exactly that — no title, no podium, and scored as last in the official model — but the
              athlete&apos;s event scores remain in the field, because that is how everyone else that
              year was actually ranked.
            </li>
            <li>
              Only Individual Men are analysed, as scoped. The pipeline takes a division id, so women
              and teams are a one-line change.
            </li>
          </ul>
          <p style={{ marginTop: '1.4rem' }}>
            <Link href="/goat" className="back-link">
              ← Back to the GOAT table
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
