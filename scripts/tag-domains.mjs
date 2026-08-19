/**
 * Assigns fitness-domain weights to every Games event.
 *
 *   node scripts/tag-domains.mjs
 *
 * Hybrid strategy: curated weights in data/event-domains.overrides.json win;
 * anything not listed there is classified automatically from the event name
 * and its score format, and flagged `inferred` so the UI can show which tags
 * are hand-checked and which are guesses.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOMAIN_KEYS, NAME_RULES, normalise, parseSeconds, scoreFormatWeights } from './lib/domains.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Median event duration in seconds, used as a time-domain signal. */
function medianSeconds(year, ordinal) {
  const secs = year.athletes
    .map((a) => a.scores.find((s) => s.ordinal === ordinal))
    .map((s) => parseSeconds(s?.display))
    .filter((n) => n != null)
    .sort((a, b) => a - b);
  return secs.length ? secs[Math.floor(secs.length / 2)] : null;
}

function representativeDisplay(year, ordinal) {
  for (const a of year.athletes) {
    const s = a.scores.find((x) => x.ordinal === ordinal);
    if (s?.display && !/^CAP/i.test(s.display)) return s.display;
  }
  return null;
}

function autoTag(name, display, seconds) {
  const hits = {};
  let matchedRules = 0;
  for (const [re, weights] of NAME_RULES) {
    if (!re.test(name)) continue;
    for (const [k, v] of Object.entries(weights)) hits[k] = (hits[k] ?? 0) + v;
    // Two matching rules is enough signal; more just muddies the blend.
    matchedRules += 1;
    if (matchedRules >= 2) break;
  }
  if (Object.keys(hits).length) return { weights: normalise(hits), basis: 'name' };

  const fallback = scoreFormatWeights(display, seconds);
  return { weights: normalise(fallback ?? {}), basis: 'score-format' };
}

async function main() {
  const dataset = JSON.parse(await readFile(join(ROOT, 'data', 'games.json'), 'utf8'));
  const overrides = JSON.parse(
    await readFile(join(ROOT, 'data', 'event-domains.overrides.json'), 'utf8'),
  );

  let curated = 0;
  let inferred = 0;
  let excluded = 0;
  let classifierAgree = 0;

  const topDomain = (weights) =>
    Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  for (const year of dataset.years) {
    for (const ev of year.events) {
      const key = `${year.year}|${ev.name}`;
      const display = representativeDisplay(year, ev.ordinal);
      const seconds = medianSeconds(year, ev.ordinal);

      ev.scoreFormat = /lb|kg/i.test(display ?? '')
        ? 'load'
        : /\brep\b/i.test(display ?? '')
          ? 'reps'
          : /\bpt\b/i.test(display ?? '')
            ? 'points'
            : /\bcal\b/i.test(display ?? '')
              ? 'calories'
              : seconds != null
                ? 'time'
                : 'other';
      ev.medianSeconds = seconds;
      ev.sampleScore = display;

      const override = overrides[key];
      if (override?.exclude) {
        ev.exclude = true;
        ev.note = override.note ?? null;
        ev.domains = {};
        ev.tagSource = 'excluded';
        excluded += 1;
        continue;
      }

      if (override) {
        const { note, ...weights } = override;
        ev.domains = normalise(weights);
        ev.tagSource = 'curated';
        ev.note = note ?? null;
        curated += 1;
        // Free validation for the auto classifier: every curated event is a
        // labelled example it will never see in production.
        const auto = autoTag(ev.name, display, seconds);
        if (topDomain(auto.weights) === topDomain(ev.domains)) classifierAgree += 1;
      } else {
        const { weights, basis } = autoTag(ev.name, display, seconds);
        ev.domains = weights;
        ev.tagSource = 'inferred';
        ev.tagBasis = basis;
        ev.note = null;
        inferred += 1;
      }

      const bad = Object.keys(ev.domains).filter((k) => !DOMAIN_KEYS.includes(k));
      if (bad.length) throw new Error(`${key}: unknown domain(s) ${bad.join(', ')}`);
    }
  }

  await writeFile(join(ROOT, 'data', 'games.json'), JSON.stringify(dataset, null, 2));

  const total = curated + inferred + excluded;
  console.log(
    `Tagged ${total} events: ${curated} curated (${Math.round((curated / total) * 100)}%), ` +
      `${inferred} inferred, ${excluded} excluded.`,
  );
  if (curated) {
    console.log(
      `Auto classifier agrees with the curated top domain on ${classifierAgree}/${curated} ` +
        `events (${Math.round((classifierAgree / curated) * 100)}%).`,
    );
  }

  const untagged = dataset.years.flatMap((y) =>
    y.events.filter((e) => e.tagSource === 'inferred').map((e) => `${y.year} ${e.name}`),
  );
  if (untagged.length) console.log('\nInferred (review candidates):\n  ' + untagged.join('\n  '));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
