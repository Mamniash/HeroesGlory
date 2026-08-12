/**
 * §4.1: cumulative Опыт required to REACH each level (not the amount
 * gained per kill — that's random, Xd6 where X = creature level, handled
 * elsewhere/not automated here). Index 0 is unused so `LEVEL_EXPERIENCE[n]`
 * reads naturally as "XP for level n". Level progression itself isn't
 * automated in this system (rules.md §11) — this is purely an
 * informational "XP to next level" lookup for the sheet's tooltip.
 * @type {number[]}
 */
const LEVEL_EXPERIENCE = [
  0, // unused
  15, 45, 150, 220, 300, // 1-5
  400, 500, 650, 800, 950, // 6-10
  1100, 1300, 1600, 1900, 2200, // 11-15
  2500, 2800, 3200, 3600, 4000, // 16-20
];

/** §4.1: "свыше 20-го: +500 за уровень". */
const POST_20_STEP = 500;

/**
 * @param {number} level
 * @returns {number} cumulative XP required to reach `level`.
 */
export function experienceForLevel(level) {
  if (level <= 20) return LEVEL_EXPERIENCE[Math.max(0, level)];
  return LEVEL_EXPERIENCE[20] + (level - 20) * POST_20_STEP;
}

/**
 * How much more Опыт is needed to reach `currentLevel + 1`, given the
 * hero's current XP total. Floored at 0 — a hero already past the next
 * threshold isn't an error (level-up itself isn't automated).
 * @param {number} currentLevel
 * @param {number} currentExperience
 * @returns {number}
 */
export function experienceToNextLevel(currentLevel, currentExperience) {
  return Math.max(0, experienceForLevel(currentLevel + 1) - currentExperience);
}
