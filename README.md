# CrossFit Games — Cross-Era Analysis

Every CrossFit Games event from 2011 to 2026 for **Individual Men**, tagged by fitness domain,
with a three-model analysis of who the greatest of all time is — and whether they'd still be
great dropped into any other era.

**The answer: Mathew Fraser**, unanimously across all three models, projected to win every
one of the 16 Games ever held — alone against each year's real field, and with the rest of
the top-25 cohort dropped in beside him. Rich Froning is the only athlete close.

## What's here

| | |
|---|---|
| **16** Games | 2011–2026 |
| **218** events | 217 domain-tagged, 1 excluded (an aggregate column, not a real event) |
| **342** athletes | 135 with enough appearances to rank |
| **7,319** event results | every event an athlete actually contested (the API's placeholder rows for cut/withdrawn athletes are dropped, and a handful of entrants never started) |
| **11** fitness domains | endurance, running, swimming, machines, sprint, max strength, weightlifting, gymnastics, odd object, skill, grip |
| **79** movements | parsed from the published workout descriptions, 601 appearances |

## Quick start

```bash
npm install
npm run dev
```

The site reads the committed `data/analysis.json`, so it runs with no database and no
network access.

## Rebuilding the data

```bash
npm run build:data
```

Runs three steps, each independently re-runnable:

| Script | Does |
|---|---|
| `npm run fetch` | Pulls every year from the public games.crossfit.com API into `data/games.json`. Discovers the latest completed Games automatically — set `LAST_YEAR` to pin it |
| `npm run fetch:workouts` | Scrapes the published workout descriptions, which the API never exposes |
| `npm run tag` | Applies fitness-domain weights to every event |
| `npm run tag:movements` | Matches descriptions to events and extracts the movements in each |
| `npm run analyze` | Computes the three models, consensus GOAT ranking, era transplants and movement analysis |

`fetch` asserts that each year's event count matches its leaderboard score columns and aborts
if they ever disagree — without that check, every score would silently attach to the wrong event.

### Changing the domain tags

The one genuinely subjective input lives in a single file:
[`data/event-domains.overrides.json`](data/event-domains.overrides.json).

```json
"2015|Murph": { "endurance": 0.35, "gymnastics": 0.35, "running": 0.30 }
```

Weights are normalised to sum to 1.0, so write them as rough proportions. Anything not listed
falls through to the automatic classifier in `scripts/lib/domains.mjs` and is flagged
`inferred` in the UI. Edit, run `npm run build:data`, and the whole analysis regenerates.

### Split athlete identities

CrossFit occasionally reissues an athlete a new `competitorId`, which splits one career
across several records — and because short fragments fall below the minimum-appearances
threshold, the athlete's best season can vanish from the ranking entirely. Josh Bridges'
2011 runner-up finish was recorded under a different id from the rest of his career.

[`data/athlete-aliases.json`](data/athlete-aliases.json) maps duplicates onto a canonical id,
with the evidence for each merge. `npm run fetch` reports any suspected split not listed
there — same name, different ids, no overlapping years — so new ones surface instead of
sitting unnoticed. The fetch also aborts if merging ever puts one athlete in a year twice,
which would mean two different people were being collapsed into one.

## Movements

The leaderboard API exposes event names but never the workouts, so movements come from scraping
the public workout pages — one `<li id="eventRow…>` per event, description included. All 217
events match a description, and every one yields at least one movement.

Three traps worth knowing if you extend the vocabulary in
[`scripts/lib/movements.mjs`](scripts/lib/movements.mjs):

- **Order matters.** Matching runs top to bottom and blanks out the text it consumes, so specific
  variants must precede generic ones — otherwise `chest-to-bar pull-up` also registers a plain
  `pull-up`, and `dumbbell snatch` registers a barbell `snatch`.
- **The pages are full of non-breaking spaces.** A literal `" "` in a pattern does not match
  U+00A0, which silently hid `overhead·squat` until it was traced by character code. Input is
  now whitespace-normalised first.
- **Narration lies.** The scraped pages mix the workout prescription with flow notes, tie-break
  rules and references to other events ("the reverse order that they finish the run" made a 1RM
  deadlift ladder a running event). A movement only counts from a sentence that carries a rep,
  distance or load figure; descriptions covering two events are split on their "Event N:"
  headings first.

Some events name their movement only in the title — "2020 Speed Snatch" and "Cyclocross" describe
the format and course but never the movement — so the event name is scanned alongside the
description and is exempt from the digit rule.

An athlete's standing in a movement is their mean percentile across the events containing it,
era-adjusted, with a four-event minimum to be ranked — and only events where at least half of
the year's field was still competing count, because percentiles are scored against the full
starting field: a 10-man final of a 144-man year has a floor of p94, and attendance at post-cut
events was buying elite movement scores regardless of how anyone actually moved.

## Railway Postgres

```bash
cp .env.example .env      # paste your Railway DATABASE_URL
npm run db:setup          # prisma db push + seed
```

`db:setup` creates the schema and loads it. The seed is idempotent — safe to re-run after
any rebuild.

Two shapes are stored on purpose:

- **Relational tables** (`Year`, `Event`, `Athlete`, `Season`, `EventResult`) for querying —
  *"every swim event since 2011"*, *"Vellner's placings in gymnastics events"*.
- **`AnalysisSnapshot`**, one row holding the whole computed analysis, which is what the site
  reads so a page render is one query instead of a join across 7k result rows.

With `DATABASE_URL` set and seeded, the site reads Postgres; otherwise it falls back to the
committed JSON. The footer states which source is live.

### Deploying to Railway

Add a service pointing at this repo alongside your Postgres. Railway detects Next.js; set
`DATABASE_URL` to the Postgres service's **internal** URL (`postgres.railway.internal`).
Build `npm run build`, start `npm start`.

## The three models

Rather than pick one definition of greatness, three are computed on deliberately different
information about each season, so agreement means something and disagreement is displayed
rather than hidden.

| Model | Rates a season by | Blind spot it covers |
|---|---|---|
| **Percentile** | Field-normalised placing per event | Era-neutral; ignores margin |
| **Official** | CrossFit's finishing position, with points summed from per-event points | Closest to the record books |
| **Z-score** | Margin on the raw score, calibrated to the full starting field, clamped to ±3 SD | Rewards *how much* you won by |

The official model sums per-event points rather than trusting the leaderboard's season total,
because that total is finals-only in 2020 (literally 0 for ranks 6–30) and collapsed for cut
athletes in 2019 — identical finishes scored 2–3× apart across eras. A stripped (DQ) season
scores as last: no finishing place *and* no points.

Each model scores a career on the same four axes, so no single one can carry it:

| Axis | Weight | What it measures |
|---|---|---|
| Quality | 30% | Average season |
| Peak | 20% | Mean of their best three years (short careers padded with the pool median, so two-season careers don't double-count quality) |
| Volume | 20% | Accumulated, damped by a square root |
| Hardware | 30% | Title 10, non-title podium 3, non-podium top ten 1, event win 0.5 |

A title counts *separately* from a podium rather than as a bonus on top of one — winning the
Games is categorical, not just a very good placing. Volume is damped so an eleventh appearance
cannot outweigh winning twice; an earlier version of this model had exactly that failure,
ranking a title-less ten-appearance career above a two-time champion.

One deliberate exception to independence: the **hardware axis is identical in all three
models**, because what an athlete won is the record itself, not a model of it. The models
genuinely disagree only about how good each season was. Axes are normalised with a winsorised
floor (5th percentile) so a single fringe two-appearance career cannot compress every
contender's differences to a sliver — under plain min-max the hardware axis was carrying ~50%
of the effective weight instead of its nominal 30%.

The headline ranking is the mean of the three model ranks; exact ties share a rank.

Because Games points events have scored both high-is-good (skills tests) and low-is-good
(speed ladders), the z-score model **infers scoring direction per event** from how raw scores
track against finishing rank rather than assuming it. Displays with tiebreak parentheticals
("07:17.00 (03:28)", introduced in 2026) are stripped before parsing — an earlier version
parsed the leading minutes digit as the score, which inverted the inferred direction of four
2026 time events.

## Strength of field

A percentile only means something relative to whoever turned up. The correction comes from
athletes who competed in more than one year: if the same competitors score consistently lower
in one year than another, the difference is the field, not them.

Fitting `season = α(year) + β(year)·ability` across every multi-year athlete by alternating
least squares — the bridging idea used to carry chess or baseball ratings across eras — gives
each year a correction, and every season score is adjusted by it before the models run. Two
details matter:

- **A per-year slope, not just a shift.** 2019 inflated scores unevenly: elite returners
  gained about half an SD, midfield returners three times that, so a single subtraction
  over-corrects the podium and under-corrects the middle. The slope is fitted on the bridge
  athletes, shrunk toward 1 so sparse years cannot invent a wild rescale, and the adjustment
  stays monotone within a year.
- **One fit per model scale.** The 2019 inflation is mostly a property of the *percentile
  definition* — beating 90% of 144 men is easier than beating 90% of 40. Measured on the
  margin (z) scale it barely exists, and an earlier version that reused the percentile-fitted
  constant on z-scores penalised 2019 margins about twenty times harder than the drift
  actually measured there. Percentile, official and z each get their own fit.

The trend is upward, which is the expected result and a reasonable check that the method works:
the earliest fields rate shallow, the most recent among the strongest. **2019 is the outlier on
the percentile scale (−0.56 mean correction) and it is not an error** — that year every national
champion qualified, so 144 men started against a normal field of about 40, and beating 90% of
that field was genuinely easier.

## Cut formats and the 2020 two-stage Games

Most Games since 2019 eliminate athletes partway through, and 2020 ran an online Stage 1 for all
30 men before sending only the top five to the Ranch (all of it is in the dataset — the events
page shows how many were still in for each event).

Scoring an event against only the athletes still in it turns surviving a cut into a punishment:
fifth of the five 2020 finalists scored a percentile of zero, identical to finishing last of 144.
Events are therefore scored against the **year's full starting field**, with eliminated athletes
treated as behind everyone still competing — which is what the cut itself asserts. The 2020
runner-up went from a season percentile of 52 to 83. The z-score model shares the same frame:
margins measured among the survivors are affine-mapped to where that group's ranks sit in the
full field (expected order statistics), so fifth of the five best men alive is a top-five
margin result, not a −1.5 SD one — an earlier version applied the cut fix to percentiles only,
and the z model ranked the 2020 runner-up below five athletes he officially beat.

Two data traps handled here rather than inherited from the API: from 2021 the leaderboard emits
**placeholder score rows** for cut/withdrawn athletes (tied ranks, no result, zero points, for
events they never contested) — these are dropped, where an earlier version ingested them as real
last-place performances, including a fabricated posthumous season. And capped (CAP+) athletes
keep their leaderboard order in the z model via their rank's expected position, instead of all
being flattened to −3 SD.

## The era transplant

Each athlete's career yields a percentile in each domain. For a target year, every event is
scored by combining those percentiles in the proportions that event tested, then the resulting
season score is ranked against that year's real field.

Both sides of that comparison are era-adjusted onto one all-time scale. An earlier version
ranked the projection against *raw* season percentiles, whose scale swings with field size —
in 2019's 144-man field, finishing tenth still meant beating 134 men, so sixteen season
scores landed above Fraser's projection in the year he actually won. Because the adjustment
is a monotone within-year transform, the real field's internal order is untouched; the fix
only puts the projection on the same footing. The athlete's own actual season is excluded
from the field they are ranked against — without that, Fraser showed 2nd in four years he
won, beaten only by his own real season.

Calibration is published in the output and shown on the methodology page, measured honestly:
each top-25 athlete is projected into the seasons they actually finished using a profile
rebuilt **without** that season (leave-one-year-out), reproducing real finishes to a mean
absolute error of 4.7 places — about 12% of the field — with per-year biases listed rather
than claimed away.

This answers *"does the shape of this athlete's fitness fit that year's test"* — not *"what
would have happened on the day"*. There is no model of form, injury, tactics, or the cut
formats that ended some athletes' competitions early.

## Limitations

- Field strength is estimated, not measured. It assumes a returning athlete's ability is roughly
  stable year to year, which is untrue for anyone improving fast or declining, and
  single-appearance athletes contribute nothing to the bridge.
- The era transplant smooths a career into one domain profile, so it deliberately cannot see
  a single season's form — an athlete's best year will beat their own projection. The GOAT
  table scores seasons directly. They answer different questions and will not always agree.
- Domain weights are informed judgement, not measurement. That's why they're isolated in one file.
- An athlete with no exposure to a domain has no score in it; transplants into years leaning on
  that domain rest on their other domains and are less certain.
- A stripped (DQ) season is scored as last in the official model — no finishing place, no
  points — but the athlete's event results remain in everyone else's field, because that is
  how the rest of that year was actually ranked.
- Individual Men only, as scoped. `DIVISION` in `scripts/fetch-games.mjs` is a one-line change
  for women (2) or teams (11).

## Data source

The public API behind games.crossfit.com:

- `competitions/v1/competitions/games/{year}/workouts` — event names
- `leaderboards/v2/competitions/games/{year}/leaderboards?division=1` — placings and scores

Raw payloads land in `data/raw/` (gitignored, reproducible with `npm run fetch`).
