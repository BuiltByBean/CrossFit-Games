/**
 * Movement vocabulary for parsing published workout descriptions.
 *
 * Order matters. Matching runs top to bottom and blanks out the text it has
 * consumed, so the most specific variant must come first — otherwise
 * "chest-to-bar pull-up" would also register a plain "pull-up", and
 * "dumbbell snatch" would register a barbell "snatch".
 */

export const MOVEMENT_CATEGORIES = {
  barbell: { label: 'Barbell', color: 'var(--d-weightlifting)' },
  dumbbell: { label: 'Dumbbell / KB', color: 'var(--d-strength)' },
  gymnastics: { label: 'Gymnastics', color: 'var(--d-gymnastics)' },
  monostructural: { label: 'Monostructural', color: 'var(--d-machine)' },
  oddobject: { label: 'Odd Object', color: 'var(--d-strongman)' },
  other: { label: 'Other', color: 'var(--d-skill)' },
};

/** @type {{key:string,label:string,category:keyof typeof MOVEMENT_CATEGORIES,patterns:RegExp[]}[]} */
export const MOVEMENTS = [
  // ---- dumbbell / kettlebell (before barbell, they share verb names) ----
  { key: 'db-snatch', label: 'Dumbbell Snatch', category: 'dumbbell', patterns: [/\b(single-arm |one-arm )?(dumbbell|db)[- ]snatch/i] },
  { key: 'db-ohs', label: 'Dumbbell Overhead Squat', category: 'dumbbell', patterns: [/\b(single-arm |one-arm )?(dumbbell|db)[- ]overhead squat/i] },
  { key: 'db-clean', label: 'Dumbbell Clean', category: 'dumbbell', patterns: [/\b(dumbbell|db)[- ]clean/i] },
  { key: 'db-lunge', label: 'Dumbbell Lunge', category: 'dumbbell', patterns: [/\b(dumbbell|db)[- ](walking )?lunge/i] },
  { key: 'db-overhead', label: 'Dumbbell Overhead', category: 'dumbbell', patterns: [/\b(dumbbell|db)[- ](shoulder[- ]to[- ]overhead|push press|press|jerk)/i] },
  { key: 'kb-swing', label: 'Kettlebell Swing', category: 'dumbbell', patterns: [/\b(kettlebell|kb)[- ]swing/i, /\bswings?\b(?=[^.]*kettlebell)/i] },
  { key: 'kb-overhead', label: 'Kettlebell Overhead', category: 'dumbbell', patterns: [/\b(kettlebell|kb)[- ](shoulder[- ]to[- ]overhead|overhead|jerk|press)/i] },
  { key: 'sdhp', label: 'Sumo Deadlift High Pull', category: 'dumbbell', patterns: [/sumo deadlift high[- ]pull|\bsdhp\b/i] },

  // ---- barbell ----
  { key: 'squat-snatch', label: 'Squat Snatch', category: 'barbell', patterns: [/\bsquat snatch/i] },
  { key: 'hang-snatch', label: 'Hang Snatch', category: 'barbell', patterns: [/\bhang (power |squat )?snatch/i] },
  { key: 'power-snatch', label: 'Power Snatch', category: 'barbell', patterns: [/\bpower snatch/i] },
  { key: 'snatch', label: 'Snatch', category: 'barbell', patterns: [/\bsnatch(es)?\b/i] },
  { key: 'squat-clean', label: 'Squat Clean', category: 'barbell', patterns: [/\bsquat clean/i] },
  { key: 'hang-clean', label: 'Hang Clean', category: 'barbell', patterns: [/\bhang (power |squat )?clean/i] },
  { key: 'power-clean', label: 'Power Clean', category: 'barbell', patterns: [/\bpower clean/i] },
  { key: 'clean-jerk', label: 'Clean and Jerk', category: 'barbell', patterns: [/\bclean(-| and | & )jerk/i] },
  { key: 'clean', label: 'Clean', category: 'barbell', patterns: [/\bcleans?\b/i] },
  { key: 'jerk', label: 'Jerk', category: 'barbell', patterns: [/\b(split |push |power )?jerks?\b/i] },
  { key: 'thruster', label: 'Thruster', category: 'barbell', patterns: [/\bthrusters?\b/i] },
  { key: 'overhead-squat', label: 'Overhead Squat', category: 'barbell', patterns: [/\boverhead squat/i, /\bOHS\b/] },
  { key: 'front-squat', label: 'Front Squat', category: 'barbell', patterns: [/\bfront squat/i] },
  { key: 'back-squat', label: 'Back Squat', category: 'barbell', patterns: [/\bback squat/i] },
  { key: 'deadlift', label: 'Deadlift', category: 'barbell', patterns: [/\bdeadlifts?\b/i] },
  { key: 'shoulder-to-overhead', label: 'Shoulder to Overhead', category: 'barbell', patterns: [/shoulder[- ]to[- ]overhead|\bS2OH\b/i] },
  { key: 'push-press', label: 'Push Press', category: 'barbell', patterns: [/\bpush press/i] },
  { key: 'strict-press', label: 'Strict Press', category: 'barbell', patterns: [/\b(strict |shoulder |overhead )press\b/i] },
  { key: 'bench-press', label: 'Bench Press', category: 'barbell', patterns: [/\bbench press/i] },
  { key: 'barbell-lunge', label: 'Barbell Lunge', category: 'barbell', patterns: [/(back|front|overhead)[- ]rack(ed)? (walking )?lunge/i, /overhead (walking )?lunge/i] },

  // ---- gymnastics ----
  { key: 'ring-muscle-up', label: 'Ring Muscle-up', category: 'gymnastics', patterns: [/\bring muscle[- ]ups?/i] },
  { key: 'bar-muscle-up', label: 'Bar Muscle-up', category: 'gymnastics', patterns: [/\bbar muscle[- ]ups?/i] },
  { key: 'muscle-up', label: 'Muscle-up', category: 'gymnastics', patterns: [/\bmuscle[- ]ups?/i] },
  { key: 'c2b-pullup', label: 'Chest-to-bar Pull-up', category: 'gymnastics', patterns: [/chest[- ]to[- ]bar( pull[- ]ups?)?/i, /\bC2B\b/i] },
  { key: 'pullup', label: 'Pull-up', category: 'gymnastics', patterns: [/\bpull[- ]ups?\b/i] },
  { key: 'strict-hspu', label: 'Strict Handstand Push-up', category: 'gymnastics', patterns: [/strict handstand push[- ]ups?/i] },
  { key: 'deficit-hspu', label: 'Deficit Handstand Push-up', category: 'gymnastics', patterns: [/deficit handstand push[- ]ups?/i] },
  { key: 'freestanding-hspu', label: 'Freestanding HSPU', category: 'gymnastics', patterns: [/free[- ]?standing handstand push[- ]ups?/i] },
  { key: 'hspu', label: 'Handstand Push-up', category: 'gymnastics', patterns: [/handstand push[- ]ups?/i, /\bHSPU\b/i] },
  { key: 'handstand-walk', label: 'Handstand Walk', category: 'gymnastics', patterns: [/handstand walk/i] },
  { key: 'handstand-hold', label: 'Handstand Hold', category: 'gymnastics', patterns: [/handstand hold/i] },
  { key: 'toes-to-bar', label: 'Toes-to-bar', category: 'gymnastics', patterns: [/toes[- ]to[- ]bars?/i, /\bT2B\b/i] },
  { key: 'ghd', label: 'GHD Sit-up', category: 'gymnastics', patterns: [/\bGHD\b/i] },
  { key: 'legless-rope', label: 'Legless Rope Climb', category: 'gymnastics', patterns: [/legless rope climb/i] },
  { key: 'rope-climb', label: 'Rope Climb', category: 'gymnastics', patterns: [/rope climb/i] },
  { key: 'pegboard', label: 'Pegboard', category: 'gymnastics', patterns: [/peg[- ]?board/i] },
  { key: 'ring-dip', label: 'Ring Dip', category: 'gymnastics', patterns: [/\bring dips?/i] },
  { key: 'dip', label: 'Dip', category: 'gymnastics', patterns: [/\bdips?\b/i] },
  { key: 'pushup', label: 'Push-up', category: 'gymnastics', patterns: [/\bpush[- ]ups?\b/i] },
  { key: 'burpee', label: 'Burpee', category: 'gymnastics', patterns: [/\bburpees?\b/i] },
  { key: 'box-jump', label: 'Box Jump', category: 'gymnastics', patterns: [/box jump/i] },
  { key: 'wall-walk', label: 'Wall Walk', category: 'gymnastics', patterns: [/wall walk/i] },
  { key: 'pistol', label: 'Pistol', category: 'gymnastics', patterns: [/\bpistols?\b/i, /single[- ]leg squat/i] },
  { key: 'air-squat', label: 'Air Squat', category: 'gymnastics', patterns: [/\bair squats?\b/i, /\bsquats\b(?!\s*(clean|snatch))/i] },
  { key: 'situp', label: 'Sit-up', category: 'gymnastics', patterns: [/\bsit[- ]ups?\b/i] },
  { key: 'rope-roll', label: 'Roll to Support', category: 'gymnastics', patterns: [/rolls? to support/i] },

  // ---- monostructural ----
  { key: 'swim', label: 'Swim', category: 'monostructural', patterns: [/\bswim(ming)?\b/i] },
  { key: 'paddle', label: 'Paddle / Kayak', category: 'monostructural', patterns: [/\bpaddle|kayak|surf[- ]?ski/i] },
  { key: 'run', label: 'Run', category: 'monostructural', patterns: [/\bruns?\b|\brunning\b|\bmile run\b|laps? on the track|track race/i] },
  { key: 'shuttle-run', label: 'Shuttle Run', category: 'monostructural', patterns: [/shuttle (run|sprint)/i] },
  { key: 'row', label: 'Row', category: 'monostructural', patterns: [/\brow(ing)?\b|\berg\b(?=[^.]*row)/i] },
  { key: 'ski', label: 'Ski Erg', category: 'monostructural', patterns: [/ski[- ]?erg|\bskis?\b(?=[^.]*(erg|meter|m\b))/i] },
  { key: 'echo-bike', label: 'Echo / Assault Bike', category: 'monostructural', patterns: [/echo bike|assault bike|air bike/i] },
  { key: 'bike', label: 'Bike', category: 'monostructural', patterns: [/\bbike|cycling|bicycle|cyclocross|criterium/i] },
  { key: 'double-under', label: 'Double-under', category: 'monostructural', patterns: [/double[- ]unders?/i] },
  { key: 'jump-rope', label: 'Jump Rope', category: 'monostructural', patterns: [/jump rope|single[- ]unders?/i] },

  // ---- odd object ----
  { key: 'sandbag', label: 'Sandbag', category: 'oddobject', patterns: [/sand ?bag/i] },
  { key: 'yoke', label: 'Yoke', category: 'oddobject', patterns: [/\byoke/i] },
  { key: 'sled', label: 'Sled', category: 'oddobject', patterns: [/\bsled\b|\bplow\b/i] },
  { key: 'worm', label: 'Worm', category: 'oddobject', patterns: [/\bworm\b/i] },
  { key: 'pig', label: 'Pig Flip', category: 'oddobject', patterns: [/\bpig\b/i] },
  { key: 'dball', label: 'D-Ball / Stone', category: 'oddobject', patterns: [/d[- ]?ball|atlas stone|\bstones?\b/i] },
  { key: 'wall-ball', label: 'Wall Ball', category: 'oddobject', patterns: [/wall[- ]?ball/i] },
  { key: 'medball', label: 'Medicine Ball', category: 'oddobject', patterns: [/medicine ball|med[- ]?ball/i] },
  { key: 'farmers-carry', label: 'Farmers Carry', category: 'oddobject', patterns: [/farmer'?s? (carry|walk)/i] },
  { key: 'carry', label: 'Loaded Carry', category: 'oddobject', patterns: [/\bcarry\b|\bcarries\b/i] },
  { key: 'log', label: 'Log', category: 'oddobject', patterns: [/\blogs?\b/i] },
  { key: 'tire', label: 'Tire Flip', category: 'oddobject', patterns: [/tire flip|\btire\b/i] },
  { key: 'sledgehammer', label: 'Sledgehammer', category: 'oddobject', patterns: [/sledgehammer|\bbanger\b/i] },

  // ---- other ----
  { key: 'obstacle', label: 'Obstacle', category: 'other', patterns: [/obstacle|\bo[- ]course\b/i] },
  { key: 'sprint', label: 'Sprint', category: 'other', patterns: [/\bsprints?\b/i] },
  { key: 'step-up', label: 'Step-up', category: 'other', patterns: [/step[- ]ups?/i] },
  { key: 'bear-crawl', label: 'Bear Crawl', category: 'other', patterns: [/bear crawl/i] },
  { key: 'throw', label: 'Throw', category: 'other', patterns: [/\bthrows?\b|\btoss\b/i] },
  { key: 'broad-jump', label: 'Broad Jump', category: 'other', patterns: [/broad jump|standing (long )?jump/i] },
];

/**
 * Movements named in a workout description.
 *
 * Matched text is blanked as it is consumed so a specific variant cannot also
 * register its generic form.
 */
export function extractMovements(description) {
  if (!description) return [];
  // The workout pages are littered with non-breaking spaces and typographic
  // dashes. A literal " " in a pattern will not match U+00A0, which silently
  // hid movements like "overhead·squat" until it was traced by char code.
  const cleaned = String(description)
    .replace(/\s+/g, ' ')
    .replace(new RegExp('[\u2010-\u2015\u2212]', 'g'), '-')
    .replace(new RegExp('[\u2018\u2019]', 'g'), "'");
  let text = ` ${cleaned} `;
  const found = [];

  for (const movement of MOVEMENTS) {
    let hit = false;
    for (const pattern of movement.patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      if (re.test(text)) {
        hit = true;
        text = text.replace(new RegExp(pattern.source, re.flags), (m) => ' '.repeat(m.length));
      }
    }
    if (hit) found.push(movement.key);
  }

  return found;
}
