# CrossFit Games — Cross-Era Analysis

Every CrossFit Games event from 2011 to 2026 for **Individual Men**, tagged by fitness domain,
with a three-model analysis of who the greatest of all time is — and whether they'd still be
great dropped into any other era.

**The answer: Mathew Fraser**, unanimously across all three models, projected to podium in
all 16 Games ever held and win 11 of them outright — all 16 with the rest of the top-25
cohort dropped in beside him. Rich Froning is the only athlete close.

## What's here

| | |
|---|---|
| **16** Games | 2011–2026 |
| **218** events | 217 domain-tagged, 1 excluded (an aggregate column, not a real event) |
| **342** athletes | 136 with enough appearances to rank |
| **7,625** event results | every man, every event, every year |
| **11** fitness domains | endurance, running, swimming, machines, sprint, max strength, weightlifting, gymnastics, odd object, skill, grip |
| **74** movements | parsed from the published workout descriptions, 607 appearances |

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

Two traps worth knowing if you extend the vocabulary in
[`scripts/lib/movements.mjs`](scripts/lib/movements.mjs):

- **Order matters.** Matching runs top to bottom and blanks out the text it consumes, so specific
  variants must precede generic ones — otherwise `chest-to-bar pull-up` also registers a plain
  `pull-up`, and `dumbbell snatch` registers a barbell `snatch`.
- **The pages are full of non-breaking spaces.** A literal `" "` in a pattern does not match
  U+00A0, which silently hid `overhead·squat` until it was traced by character code. Input is
  now whitespace-normalised first.

Some events name their movement only in the title — "2020 Speed Snatch" and "Cyclocross" describe
the format and course but never the movement — so the event name is scanned alongside the
description.

An athlete's standing in a movement is their mean percentile across every event containing it,
era-adjusted, with a four-event minimum to be ranked.

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

Rather than pick one definition of greatness, three are computed independently on deliberately
different information, so agreement means something and disagreement is displayed rather than hidden.

| Model | Rates a season by | Blind spot it covers |
|---|---|---|
| **Percentile** | Field-normalised placing per event | Era-neutral; ignores margin |
| **Official** | CrossFit's own points and finish | Matches the record books |
| **Z-score** | Standardised margin on the raw score, clamped to ±3 SD | Rewards *how much* you won by |

Each scores a career on the same four axes, so no single one can carry it:

| Axis | Weight | What it measures |
|---|---|---|
| Quality | 30% | Average season |
| Peak | 20% | Mean of their best three years |
| Volume | 20% | Accumulated, damped by a square root |
| Hardware | 30% | Title 10, non-title podium 3, non-podium top ten 1, event win 0.5 |

A title counts *separately* from a podium rather than as a bonus on top of one — winning the
Games is categorical, not just a very good placing. Volume is damped so an eleventh appearance
cannot outweigh winning twice; an earlier version of this model had exactly that failure,
ranking a title-less ten-appearance career above a two-time champion.

The headline ranking is the mean of the three model ranks.

Because Games points events have scored both high-is-good (skills tests) and low-is-good
(speed ladders), the z-score model **infers scoring direction per event** from how raw scores
track against finishing rank rather than assuming it.

## Strength of field

A percentile only means something relative to whoever turned up. The correction comes from
athletes who competed in more than one year: if the same competitors score consistently lower
in one year than another, the difference is the field, not them.

Fitting `season = ability − strength(year)` across every athlete-season by alternating least
squares — the bridging idea used to carry chess or baseball ratings across eras — gives each
year a depth rating in SD units, and every season score is adjusted by it before the models run.

The trend is upward, which is the expected result and a reasonable check that the method works:
2011 and 2012 are the shallowest fields, 2026 the strongest. **2019 is an extreme outlier at
−0.77 and it is not an error** — that year every national champion qualified, so 144 men started
against a normal field of about 40, and beating 90% of that field was genuinely easier.

## Cut formats and the 2020 two-stage Games

Most Games since 2019 eliminate athletes partway through, and 2020 ran an online Stage 1 for all
30 men before sending only the top five to the Ranch (all of it is in the dataset — the events
page shows how many were still in for each event).

Scoring an event against only the athletes still in it turns surviving a cut into a punishment:
fifth of the five 2020 finalists scored a percentile of zero, identical to finishing last of 144.
Events are therefore scored against the **year's full starting field**, with eliminated athletes
treated as behind everyone still competing — which is what the cut itself asserts. The 2020
runner-up went from a season percentile of 52 to 83.

## The era transplant

Each athlete's career yields a percentile in each domain. For a target year, every event is
scored by combining those percentiles in the proportions that event tested, then the resulting
season score is ranked against that year's real field.

Both sides of that comparison are era-adjusted onto one all-time scale. An earlier version
ranked the projection against *raw* season percentiles, whose scale swings with field size —
in 2019's 144-man field, finishing tenth still meant beating 134 men, so sixteen season
scores landed above Fraser's projection in the year he actually won. Because the adjustment
is a monotone within-year transform, the real field's internal order is untouched; the fix
only puts the projection on the same footing. Calibration is published in the output:
projecting each top-25 athlete into the years they actually competed reproduces their real
finish to a mean absolute error of about 5.6 places, with no year systematically biased.

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
- Retroactive disqualifications appear as the API reports them.
- Individual Men only, as scoped. `DIVISION` in `scripts/fetch-games.mjs` is a one-line change
  for women (2) or teams (11).

## Data source

The public API behind games.crossfit.com:

- `competitions/v1/competitions/games/{year}/workouts` — event names
- `leaderboards/v2/competitions/games/{year}/leaderboards?division=1` — placings and scores

Raw payloads land in `data/raw/` (gitignored, reproducible with `npm run fetch`).
