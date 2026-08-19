export type DomainKey =
  | 'running'
  | 'swimming'
  | 'machine'
  | 'endurance'
  | 'sprint'
  | 'strength'
  | 'weightlifting'
  | 'gymnastics'
  | 'strongman'
  | 'skill'
  | 'grip';

export type DomainWeights = Partial<Record<DomainKey, number>>;

export interface DomainMeta {
  label: string;
  blurb: string;
}

export interface EventSummary {
  ordinal: number;
  name: string;
  /** Athletes still in the competition for this event — reveals cuts and stages. */
  participants: number;
  scoreFormat: 'time' | 'load' | 'reps' | 'points' | 'calories' | 'other';
  medianSeconds: number | null;
  domains: DomainWeights;
  tagSource: 'curated' | 'inferred' | 'excluded';
  note: string | null;
  exclude: boolean;
  winner: string | null;
}

export interface YearSummary {
  year: number;
  eventCount: number;
  /** Athletes who recorded at least one event result — the true starting field. */
  fieldSize: number;
  /** Everyone on the entry list, including athletes who never started. */
  entrants: number;
  /** Depth of the field in SD units on the percentile scale, 0 = all-time average. */
  fieldStrength: number;
  /** Strength fitted separately on each model's own scale. */
  strengths: { percentile: number; official: number; zscore: number };
  champion: { name: string; competitorId: string } | null;
  domainMix: DomainWeights;
  events: EventSummary[];
}

export interface SeasonEvent {
  ordinal: number;
  name: string;
  rank: number | null;
  display: string | null;
  fieldSize: number;
  percentile: number;
  z: number;
  domains: DomainWeights;
}

export interface Season {
  competitorId: string;
  name: string;
  year: number;
  finish: number | null;
  /** ACT competed · CUT eliminated at a cut · WD withdrew · DQ disqualified */
  status: 'ACT' | 'CUT' | 'WD' | 'DQ' | null;
  fieldStrength: number;
  rawPercentileScore: number;
  fieldSize: number;
  officialPoints: number | null;
  percentileScore: number;
  officialScore: number;
  zScore: number;
  eventWins: number;
  /** Era-adjusted domain profile, on the all-time scale. */
  domains: DomainWeights;
  /** Raw within-year domain profile — same scale as events[].percentile. */
  rawDomains: DomainWeights;
  exposure: DomainWeights;
  events: SeasonEvent[];
}

export interface Transplant {
  year: number;
  projectedScore: number;
  /** Solo: this athlete alone swapped into that year's real field. */
  projectedFinish: number;
  /** Head-to-head: the whole cohort competing in that year at once. */
  headToHeadFinish: number | null;
  poolSize: number | null;
  fieldSize: number;
  actualFinish: number | null;
  actualStatus: 'ACT' | 'CUT' | 'WD' | 'DQ' | null;
  competed: boolean;
  coverage: number;
  strongest: { name: string; projected: number }[];
  weakest: { name: string; projected: number }[];
}

export interface Bio {
  country: string | null;
  countryCode: string | null;
  affiliate: string | null;
  age: number | null;
  heightIn: number | null;
  weightLb: number | null;
}

export interface ModelScore {
  score: number;
  rank: number;
}

export interface Career {
  competitorId: string;
  name: string;
  bio: Bio | null;
  seasons: Season[];
  appearances: number;
  years: number[];
  titles: number;
  podiums: number;
  topTens: number;
  eventWins: number;
  bestFinish: number | null;
  disqualified: number;
  totalEvents: number;
  meanPercentile: number;
  meanOfficial: number;
  meanZ: number;
  peakPercentile: number;
  totalPercentile: number;
  totalZ: number;
  domains: DomainWeights;
  domainExposure: DomainWeights;
  goatRank?: number;
  models?: { percentile: ModelScore; official: ModelScore; zscore: ModelScore };
  consensus?: { meanRank: number; spread: number; score: number };
  transplants?: Transplant[];
  transplantSummary?: {
    meanFinish: number;
    /** Mean projected finish as a fraction of the field (0 = winner). */
    meanFinishPct: number;
    bestYear: number;
    worstYear: number;
    wouldWin: number;
    wouldPodium: number;
    meanHeadToHead: number;
    h2hWins: number;
    h2hPodiums: number;
  };
}

export interface AthleteIndexEntry {
  competitorId: string;
  name: string;
  appearances: number;
  years: number[];
  bestFinish: number | null;
  titles: number;
  podiums: number;
  eventWins: number;
  meanPercentile: number;
  domains: DomainWeights;
  bio: Bio | null;
  goatRank: number | null;
}

export interface MovementLeader {
  competitorId: string;
  name: string;
  events: number;
  eventWins: number;
  meanPercentile: number;
}

export interface Movement {
  key: string;
  label: string;
  category: string;
  eventCount: number;
  firstYear: number;
  lastYear: number;
  yearsSeen: number;
  byYear: Record<number, number>;
  domainMix: DomainWeights;
  events: { year: number; ordinal: number; name: string }[];
  leaders: MovementLeader[];
  rankedCount: number;
}

export interface TransplantCalibration {
  n: number;
  meanAbsError: number;
  meanSignedError: number;
  /** Mean |error| as a fraction of the field size. */
  meanRelError: number;
  byYear: Record<string, { n: number; meanSignedError: number }>;
}

export interface Analysis {
  generatedAt: string;
  source: string;
  division: { id: number; name: string };
  domains: Record<DomainKey, DomainMeta>;
  methodology: {
    models: Record<'percentile' | 'official' | 'zscore', string>;
    adjustment: string;
    weights: { quality: number; peak: number; volume: number; hardware: number };
    hardwareScale: string;
    percentileBasis: string;
    minAppearances: number;
    consensus: string;
    transplant: {
      cohort: number;
      solo: string;
      headToHead: string;
      scale: string;
      calibration: TransplantCalibration & { basis: string; inSample: TransplantCalibration };
    };
    movements: { minEvents: number; fieldMinimum: number; basis: string };
  };
  years: YearSummary[];
  movements: Movement[];
  movementCategories: Record<string, { label: string; color: string }>;
  movementMixByYear: { year: number; total: number; mix: Record<string, number> }[];
  movementMinEvents: number;
  goat: Career[];
  allAthletes: AthleteIndexEntry[];
}
