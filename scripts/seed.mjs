/**
 * Loads data/analysis.json into the Railway Postgres described by prisma/schema.prisma.
 *
 *   DATABASE_URL=postgresql://... npm run db:setup
 *
 * Idempotent: wipes and reloads, so it is safe to re-run after rebuilding the
 * analysis. Writes both the relational tables (for querying) and a single
 * AnalysisSnapshot row (which is what the site reads).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and add your Railway URL.');
  }

  const a = JSON.parse(await readFile(join(ROOT, 'data', 'analysis.json'), 'utf8'));

  console.log('Clearing existing rows...');
  await prisma.eventResult.deleteMany();
  await prisma.season.deleteMany();
  await prisma.event.deleteMany();
  await prisma.athlete.deleteMany();
  await prisma.year.deleteMany();
  await prisma.analysisSnapshot.deleteMany();

  console.log('Writing years and events...');
  const eventIdByKey = new Map();
  for (const y of a.years) {
    await prisma.year.create({
      data: {
        year: y.year,
        fieldSize: y.fieldSize,
        // one Event row is created per entry in y.events below, including the
        // excluded aggregate, so the count must match that — y.eventCount is
        // the scoreable count and left the 2020 join off by one
        eventCount: y.events.length,
        champion: y.champion?.name ?? null,
        domainMix: y.domainMix,
      },
    });
    for (const e of y.events) {
      const row = await prisma.event.create({
        data: {
          year: y.year,
          ordinal: e.ordinal,
          name: e.name,
          scoreFormat: e.scoreFormat ?? 'other',
          medianSeconds: e.medianSeconds ?? null,
          domains: e.domains ?? {},
          tagSource: e.tagSource,
          note: e.note ?? null,
          excluded: !!e.exclude,
          winner: e.winner ?? null,
        },
      });
      eventIdByKey.set(`${y.year}|${e.ordinal}`, row.id);
    }
  }

  console.log(`Writing ${a.allAthletes.length} athletes...`);
  for (const ath of a.allAthletes) {
    await prisma.athlete.create({
      data: {
        competitorId: ath.competitorId,
        name: ath.name,
        country: ath.bio?.country ?? null,
        countryCode: ath.bio?.countryCode ?? null,
        affiliate: ath.bio?.affiliate ?? null,
        heightIn: ath.bio?.heightIn ?? null,
        weightLb: ath.bio?.weightLb ?? null,
        appearances: ath.appearances,
        titles: ath.titles,
        podiums: ath.podiums,
        eventWins: ath.eventWins,
        bestFinish: ath.bestFinish,
        goatRank: ath.goatRank ?? null,
        meanPercentile: ath.meanPercentile,
        domains: ath.domains ?? {},
      },
    });
  }

  console.log('Writing seasons and event results...');
  const { seasons } = JSON.parse(await readFile(join(ROOT, 'data', 'results.json'), 'utf8'));
  let resultCount = 0;

  for (const s of seasons) {
    const season = await prisma.season.create({
      data: {
        competitorId: s.competitorId,
        year: s.year,
        finish: s.finish,
        fieldSize: s.fieldSize,
        officialPoints: s.officialPoints,
        percentileScore: s.percentileScore,
        officialScore: s.officialScore,
        zScore: s.zScore,
        eventWins: s.eventWins,
        domains: s.domains,
      },
    });

    const rows = s.events
      .map((e) => ({
        seasonId: season.id,
        eventId: eventIdByKey.get(`${s.year}|${e.ordinal}`),
        rank: e.rank,
        display: e.display,
        percentile: e.percentile,
        z: e.z,
      }))
      .filter((r) => r.eventId != null);

    if (rows.length) {
      await prisma.eventResult.createMany({ data: rows, skipDuplicates: true });
      resultCount += rows.length;
    }
  }

  console.log('Writing the analysis snapshot...');
  await prisma.analysisSnapshot.create({
    data: {
      generatedAt: new Date(a.generatedAt),
      division: a.division.name,
      payload: a,
    },
  });

  console.log(
    `\nDone. ${a.years.length} years, ${a.allAthletes.length} athletes, ` +
      `${resultCount} event results, 1 snapshot.`,
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
