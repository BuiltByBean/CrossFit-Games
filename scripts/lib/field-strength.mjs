/**
 * Strength-of-field estimation.
 *
 * A percentile is relative to whoever turned up. Finishing p90 against the
 * 2011 field is not the same achievement as p90 against the 2024 field, so
 * raw percentiles cannot be compared across eras without an adjustment.
 *
 * The signal comes from athletes who competed in more than one year. If the
 * same competitors consistently score lower in one year than another, the
 * difference is the field, not them. That is a two-way additive model:
 *
 *     q(i,y) = ability(i) - strength(y) + error
 *
 * where q is a score mapped onto a latent scale (probit for probabilities,
 * identity for values already in SD units). It is fitted by alternating least
 * squares — the same idea as bridging player ratings across seasons in chess
 * or baseball. Strength is identified only up to a constant, so it is centred
 * on zero: positive means a deeper field than the all-time average.
 *
 * Two refinements over the plain additive fit:
 *
 * 1. A per-year slope as well as a location:  q(i,y) = α(y) + β(y)·ability(i).
 *    A location shift alone cannot represent 2019, where the 144-man field
 *    under cuts inflated scores in a rank-DEPENDENT way — the measured
 *    2018→2019 drift is ~+0.5 for elite returners but +1.3 to +1.55 for
 *    midfield ones, so any single subtraction over-corrects the top and
 *    under-corrects the middle. The slope is fitted per year by regressing
 *    the year's bridge scores on ability, shrunk toward 1 (a weak year has
 *    few bridge rows and must not invent a wild slope) and clamped. Within-
 *    year order is untouched: the adjustment is affine and monotone per year.
 *
 * 2. One fit per scale. The percentile, official and z models live on scales
 *    that respond differently to the same year: 2019's percentile inflation
 *    is mostly a property of the percentile definition, and applying the
 *    percentile-fitted −0.77 to z-scores injected a penalty ~20× the drift
 *    actually measured on the z scale. Each scale is fitted on its own
 *    numbers, so genuine depth changes (which register everywhere) are kept
 *    while scale-specific artifacts stay in the scale they belong to.
 *
 * Single-appearance athletes are excluded from the fit input: their rows
 * cancel out of the year equations identically at the fixed point (their
 * fitted ability sits exactly on the year line), so removing them is
 * result-identical and faster. They still shape a year's field — upstream,
 * in the percentiles everyone else is scored against.
 */

/** Abramowitz & Stegun 26.2.23 — normal CDF, accurate to ~7.5e-8. */
export function normalCdf(x) {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

/** Acklam's inverse normal CDF. */
export function probit(p) {
  const clamped = Math.min(1 - 1e-4, Math.max(1e-4, p));
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;

  if (clamped < plow) {
    const q = Math.sqrt(-2 * Math.log(clamped));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (clamped > 1 - plow) {
    const q = Math.sqrt(-2 * Math.log(1 - clamped));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const q = clamped - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Fit per-year field strength on one scale:  q(i,y) = α(y) + β(y)·ability(i).
 *
 * @param rows {{id: string, year: number, q: number}[]} latent-scale scores —
 *   the caller maps probabilities through probit() first; z-scores pass as-is.
 * @returns {
 *   strength: Map<year, number>,  // mean correction applied to that year's
 *                                 // seasons, in SD units; negative = the
 *                                 // year's scores were inflated
 *   adjust: (year, q) => number,  // (q - α)/β — the score on the all-time scale
 *   params: Map<year, {alpha, beta}>,
 * }
 */
export function fitYearStrength(rows, { iterations = 300, slopeShrink = 10 } = {}) {
  const years = [...new Set(rows.map((r) => r.year))];

  // bridge athletes only — the others are inert in the fit
  const appearanceYears = new Map();
  for (const r of rows) {
    if (!appearanceYears.has(r.id)) appearanceYears.set(r.id, new Set());
    appearanceYears.get(r.id).add(r.year);
  }
  const bridge = rows.filter((r) => appearanceYears.get(r.id).size > 1);

  const byAthlete = new Map();
  const byYear = new Map();
  for (const r of bridge) {
    if (!byAthlete.has(r.id)) byAthlete.set(r.id, []);
    byAthlete.get(r.id).push(r);
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
  }

  const ability = new Map(
    [...byAthlete.entries()].map(([id, rs]) => [id, mean(rs.map((r) => r.q))]),
  );
  const alpha = new Map(years.map((y) => [y, 0]));
  const beta = new Map(years.map((y) => [y, 1]));

  for (let it = 0; it < iterations; it += 1) {
    // year update: regress the year's bridge scores on ability. The slope is
    // shrunk toward 1 (a Bayesian prior worth `slopeShrink` observations) and
    // clamped, so sparse years cannot invent a wild rescale.
    for (const [year, rs] of byYear) {
      const as = rs.map((r) => ability.get(r.id));
      const qs = rs.map((r) => r.q);
      const ma = mean(as);
      const mq = mean(qs);
      const va = mean(as.map((a) => (a - ma) ** 2));
      const cov = mean(as.map((a, i) => (a - ma) * (qs[i] - mq)));
      const raw = va > 1e-9 ? cov / va : 1;
      const b = Math.min(2, Math.max(0.5, (rs.length * raw + slopeShrink) / (rs.length + slopeShrink)));
      beta.set(year, b);
      alpha.set(year, mq - b * ma);
    }
    // ability update: least squares over the athlete's rows
    for (const [id, rs] of byAthlete) {
      let num = 0;
      let den = 0;
      for (const r of rs) {
        const b = beta.get(r.year);
        num += b * (r.q - alpha.get(r.year));
        den += b * b;
      }
      ability.set(id, den > 0 ? num / den : 0);
    }
    // identification: mean slope 1, mean intercept 0 (absorbed into ability)
    const mb = mean([...beta.values()]);
    if (mb > 0) {
      for (const [y, b] of beta) beta.set(y, b / mb);
      for (const [id, a] of ability) ability.set(id, a * mb);
    }
    const ma2 = mean([...alpha.values()]);
    const mbb = mean([...beta.values()]);
    const shift = mbb !== 0 ? ma2 / mbb : 0;
    for (const [y] of alpha) alpha.set(y, alpha.get(y) - beta.get(y) * shift);
    for (const [id, a] of ability) ability.set(id, a + shift);
  }

  const params = new Map(years.map((y) => [y, { alpha: alpha.get(y), beta: beta.get(y) }]));
  const adjust = (year, q) => {
    const p = params.get(year);
    if (!p) return q;
    return (q - p.alpha) / p.beta;
  };

  // displayed strength: the mean correction this year's seasons receive —
  // negative means the year's raw scores were inflated relative to the
  // all-time scale (a shallower or mechanically stretched field)
  const strength = new Map();
  const qByYear = new Map();
  for (const r of rows) {
    if (!qByYear.has(r.year)) qByYear.set(r.year, []);
    qByYear.get(r.year).push(r.q);
  }
  for (const [year, qs] of qByYear) {
    strength.set(year, mean(qs.map((q) => adjust(year, q) - q)));
  }

  return { strength, adjust, params };
}

/**
 * Convenience for probability scales: fit on probit(score), and return an
 * adjuster that maps a probability back to a probability.
 */
export function fitProbabilityStrength(rows, opts) {
  const fit = fitYearStrength(
    rows.map((r) => ({ id: r.id, year: r.year, q: probit(r.score) })),
    opts,
  );
  return {
    strength: fit.strength,
    adjustProbability: (year, p) => normalCdf(fit.adjust(year, probit(p))),
  };
}
