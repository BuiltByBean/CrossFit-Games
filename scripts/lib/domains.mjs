/**
 * The fitness-domain taxonomy every Games event is scored against.
 *
 * Weights per event sum to 1.0, so an event contributes exactly one
 * "event's worth" of signal spread across the domains it actually tests.
 */
export const DOMAINS = {
  running: { label: 'Running', blurb: 'Foot speed and running economy, track to trail.' },
  swimming: { label: 'Swim / Water', blurb: 'Open-water swimming, paddling and kayak work.' },
  machine: { label: 'Machines', blurb: 'Row, bike, ski and echo — pure engine on a fixed implement.' },
  endurance: { label: 'Endurance', blurb: 'Long aerobic grinds, typically 20 minutes and beyond.' },
  sprint: { label: 'Sprint / Power', blurb: 'Short maximal efforts under two minutes.' },
  strength: { label: 'Max Strength', blurb: 'One-rep-max and near-limit absolute loading.' },
  weightlifting: { label: 'Weightlifting', blurb: 'Barbell cycling and technical Olympic lifting.' },
  gymnastics: { label: 'Gymnastics', blurb: 'Bodyweight volume — pull-ups, muscle-ups, HSPU, midline.' },
  strongman: { label: 'Odd Object', blurb: 'Sandbags, yokes, sleds, worms and loaded carries.' },
  skill: { label: 'Skill / Coordination', blurb: 'Pegboards, handstand walks, obstacles, precision work.' },
  grip: { label: 'Grip', blurb: 'Sustained grip demand — ropes, bars, heavy holds and carries.' },
};

export const DOMAIN_KEYS = Object.keys(DOMAINS);

/**
 * Keyword rules applied to the event name, highest specificity first.
 * These are the automatic half of the hybrid tagger; anything in the
 * overrides file wins over these.
 */
export const NAME_RULES = [
  [/swim|paddle|pool|ocean|pier|lake day|kayak/i, { swimming: 0.7, endurance: 0.3 }],
  [/marathon row/i, { machine: 0.55, endurance: 0.45 }],
  [/\brow\b|rower|ski|bike|echo|assault|cyclocross|crit\b|pedal|bike to work/i, { machine: 0.6, endurance: 0.4 }],
  [/\brun\b|running|trail|track|5k|mile|ruck|cross-country/i, { running: 0.7, endurance: 0.3 }],
  [/1rm|1-rm|one rep|\btotal\b|\bmax\b|deadlift ladder|clean ladder|snatch ladder/i, { strength: 0.85, weightlifting: 0.15 }],
  [/speed ladder/i, { strength: 0.45, weightlifting: 0.4, skill: 0.15 }],
  [/handstand walk|handstand sprint|o-course|obstacle|pegboard|zigzag|agility/i, { skill: 0.6, gymnastics: 0.3, sprint: 0.1 }],
  [/handstand|hspu|muscle-up|muscle up|pull-up|pullup|ring|\bbar\b|toes-to-bar|ghd|midline|legless|inverted/i, { gymnastics: 0.7, grip: 0.2, skill: 0.1 }],
  [/rope|climb|peg/i, { gymnastics: 0.4, grip: 0.35, skill: 0.25 }],
  [/sandbag|yoke|sled|worm|pig|log|stone|carry|burden|snail|bob|corn sack|atlas/i, { strongman: 0.7, grip: 0.15, endurance: 0.15 }],
  [/sprint|suicide|firestorm|dash/i, { sprint: 0.7, running: 0.2, machine: 0.1 }],
  [/snatch|clean|jerk|thruster|squat|press|lift|barbell|grace|isabel|elizabeth|fran|diane|\bdt\b|jackie/i, { weightlifting: 0.6, strength: 0.2, endurance: 0.2 }],
  [/grip|hold|hang/i, { grip: 0.7, gymnastics: 0.2, strongman: 0.1 }],
  [/chipper|triplet|couplet|medley|complex|interval/i, { endurance: 0.35, weightlifting: 0.25, gymnastics: 0.25, machine: 0.15 }],
];

/** Fallback signal from how the event was scored, when the name says nothing. */
export function scoreFormatWeights(display, seconds) {
  if (!display) return null;
  if (/lb|kg/i.test(display)) return { strength: 0.85, weightlifting: 0.15 };
  if (/\bcal\b/i.test(display)) return { machine: 0.7, endurance: 0.3 };
  if (/\bin\b/.test(display)) return { sprint: 0.6, skill: 0.4 };
  if (seconds != null) {
    if (seconds >= 1800) return { endurance: 0.5, machine: 0.2, running: 0.2, gymnastics: 0.1 };
    if (seconds >= 900) return { endurance: 0.4, gymnastics: 0.25, weightlifting: 0.2, machine: 0.15 };
    if (seconds <= 120) return { sprint: 0.55, weightlifting: 0.2, gymnastics: 0.25 };
  }
  // generic mid-length metcon
  return { endurance: 0.3, weightlifting: 0.25, gymnastics: 0.25, machine: 0.2 };
}

/**
 * Parse a clock display into seconds.
 *
 * The Games mixes formats freely — "36.51", ":44.7", "17:59.34" and
 * "1:20:14.9" all appear, sometimes within a single event. Fields are
 * therefore read right-to-left (seconds, then minutes, then hours) rather
 * than pattern-matched, so "41:33" is 41 minutes and never 41 hours.
 */
export function parseSeconds(display) {
  if (!display) return null;
  const s = String(display).trim();
  if (/lb|kg|rep|pt|cal|\bin\b/i.test(s)) return null;
  if (!/^:?\d/.test(s)) return null; // "CAP", "CAP+2", "--"

  const parts = s.split(':');
  if (parts.length > 3) return null;

  const nums = parts.map((p) => (p === '' ? 0 : Number(p)));
  if (nums.some((n) => !Number.isFinite(n))) return null;

  return nums.reduce((total, n) => total * 60 + n, 0);
}

export function normalise(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  if (!total) return {};
  return Object.fromEntries(
    Object.entries(weights)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => [k, Number((v / total).toFixed(4))]),
  );
}
