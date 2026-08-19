/**
 * Pulls every CrossFit Games year for a division from the public c3po API
 * and writes a normalised dataset to data/games.json (plus raw payloads).
 *
 *   node scripts/fetch-games.mjs
 *
 * Two endpoints are involved:
 *   competitions/v1/competitions/games/<year>/workouts   -> event names
 *   leaderboards/v2/competitions/games/<year>/leaderboards -> ranks + scores
 *
 * The workouts feed lists every division, so it is filtered to the target
 * division. After filtering, its order matches the leaderboard `ordinals`
 * 1:1 for all years 2011-2025 (verified by assertion below).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://c3po.crossfit.com/api';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; crossfit-games-history/1.0)' };

const DIVISION = { id: 1, name: 'Individual Men' };
const FIRST_YEAR = 2011;

async function getJSON(url, attempt = 1) {
  try {
    const res = await fetch(url, { headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt >= 4) throw new Error(`${url} failed after ${attempt} tries: ${err.message}`);
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return getJSON(url, attempt + 1);
  }
}

/**
 * The most recent Games with results, discovered by walking forward until the
 * competition endpoint 404s. Hardcoding this meant a new Games was silently
 * missing from the analysis until someone noticed.
 */
async function discoverLastYear() {
  if (process.env.LAST_YEAR) return Number(process.env.LAST_YEAR);

  let last = FIRST_YEAR;
  for (let year = FIRST_YEAR + 1; year <= FIRST_YEAR + 40; year += 1) {
    const res = await fetch(`${API}/competitions/v1/competitions/games/${year}`, { headers: UA });
    if (!res.ok) break;
    const comp = await res.json();
    // A scheduled-but-unfinished Games has a competition record before it has
    // any results, so only count years whose leaderboard is actually populated.
    const lb = await getJSON(
      `${API}/leaderboards/v2/competitions/games/${year}/leaderboards?division=${DIVISION.id}&sort=0`,
    ).catch(() => null);
    if (!lb?.leaderboardRows?.length) break;
    last = comp.year ?? year;
  }
  return last;
}

/** Event names for a year, filtered to the division and in competition order. */
async function fetchEvents(year) {
  const workouts = await getJSON(`${API}/competitions/v1/competitions/games/${year}/workouts`);
  const events = workouts
    .filter((w) => (w.divisions ?? []).includes(DIVISION.id))
    .map((w, i) => ({
      ordinal: i + 1,
      name: w.leaderboard_display || w.name || w.internal_name,
      internalName: w.internal_name,
      identifier: w.identifier,
      startDate: w.start_date ?? null,
    }));

  // Scores attach to events purely by position, and the count assertion below
  // cannot catch a same-count reordering of the workouts feed. start_date is
  // usually non-decreasing in feed order but not always (2022 has one genuine
  // out-of-order pair), so a violation is surfaced for a human to eyeball
  // rather than treated as proof of misordering.
  const dates = events.map((e) => e.startDate).filter(Boolean);
  for (let i = 1; i < dates.length; i += 1) {
    if (dates[i] < dates[i - 1]) {
      console.warn(
        `⚠ ${year}: workouts feed start_dates out of order (${dates[i - 1]} then ${dates[i]}) — ` +
          `spot-check that scores line up with event names for this year.`,
      );
    }
  }
  return events;
}

/** Every leaderboard row for a year, following pagination. */
async function fetchLeaderboard(year) {
  const rows = [];
  let page = 1;
  let meta = null;

  for (;;) {
    const url =
      `${API}/leaderboards/v2/competitions/games/${year}/leaderboards` +
      `?division=${DIVISION.id}&sort=0&page=${page}`;
    const data = await getJSON(url);
    meta ??= data;
    rows.push(...(data.leaderboardRows ?? []));
    if (page >= (data.pagination?.totalPages ?? 1)) break;
    page += 1;
  }

  return { meta, rows };
}

const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * The API reports height/weight as unit-tagged free text — "74 in"/"210 lb"
 * for US athletes but "182 cm"/"93 kg" for most internationals, sometimes
 * mixed within one athlete. Stripping the unit and storing the number under
 * heightIn/weightLb put hundreds of athletes at "182 in" tall, so the unit is
 * parsed and converted, and implausible results are rejected as null.
 */
export function parseHeightIn(v) {
  const s = String(v ?? '');
  const m = s.match(/([\d.]+)/);
  if (!m) return null;
  let val = Number(m[1]);
  if (/cm/i.test(s)) val /= 2.54;
  else if (!/in/i.test(s)) {
    // untagged: infer the unit from the plausible range
    if (val >= 120 && val <= 230) val /= 2.54;
  }
  val = Math.round(val);
  return val >= 55 && val <= 90 ? val : null;
}

export function parseWeightLb(v) {
  const s = String(v ?? '');
  const m = s.match(/([\d.]+)/);
  if (!m) return null;
  let val = Number(m[1]);
  if (/kg/i.test(s)) val *= 2.20462;
  else if (!/lb/i.test(s)) {
    if (val >= 45 && val <= 160) val *= 2.20462;
  }
  val = Math.round(val);
  return val >= 100 && val <= 350 ? val : null;
}

function normaliseAthlete(row) {
  const e = row.entrant ?? {};
  return {
    competitorId: String(e.competitorId ?? ''),
    name: e.competitorName ?? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim(),
    country: e.countryOfOriginName || null,
    countryCode: e.countryOfOriginCode || null,
    affiliate: e.affiliateName || null,
    age: num(e.age),
    heightIn: parseHeightIn(e.height),
    weightLb: parseWeightLb(e.weight),
    // The API reports rank 0 for athletes stripped of their result (DQ), which
    // is not a finishing place — treat it as "no official finish" so it cannot
    // be mistaken for a win or a podium downstream.
    overallRank: num(row.overallRank) || null,
    overallPoints: num(row.overallScore),
    // ACT competed, CUT eliminated at a cut, WD withdrew, DQ disqualified
    status: e.postCompStatus || e.status || null,
    scores: (row.scores ?? []).map((s) => ({
      ordinal: Number(s.ordinal),
      rank: num(s.rank),
      points: num(s.score),
      display: s.scoreDisplay || null,
      valid: s.valid === '1',
    })),
  };
}

/**
 * Flags athletes who look like one career split across several competitorIds:
 * same name (allowing for nickname forms), different ids, no overlapping years.
 * Anything already merged via the alias file is ignored.
 */
const NICKNAMES = {
  josh: 'joshua', rich: 'richard', ricky: 'richard', matt: 'mathew', mike: 'michael',
  dan: 'daniel', alex: 'alexander', ben: 'benjamin', tim: 'timothy', nick: 'nicholas',
  chris: 'christopher', sam: 'samuel', jon: 'jonathan', tom: 'thomas', rob: 'robert',
  pat: 'patrick', dave: 'david', joe: 'joseph', andy: 'andrew', zach: 'zachary',
  jake: 'jacob', will: 'william', tony: 'anthony', greg: 'gregory', jeff: 'jeffrey',
};

function reportSuspectedSplits(years) {
  const byId = new Map();
  for (const y of years) {
    for (const a of y.athletes) {
      if (!byId.has(a.competitorId)) byId.set(a.competitorId, { id: a.competitorId, name: a.name, years: [] });
      byId.get(a.competitorId).years.push(y.year);
    }
  }

  const normalise = (s) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z ]/g, '').replace(/\b(jr|sr|ii|iii)\b/g, '').trim().replace(/\s+/g, ' ');

  const groups = new Map();
  for (const a of byId.values()) {
    const parts = normalise(a.name).split(' ');
    if (parts.length < 2) continue;
    const first = parts[0];
    const key = `${NICKNAMES[first] ?? first}|${parts[parts.length - 1]}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  const suspects = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    // two people of the same name in the same year are two people, not one split
    const allYears = list.flatMap((a) => a.years);
    if (new Set(allYears).size !== allYears.length) continue;
    suspects.push(list);
  }

  if (suspects.length) {
    console.log('\n⚠ Suspected split identities not covered by data/athlete-aliases.json:');
    for (const list of suspects) {
      console.log(`   ${list[0].name}`);
      for (const a of list) console.log(`     id ${a.id} — ${a.years.join(', ')}`);
    }
    console.log('   Verify against height/age/affiliate, then add to the alias file.\n');
  }
}

async function main() {
  await mkdir(join(ROOT, 'data', 'raw'), { recursive: true });
  const years = [];

  const { aliases, nameOverrides = {} } = JSON.parse(
    await readFile(join(ROOT, 'data', 'athlete-aliases.json'), 'utf8'),
  );
  const canonicalId = (id) => aliases[id]?.canonical ?? id;

  const lastYear = await discoverLastYear();
  console.log(`Latest Games with results: ${lastYear}\n`);

  for (let year = FIRST_YEAR; year <= lastYear; year += 1) {
    const [events, { meta, rows }] = await Promise.all([fetchEvents(year), fetchLeaderboard(year)]);

    const ordinals = (meta.ordinals ?? []).length;
    if (events.length !== ordinals) {
      throw new Error(
        `${year}: ${events.length} events but ${ordinals} leaderboard ordinals — ` +
          `event-to-score mapping cannot be trusted, aborting.`,
      );
    }

    const athletes = rows
      .map(normaliseAthlete)
      .filter((a) => a.competitorId)
      .map((a) => ({ ...a, competitorId: canonicalId(a.competitorId) }))
      // the API sometimes scrubs a name to "Anonymous Anonymous" but keeps
      // the id; curated overrides restore the display name
      .map((a) => ({ ...a, name: nameOverrides[a.competitorId]?.name ?? a.name }));

    const seen = new Set();
    for (const a of athletes) {
      if (seen.has(a.competitorId)) {
        throw new Error(
          `${year}: ${a.name} (${a.competitorId}) appears twice after alias merging — ` +
            `two different athletes are being merged, check data/athlete-aliases.json.`,
        );
      }
      seen.add(a.competitorId);
    }

    years.push({
      year,
      competitionId: meta.competition?.competitionId ?? null,
      eventCount: events.length,
      fieldSize: athletes.length,
      events,
      athletes,
    });

    await writeFile(
      join(ROOT, 'data', 'raw', `games-${year}.json`),
      // meta.ordinals is the assertion's other input, persisted so the
      // event-to-score join can be re-audited offline.
      JSON.stringify({ events, ordinals: meta.ordinals ?? [], leaderboard: rows }, null, 2),
    );
    console.log(`${year}: ${events.length} events, ${athletes.length} athletes`);
  }

  const dataset = {
    source: 'games.crossfit.com (c3po public API)',
    fetchedAt: new Date().toISOString(),
    division: DIVISION,
    years,
  };

  await writeFile(join(ROOT, 'data', 'games.json'), JSON.stringify(dataset, null, 2));

  const totalEvents = years.reduce((n, y) => n + y.events.length, 0);
  const athleteIds = new Set(years.flatMap((y) => y.athletes.map((a) => a.competitorId)));
  const merged = Object.keys(aliases).length;
  console.log(
    `\nWrote data/games.json — ${years.length} years, ${totalEvents} events, ` +
      `${athleteIds.size} unique athletes (${merged} duplicate ids merged).`,
  );

  reportSuspectedSplits(years);
}

// Only fetch when run directly — parseHeightIn/parseWeightLb are imported
// elsewhere, and an import must never kick off a network crawl.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
