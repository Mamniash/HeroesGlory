/**
 * Sprite-sheet path lookup for the hero sheet's secondary-skill icons and
 * morale/luck value icons. Pure lookup/path-building — no Foundry globals
 * — so it's unit-testable the same way as wounds.mjs/modifiers.mjs.
 */

const SYSTEM_ID = 'heroes-glory';

/**
 * Per-skill frame numbers for each tier, cross-referencing rules.md §3's
 * 21 secondary skills against the sprite sheet. `skillKey` is a schema
 * `choices` field (module/data/item-skill.mjs) but also `blank: true`
 * (initial `""`) for a freshly created, not-yet-configured skill Item —
 * so this table is NOT guaranteed to have every key a real skill Item can
 * carry. See `secondarySkillIconPath`'s fallback below.
 * @type {Record<string, {base: number, advanced: number, expert: number}>}
 */
const SECONDARY_SKILL_FRAMES = {
  pathfinding: { base: 3, advanced: 4, expert: 5 },
  archery: { base: 6, advanced: 7, expert: 8 },
  scouting: { base: 12, advanced: 13, expert: 14 },
  diplomacy: { base: 15, advanced: 16, expert: 17 },
  leadership: { base: 21, advanced: 22, expert: 23 },
  wisdom: { base: 24, advanced: 25, expert: 26 },
  mysticism: { base: 27, advanced: 28, expert: 29 },
  luck: { base: 30, advanced: 31, expert: 32 },
  necromancy: { base: 39, advanced: 40, expert: 41 },
  fireMagic: { base: 45, advanced: 46, expert: 47 },
  airMagic: { base: 48, advanced: 49, expert: 50 },
  waterMagic: { base: 51, advanced: 52, expert: 53 },
  earthMagic: { base: 54, advanced: 55, expert: 56 },
  tactics: { base: 60, advanced: 61, expert: 62 },
  aptitude: { base: 66, advanced: 67, expert: 68 },
  assault: { base: 69, advanced: 70, expert: 71 },
  armor: { base: 72, advanced: 73, expert: 74 },
  intellect: { base: 75, advanced: 76, expert: 77 },
  sorcery: { base: 78, advanced: 79, expert: 80 },
  interference: { base: 81, advanced: 82, expert: 83 },
  healing: { base: 84, advanced: 85, expert: 86 },
};

function frame(n) {
  return String(n).padStart(3, '0');
}

/**
 * Frames 000-002 are the sprite sheet's blank-slot placeholder art (design
 * doc). Used when `secondarySkillIconPath` is asked for a skillKey/tier
 * combination the frame table doesn't have — most commonly a skill Item
 * that's been created but not yet configured (`item-skill.mjs`'s
 * `skillKey` field is `blank: true`, defaulting to `""`, precisely so a
 * fresh skill can exist before the user picks what it is).
 * @type {number}
 */
const EMPTY_SKILL_FRAME = 0;

/**
 * Primary-skill/Experience/Mana icons (assets/pskil42) are one static
 * frame each, not value-driven. Health has no dedicated icon — the design
 * doc calls for reusing the Experience frame as a deliberate placeholder;
 * callers do that by passing 'experience' for a health icon rather than
 * this table gaining a redundant 'health' entry.
 *
 * Frame identification confirmed by opening the actual PNGs: f000 crossed
 * swords (Attack), f001 shield (Defense), f002 glowing open book (Magic
 * Power), f003 scroll (Mana), f004 star medal (Experience), f005 stack of
 * books (Knowledge). An earlier pass had f003/f005 swapped — a plain
 * "stack of books" reads as Knowledge (a library), not Mana; the scroll
 * fits a single prepared spell/Mana better than a whole shelf of tomes.
 * @type {Record<string, number>}
 */
const PRIMARY_SKILL_FRAMES = {
  attack: 0,
  defense: 1,
  magicPower: 2,
  mana: 3,
  experience: 4,
  knowledge: 5,
};

/**
 * @param {'attack'|'defense'|'magicPower'|'knowledge'|'experience'|'mana'} key
 * @param {object} [options]
 * @param {boolean} [options.large]   82×93 version instead of the 42×42 slot icon.
 * @returns {string}
 */
export function primarySkillIconPath(key, { large = false } = {}) {
  const set = large ? 'pskill' : 'pskil42';
  return `systems/${SYSTEM_ID}/assets/${set}/${set}_g00_f${frame(PRIMARY_SKILL_FRAMES[key])}.png`;
}

/**
 * Falls back to the empty-slot placeholder (with a console warning, not a
 * thrown error) for any skillKey/tier this table doesn't cover — an
 * unconfigured skill Item (`skillKey: ""`) is a normal, reachable state,
 * not a data error, and one bad skill on an actor must not blank the
 * whole hero sheet for every other field on it.
 * @param {string} skillKey   A CONFIG.HEROES_GLORY.secondarySkills key.
 * @param {'base'|'advanced'|'expert'} tier
 * @param {object} [options]
 * @param {boolean} [options.large]   82×93 version (tooltip/modal) instead of the 44×44 slot icon.
 * @returns {string}
 */
export function secondarySkillIconPath(skillKey, tier, { large = false } = {}) {
  const set = large ? 'secsk82' : 'secskill';
  const n = SECONDARY_SKILL_FRAMES[skillKey]?.[tier];
  if (n === undefined) {
    console.warn(`Heroes & Glory | No secondary-skill icon frame for skillKey="${skillKey}" tier="${tier}" — using the empty-slot placeholder.`);
    return `systems/${SYSTEM_ID}/assets/${set}/${set}_g00_f${frame(EMPTY_SKILL_FRAME)}.png`;
  }
  return `systems/${SYSTEM_ID}/assets/${set}/${set}_g00_f${frame(n)}.png`;
}

/**
 * Morale/Luck sprite sheets only cover the -3..+3 range (rules.md §2.2)
 * with 7 frames; clamped defensively since artifacts/effects can in
 * practice push the stored value outside that range (schema only enforces
 * the -3..3 bound on Удача, not on Боевой дух).
 * @param {number} value
 * @returns {number}
 */
function valueFrame(value) {
  return Math.min(6, Math.max(0, value + 3));
}

/**
 * @param {number} value
 * @param {object} [options]
 * @param {boolean} [options.large]   82×93 version instead of the 42×38 slot icon.
 * @returns {string}
 */
export function moraleIconPath(value, { large = false } = {}) {
  const set = large ? 'imrl82' : 'imrl42';
  return `systems/${SYSTEM_ID}/assets/${set}/${set}_g00_f${frame(valueFrame(value))}.png`;
}

/**
 * @param {number} value
 * @param {object} [options]
 * @param {boolean} [options.large]   82×93 version instead of the 42×38 slot icon.
 * @returns {string}
 */
export function luckIconPath(value, { large = false } = {}) {
  const set = large ? 'ilck82' : 'ilck42';
  return `systems/${SYSTEM_ID}/assets/${set}/${set}_g00_f${frame(valueFrame(value))}.png`;
}
