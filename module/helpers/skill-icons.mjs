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
 * The small slot icons (pskil42, secskill, imrl42, ilck42) are shown from
 * their xBRZ ×4 versions in `assets/<set>-x4/` (same file names), which the
 * browser scales down into the cell smoothly (_hd-icons.scss) — the originals
 * stretched ×1.26 pixel by pixel came out uneven. Built by
 * scripts/upscale_icons.py --hero-sheet; the originals stay in assets/<set>/.
 * @param {string} set
 * @param {number} n
 * @returns {string}
 */
function smallIconPath(set, n) {
  return `systems/${SYSTEM_ID}/assets/${set}-x4/${set}_g00_f${frame(n)}.png`;
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
  if (!large) return smallIconPath('pskil42', { ...PRIMARY_SKILL_FRAMES, ...PRIMARY_SKILL_FRAMES_SMALL_OVERRIDE }[key]);
  return `systems/${SYSTEM_ID}/assets/pskill/pskill_g00_f${frame(PRIMARY_SKILL_FRAMES[key])}.png`;
}

/**
 * @param {string} skillKey   A CONFIG.HEROES_GLORY.secondarySkills key.
 * @param {'base'|'advanced'|'expert'} tier
 * @param {object} [options]
 * @param {boolean} [options.large]   82×93 version (tooltip/modal) instead of the 44×44 slot icon.
 * @returns {string}
 */
export function secondarySkillIconPath(skillKey, tier, { large = false } = {}) {
  const n = SECONDARY_SKILL_FRAMES[skillKey][tier];
  if (!large) return smallIconPath('secskill', n);
  return `systems/${SYSTEM_ID}/assets/secsk82/secsk82_g00_f${frame(n)}.png`;
}

/**
 * §task: the level-up window's "pick a skill" placeholder — shown instead
 * of a real skill icon while more than one eligible skill exists and none
 * has been chosen yet (roll-actions.mjs's `buildUpgradePlaceholderSlot`).
 * Frame 0 of both sprite sheets, confirmed by direct visual inspection:
 * plain leather/parchment texture, no icon artwork at all — same as
 * frames 1-2, none of which `SECONDARY_SKILL_FRAMES` maps to any real
 * skill either (contrast frame 3, a real painted icon — pathfinding's own
 * base tier).
 */
const SECONDARY_SKILL_EMPTY_FRAME = 0;

/**
 * @param {object} [options]
 * @param {boolean} [options.large]   82×93 version instead of the 44×44 slot icon.
 * @returns {string}
 */
export function secondarySkillEmptyIconPath({ large = false } = {}) {
  if (!large) return smallIconPath('secskill', SECONDARY_SKILL_EMPTY_FRAME);
  return `systems/${SYSTEM_ID}/assets/secsk82/secsk82_g00_f${frame(SECONDARY_SKILL_EMPTY_FRAME)}.png`;
}

/**
 * Morale/Luck sprite sheets only cover the -3..+3 range (rules.md §2.2)
 * with 7 frames; clamped since Боевой дух has no limit at all (§11) and
 * can go past ±3. Удача never does: its total is clamped to ±3 where it is
 * computed (resolveLuckTotal, rolls.mjs) — the schema itself has no bound.
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
 * @param {boolean} [options.small]   22×12 version (IMRL22, the creature sheet's line).
 * @returns {string}
 */
export function moraleIconPath(value, { large = false, small = false } = {}) {
  if (!large && !small) return smallIconPath('imrl42', valueFrame(value));
  const set = large ? 'imrl82' : 'imrl22';
  return `systems/${SYSTEM_ID}/assets/${set}/${set}_g00_f${frame(valueFrame(value))}.png`;
}

/**
 * HOMM3's ILCK42/ILCK82 draw −3…0 as one and the same picture, so −1…−3
 * are our own frames — the +1…+3 horseshoes turned upside down
 * (scripts/build_luck_negative.py): the large ones in assets/ilck82-neg/,
 * the small ones inside assets/ilck42-x4/ (sources in assets/ilck42-neg/).
 * @param {number} value
 * @param {object} [options]
 * @param {boolean} [options.large]   82×93 version instead of the 42×38 slot icon.
 * @returns {string}
 */
export function luckIconPath(value, { large = false } = {}) {
  const n = valueFrame(value);
  if (!large) return smallIconPath('ilck42', n);
  const folder = n < 3 ? 'ilck82-neg' : 'ilck82';
  return `systems/${SYSTEM_ID}/assets/${folder}/ilck82_g00_f${frame(n)}.png`;
}

/**
 * Скорость / Зрение cells on the hero sheet: game-icons.net icons recoloured
 * to the sheet's gold (assets/game-icons/, authors and licence in
 * assets/weapons/README.md). The other candidates lie in the same folder —
 * swap the file name here to switch.
 */
const GAME_ICON = (name) => `systems/${SYSTEM_ID}/assets/game-icons/${name}.svg`;
const SPEED_ICON = 'lorc-wingfoot';
const VISION_ICONS = {
  normal: 'lorc-semi-closed-eye',
  darkvision: 'lorc-beast-eye',
  nightvision: 'lorc-moon',
  blindsense: 'skoll-sight-disabled',
};

/**
 * The Специализация cell while none is chosen: a padlock while none can be
 * taken, a laurel crown once one can (same gold recolour, same folder).
 * @param {boolean} available
 * @returns {string}
 */
export function specializationPlaceholderIconPath(available) {
  return GAME_ICON(available ? 'lorc-laurel-crown' : 'lorc-padlock');
}

/**
 * §4.3 p. 23: a specialization's own icon — a skill's: that skill's Expert
 * icon (the condition), a spell's: the spell's own icon from `assets/spells/`
 * (one size only — `large` changes nothing for a spell).
 * @param {{type: string, key: string}} spec
 * @param {Record<string, number>} spellFrames   specializations.mjs's
 *   SPECIALIZATION_SPELL_ICON_FRAMES (passed in: no import cycle).
 * @param {object} [options]
 * @param {boolean} [options.large]
 * @returns {string|null}
 */
export function specializationIconPath(spec, spellFrames, { large = false } = {}) {
  if (spec.type === 'skill' && SECONDARY_SKILL_FRAMES[spec.key]) return secondarySkillIconPath(spec.key, 'expert', { large });
  if (spec.type === 'spell' && spellFrames[spec.key] !== undefined) {
    return `systems/${SYSTEM_ID}/assets/spells/spells_g00_f${frame(spellFrames[spec.key])}.png`;
  }
  return null;
}

/** @returns {string} */
export function speedIconPath() {
  return GAME_ICON(SPEED_ICON);
}

/**
 * @param {string} vision   A CONFIG.HEROES_GLORY.visionTypes key.
 * @returns {string}
 */
export function visionIconPath(vision) {
  return GAME_ICON(VISION_ICONS[vision] ?? VISION_ICONS.normal);
}

/**
 * §6.3: the spellbook overlay's corner-ornament frame overlaid on a
 * spell's icon, one 4-frame set per school (assets/spellbook/<set>/) —
 * confirmed by direct visual inspection: f000 is a single corner
 * ornament, f001 two, f002 three, f003 all four (a complete frame),
 * matching the caster's mastery variant in that school 1:1 (the same 4
 * keys as item-spell.mjs's own `variants` schema: none/basic/advanced/
 * expert). No `universal` entry — a Универсальные spell has no frame set
 * of its own at all (§6.2/§11), it always borrows one of these four via
 * whichever real elemental school it resolved to (roll-actions.mjs's
 * findSpellVariant — see that function's own `resolvedSchool`, which is
 * what callers must pass here, never a raw `spell.system.school` for a
 * universal spell). `null` in means no school owned at all — same
 * "returns null, caller renders no overlay" result either way.
 * @type {Record<string, string>}
 */
const SCHOOL_FRAME_SETS = { earth: 'spleve', air: 'spleva', water: 'splevw', fire: 'splevf' };

/** @type {Record<string, number>} */
const VARIANT_FRAME_INDEX = { none: 0, basic: 1, advanced: 2, expert: 3 };

/**
 * @param {string|null} school   An elemental CONFIG.HEROES_GLORY.schools
 *   key (never `'universal'` itself — pass the already-resolved elemental
 *   school for a universal spell), or `null` for "no school owned".
 * @param {'none'|'basic'|'advanced'|'expert'} variant
 * @returns {string|null}   `null` for a `null`/unrecognized/`'universal'` school (no frame set).
 */
export function schoolFramePath(school, variant) {
  const set = SCHOOL_FRAME_SETS[school];
  if (!set) return null;
  return `systems/${SYSTEM_ID}/assets/spellbook/${set}/${set}_g00_f${frame(VARIANT_FRAME_INDEX[variant])}.png`;
}
