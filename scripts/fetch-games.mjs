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
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://c3po.crossfit.com/api';
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; crossfit-games-history/1.0)' };

const DIVISION = { id: 1, name: 'Individual Men' };
const FIRST_YEAR = 2011;
const LAST_YEAR = Number(process.env.LAST_YEAR ?? 2025);

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

/** Event names for a year, filtered to the division and in competition order. */
async function fetchEvents(year) {
  const workouts = await getJSON(`${API}/competitions/v1/competitions/games/${year}/workouts`);
  return workouts
    .filter((w) => (w.divisions ?? []).includes(DIVISION.id))
    .map((w, i) => ({
      ordinal: i + 1,
      name: w.leaderboard_display || w.name || w.internal_name,
      internalName: w.internal_name,
      identifier: w.identifier,
    }));
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

function normaliseAthlete(row) {
  const e = row.entrant ?? {};
  return {
    competitorId: String(e.competitorId ?? ''),
    name: e.competitorName ?? `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim(),
    country: e.countryOfOriginName || null,
    countryCode: e.countryOfOriginCode || null,
    affiliate: e.affiliateName || null,
    age: num(e.age),
    heightIn: num(e.height),
    weightLb: num(e.weight),
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

async function main() {
  await mkdir(join(ROOT, 'data', 'raw'), { recursive: true });
  const years = [];

  for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
    const [events, { meta, rows }] = await Promise.all([fetchEvents(year), fetchLeaderboard(year)]);

    const ordinals = (meta.ordinals ?? []).length;
    if (events.length !== ordinals) {
      throw new Error(
        `${year}: ${events.length} events but ${ordinals} leaderboard ordinals — ` +
          `event-to-score mapping cannot be trusted, aborting.`,
      );
    }

    const athletes = rows.map(normaliseAthlete).filter((a) => a.competitorId);

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
      JSON.stringify({ events, leaderboard: rows }, null, 2),
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
  console.log(
    `\nWrote data/games.json — ${years.length} years, ${totalEvents} events, ` +
      `${athleteIds.size} unique athletes.`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
