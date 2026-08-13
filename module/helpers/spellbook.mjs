/**
 * §6.3: stable total order for the spellbook overlay's 12-slot grid.
 * Level ascending; a level tie breaks by the spell's school position in
 * CONFIG.HEROES_GLORY.schools's declared key order (module/helpers/
 * config.mjs); a remaining tie breaks by name. The order is hardcoded
 * here rather than read off CONFIG at call time so this stays a plain,
 * Foundry-independent function like rolls.mjs's own SCHOOL_SKILL_KEYS —
 * keep in sync with config.mjs's HEROES_GLORY.schools key order if that
 * ever changes.
 * @type {string[]}
 */
const SCHOOL_ORDER = ['earth', 'air', 'water', 'fire', 'universal'];

/**
 * @param {{level: number, school: string, name: string}} a
 * @param {{level: number, school: string, name: string}} b
 * @returns {number}
 */
export function compareSpellsForBook(a, b) {
  if (a.level !== b.level) return a.level - b.level;
  const schoolDelta = SCHOOL_ORDER.indexOf(a.school) - SCHOOL_ORDER.indexOf(b.school);
  if (schoolDelta !== 0) return schoolDelta;
  return a.name.localeCompare(b.name);
}
