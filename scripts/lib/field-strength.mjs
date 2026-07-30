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
 * where q is the season score mapped into a latent normal scale. It is fitted
 * by alternating least squares, which is the same idea as bridging player
 * ratings across seasons in chess or baseball. Strength is identified only up
 * to a constant, so it is centred on zero: positive means a deeper field than
 * the all-time average, in standard deviations of athlete ability.
 *
 * Single-appearance athletes contribute nothing to the bridge — they have no
 * second year to be compared against — but they still shape a year's field,
 * which is what the model is measuring.
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
  const clamped = Math.min(0.999, Math.max(0.001, p));
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
 * @param seasons {{competitorId: string, year: number, score: number}[]} score in (0,1)
 * @returns Map<year, strength> centred on zero, in SD units
 */
export function estimateFieldStrength(seasons, { iterations = 300 } = {}) {
  const q = seasons.map((s) => ({ id: s.competitorId, year: s.year, q: probit(s.score) }));

  const byAthlete = new Map();
  const byYear = new Map();
  for (const r of q) {
    if (!byAthlete.has(r.id)) byAthlete.set(r.id, []);
    byAthlete.get(r.id).push(r);
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
  }

  const ability = new Map([...byAthlete.keys()].map((id) => [id, 0]));
  const strength = new Map([...byYear.keys()].map((y) => [y, 0]));

  for (let it = 0; it < iterations; it += 1) {
    // ability given strength
    for (const [id, rows] of byAthlete) {
      ability.set(id, mean(rows.map((r) => r.q + strength.get(r.year))));
    }
    // strength given ability
    for (const [year, rows] of byYear) {
      strength.set(year, mean(rows.map((r) => ability.get(r.id) - r.q)));
    }
    // centre, since only differences are identified
    const offset = mean([...strength.values()]);
    for (const [year, v] of strength) strength.set(year, v - offset);
  }

  return { strength, ability };
}

/** Apply a year's field strength to a score in (0,1). */
export function adjustProbability(score, strength) {
  return normalCdf(probit(score) + strength);
}
