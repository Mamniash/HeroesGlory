/**
 * Sprite-sheet path lookup for the hero sheet's secondary-skill icons and
 * morale/luck value icons. Pure lookup/path-building — no Foundry globals
 * — so it's unit-testable the same way as wounds.mjs/modifiers.mjs.
 */

const SYSTEM_ID = 'heroes-glory';

/**
 * Per-skill frame numbers for each tier, cross-referencing rules.md §3's
 * 21 secondary skills against the sprite sheet. `skillKey`/`tier` are both
 * schema `choices` fields (module/data/item-skill.mjs), so every call site
 * passes a key/tier this table is guaranteed to have.
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
 * Primary-skill/Experience/Mana icons (assets/pskil42) are one static
 * frame each, not value-driven. Health has no dedicated icon — the design
 * doc calls for reusing the Experience frame as a deliberate placeholder;
 * callers do that by passing 'experience' for a health icon rather than
 * this table gaining a redundant 'health' entry.
 * @type {Record<string, number>}
 */
const PRIMARY_SKILL_FRAMES = {
  attack: 0,
  defense: 1,
  magicPower: 2,
  knowledge: 3,
  experience: 4,
  mana: 5,
};

// Both sets (pskil42 — small slot icons, pskill — large tooltip icons) were
// unpacked by the same external script (def2png.py, outside this repo) from
// PSKILL.def and PSKIL42.def respectively. Frame order differs between
// those two .def containers: in the small set, frames 3 and 5 hold each
// other's picture relative to the large set (confirmed by opening the PNGs
// directly — pskil42_g00_f003.png is a scroll, pskil42_g00_f005.png is a
// book stack; pskill has it the other way and correctly so: f003 = books =
// Knowledge, f005 = scroll = Mana). Fixed here, not by swapping the files
// on disk, so re-running the unpack script on the same .def sources doesn't
// silently revert this.
const PRIMARY_SKILL_FRAMES_SMALL_OVERRIDE = {
  knowledge: 5,
  mana: 3,
};

/**
 * @param {'attack'|'defense'|'magicPower'|'knowledge'|'experience'|'mana'} key
 * @param {object} [options]
 * @param {boolean} [options.large]   82×93 version instead of the 42×42 slot icon.
 * @returns {string}
 */
export function primarySkillIconPath(key, { large = false } = {}) {
  const set = large ? 'pskill' : 'pskil42';
  const frames = large ? PRIMARY_SKILL_FRAMES : { ...PRIMARY_SKILL_FRAMES, ...PRIMARY_SKILL_FRAMES_SMALL_OVERRIDE };
  return `systems/${SYSTEM_ID}/assets/${set}/${set}_g00_f${frame(frames[key])}.png`;
}

/**
 * @param {string} skillKey   A CONFIG.HEROES_GLORY.secondarySkills key.
 * @param {'base'|'advanced'|'expert'} tier
 * @param {object} [options]
 * @param {boolean} [options.large]   82×93 version (tooltip/modal) instead of the 44×44 slot icon.
 * @returns {string}
 */
export function secondarySkillIconPath(skillKey, tier, { large = false } = {}) {
  const set = large ? 'secsk82' : 'secskill';
  const n = SECONDARY_SKILL_FRAMES[skillKey][tier];
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

/**
 * §6.3: the spellbook overlay's corner-ornament frame overlaid on a
 * spell's icon, one 4-frame set per school (assets/spellbook/<set>/) —
 * confirmed by direct visual inspection: f000 is a single corner
 * ornament, f001 two, f002 three, f003 all four (a complete frame),
 * matching the caster's mastery variant in that school 1:1 (the same 4
 * keys as item-spell.mjs's own `variants` schema: none/basic/advanced/
 * expert). Universal-school spells have no governing secondary skill
 * (rolls.mjs's SCHOOL_SKILL_KEYS has no `universal` entry either) and no
 * frame set exists for them — returns null, caller renders no overlay.
 * @type {Record<string, string>}
 */
const SCHOOL_FRAME_SETS = { earth: 'spleve', air: 'spleva', water: 'splevw', fire: 'splevf' };

/** @type {Record<string, number>} */
const VARIANT_FRAME_INDEX = { none: 0, basic: 1, advanced: 2, expert: 3 };

/**
 * @param {string} school   A CONFIG.HEROES_GLORY.schools key.
 * @param {'none'|'basic'|'advanced'|'expert'} variant
 * @returns {string|null}   `null` for `school: 'universal'` (no frame set).
 */
export function schoolFramePath(school, variant) {
  const set = SCHOOL_FRAME_SETS[school];
  if (!set) return null;
  return `systems/${SYSTEM_ID}/assets/spellbook/${set}/${set}_g00_f${frame(VARIANT_FRAME_INDEX[variant])}.png`;
}
