import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Analysis, Career } from './types';

/**
 * The analysis is a single build artifact. It is read from Postgres when a
 * Railway DATABASE_URL is configured and seeded, and from the committed JSON
 * otherwise — so the site runs before any database exists.
 */
let cache: { analysis: Analysis; source: 'postgres' | 'json' } | null = null;

async function fromPostgres(): Promise<Analysis | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const row = await prisma.analysisSnapshot.findFirst({ orderBy: { generatedAt: 'desc' } });
    await prisma.$disconnect();
    if (!row) return null;
    return row.payload as unknown as Analysis;
  } catch {
    // no client generated, no table yet, or the database is unreachable
    return null;
  }
}

export async function getAnalysis(): Promise<Analysis> {
  return (await getAnalysisWithSource()).analysis;
}

export async function getAnalysisWithSource() {
  if (cache) return cache;

  const fromDb = await fromPostgres();
  if (fromDb) {
    cache = { analysis: fromDb, source: 'postgres' };
    return cache;
  }

  const raw = await readFile(join(process.cwd(), 'data', 'analysis.json'), 'utf8');
  cache = { analysis: JSON.parse(raw) as Analysis, source: 'json' };
  return cache;
}

export async function getCareer(competitorId: string): Promise<Career | null> {
  const a = await getAnalysis();
  return a.goat.find((c) => c.competitorId === competitorId) ?? null;
}

export async function getYear(year: number) {
  const a = await getAnalysis();
  return a.years.find((y) => y.year === year) ?? null;
}
