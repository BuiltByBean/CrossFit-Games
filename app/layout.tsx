import type { Metadata } from 'next';
import Link from 'next/link';
import { getAnalysisWithSource } from '@/lib/data';
import './globals.css';

export const metadata: Metadata = {
  title: 'CrossFit Games — Cross-Era Analysis',
  description:
    'Every CrossFit Games event since 2011 tagged by fitness domain, with a three-model cross-era GOAT analysis for Individual Men.',
};

const LINKS = [
  ['/', 'Overview'],
  ['/goat', 'GOAT Table'],
  ['/transplant', 'Era Transplant'],
  ['/athletes', 'Athletes'],
  ['/events', 'Events'],
  ['/domains', 'Domains'],
  ['/methodology', 'Methodology'],
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { analysis, source } = await getAnalysisWithSource();

  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="wrap nav-inner">
            <Link href="/" className="brand">
              CROSSFIT<span>/</span>GAMES
            </Link>
            <div className="nav-links">
              {LINKS.map(([href, label]) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </nav>

        <main>{children}</main>

        <footer>
          <div className="wrap">
            <p>
              Data: {analysis.division.name}, {analysis.years[0].year}–
              {analysis.years[analysis.years.length - 1].year}, from the public{' '}
              <a href="https://games.crossfit.com/leaderboard/games" target="_blank" rel="noreferrer">
                games.crossfit.com
              </a>{' '}
              leaderboard API. Served from {source === 'postgres' ? 'Postgres' : 'the committed JSON snapshot'}.
            </p>
            <p>
              Generated {new Date(analysis.generatedAt).toISOString().slice(0, 10)}. Domain tags are an
              interpretive layer — see <Link href="/methodology">methodology</Link>.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
