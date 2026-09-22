import { HEROES_GLORY } from './config.mjs';

/**
 * §2.6: starting primary-skill values + base secondary skill per concrete
 * class, copied verbatim from docs/rules.md's own §2.6 table. Pure data +
 * pure diff helper — no game/actor references — for the class-change
 * recompute confirmation on the hero sheet (module/sheets/actor/hero-sheet.mjs).
 * @type {Record<string, {attack:number, defense:number, magicPower:number, knowledge:number, secondarySkillKey:string}>}
 */
export const CLASS_STATS = {
  knight: { attack: 2, defense: 2, magicPower: 1, knowledge: 1, secondarySkillKey: 'leadership' },
  cleric: { attack: 1, defense: 0, magicPower: 2, knowledge: 2, secondarySkillKey: 'healing' },
  ranger: { attack: 1, defense: 3, magicPower: 1, knowledge: 1, secondarySkillKey: 'archery' },
  druid: { attack: 0, defense: 2, magicPower: 1, knowledge: 2, secondarySkillKey: 'mysticism' },
  alchemist: { attack: 1, defense: 1, magicPower: 2, knowledge: 2, secondarySkillKey: 'wisdom' },
  mage: { attack: 0, defense: 0, magicPower: 2, knowledge: 3, secondarySkillKey: 'intellect' },
  beastmaster: { attack: 0, defense: 4, magicPower: 1, knowledge: 1, secondarySkillKey: 'armor' },
  witch: { attack: 0, defense: 1, magicPower: 2, knowledge: 2, secondarySkillKey: 'earthMagic' },
  lord: { attack: 2, defense: 2, magicPower: 1, knowledge: 1, secondarySkillKey: 'diplomacy' },
  warlock: { attack: 0, defense: 0, magicPower: 3, knowledge: 2, secondarySkillKey: 'sorcery' },
  possessed: { attack: 2, defense: 2, magicPower: 1, knowledge: 1, secondarySkillKey: 'tactics' },
  heretic: { attack: 1, defense: 1, magicPower: 2, knowledge: 1, secondarySkillKey: 'fireMagic' },
  deathKnight: { attack: 1, defense: 2, magicPower: 2, knowledge: 1, secondarySkillKey: 'necromancy' },
  necromancer: { attack: 1, defense: 0, magicPower: 2, knowledge: 2, secondarySkillKey: 'necromancy' },
  barbarian: { attack: 4, defense: 0, magicPower: 1, knowledge: 1, secondarySkillKey: 'assault' },
  battlemage: { attack: 2, defense: 1, magicPower: 1, knowledge: 1, secondarySkillKey: 'assault' },
  wanderer: { attack: 3, defense: 1, magicPower: 1, knowledge: 1, secondarySkillKey: 'pathfinding' },
  elementalist: { attack: 0, defense: 0, magicPower: 3, knowledge: 3, secondarySkillKey: 'airMagic' },
  captain: { attack: 3, defense: 0, magicPower: 2, knowledge: 1, secondarySkillKey: 'luck' },
  navigator: { attack: 2, defense: 0, magicPower: 1, knowledge: 2, secondarySkillKey: 'waterMagic' },
};

/**
 * @param {string} classKey
 * @returns {object|null}
 */
export function statsForClass(classKey) {
  return CLASS_STATS[classKey] ?? null;
}

/**
 * lang/ru.json's `ClassDescription.<Key>` loc key for a concrete class —
 * shown in the classType-change confirm dialog (hero-sheet.mjs's
 * `#confirmClassEffectiveChange`, classType changes only; a faction
 * change shows `faction-icons.mjs`'s `factionDescriptionKey` instead).
 * The book itself has nothing beyond the stat table these 20 keys were
 * written from (§2.6, `CLASS_STATS` above) plus each class's own base
 * secondary skill — no per-class prose exists to quote. Every
 * "превосходит все прочие"/"меньше всего"-style claim in these 20
 * descriptions was checked against `CLASS_STATS`'s own numbers directly,
 * not eyeballed.
 * @param {string} classKey
 * @returns {string|null}   null for an unknown class key.
 */
export function classDescriptionKey(classKey) {
  if (!(classKey in CLASS_STATS)) return null;
  const suffix = classKey[0].toUpperCase() + classKey.slice(1);
  return `HEROES_GLORY.ClassDescription.${suffix}`;
}

/**
 * Class portrait for the classType-change confirm dialog's right-hand
 * column — same contract as `race-stats.mjs`'s `raceIconPath`/
 * `faction-icons.mjs`'s `factionIconPath`. Unlike the faction crests
 * (this project's own placeholder, no book source), these are real HOMM3
 * hero portraits, one per class, extracted from the base game + expansion
 * assets under `D:\HOMM3_Extracted` (`h3ab_bmp\HPL###<code>.bmp`, decoded
 * as plain BMP — no custom decoder needed, unlike the HotA-format ones
 * below) with `scripts/def2png.py`'s sibling convention (native px x6,
 * nearest-neighbor, matching the faction crests' own upscale factor):
 * 18 of the 20 classes match a HOMM3/Armageddon's Blade class 1:1 by the
 * source files' own 2-letter class-code suffix (not a guess — confirmed
 * both by the code and by the portrait's own art matching the class,
 * e.g. `Dk` = a skeletal face in a knight's helm for Death Knight, `Wz` =
 * a white-bearded pointed-hat wizard for Mage). `captain`/`navigator`
 * (Причал/Haven, HotA's own Cove faction — not part of the base game or
 * Armageddon's Blade) have no such filename-confirmed match; those two
 * are a visual best-guess from HotA's own portrait set
 * (`Data\HotA_1.8\01_Raw_PCX`, decoded with `scripts/h3pcx2png.py`, this
 * project's own existing HOMM3/HotA "PCX" decoder — no new script
 * written) — picked for reading as "pirate captain" / "ship's navigator"
 * respectively, not confirmed by a filename the way the other 18 are.
 * @param {string} classKey
 * @returns {string|null}   null for an unknown class key.
 */
export function classIconPath(classKey) {
  if (!(classKey in CLASS_STATS)) return null;
  return `systems/heroes-glory/assets/classes/${classKey}.png`;
}

/**
 * §4.2/rules.md с.22: d20 ranges for which primary skill grows on level-up,
 * per concrete class. Ranges are increasing, contiguous, and cover 1-20
 * (verified in test/class-stats.test.mjs). `warlock`'s magicPower range is
 * `5-12`, not the book's printed `4-12` — the book's own defense range
 * (`3-4`) and magicPower range (`4-12`) overlap on "4", which is a printing
 * error (rules.md §6.1); every other class's four ranges are disjoint and
 * contiguous, so `5-12` is the correction that restores that pattern here
 * too.
 * @type {Record<string, Array<{max:number, key:string}>>}
 */
export const PRIMARY_SKILL_ROLL_RANGES = {
  knight: [{ max: 6, key: 'attack' }, { max: 14, key: 'defense' }, { max: 17, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  cleric: [{ max: 3, key: 'attack' }, { max: 7, key: 'defense' }, { max: 14, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  ranger: [{ max: 5, key: 'attack' }, { max: 13, key: 'defense' }, { max: 16, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  druid: [{ max: 2, key: 'attack' }, { max: 6, key: 'defense' }, { max: 13, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  alchemist: [{ max: 4, key: 'attack' }, { max: 10, key: 'defense' }, { max: 15, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  mage: [{ max: 2, key: 'attack' }, { max: 4, key: 'defense' }, { max: 13, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  possessed: [{ max: 9, key: 'attack' }, { max: 14, key: 'defense' }, { max: 18, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  heretic: [{ max: 4, key: 'attack' }, { max: 7, key: 'defense' }, { max: 16, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  deathKnight: [{ max: 6, key: 'attack' }, { max: 11, key: 'defense' }, { max: 15, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  necromancer: [{ max: 3, key: 'attack' }, { max: 5, key: 'defense' }, { max: 12, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  lord: [{ max: 8, key: 'attack' }, { max: 15, key: 'defense' }, { max: 17, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  // §6.1: book prints "4-12" for magicPower, which overlaps defense's own
  // "3-4" on the value 4 — corrected to 5-12 to keep the range contiguous.
  warlock: [{ max: 2, key: 'attack' }, { max: 4, key: 'defense' }, { max: 12, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  barbarian: [{ max: 10, key: 'attack' }, { max: 16, key: 'defense' }, { max: 18, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  battlemage: [{ max: 6, key: 'attack' }, { max: 10, key: 'defense' }, { max: 16, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  beastmaster: [{ max: 6, key: 'attack' }, { max: 16, key: 'defense' }, { max: 18, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  witch: [{ max: 2, key: 'attack' }, { max: 6, key: 'defense' }, { max: 14, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  wanderer: [{ max: 5, key: 'attack' }, { max: 10, key: 'defense' }, { max: 15, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  elementalist: [{ max: 2, key: 'attack' }, { max: 5, key: 'defense' }, { max: 13, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  captain: [{ max: 9, key: 'attack' }, { max: 15, key: 'defense' }, { max: 18, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
  navigator: [{ max: 5, key: 'attack' }, { max: 8, key: 'defense' }, { max: 16, key: 'magicPower' }, { max: 20, key: 'knowledge' }],
};

/**
 * §6.1: "если класс не определён — равновероятный выбор из четырёх" — the
 * book gives no concrete split for this case, so an equal-quarters range
 * is used (decided, not derived from the book).
 * @type {Array<{max:number, key:string}>}
 */
export const PRIMARY_SKILL_ROLL_RANGES_FALLBACK = [
  { max: 5, key: 'attack' },
  { max: 10, key: 'defense' },
  { max: 15, key: 'magicPower' },
  { max: 20, key: 'knowledge' },
];

/**
 * §2.5: the concrete class (e.g. "knight") is derived from (faction,
 * classType), never stored on the actor — see config.mjs's
 * `classByFactionAndType`. Shared by the level-up flow
 * (helpers/roll-actions.mjs) and the hero sheet's own identity block/
 * class-change confirmation, which used to each compute this inline.
 * @param {string} faction
 * @param {string} classType
 * @returns {string|null}
 */
export function concreteClassKey(faction, classType) {
  if (!faction || !classType) return null;
  return HEROES_GLORY.classByFactionAndType[faction]?.[classType] ?? null;
}

/**
 * Pure before/after diff for the 4 primary skills — only stats that
 * actually change are included, so the confirm dialog doesn't show a
 * redundant "2 → 2" row. `current`/`target` are plain {attack, defense,
 * magicPower, knowledge} objects, not an Actor — callers must pass base
 * (`_source.system`) values, not effective (post-ActiveEffect) ones, since
 * all four stats are artifact-modifiable (CONFIG.HEROES_GLORY.artifactModifierStats).
 * @param {{attack:number, defense:number, magicPower:number, knowledge:number}} current
 * @param {{attack:number, defense:number, magicPower:number, knowledge:number}} target
 * @returns {Record<string, {before:number, after:number}>}
 */
export function classDiff(current, target) {
  const diff = {};
  for (const stat of ['attack', 'defense', 'magicPower', 'knowledge']) {
    if (current[stat] !== target[stat]) diff[stat] = { before: current[stat], after: target[stat] };
  }
  return diff;
}
