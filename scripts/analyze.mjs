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
 *   official    CrossFit's points system   — closest to the record books
 *   zscore      margin against the field   — rewards how *much* you won by
 *
 * The one axis they share on purpose is hardware: what an athlete actually won
 * is the record itself, not a model of it, so it enters all three identically.
 *
 * Each model's season scores are era-adjusted by a field strength fitted on
 * that model's own scale (see scripts/lib/field-strength.mjs) — a correction
 * measured on percentiles must not be transplanted onto margins.
 *
 * The domain profile and the era-transplant simulation both run off the
 * percentile model, because it is the only one that is unit-free across
 * every scoring format the Games has used since 2011.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAINS, DOMAIN_KEYS, parseSeconds } from './lib/domains.mjs';
import { fitProbabilityStrength, fitYearStrength, probit } from './lib/field-strength.mjs';
import { MOVEMENT_CATEGORIES, MOVEMENTS } from './lib/movements.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLAMP_Z = 3;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, n = 4) => (v == null ? null : Number(v.toFixed(n)));

/** Parse a score display into a comparable number, whatever its unit. */
function parseValue(display) {
  if (!display) return null;
  // 2026 added tiebreak splits to displays — "07:17.00 (03:28)". The
  // parenthetical is a different quantity and must never reach the parser:
  // before this strip, a failed time parse fell through to the numeric
  // fallback and returned the leading MINUTES digit as the score, which
  // inverted the inferred scoring direction of four 2026 time events.
  const s = String(display).replace(/\s*\([^)]*\)\s*$/, '');
  if (/^CAP/i.test(s)) return null; // capped: no comparable magnitude
  const secs = parseSeconds(s);
  if (secs != null) return secs;
  if (s.includes(':')) return null; // a time that failed to parse is not a number
  const m = s.match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '')) : null;
}

/**
 * From 2021 the API emits placeholder score rows for athletes who were cut or
 * withdrew — tied "behind the field" ranks with no display and zero points,
 * for events they never contested. Ingesting them fabricated last-place
 * performances (including a full posthumous 2024 season). They are dropped
 * everywhere; nothing an athlete never did is scored.
 */
function isPlaceholder(score) {
  if (score.rank == null || score.rank <= 0) return false;
  const disp = (score.display ?? '').trim();
  const noDisplay = !disp || /^(WD|DNS|DNF|--)$/i.test(disp);
  return noDisplay && (score.points ?? 0) <= 0;
}

const genuineScores = (athlete) =>
  athlete.scores.filter((s) => s.rank != null && s.rank > 0 && !isPlaceholder(s));

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

/**
 * Expected position of event-rank r in a year field of M, in SD units of a
 * standard-normal field: the probit of the midpoint percentile. This is the
 * common frame both z bases are calibrated to, so that a margin measured
 * among 5 finalists and a margin measured among 40 starters land on the same
 * scale — the finalists sit where a top-5-of-the-field group sits.
 */
const orderStat = (rank, M) => probit(1 - (rank - 0.5) / M);

function buildEventStats(year, yearField) {
  const stats = new Map();
  // Cut formats shrink the field as the competition goes on. Scoring an event
  // against only the athletes still in it makes surviving a cut a penalty:
  // 5th of the 5 finalists at the 2020 Games would score 0, the same as last
  // of 144 in 2019. Events are therefore scored against the year's full
  // starting field, with already-eliminated athletes treated as behind
  // everyone still competing — which is exactly what the cut itself asserts.
  // The z model shares the same frame via expected order statistics.

  for (const ev of year.events) {
    if (ev.exclude) continue;
    const entries = year.athletes
      .map((a) => ({ athlete: a, score: genuineScores(a).find((s) => s.ordinal === ev.ordinal) }))
      .filter((e) => e.score);

    const N = entries.length;
    if (N < 2) continue;

    const parsed = entries
      .map((e) => ({ id: e.athlete.competitorId, rank: e.score.rank, value: parseValue(e.score.display) }))
      .filter((p) => p.value != null && Number.isFinite(p.value));

    const coverage = parsed.length / N;
    const useValues = coverage >= 0.7;
    const hib = useValues ? higherIsBetter(parsed) : true;

    // z-scores: margins where the field is well covered, calibrated to the
    // full-field frame; expected order statistics otherwise. Capped and
    // unparseable athletes keep their leaderboard order (CAP+1 beats CAP+40)
    // instead of the flat -3 cliff an earlier version assigned them.
    const zById = new Map();
    if (useValues) {
      const vals = parsed.map((p) => p.value);
      const m = mean(vals);
      const s = sd(vals);
      const raw = parsed.map((p) => (s > 0 ? (hib ? p.value - m : m - p.value) / s : 0));
      const es = parsed.map((p) => orderStat(p.rank, yearField));
      const me = mean(es);
      const se = sd(es);
      const mz = mean(raw);
      const sz = sd(raw);
      parsed.forEach((p, i) => {
        // affine map: keep the observed margins' shape, but place the group's
        // location and spread where its ranks sit in the full field
        const z = sz > 0 ? me + (raw[i] - mz) * (se / sz) : es[i];
        zById.set(p.id, clamp(z, -CLAMP_Z, CLAMP_Z));
      });
      for (const e of entries) {
        if (!zById.has(e.athlete.competitorId)) {
          zById.set(e.athlete.competitorId, clamp(orderStat(e.score.rank, yearField), -CLAMP_Z, CLAMP_Z));
        }
      }
    } else {
      for (const e of entries) {
        zById.set(e.athlete.competitorId, clamp(orderStat(e.score.rank, yearField), -CLAMP_Z, CLAMP_Z));
      }
    }

    const pctById = new Map(
      entries.map((e) => [
        e.athlete.competitorId,
        yearField > 1 ? 1 - (e.score.rank - 1) / (yearField - 1) : 1,
      ]),
    );

    stats.set(ev.ordinal, {
      event: ev,
      fieldSize: N, // athletes still in the competition for this event
      yearField, // everyone who started the year
      pctById,
      zById,
      zBasis: useValues ? 'margin' : 'rank',
    });
  }

  return stats;
}

function analyseYear(year, log = console) {
  // The starting field is everyone who actually recorded an event result.
  // Entrants who never started (visa refusals, pre-event withdrawals) used to
  // inflate every percentile denominator by one or two.
  const starters = year.athletes.filter((a) => genuineScores(a).length > 0);
  for (const a of year.athletes) {
    if (!starters.includes(a)) {
      log.warn(`  dropped ${year.year}: ${a.name} (${a.competitorId}) — no scored events`);
    }
  }
  const field = starters.length;

  const stats = buildEventStats(year, field);
  const perAthlete = new Map();

  // Season points are summed from per-event points rather than trusting the
  // leaderboard's overallScore, which is finals-only in 2020 (literally 0 for
  // ranks 6-30) and collapsed for cut athletes in 2019. The sum reconciles
  // with overallScore in every ordinary year.
  const excluded = new Set(year.events.filter((e) => e.exclude).map((e) => e.ordinal));
  const pointsFor = (a) =>
    genuineScores(a)
      .filter((s) => !excluded.has(s.ordinal))
      .reduce((n, s) => n + Math.max(0, s.points ?? 0), 0);
  const maxPoints = Math.max(...starters.map(pointsFor), 1);

  for (const a of starters) {
    const pcts = [];
    const zs = [];
    const domainNum = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
    const domainDen = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
    const events = [];

    for (const [, st] of stats) {
      const pct = st.pctById.get(a.competitorId);
      if (pct == null) continue;
      const z = st.zById.get(a.competitorId) ?? 0;
      const score = a.scores.find((s) => s.ordinal === st.event.ordinal);
      pcts.push(pct);
      zs.push(z);
      events.push({
        ordinal: st.event.ordinal,
        name: st.event.name,
        rank: score?.rank ?? null,
        display: score?.display ?? null,
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

    // A stripped (DQ) result is scored as exactly that: no finishing place
    // AND no points — last in the official model, as the comment always
    // claimed but the points half previously ignored.
    const stripped = a.status === 'DQ';
    const points = stripped ? 0 : pointsFor(a);

    perAthlete.set(a.competitorId, {
      competitorId: a.competitorId,
      name: a.name,
      year: year.year,
      finish: a.overallRank,
      status: a.status ?? null,
      fieldSize: field,
      officialPoints: points,
      // three model scores; percentile and official are normalised so 1.0 is
      // the best possible year, z is in SD units against the year's field
      percentileScore: mean(pcts),
      officialScore:
        field > 1
          ? 0.5 * (1 - (((stripped ? null : a.overallRank) ?? field) - 1) / (field - 1)) +
            0.5 * (points / maxPoints)
          : 1,
      zScore: mean(zs),
      eventWins: events.filter((e) => e.rank === 1).length,
      domains,
      exposure,
      events,
    });
  }

  return perAthlete;
}

/**
 * Normalise a set of raw values to [0,1], winsorised at the 5th percentile.
 * Plain min-max let a single fringe two-appearance career anchor the bottom
 * of an axis and compress every contender's differences to a sliver — the
 * hardware axis ended up carrying ~50% of the effective weight instead of
 * its nominal 30%.
 */
function winsorisedNorm(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(0.05 * (sorted.length - 1))];
  const hi = sorted[sorted.length - 1];
  return (v) => (hi > lo ? clamp((v - lo) / (hi - lo), 0, 1) : 1);
}

function buildCareers(yearResults, dataset) {
  const careers = new Map();

  for (const [, byAthlete] of yearResults) {
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
    const prof = profileFrom(c.seasons);
    c.domains = prof.domains;
    c.domainExposure = prof.exposure;
  }

  return careers;
}

/** Career domain profile from a set of seasons, exposure-weighted. */
function profileFrom(seasons) {
  const num = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
  const den = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
  for (const s of seasons) {
    for (const [d, v] of Object.entries(s.domains)) {
      const w = s.exposure[d] ?? 0;
      num[d] += v * w;
      den[d] += w;
    }
  }
  const domains = {};
  const exposure = {};
  for (const d of DOMAIN_KEYS) {
    if (den[d] > 0.5) {
      domains[d] = round(num[d] / den[d]);
      exposure[d] = round(den[d], 2);
    }
  }
  return { domains, exposure };
}

/**
 * Rank careers under each model, then take the consensus.
 *
 * Greatness is scored on four separate axes, so that no single one can carry a
 * career on its own. Every model uses the same four in the same proportions;
 * the only difference between models is how an individual season is rated.
 *
 *   quality  how good they were, on average, when they showed up
 *   peak     how high they climbed at their best (mean of their best 3 years)
 *   volume   how much they accumulated, with diminishing returns
 *   hardware what they actually won — shared across models by design
 */
const W_QUALITY = 0.3;
const W_PEAK = 0.2;
const W_VOLUME = 0.2;
const W_HARDWARE = 0.3;

/**
 * Championship points.
 *
 * Titles are counted separately from podiums rather than as a bonus on top of
 * them, because winning the Games is a categorical achievement rather than a
 * very good placing.
 */
function hardwarePoints(c) {
  const nonTitlePodiums = c.podiums - c.titles;
  const nonPodiumTopTens = c.topTens - c.podiums;
  return c.titles * 10 + nonTitlePodiums * 3 + nonPodiumTopTens * 1 + c.eventWins * 0.5;
}

/** Diminishing returns on accumulation, sign-preserving so z-scores survive. */
const damp = (v) => Math.sign(v) * Math.sqrt(Math.abs(v));

function scoreModel(careers, rate) {
  const list = [...careers];
  // Peak is the mean of the best three seasons. A two-appearance career has
  // no third season, and using both of its seasons made peak arithmetically
  // identical to quality — double-weighting quality for a third of the pool.
  // Missing seasons are filled with the pool's median season instead.
  const medianSeason = median(list.flatMap((c) => c.seasons.map(rate)));
  const qualityOf = (c) => mean(c.seasons.map(rate));
  const peakOf = (c) => {
    const best = c.seasons.map(rate).sort((a, b) => b - a).slice(0, 3);
    while (best.length < 3) best.push(medianSeason);
    return mean(best);
  };
  const volumeOf = (c) => damp(c.seasons.reduce((n, s) => n + rate(s), 0));

  const qn = winsorisedNorm(list.map(qualityOf));
  const pn = winsorisedNorm(list.map(peakOf));
  const vn = winsorisedNorm(list.map(volumeOf));
  const hn = winsorisedNorm(list.map(hardwarePoints));

  return new Map(
    list.map((c) => [
      c.competitorId,
      W_QUALITY * qn(qualityOf(c)) +
        W_PEAK * pn(peakOf(c)) +
        W_VOLUME * vn(volumeOf(c)) +
        W_HARDWARE * hn(hardwarePoints(c)),
    ]),
  );
}

/** Competition ranking: tied scores share the better rank. */
function rankFrom(scoreMap) {
  const sorted = [...scoreMap.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  const ranks = new Map();
  sorted.forEach(([id, score], i) => {
    ranks.set(id, i > 0 && score === sorted[i - 1][1] ? ranks.get(sorted[i - 1][0]) : i + 1);
  });
  return ranks;
}

/** Finishing place of `score` against a descending-sorted field: ties share the better place. */
const placeAgainst = (fieldScores, score) => fieldScores.filter((s) => s > score).length + 1;

/**
 * Project a career domain profile onto another year's event mix, then read
 * off where that would have placed in that year's actual field.
 *
 * Both sides of the comparison are era-adjusted onto one all-time scale. An
 * earlier version compared the projection against raw within-year season
 * percentiles, whose scale swings with field size — 2019's 144-man field put
 * sixteen raw season scores above Fraser's projection in the year he won.
 * The athlete's own actual season is excluded from the field: without that,
 * an athlete competed against themselves, and Fraser was shown 2nd in four
 * years he won — beaten only by his own real season.
 */
function transplant(domains, competitorId, year, yearResults) {
  const actual = yearResults.get(year.year);
  if (!actual) return null;

  const perEvent = [];
  for (const ev of year.events) {
    if (ev.exclude || !Object.keys(ev.domains).length) continue;
    let num = 0;
    let den = 0;
    for (const [d, w] of Object.entries(ev.domains)) {
      const v = domains[d];
      if (v == null) continue;
      num += w * v;
      den += w;
    }
    if (den <= 0) continue;
    // coverage: how much of this event's demand the athlete has a record in
    perEvent.push({ ordinal: ev.ordinal, name: ev.name, projected: num / den, coverage: den });
  }

  if (!perEvent.length) return null;

  // events the athlete has thin domain coverage of count for less, rather
  // than being silently imputed from their strengths
  const covSum = perEvent.reduce((n, e) => n + e.coverage, 0);
  const projectedScore = perEvent.reduce((n, e) => n + e.projected * e.coverage, 0) / covSum;

  const fieldScores = [...actual.entries()]
    .filter(([id]) => id !== competitorId)
    .map(([, r]) => r.percentileScore)
    .sort((a, b) => b - a);
  const projectedFinish = placeAgainst(fieldScores, projectedScore);

  const strongest = [...perEvent].sort((a, b) => b.projected - a.projected).slice(0, 3);
  const weakest = [...perEvent].sort((a, b) => a.projected - b.projected).slice(0, 3);
  const own = actual.get(competitorId);

  return {
    year: year.year,
    projectedScore,
    projectedFinish,
    fieldSize: fieldScores.length + (own ? 1 : 0),
    actualFinish: own?.finish ?? null,
    actualStatus: own?.status ?? null,
    competed: !!own,
    coverage: round(covSum / perEvent.length, 3),
    strongest: strongest.map((e) => ({ name: e.name, projected: round(e.projected) })),
    weakest: weakest.map((e) => ({ name: e.name, projected: round(e.projected) })),
  };
}

async function main() {
  const dataset = JSON.parse(await readFile(join(ROOT, 'data', 'games.json'), 'utf8'));

  const yearResults = new Map();
  for (const y of dataset.years) yearResults.set(y.year, analyseYear(y));

  // ---- strength of field, one fit per scale -------------------------------
  // Fitted from athletes who span more than one year, then applied to every
  // season score so the models compare eras on equal terms. Each model's
  // scale gets its own fit: the 2019 percentile inflation (a 144-man field
  // under cuts) barely registers on the margin scale, and reusing the
  // percentile-fitted constant there injected a ~20x overcorrection.
  const seasonRows = { pct: [], official: [], z: [] };
  const eventRows = [];
  for (const [year, byAthlete] of yearResults) {
    for (const [id, r] of byAthlete) {
      seasonRows.pct.push({ id, year, score: r.percentileScore });
      seasonRows.official.push({ id, year, score: r.officialScore });
      seasonRows.z.push({ id, year, q: r.zScore });
      for (const e of r.events) {
        eventRows.push({ id, year, score: e.percentile });
      }
    }
  }
  const pctFit = fitProbabilityStrength(seasonRows.pct);
  const officialFit = fitProbabilityStrength(seasonRows.official);
  const zFit = fitYearStrength(seasonRows.z);
  // per-event percentiles have their own dispersion (an event spans the whole
  // field; a season mean does not), so the movement tables and domain
  // profiles get a fit on event-level numbers rather than season-level ones
  const eventFit = fitProbabilityStrength(eventRows);
  const adjustEventPct = (year, p) => eventFit.adjustProbability(year, p);

  for (const [year, byAthlete] of yearResults) {
    for (const [, r] of byAthlete) {
      r.fieldStrength = round(pctFit.strength.get(year) ?? 0, 4);
      r.rawPercentileScore = round(r.percentileScore);
      r.rawOfficialScore = round(r.officialScore);
      r.rawZScore = round(r.zScore);
      // kept at full precision here — pools and ranks compare these, and
      // 4-decimal rounding manufactured exact ties; rounded only at output
      r.percentileScore = pctFit.adjustProbability(year, r.percentileScore);
      r.officialScore = officialFit.adjustProbability(year, r.officialScore);
      r.zScore = zFit.adjust(year, r.zScore);

      // Rebuild the season's domain profile on the era-adjusted scale. A raw
      // percentile depends mechanically on field size — tenth of 2019's 144
      // starters is p94 — so career profiles built from raw values inherit
      // whatever field each season happened to have. Adjusting per event puts
      // every profile on the all-time reference scale, the same one the
      // movement tables use. The raw profile is kept alongside so no exported
      // record mixes scales unlabelled.
      r.rawDomains = r.domains;
      const num = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
      const den = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
      for (const e of r.events) {
        if (e.percentile == null) continue;
        const adj = adjustEventPct(year, e.percentile);
        for (const [d, w] of Object.entries(e.domains)) {
          num[d] += w * adj;
          den[d] += w;
        }
      }
      const adjDomains = {};
      for (const d of DOMAIN_KEYS) {
        if (den[d] > 0) adjDomains[d] = round(num[d] / den[d]);
      }
      r.domains = adjDomains;
    }
  }

  const careers = buildCareers(yearResults, dataset);

  // Only athletes with a real body of work can be ranked as the GOAT; the rest
  // stay in the dataset but are excluded from the headline table.
  const MIN_APPEARANCES = 2;
  const eligible = [...careers.values()].filter((c) => c.appearances >= MIN_APPEARANCES);

  const models = {
    percentile: scoreModel(eligible, (s) => s.percentileScore),
    official: scoreModel(eligible, (s) => s.officialScore),
    zscore: scoreModel(eligible, (s) => s.zScore),
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

  // ---- era transplant -----------------------------------------------------
  const TRANSPLANT_COHORT = 25;
  const topForTransplant = eligible.slice(0, TRANSPLANT_COHORT);
  for (const c of topForTransplant) {
    c.transplants = dataset.years
      .map((y) => transplant(c.domains, c.competitorId, y, yearResults))
      .filter(Boolean);
  }

  /**
   * The solo projection above swaps one athlete into a year's real field at a
   * time, so two athletes who would both beat everyone who actually competed
   * each come out first — they are never measured against each other.
   *
   * This second pass runs the whole cohort in the same year simultaneously:
   * the pool is that year's real field, with any cohort member's actual result
   * replaced by their projected one, plus the cohort members who were not
   * there. Exactly one athlete can win a given year. Pools are ranked on
   * unrounded scores with competition ranking, so a tie is a shared place
   * rather than whatever the array order happened to be.
   */
  const cohortIds = new Set(topForTransplant.map((c) => c.competitorId));
  for (const y of dataset.years) {
    const actual = yearResults.get(y.year);
    if (!actual) continue;

    const poolScores = [];
    for (const [id, r] of actual) {
      if (!cohortIds.has(id)) poolScores.push(r.percentileScore);
    }
    const projections = new Map();
    for (const c of topForTransplant) {
      const t = c.transplants.find((x) => x.year === y.year);
      if (t) {
        poolScores.push(t.projectedScore);
        projections.set(c.competitorId, t);
      }
    }
    poolScores.sort((a, b) => b - a);

    for (const [, t] of projections) {
      // competition place among the pool, not counting the athlete's own entry
      t.headToHeadFinish = poolScores.filter((s) => s > t.projectedScore).length + 1;
      t.poolSize = poolScores.length;
    }
  }

  /**
   * Calibration: an athlete transplanted into a year they actually competed
   * should roughly reproduce their real finish — the deviation is career
   * shape vs that season's form, which is the model's job to smooth. It is
   * measured honestly: the profile is rebuilt without the target year
   * (leave-one-year-out, so the projection never contains the season it is
   * predicting), and only seasons the athlete actually finished (ACT) count —
   * a projection cannot foresee a withdrawal or a cut. The in-sample number
   * is published alongside for comparison.
   */
  const calib = { loo: [], inSample: [] };
  for (const c of topForTransplant) {
    for (const t of c.transplants) {
      if (!t.competed || t.actualFinish == null) continue;
      if (t.actualStatus != null && t.actualStatus !== 'ACT') continue;
      const rel = (err, fieldSize) => Math.abs(err) / Math.max(1, fieldSize - 1);
      calib.inSample.push({
        year: t.year,
        err: t.projectedFinish - t.actualFinish,
        rel: rel(t.projectedFinish - t.actualFinish, t.fieldSize),
      });

      const looSeasons = c.seasons.filter((s) => s.year !== t.year);
      if (!looSeasons.length) continue;
      const looProfile = profileFrom(looSeasons).domains;
      const y = dataset.years.find((x) => x.year === t.year);
      const looT = transplant(looProfile, c.competitorId, y, yearResults);
      if (!looT) continue;
      calib.loo.push({
        year: t.year,
        err: looT.projectedFinish - t.actualFinish,
        rel: rel(looT.projectedFinish - t.actualFinish, looT.fieldSize),
      });
    }
  }
  const summariseCalib = (rows) => {
    const byYear = new Map();
    for (const r of rows) {
      if (!byYear.has(r.year)) byYear.set(r.year, []);
      byYear.get(r.year).push(r.err);
    }
    return {
      n: rows.length,
      meanAbsError: round(mean(rows.map((r) => Math.abs(r.err))), 2),
      meanSignedError: round(mean(rows.map((r) => r.err)), 2),
      meanRelError: round(mean(rows.map((r) => r.rel)), 4),
      byYear: Object.fromEntries(
        [...byYear.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([y, errs]) => [y, { n: errs.length, meanSignedError: round(mean(errs), 1) }]),
      ),
    };
  };
  const transplantCalibration = {
    basis:
      'Top-25 athletes projected into seasons they actually finished (ACT only). Primary numbers are leave-one-year-out: the profile is rebuilt without the target year, so the projection never contains the season it predicts.',
    ...summariseCalib(calib.loo),
    inSample: summariseCalib(calib.inSample),
  };

  for (const c of topForTransplant) {
    const h2h = c.transplants.map((t) => t.headToHeadFinish).filter((v) => v != null);
    // best/worst fit is judged in field-relative terms — 21st of 142 is a far
    // better result than 12th of 30, and raw places said the opposite
    const relFinish = (t) => (t.projectedFinish - 1) / Math.max(1, t.fieldSize - 1);
    c.transplantSummary = {
      // solo projection: does this athlete's fitness fit that year's test
      meanFinish: round(mean(c.transplants.map((t) => t.projectedFinish)), 2),
      meanFinishPct: round(mean(c.transplants.map(relFinish)), 4),
      bestYear: c.transplants.reduce((a, b) => (relFinish(b) < relFinish(a) ? b : a)).year,
      worstYear: c.transplants.reduce((a, b) => (relFinish(b) > relFinish(a) ? b : a)).year,
      wouldWin: c.transplants.filter((t) => t.projectedFinish === 1).length,
      wouldPodium: c.transplants.filter((t) => t.projectedFinish <= 3).length,
      // head-to-head: the whole cohort competing in that year at once
      meanHeadToHead: round(mean(h2h), 2),
      h2hWins: h2h.filter((v) => v === 1).length,
      h2hPodiums: h2h.filter((v) => v <= 3).length,
    };
  }

  // round the scores kept at full precision for pooling and tie handling
  for (const c of topForTransplant) {
    for (const t of c.transplants) t.projectedScore = round(t.projectedScore);
  }

  // ---- per-year summaries -------------------------------------------------
  // Season rows carry that year's spelling ("Rich Froning"); careers hold the
  // canonical one, so champions, event winners and movement tables all agree
  // with the rest of the site.
  const canonicalName = new Map([...careers.values()].map((c) => [c.competitorId, c.name]));

  const yearSummaries = dataset.years.map((y) => {
    const results = yearResults.get(y.year);
    const totals = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0]));
    let n = 0;
    for (const ev of y.events) {
      if (ev.exclude) continue;
      n += 1;
      for (const [d, w] of Object.entries(ev.domains)) totals[d] += w;
    }
    const champion = [...(results?.values() ?? [])].find((r) => r.finish === 1);
    const starters = [...(results?.values() ?? [])].length;
    return {
      year: y.year,
      eventCount: n,
      fieldSize: starters,
      entrants: y.athletes.length,
      fieldStrength: round(pctFit.strength.get(y.year) ?? 0, 3),
      strengths: {
        percentile: round(pctFit.strength.get(y.year) ?? 0, 3),
        official: round(officialFit.strength.get(y.year) ?? 0, 3),
        zscore: round(zFit.strength.get(y.year) ?? 0, 3),
      },
      champion: champion
        ? { name: canonicalName.get(champion.competitorId) ?? champion.name, competitorId: champion.competitorId }
        : null,
      domainMix: Object.fromEntries(
        Object.entries(totals)
          .filter(([, v]) => v > 0)
          .map(([k, v]) => [k, round(v / n)]),
      ),
      events: y.events.map((ev) => ({
        ordinal: ev.ordinal,
        name: ev.name,
        // how many were still in the competition for this event — makes cut
        // formats and the 2020 two-stage Games legible without hardcoding
        participants: y.athletes.filter((a) => genuineScores(a).some((s) => s.ordinal === ev.ordinal)).length,
        scoreFormat: ev.scoreFormat,
        medianSeconds: ev.medianSeconds,
        domains: ev.domains,
        tagSource: ev.tagSource,
        note: ev.note ?? null,
        exclude: !!ev.exclude,
        winner:
          [...(results?.values() ?? [])]
            .filter((r) => r.events.some((e) => e.ordinal === ev.ordinal && e.rank === 1))
            .map((r) => canonicalName.get(r.competitorId) ?? r.name)
            .join(' & ') || null,
      })),
    };
  });

  // ---- movement analysis -------------------------------------------------
  // Every event carries the movements parsed from its published description.
  // An athlete's standing in a movement is their mean era-adjusted percentile
  // across the events that contained it. Standings only count events where at
  // least half the year's field was still competing: percentiles are scored
  // against the full starting field, so a 10-man final of a 144-man year has
  // a floor of p94 — attendance at post-cut events bought an elite movement
  // mean regardless of how the athlete actually moved.
  const MIN_MOVEMENT_EVENTS = 4;
  const MOVEMENT_FIELD_MIN = 0.5;
  const movementIndex = new Map();

  for (const y of dataset.years) {
    const results = yearResults.get(y.year);
    if (!results) continue;
    const yearField = [...results.values()].length;
    for (const ev of y.events) {
      if (ev.exclude) continue;
      for (const key of ev.movements ?? []) {
        if (!movementIndex.has(key)) {
          movementIndex.set(key, { key, events: [], byYear: new Map(), domains: {}, athletes: new Map() });
        }
        const m = movementIndex.get(key);
        m.events.push({ year: y.year, ordinal: ev.ordinal, name: ev.name });
        m.byYear.set(y.year, (m.byYear.get(y.year) ?? 0) + 1);
        for (const [d, w] of Object.entries(ev.domains ?? {})) {
          m.domains[d] = (m.domains[d] ?? 0) + w;
        }

        for (const [, r] of results) {
          const hit = r.events.find((e) => e.ordinal === ev.ordinal);
          if (!hit || hit.percentile == null) continue;
          if (hit.fieldSize < MOVEMENT_FIELD_MIN * yearField) continue;
          if (!m.athletes.has(r.competitorId)) {
            m.athletes.set(r.competitorId, {
              name: canonicalName.get(r.competitorId) ?? r.name,
              scores: [],
              wins: 0,
            });
          }
          const rec = m.athletes.get(r.competitorId);
          rec.scores.push(adjustEventPct(y.year, hit.percentile));
          if (hit.rank === 1) rec.wins += 1;
        }
      }
    }
  }

  const movements = [...movementIndex.values()]
    .map((m) => {
      const meta = MOVEMENTS.find((x) => x.key === m.key);
      const totalWeight = Object.values(m.domains).reduce((a, b) => a + b, 0) || 1;
      const ranked = [...m.athletes.entries()]
        .map(([competitorId, rec]) => ({
          competitorId,
          name: rec.name,
          events: rec.scores.length,
          eventWins: rec.wins,
          meanPercentile: round(mean(rec.scores)),
        }))
        .filter((r) => r.events >= MIN_MOVEMENT_EVENTS)
        .sort((a, b) => b.meanPercentile - a.meanPercentile);

      const years = [...m.byYear.keys()].sort((a, b) => a - b);
      return {
        key: m.key,
        label: meta?.label ?? m.key,
        category: meta?.category ?? 'other',
        eventCount: m.events.length,
        firstYear: years[0],
        lastYear: years[years.length - 1],
        yearsSeen: years.length,
        byYear: Object.fromEntries([...m.byYear.entries()].sort((a, b) => a[0] - b[0])),
        domainMix: Object.fromEntries(
          Object.entries(m.domains)
            .map(([d, w]) => [d, round(w / totalWeight)])
            .filter(([, w]) => w > 0)
            .sort((a, b) => b[1] - a[1]),
        ),
        events: m.events,
        leaders: ranked.slice(0, 8),
        rankedCount: ranked.length,
      };
    })
    .sort((a, b) => b.eventCount - a.eventCount);

  // Movement-category mix per year, for the stacked chart
  const movementMixByYear = dataset.years.map((y) => {
    const counts = {};
    let total = 0;
    for (const ev of y.events) {
      if (ev.exclude) continue;
      for (const key of ev.movements ?? []) {
        const cat = MOVEMENTS.find((x) => x.key === key)?.category ?? 'other';
        counts[cat] = (counts[cat] ?? 0) + 1;
        total += 1;
      }
    }
    return {
      year: y.year,
      total,
      mix: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, round(v / (total || 1))])),
    };
  });

  const out = {
    generatedAt: new Date().toISOString(),
    source: dataset.source,
    division: dataset.division,
    domains: DOMAINS,
    methodology: {
      models: {
        percentile: 'Field-normalised placing per event (winner 1.0, last 0.0), averaged over the season.',
        official:
          "CrossFit's own finishing position, with season points summed from per-event points — the leaderboard's own season total is finals-only in 2020 and collapsed for cut athletes in 2019.",
        zscore:
          'Margin against the field on the raw score, calibrated to where each event group sits in the full starting field, clamped to ±3 SD.',
      },
      adjustment:
        "Each model's season scores are era-adjusted by a field strength fitted on that model's own scale, with each year's dispersion standardised first. The hardware axis is shared across all three models by design: what an athlete won is the record itself, not a model of it.",
      weights: {
        quality: W_QUALITY,
        peak: W_PEAK,
        volume: W_VOLUME,
        hardware: W_HARDWARE,
      },
      hardwareScale: 'Title 10, non-title podium 3, non-podium top ten 1, event win 0.5.',
      percentileBasis:
        "Each event is scored against the year's full starting field, not just the athletes still in it, so surviving a cut is never a penalty. Placeholder rows the API emits for athletes who never contested an event are dropped.",
      minAppearances: MIN_APPEARANCES,
      consensus: 'Mean of the three model ranks; ties broken by mean model score.',
      transplant: {
        cohort: TRANSPLANT_COHORT,
        solo: "One athlete swapped into that year's real field (their own actual season excluded, so no one competes against themselves). Independent per athlete, so two who would both beat the actual field each show first.",
        headToHead:
          'The whole cohort competing in that year at once, against the remainder of the real field. Exactly one athlete wins each year.',
        scale:
          'Career domain profiles and the field they are ranked against are both era-adjusted, so the projection and the real season scores share one all-time scale regardless of how large or deep a given field was.',
        calibration: transplantCalibration,
      },
      movements: {
        minEvents: MIN_MOVEMENT_EVENTS,
        fieldMinimum: MOVEMENT_FIELD_MIN,
        basis:
          'Mean era-adjusted percentile across events containing the movement. Standings only count events where at least half of the year’s field was still competing, so a place in a small post-cut final cannot buy an elite movement score by attendance.',
      },
    },
    years: yearSummaries,
    movements,
    movementCategories: MOVEMENT_CATEGORIES,
    movementMixByYear,
    movementMinEvents: MIN_MOVEMENT_EVENTS,
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

  // round the season model scores for output (they were kept at full
  // precision through the fits and pools above)
  for (const [, byAthlete] of yearResults) {
    for (const [, r] of byAthlete) {
      r.percentileScore = round(r.percentileScore);
      r.officialScore = round(r.officialScore);
      r.zScore = round(r.zScore);
    }
  }

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
        // era-adjusted; events[].percentile below is raw within-year — the
        // raw profile is in rawDomains so no consumer has to mix scales
        domains: r.domains,
        rawDomains: r.rawDomains,
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

  console.log(`\nAnalysed ${careers.size} athletes; ${eligible.length} eligible for the GOAT table.\n`);
  console.log('Strength of field per scale (2019 should be an outlier on percentile, mild elsewhere):');
  for (const y of [2011, 2018, 2019, 2020, 2024, 2026]) {
    const s = yearSummaries.find((x) => x.year === y)?.strengths;
    if (s) console.log(`  ${y}  pct ${s.percentile}  official ${s.official}  z ${s.zscore}`);
  }
  console.log(
    `\nTransplant calibration (leave-one-year-out, ACT seasons): MAE ${transplantCalibration.meanAbsError} places ` +
      `(${(transplantCalibration.meanRelError * 100).toFixed(1)}% of field) over n=${transplantCalibration.n}; ` +
      `in-sample MAE ${transplantCalibration.inSample.meanAbsError}.`,
  );
  console.log('\nConsensus top 15:');
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
