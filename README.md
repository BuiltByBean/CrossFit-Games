# CrossFit Games — Cross-Era Analysis

Every CrossFit Games event from 2011 to 2026 for **Individual Men**, tagged by fitness domain,
with a three-model analysis of who the greatest of all time is — and whether they'd still be
great dropped into any other era.

**The answer: Mathew Fraser**, unanimously across all three models, projected to podium in
all 16 Games ever held and win 10 of them. Rich Froning is the only athlete close.

## What's here

| | |
|---|---|
| **16** Games | 2011–2026 |
| **218** events | 217 domain-tagged, 1 excluded (an aggregate column, not a real event) |
| **347** athletes | 136 with enough appearances to rank |
| **7,625** event results | every man, every event, every year |
| **11** fitness domains | endurance, running, swimming, machines, sprint, max strength, weightlifting, gymnastics, odd object, skill, grip |

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
| `npm run tag` | Applies fitness-domain weights to all 198 events |
| `npm run analyze` | Computes the three models, consensus GOAT ranking and era transplants |

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

Each blends career quality (45%), accumulated volume (35%) and hardware — titles, podiums,
event wins (20%). Volume stops one brilliant season outranking a decade; hardware stops a
metronomic fourth-place career outranking a champion. The headline ranking is the mean of the
three model ranks.

Because Games points events have scored both high-is-good (skills tests) and low-is-good
(speed ladders), the z-score model **infers scoring direction per event** from how raw scores
track against finishing rank rather than assuming it.

## The era transplant

Each athlete's career yields a percentile in each domain. For a target year, every event is
scored by combining those percentiles in the proportions that event tested, then the resulting
season score is ranked against that year's real field.

This answers *"does the shape of this athlete's fitness fit that year's test"* — not *"what
would have happened on the day"*. There is no model of form, injury, tactics, or the cut
formats that ended some athletes' competitions early.

## Limitations

- Field depth is not equalised — a p90 in 2011 came against a shallower field than a p90 in 2026.
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
