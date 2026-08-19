/**
 * Matches scraped workout descriptions to leaderboard events and tags each
 * event with the movements it contained.
 *
 *   node scripts/tag-movements.mjs
 *
 * The two sources name events differently — the leaderboard says "Murph",
 * the workout page says "Event 3 - Murph", and 2024 packs two events into one
 * row as "Final 2421, Final 1815" — so matching is done on normalised names
 * with a containment fallback. Anything unmatched is reported rather than
 * silently left without movements.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractMovements, MOVEMENTS } from './lib/movements.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The two sources abbreviate differently; expand both to the same words. */
const ABBREVIATIONS = [
  [/\bhspu\b/g, 'handstand push up'],
  [/\bpttm\b/g, 'pedal to the metal'],
  [/\bc2b\b/g, 'chest to bar'],
  [/\bt2b\b/g, 'toes to bar'],
  [/\bohs\b/g, 'overhead squat'],
  [/\bs2oh\b/g, 'shoulder to overhead'],
  [/\bdb\b/g, 'dumbbell'],
  [/\bkb\b/g, 'kettlebell'],
  [/\bmedball\b/g, 'med ball'],
  [/\bcrit\b/g, 'criterium'],
];

/** Strip decoration so "Event 3 - Murph (100 Points)" and "Murph" agree. */
function normalise(s) {
  let out = s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/^\s*(individual\s+)?events?\s*[\d/&,\s-]*[-–—:]?\s*/i, ' ')
    .replace(/\btest\s*\d+\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  for (const [re, to] of ABBREVIATIONS) out = out.replace(re, to);
  return out.replace(/\s+/g, ' ').trim();
}

/** Event numbers declared in a heading: "Events 6/7", "Event 16/17", "Events 3/4/5". */
function headingNumbers(heading) {
  const m = heading.match(/^\s*events?\s*([\d\s/&,and-]+)/i);
  if (!m) return [];
  return [...m[1].matchAll(/\d+/g)].map((x) => Number(x[0]));
}

function findDescription(event, candidates) {
  const target = normalise(event.name);
  const scored = candidates.map((c) => ({
    c,
    key: normalise(c.heading),
    nums: headingNumbers(c.heading),
  }));

  if (target) {
    const exact = scored.find((s) => s.key === target);
    if (exact) return exact.c;

    // "Final 2421, Final 1815" contains "final 2421"
    const contains = scored.find(
      (s) => s.key.length > 2 && (s.key.includes(target) || target.includes(s.key)),
    );
    if (contains) return contains.c;
  }

  // Fall back to the declared event number, which is how 2021 (leaderboard
  // events are literally named "Event 1"…) and combined rows are resolved.
  const byNumber = scored.find((s) => s.nums.includes(event.ordinal));
  if (byNumber) return byNumber.c;

  if (!target) return null;
  const tokens = new Set(target.split(' ').filter((t) => t.length > 2));
  if (!tokens.size) return null;
  let best = null;
  for (const s of scored) {
    const other = new Set(s.key.split(' ').filter((t) => t.length > 2));
    if (!other.size) continue;
    const shared = [...tokens].filter((t) => other.has(t)).length;
    const score = shared / Math.max(tokens.size, other.size);
    if (score >= 0.6 && (!best || score > best.score)) best = { c: s.c, score };
  }
  return best?.c ?? null;
}

/**
 * The 2024 workout page packs both finals into one row ("Event 9: Final 2421
 * ... Event 10: Final 1815"). When a description covers multiple events like
 * that, each event only gets its own segment — otherwise every final is
 * credited with the other's movements.
 */
function eventSegment(description, event) {
  const headings = [...String(description).matchAll(/\bEvent\s+(\d+)\s*:/gi)];
  if (headings.length < 2) return description;

  const segments = headings.map((m, i) => ({
    num: Number(m[1]),
    text: description.slice(m.index, i + 1 < headings.length ? headings[i + 1].index : undefined),
  }));

  const target = normalise(event.name);
  const byName = target
    ? segments.find((s) => normalise(s.text.split('\n')[0]).includes(target))
    : null;
  if (byName) return byName.text;

  const byNumber = segments.find((s) => s.num === event.ordinal);
  return byNumber ? byNumber.text : description;
}

async function main() {
  const dataset = JSON.parse(await readFile(join(ROOT, 'data', 'games.json'), 'utf8'));
  const descriptions = JSON.parse(
    await readFile(join(ROOT, 'data', 'workout-descriptions.json'), 'utf8'),
  );
  const supplements = JSON.parse(
    await readFile(join(ROOT, 'data', 'workout-descriptions.overrides.json'), 'utf8'),
  );

  const unmatched = [];
  let matched = 0;
  let withMovements = 0;

  for (const year of dataset.years) {
    const candidates = (descriptions.years[year.year] ?? []).filter((c) => c.description);

    for (const ev of year.events) {
      if (ev.exclude) {
        ev.movements = [];
        continue;
      }
      const supplement = supplements[`${year.year}|${ev.name}`];
      if (supplement) {
        matched += 1;
        ev.description = supplement;
        ev.movements = extractMovements(supplement, ev.name);
        if (ev.movements.length) withMovements += 1;
        continue;
      }

      const hit = findDescription(ev, candidates);
      if (!hit) {
        ev.movements = [];
        ev.description = null;
        unmatched.push(`${year.year} ${ev.name}`);
        continue;
      }
      matched += 1;
      const description = eventSegment(hit.description, ev);
      ev.description = description;
      // Some events only name the movement in the title — "2020 Speed Snatch"
      // and "Cyclocross" describe format and course but never the movement.
      ev.movements = extractMovements(description, ev.name);
      if (ev.movements.length) withMovements += 1;
    }
  }

  await writeFile(join(ROOT, 'data', 'games.json'), JSON.stringify(dataset, null, 2));

  const total = dataset.years.reduce((n, y) => n + y.events.filter((e) => !e.exclude).length, 0);
  console.log(
    `Matched ${matched}/${total} events to a description; ${withMovements} yielded movements.`,
  );

  const counts = new Map();
  for (const y of dataset.years) {
    for (const ev of y.events) {
      for (const m of ev.movements ?? []) counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  const never = MOVEMENTS.filter((m) => !counts.has(m.key));
  console.log(`${counts.size}/${MOVEMENTS.length} movements in the vocabulary were found.`);
  if (never.length) console.log(`  never matched: ${never.map((m) => m.key).join(', ')}`);

  if (unmatched.length) {
    console.log(`\n⚠ ${unmatched.length} events without a description:`);
    for (const u of unmatched) console.log(`   ${u}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
