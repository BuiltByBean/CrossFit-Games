/**
 * Scrapes the published workout descriptions from games.crossfit.com into
 * data/workout-descriptions.json.
 *
 *   node scripts/fetch-workouts.mjs
 *
 * The leaderboard API exposes event names but never the workouts themselves,
 * so the movement analysis needs the public workout pages. Each year renders
 * one <li id="eventRow…> per event containing a heading and a description
 * block; both are pulled out and reduced to plain text.
 *
 * Descriptions are matched back to leaderboard events by name in
 * scripts/tag-movements.mjs, not here — headings on these pages are written
 * inconsistently ("Event 3 - Murph", "Murph", "Murph (100 Points)").
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; crossfit-games-history/1.0)' };
const FIRST_YEAR = 2011;

const stripTags = (html) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&deg;/g, '°')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

async function fetchYear(year) {
  // 2026 moved the Games under a "finals" path; older years stayed on "games"
  for (const path of [`games/${year}`, `finals/${year}`]) {
    const res = await fetch(`https://games.crossfit.com/workouts/${path}?division=1`, { headers: UA });
    if (!res.ok) continue;
    const html = await res.text();

    const chunks = html.split(/<li id="eventRow/).slice(1);
    const events = [];
    for (const chunk of chunks) {
      const heading = chunk.match(/<div class="events-heading">([\s\S]*?)<\/div>/);
      if (!heading) continue;
      // one event per year renders expanded, as "description collapse in"
      const body = chunk.match(/<div class="description collapse[^"]*"[^>]*>([\s\S]*)$/);
      const text = body ? stripTags(body[1]) : '';
      events.push({ heading: stripTags(heading[1]), description: text });
    }
    if (events.length) return events;
  }
  return [];
}

async function main() {
  const dataset = JSON.parse(
    await (await import('node:fs/promises')).readFile(join(ROOT, 'data', 'games.json'), 'utf8'),
  );
  const lastYear = dataset.years[dataset.years.length - 1].year;

  await mkdir(join(ROOT, 'data'), { recursive: true });
  const years = {};
  let total = 0;
  let empty = 0;

  for (let year = FIRST_YEAR; year <= lastYear; year += 1) {
    const events = await fetchYear(year);
    years[year] = events;
    total += events.length;
    empty += events.filter((e) => !e.description).length;
    console.log(
      `${year}: ${events.length} descriptions` +
        (events.filter((e) => !e.description).length
          ? ` (${events.filter((e) => !e.description).length} empty)`
          : ''),
    );
  }

  await writeFile(
    join(ROOT, 'data', 'workout-descriptions.json'),
    JSON.stringify({ source: 'games.crossfit.com/workouts', fetchedAt: new Date().toISOString(), years }, null, 2),
  );
  console.log(`\nWrote data/workout-descriptions.json — ${total} descriptions, ${empty} empty.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
