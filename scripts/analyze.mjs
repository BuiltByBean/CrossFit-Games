/**
 * Builds the cross-era analysis from data/games.json into data/analysis.json.
 *
 *   node scripts/analyze.mjs
 *
 * Three independent models rate every athlete-year, then a consensus is taken.
 * They are deliberately built on different information so that agreement means
 * something and disagreement is worth showing:
 *
 *   percentile  field-normalised placing   — era-neutral, ignores margin
 *   official    CrossFit's own points/rank — matches the record books
 *   zscore      margin against the field   — rewards how *much* you won by
 *
 * The domain profile and the era-transplant simulation both run off the
 * percentile model, because it is the only one that is unit-free across
 * every scoring format the Games has used since 2011.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAINS, DOMAIN_KEYS, parseSeconds } from './lib/domains.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLAMP_Z = 3;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, n = 4) => (v == null ? null : Number(v.toFixed(n)));

/** Parse a score display into a comparable number, whatever its unit. */
function parseValue(display) {
  if (!display) return null;
  if (/^CAP/i.test(display)) return null; // capped: no comparable magnitude
  const secs = parseSeconds(display);
  if (secs != null) return secs;
  const m = String(display).match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '')) : null;
}

/**
 * Whether a larger raw value is a better result, inferred empirically from
 * how value tracks against finishing rank. Points events go both ways at the
 * Games (speed ladders score low-is-good, skill tests high-is-good), so this
 * is measured rather than assumed.
 */
function higherIsBetter(pairs) {
  if (pairs.length < 3) return true;
  const vs = pairs.map((p) => p.value);
  const rs = pairs.map((p) => p.rank);
  const mv = mean(vs);
  const mr = mean(rs);
  const cov = mean(pairs.map((p) => (p.value - mv) * (p.rank - mr)));
  // rank 1 is best, so a negative covariance means big value -> good rank
  return cov < 0;
}

function buildEventStats(year) {
  const stats = new Map();

  for (const ev of year.events) {
    if (ev.exclude) continue;
    const entries = year.athletes
      .map((a) => ({ athlete: a, score: a.scores.find((s) => s.ordinal === ev.ordinal) }))
      .filter((e) => e.score && e.score.rank != null && e.score.rank > 0);

    const N = entries.length;
    if (N < 2) continue;

    const parsed = entries
      .map((e) => ({ id: e.athlete.competitorId, rank: e.score.rank, value: parseValue(e.score.display) }))
      .filter((p) => p.value != null && Number.isFinite(p.value));

    const coverage = parsed.length / N;
    const useValues = coverage >= 0.7;
    const hib = useValues ? higherIsBetter(parsed) : true;

    // z-scores: on raw margin where the field is well covered, else on rank
    let zById = new Map();
    if (useValues) {
      const vals = parsed.map((p) => p.value);
      const m = mean(vals);
      const s = sd(vals);
      const worstZ = -CLAMP_Z;
      for (const p of parsed) {
        const raw = s > 0 ? (p.value - m) / s : 0;
        zById.set(p.id, clamp(hib ? raw : -raw, -CLAMP_Z, CLAMP_Z));
      }
      // capped / unparseable athletes sit at the bottom of the event
      for (const e of entries) {
        if (!zById.has(e.athlete.competitorId)) zById.set(e.athlete.competitorId, worstZ);
      }
    } else {
      const ranks = entries.map((e) => e.score.rank);
      const m = mean(ranks);
      const s = sd(ranks);
      for (const e of entries) {
        const raw = s > 0 ? (m - e.score.rank) / s : 0;
        zById.set(e.athlete.competitorId, clamp(raw, -CLAMP_Z, CLAMP_Z));
      }
    }

    const pctById = new Map(
      entries.map((e) => [e.athlete.competitorId, N > 1 ? 1 - (e.score.rank - 1) / (N - 1) : 1]),
    );

    stats.set(ev.ordinal, { event: ev, fieldSize: N, pctById, zById, zBasis: useValues ? 'margin' : 'rank' });
  }

  return stats;
}

function analyseYear(year) {
  const stats = buildEventStats(year);
  const perAthlete = new Map();
  const maxPoints = Math.max(...year.athletes.map((a) => a.overallPoints ?? 0), 1);
  const field = year.athletes.length;

  for (const a of year.athletes) {
    const pcts = [];
    const zs = [];
    const domainNum = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
    const domainDen = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
    const events = [];

    for (const [, st] of stats) {
      const pct = st.pctById.get(a.competitorId);
      if (pct == null) continue;
      const z = st.zById.get(a.competitorId) ?? 0;
      pcts.push(pct);
      zs.push(z);
      events.push({
        ordinal: st.event.ordinal,
        name: st.event.name,
        rank: a.scores.find((s) => s.ordinal === st.event.ordinal)?.rank ?? null,
        display: a.scores.find((s) => s.ordinal === st.event.ordinal)?.display ?? null,
        fieldSize: st.fieldSize,
        percentile: round(pct),
        z: round(z),
        domains: st.event.domains,
      });
      for (const [d, w] of Object.entries(st.event.domains)) {
        domainNum[d] += w * pct;
        domainDen[d] += w;
      }
    }

    if (!pcts.length) continue;

    const domains = {};
    const exposure = {};
    for (const d of DOMAIN_KEYS) {
      if (domainDen[d] > 0) {
        domains[d] = round(domainNum[d] / domainDen[d]);
        exposure[d] = round(domainDen[d], 3);
      }
    }

    perAthlete.set(a.competitorId, {
      competitorId: a.competitorId,
      name: a.name,
      year: year.year,
      finish: a.overallRank,
      status: a.status ?? null,
      fieldSize: field,
      officialPoints: a.overallPoints,
      // three model scores, all normalised so 1.0 is the best possible year
      percentileScore: round(mean(pcts)),
      // A stripped result has no finishing place, so it is scored as last.
      officialScore: round(
        field > 1
          ? 0.5 * (1 - ((a.overallRank ?? field) - 1) / (field - 1)) +
              0.5 * ((a.overallPoints ?? 0) / maxPoints)
          : 1,
      ),
      zScore: round(mean(zs)),
      eventWins: events.filter((e) => e.rank === 1).length,
      domains,
      exposure,
      events,
    });
  }

  return perAthlete;
}

/** Normalise a set of raw values to [0,1] by min-max. */
function minmax(values) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return (v) => (hi > lo ? (v - lo) / (hi - lo) : 1);
}

function buildCareers(yearResults, dataset) {
  const careers = new Map();

  for (const [year, byAthlete] of yearResults) {
    for (const [id, r] of byAthlete) {
      if (!careers.has(id)) {
        careers.set(id, { competitorId: id, name: r.name, seasons: [], bio: null });
      }
      careers.get(id).seasons.push(r);
    }
  }

  // attach the most recent bio we have for each athlete
  for (const y of dataset.years) {
    for (const a of y.athletes) {
      const c = careers.get(a.competitorId);
      if (c) {
        c.name = a.name;
        c.bio = {
          country: a.country,
          countryCode: a.countryCode,
          affiliate: a.affiliate,
          age: a.age,
          heightIn: a.heightIn,
          weightLb: a.weightLb,
        };
      }
    }
  }

  for (const c of careers.values()) {
    c.seasons.sort((a, b) => a.year - b.year);
    c.appearances = c.seasons.length;
    c.years = c.seasons.map((s) => s.year);
    const placed = c.seasons.filter((s) => s.finish != null && s.finish >= 1);
    c.titles = placed.filter((s) => s.finish === 1).length;
    c.podiums = placed.filter((s) => s.finish <= 3).length;
    c.topTens = placed.filter((s) => s.finish <= 10).length;
    c.eventWins = c.seasons.reduce((n, s) => n + s.eventWins, 0);
    c.bestFinish = placed.length ? Math.min(...placed.map((s) => s.finish)) : null;
    c.disqualified = c.seasons.filter((s) => s.status === 'DQ').length;
    c.totalEvents = c.seasons.reduce((n, s) => n + s.events.length, 0);

    c.meanPercentile = round(mean(c.seasons.map((s) => s.percentileScore)));
    c.meanOfficial = round(mean(c.seasons.map((s) => s.officialScore)));
    c.meanZ = round(mean(c.seasons.map((s) => s.zScore)));
    c.peakPercentile = round(Math.max(...c.seasons.map((s) => s.percentileScore)));

    // accumulated value: quality summed over a career, so longevity counts
    c.totalPercentile = round(c.seasons.reduce((n, s) => n + s.percentileScore, 0));
    c.totalZ = round(c.seasons.reduce((n, s) => n + s.zScore, 0));

    // career domain profile, weighted by how much exposure each year gave
    const num = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
    const den = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
    for (const s of c.seasons) {
      for (const [d, v] of Object.entries(s.domains)) {
        const w = s.exposure[d] ?? 0;
        num[d] += v * w;
        den[d] += w;
      }
    }
    c.domains = {};
    c.domainExposure = {};
    for (const d of DOMAIN_KEYS) {
      if (den[d] > 0.5) {
        c.domains[d] = round(num[d] / den[d]);
        c.domainExposure[d] = round(den[d], 2);
      }
    }
  }

  return careers;
}

/**
 * Rank careers under each model, then take the consensus.
 *
 * Every model blends three things in the same proportions, so the only
 * difference between them is the underlying rating of an athlete-year:
 *   quality (how good they were when they showed up)
 *   volume  (how much of that they accumulated)
 *   hardware (titles, podiums, event wins)
 */
const W_QUALITY = 0.45;
const W_VOLUME = 0.35;
const W_HARDWARE = 0.2;

function scoreModel(careers, qualityOf, volumeOf) {
  const list = [...careers];
  const qn = minmax(list.map(qualityOf));
  const vn = minmax(list.map(volumeOf));
  const hn = minmax(list.map((c) => c.titles * 3 + c.podiums * 1.5 + c.eventWins * 0.25));

  return new Map(
    list.map((c) => [
      c.competitorId,
      W_QUALITY * qn(qualityOf(c)) +
        W_VOLUME * vn(volumeOf(c)) +
        W_HARDWARE * hn(c.titles * 3 + c.podiums * 1.5 + c.eventWins * 0.25),
    ]),
  );
}

function rankFrom(scoreMap) {
  const sorted = [...scoreMap.entries()].sort((a, b) => b[1] - a[1]);
  return new Map(sorted.map(([id], i) => [id, i + 1]));
}

/**
 * Project an athlete's career domain profile onto another year's event mix,
 * then read off where that would have placed in that year's actual field.
 */
function transplant(career, year, yearResults) {
  const actual = yearResults.get(year.year);
  if (!actual) return null;

  const perEvent = [];
  for (const ev of year.events) {
    if (ev.exclude || !Object.keys(ev.domains).length) continue;
    let num = 0;
    let den = 0;
    for (const [d, w] of Object.entries(ev.domains)) {
      const v = career.domains[d];
      if (v == null) continue;
      num += w * v;
      den += w;
    }
    if (den <= 0) continue;
    // coverage: how much of this event's demand the athlete has a record in
    perEvent.push({ ordinal: ev.ordinal, name: ev.name, projected: num / den, coverage: den });
  }

  if (!perEvent.length) return null;

  const projectedScore = mean(perEvent.map((e) => e.projected));
  const fieldScores = [...actual.values()].map((r) => r.percentileScore).sort((a, b) => b - a);
  // finishing place = how many of that year's field would still have beaten them, plus one
  const projectedFinish = fieldScores.filter((s) => s > projectedScore).length + 1;

  const strongest = [...perEvent].sort((a, b) => b.projected - a.projected).slice(0, 3);
  const weakest = [...perEvent].sort((a, b) => a.projected - b.projected).slice(0, 3);

  return {
    year: year.year,
    projectedScore: round(projectedScore),
    projectedFinish,
    fieldSize: fieldScores.length,
    actualFinish: actual.get(career.competitorId)?.finish ?? null,
    actualStatus: actual.get(career.competitorId)?.status ?? null,
    competed: actual.has(career.competitorId),
    coverage: round(mean(perEvent.map((e) => Math.min(1, e.coverage))), 3),
    strongest: strongest.map((e) => ({ name: e.name, projected: round(e.projected) })),
    weakest: weakest.map((e) => ({ name: e.name, projected: round(e.projected) })),
  };
}

async function main() {
  const dataset = JSON.parse(await readFile(join(ROOT, 'data', 'games.json'), 'utf8'));

  const yearResults = new Map();
  for (const y of dataset.years) yearResults.set(y.year, analyseYear(y));

  const careers = buildCareers(yearResults, dataset);

  // Only athletes with a real body of work can be ranked as the GOAT; the rest
  // stay in the dataset but are excluded from the headline table.
  const MIN_APPEARANCES = 2;
  const eligible = [...careers.values()].filter((c) => c.appearances >= MIN_APPEARANCES);

  const models = {
    percentile: scoreModel(eligible, (c) => c.meanPercentile, (c) => c.totalPercentile),
    official: scoreModel(eligible, (c) => c.meanOfficial, (c) => c.meanOfficial * c.appearances),
    zscore: scoreModel(eligible, (c) => c.meanZ, (c) => c.totalZ),
  };
  const ranks = Object.fromEntries(Object.entries(models).map(([k, m]) => [k, rankFrom(m)]));

  for (const c of eligible) {
    c.models = {
      percentile: { score: round(models.percentile.get(c.competitorId)), rank: ranks.percentile.get(c.competitorId) },
      official: { score: round(models.official.get(c.competitorId)), rank: ranks.official.get(c.competitorId) },
      zscore: { score: round(models.zscore.get(c.competitorId)), rank: ranks.zscore.get(c.competitorId) },
    };
    const rs = [c.models.percentile.rank, c.models.official.rank, c.models.zscore.rank];
    c.consensus = {
      meanRank: round(mean(rs), 2),
      spread: Math.max(...rs) - Math.min(...rs),
      score: round(mean([c.models.percentile.score, c.models.official.score, c.models.zscore.score])),
    };
  }

  eligible.sort((a, b) => a.consensus.meanRank - b.consensus.meanRank || b.consensus.score - a.consensus.score);
  eligible.forEach((c, i) => {
    c.goatRank = i + 1;
  });

  // Era transplant: run the top careers through every Games year.
  const topForTransplant = eligible.slice(0, 25);
  for (const c of topForTransplant) {
    c.transplants = dataset.years.map((y) => transplant(c, y, yearResults)).filter(Boolean);
    const finishes = c.transplants.map((t) => t.projectedFinish);
    c.transplantSummary = {
      meanFinish: round(mean(finishes), 2),
      bestYear: c.transplants.reduce((a, b) => (b.projectedFinish < a.projectedFinish ? b : a)).year,
      worstYear: c.transplants.reduce((a, b) => (b.projectedFinish > a.projectedFinish ? b : a)).year,
      wouldWin: c.transplants.filter((t) => t.projectedFinish === 1).length,
      wouldPodium: c.transplants.filter((t) => t.projectedFinish <= 3).length,
    };
  }

  // Per-year domain composition, for the "what did this era test" view
  const yearSummaries = dataset.years.map((y) => {
    const totals = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
    let n = 0;
    for (const ev of y.events) {
      if (ev.exclude) continue;
      n += 1;
      for (const [d, w] of Object.entries(ev.domains)) totals[d] += w;
    }
    const champion = [...(yearResults.get(y.year)?.values() ?? [])].find((r) => r.finish === 1);
    return {
      year: y.year,
      eventCount: n,
      fieldSize: y.fieldSize,
      champion: champion ? { name: champion.name, competitorId: champion.competitorId } : null,
      domainMix: Object.fromEntries(
        Object.entries(totals)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => [k, round(v / n)]),
      ),
      events: y.events.map((ev) => ({
        ordinal: ev.ordinal,
        name: ev.name,
        scoreFormat: ev.scoreFormat,
        medianSeconds: ev.medianSeconds,
        domains: ev.domains,
        tagSource: ev.tagSource,
        note: ev.note ?? null,
        exclude: !!ev.exclude,
        winner:
          [...(yearResults.get(y.year)?.values() ?? [])].find((r) =>
            r.events.some((e) => e.ordinal === ev.ordinal && e.rank === 1),
          )?.name ?? null,
      })),
    };
  });

  const out = {
    generatedAt: new Date().toISOString(),
    source: dataset.source,
    division: dataset.division,
    domains: DOMAINS,
    methodology: {
      models: {
        percentile: 'Field-normalised placing per event (winner 1.0, last 0.0), averaged.',
        official: "CrossFit's own finishing position and points total for the season.",
        zscore: 'Standardised margin against the field on the raw score, clamped to ±3 SD.',
      },
      weights: { quality: W_QUALITY, volume: W_VOLUME, hardware: W_HARDWARE },
      minAppearances: MIN_APPEARANCES,
      consensus: 'Mean of the three model ranks; ties broken by mean model score.',
    },
    years: yearSummaries,
    goat: eligible,
    allAthletes: [...careers.values()].map((c) => ({
      competitorId: c.competitorId,
      name: c.name,
      appearances: c.appearances,
      years: c.years,
      bestFinish: c.bestFinish,
      titles: c.titles,
      podiums: c.podiums,
      eventWins: c.eventWins,
      meanPercentile: c.meanPercentile,
      domains: c.domains,
      bio: c.bio,
      goatRank: c.goatRank ?? null,
    })),
  };

  await writeFile(join(ROOT, 'data', 'analysis.json'), JSON.stringify(out, null, 2));

  // Flat, complete results for database seeding — every athlete, not just the
  // ranked ones, so the relational tables cover the whole leaderboard.
  const flatSeasons = [];
  for (const [, byAthlete] of yearResults) {
    for (const [, r] of byAthlete) {
      flatSeasons.push({
        competitorId: r.competitorId,
        year: r.year,
        finish: r.finish,
        fieldSize: r.fieldSize,
        officialPoints: r.officialPoints,
        percentileScore: r.percentileScore,
        officialScore: r.officialScore,
        zScore: r.zScore,
        eventWins: r.eventWins,
        domains: r.domains,
        events: r.events.map((e) => ({
          ordinal: e.ordinal,
          rank: e.rank,
          display: e.display,
          percentile: e.percentile,
          z: e.z,
        })),
      });
    }
  }
  await writeFile(
    join(ROOT, 'data', 'results.json'),
    JSON.stringify({ generatedAt: out.generatedAt, seasons: flatSeasons }, null, 2),
  );

  console.log(`Analysed ${careers.size} athletes; ${eligible.length} eligible for the GOAT table.\n`);
  console.log('Consensus top 15:');
  console.log('  #   athlete                   apps  titles  pct  off    z   spread');
  for (const c of eligible.slice(0, 15)) {
    console.log(
      `  ${String(c.goatRank).padStart(2)}  ${c.name.padEnd(24)} ${String(c.appearances).padStart(4)} ` +
        `${String(c.titles).padStart(7)}  ${String(c.models.percentile.rank).padStart(3)} ` +
        `${String(c.models.official.rank).padStart(4)} ${String(c.models.zscore.rank).padStart(4)} ` +
        `${String(c.consensus.spread).padStart(7)}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
