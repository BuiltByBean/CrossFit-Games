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
            The API gives event names but not workout descriptions, so tagging is a hybrid. Curated
            weights live in a single editable file; anything absent from it falls through to an
            automatic classifier that reads the event name and score format, and is flagged as
            inferred.{' '}
            {inferred === 0 ? (
              <>
                All <strong>{curated}</strong> scored events are currently hand-curated from the
                published workout descriptions, so nothing is running on the classifier — but the
                fallback stays, because a new Games arrives before anyone has tagged it.
              </>
            ) : (
              <>
                <strong>{curated}</strong> of {curated + inferred} are hand-curated and{' '}
                <strong>{inferred}</strong> are inferred.
              </>
            )}{' '}
            Every event on the <Link href="/events">events page</Link> shows which it is.
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
            Each model scores a career on the same four axes, so no single one can carry it:{' '}
            <strong>quality</strong> ({Math.round(a.methodology.weights.quality * 100)}%, average
            season), <strong>peak</strong> ({Math.round(a.methodology.weights.peak * 100)}%, mean of
            their best three), <strong>volume</strong> (
            {Math.round(a.methodology.weights.volume * 100)}%, accumulated with diminishing returns)
            and <strong>hardware</strong> ({Math.round(a.methodology.weights.hardware * 100)}%, what
            they actually won). {a.methodology.consensus}
          </p>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            Hardware is scored {a.methodology.hardwareScale.toLowerCase()} A title counts separately
            from a podium rather than as a bonus on top of one, because winning the Games is a
            categorical achievement and not just a very good placing. Volume is damped by a square
            root so that turning up an eleventh time cannot outweigh winning twice — an earlier
            version of this model had exactly that failure, ranking a title-less ten-appearance career
            above a two-time champion.
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
          <h2>4. Strength of field</h2>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            A percentile only means something relative to whoever turned up. Finishing p90 against the{' '}
            {a.years[0].year} field is not the same achievement as p90 against the{' '}
            {a.years[a.years.length - 1].year} field, so raw percentiles cannot be compared across eras.
          </p>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            The correction comes from athletes who competed in more than one year. If the same
            competitors score consistently lower in one year than another, the difference is the field,
            not them. Fitting <code>season = ability − strength(year)</code> across every athlete-season
            by alternating least squares — the same bridging idea used to carry chess or baseball
            ratings across eras — gives each year a depth rating, and every season score is adjusted by
            it before the models run.
          </p>

          <div className="table-scroll" style={{ marginTop: '1.2rem', maxWidth: 620 }}>
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Field</th>
                  <th>Strength</th>
                  <th style={{ width: '45%' }}></th>
                </tr>
              </thead>
              <tbody>
                {a.years.map((y) => (
                  <tr key={y.year}>
                    <td className="num">{y.year}</td>
                    <td className="num faint">{y.fieldSize}</td>
                    <td className="num" style={{ color: y.fieldStrength >= 0 ? 'var(--good)' : 'var(--gold)' }}>
                      {y.fieldStrength > 0 ? '+' : ''}
                      {y.fieldStrength.toFixed(2)}
                    </td>
                    <td>
                      <div style={{ position: 'relative', height: 8 }}>
                        <div
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: 0,
                            bottom: 0,
                            width: 1,
                            background: 'var(--line)',
                          }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            top: 0,
                            height: 8,
                            borderRadius: 2,
                            background: y.fieldStrength >= 0 ? 'var(--good)' : 'var(--gold)',
                            left: y.fieldStrength >= 0 ? '50%' : `${50 - Math.abs(y.fieldStrength) * 50}%`,
                            width: `${Math.abs(y.fieldStrength) * 50}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="muted" style={{ maxWidth: '70ch', marginTop: '1.2rem' }}>
            The trend is upward, which is the expected result and a decent check that the method
            works: the sport got deeper. {a.years[0].year} and {a.years[1].year} rate as the shallowest
            fields, {a.years[a.years.length - 1].year} the strongest.
          </p>
          <div className="callout">
            2019 is the outlier at {a.years.find((y) => y.year === 2019)?.fieldStrength.toFixed(2)}, and
            it is not an error. That year every national champion qualified, so 144 men started against
            a normal field of about 40. Most were nowhere near Games standard, which makes beating 90%
            of that field a genuinely easier thing to do — and the model discounts it accordingly.
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>5. Cut formats and the 2020 two-stage Games</h2>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            Most Games since 2019 eliminate athletes partway through, and 2020 ran an online Stage 1
            for all 30 men before sending only the top five to the Ranch. Scoring an event against
            just the athletes still in it turns surviving a cut into a punishment: fifth of the five
            2020 finalists would score a percentile of zero, identical to finishing last of 144.
          </p>
          <p className="muted" style={{ maxWidth: '70ch' }}>
            {a.methodology.percentileBasis} Athletes already eliminated are treated as behind everyone
            still competing, which is exactly what the cut itself asserts. Before this fix the 2020
            runner-up scored a season percentile of 52; he now scores 83.
          </p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>6. The era transplant</h2>
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
          <p className="muted" style={{ maxWidth: '70ch' }}>
            Both sides of the comparison sit on one era-adjusted scale. A raw percentile depends
            mechanically on how many men started — tenth of 2019&apos;s 144 still beat 134 of them —
            so a projection ranked against raw season scores under-placed everyone in big-field
            years. An earlier version of this model had exactly that failure, projecting Fraser
            ninth into 2019, a year he won. Era-adjusting the career profile and the field it is
            ranked against removes the bias without touching the real field&apos;s internal order.
          </p>
          {a.methodology.transplant.calibration && (
            <div className="callout" style={{ marginTop: '1rem' }}>
              The model is checked against reality: projecting each of the top{' '}
              {a.methodology.transplant.cohort} athletes into the years they actually competed
              reproduces their real finish to a mean absolute error of{' '}
              {a.methodology.transplant.calibration.meanAbsError} places across{' '}
              {a.methodology.transplant.calibration.n} athlete-years, with no year systematically
              biased. The residual disagreements are the point — they mark seasons where an athlete
              out- or under-performed the shape of their career.
            </div>
          )}
          <p className="muted" style={{ maxWidth: '70ch' }}>
            That projection is computed <strong>one athlete at a time</strong>, which means two men who
            would each have beaten everyone who actually competed both come out first — they are never
            measured against each other. To rank them properly, a second pass puts the top{' '}
            {a.methodology.transplant.cohort} careers in the same year simultaneously, against whatever
            remains of that year&apos;s real field, so exactly one athlete can win it. Both numbers are
            shown; the solo one is the better read on era fit, the head-to-head the better read on who
            beats whom.
          </p>
        </div>
      </section>

      <section style={{ borderBottom: 'none' }}>
        <div className="wrap">
          <h2>Known limitations</h2>
          <ul className="muted" style={{ maxWidth: '70ch', paddingLeft: '1.1rem' }}>
            <li>
              Field strength is estimated, not measured. It rests on the assumption that a returning
              athlete&apos;s underlying ability is roughly stable year to year, which is untrue for
              anyone improving fast or declining — and single-appearance athletes contribute nothing
              to the bridge at all.
            </li>
            <li>
              The era transplant smooths a whole career into one domain profile, so it cannot see a
              single season&apos;s form — an athlete&apos;s best year will beat their own projection.
              The GOAT table scores seasons directly. The two answer different questions and will
              not always agree.
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
              CrossFit sometimes reissues an athlete a new competitor id, splitting one career across
              several records. Five such duplicates are merged from a curated alias file, and the
              fetch reports any new suspect — same name, different ids, no overlapping years — rather
              than silently dropping a fragment below the ranking threshold.
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
