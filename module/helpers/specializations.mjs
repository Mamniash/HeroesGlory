/**
 * §4.3 p.23: specialization from level 10 — pure data/logic, no Foundry
 * globals, so it's unit-testable (`node --test`) the same way as
 * race-granted-items.mjs. module/documents/actor.mjs's
 * `#syncSpecializationEffect` and module/sheets/actor/hero-sheet.mjs's
 * picker/context-prep are the Foundry-facing callers.
 *
 * The 12 effect-text strings this file's SPECIALIZATION_EFFECT_TEXT_KEYS
 * point at live in lang/ru.json's HEROES_GLORY.Specialization.* block
 * (JSON has no comments, so the two verbatim book typos silently fixed in
 * transit are documented here instead — same "confirmed against the page
 * images, not a transcription slip on this end" convention as
 * scripts/data/skill-compendium-data.mjs's own header):
 *  - Интеллект: book has "Ваша максимальное значение Маны" — gender
 *    agreement is off ("значение" is neuter); fixed to "Ваше".
 *  - Цепная Молния: book has "а неполовину" (missing space); fixed to
 *    "а не половину".
 */

/**
 * The 7 secondary-skill-based specializations (requires Expert tier in
 * the skill) — CONFIG.HEROES_GLORY.secondarySkills keys, book p.23.
 * @type {string[]}
 */
export const SPECIALIZATION_SKILLS = ['assault', 'archery', 'armor', 'sorcery', 'intellect', 'necromancy', 'healing'];

/**
 * The 5 spell-based specializations (requires owning the exact spell) —
 * matched by name, same as everywhere else a spell is referenced in this
 * project (item-spell.mjs has no stable key of its own — see
 * race-granted-items.mjs's own comment on this same asymmetry).
 * @type {string[]}
 */
export const SPECIALIZATION_SPELLS = ['Цепная Молния', 'Воскрешение', 'Ускорение', 'Стена Огня', 'Клон'];

/**
 * Localization key for each specialization's own effect-text tooltip —
 * lang/ru.json's HEROES_GLORY.Specialization.* block, book p.23,
 * verbatim except two silently-fixed book typos (see that block's own
 * comment in lang/ru.json). Kept independent of any given skill's own
 * per-tier `system.effects` text (item-skill.mjs) — several of these
 * texts happen to restate an earlier tier's own wording almost word for
 * word (Нападение/Стрельба in particular — flagged separately, not
 * reconciled: this is page 23's own list, taken as its own independent
 * source, the same way the price-list's weapon categories were kept
 * independent of §8.1's weaponType field).
 * @type {{skill: Record<string,string>, spell: Record<string,string>}}
 */
export const SPECIALIZATION_EFFECT_TEXT_KEYS = {
  skill: {
    assault: 'HEROES_GLORY.Specialization.Assault',
    archery: 'HEROES_GLORY.Specialization.Archery',
    armor: 'HEROES_GLORY.Specialization.Armor',
    sorcery: 'HEROES_GLORY.Specialization.Sorcery',
    intellect: 'HEROES_GLORY.Specialization.Intellect',
    necromancy: 'HEROES_GLORY.Specialization.Necromancy',
    healing: 'HEROES_GLORY.Specialization.Healing',
  },
  spell: {
    'Цепная Молния': 'HEROES_GLORY.Specialization.ChainLightning',
    'Воскрешение': 'HEROES_GLORY.Specialization.Resurrection',
    'Ускорение': 'HEROES_GLORY.Specialization.Haste',
    'Стена Огня': 'HEROES_GLORY.Specialization.FireWall',
    'Клон': 'HEROES_GLORY.Specialization.Clone',
  },
};

/**
 * @param {string} type   'skill' | 'spell' | '' (none chosen).
 * @param {string} key
 * @returns {string|null}
 */
export function specializationEffectTextKey(type, key) {
  return SPECIALIZATION_EFFECT_TEXT_KEYS[type]?.[key] ?? null;
}

/**
 * §4.3: the one numeric specialization — Интеллект, +50 to max Mana —
 * applied through the same modifiers.mjs/ActiveEffect pipeline an
 * artifact's `system.modifiers` already uses (`mana.max` already
 * resolves to the ActiveEffect "final" phase there — see that file's own
 * comment). Every other specialization is procedural text with no number
 * to automate this way; Доспехи/Воскрешение are automated too, but
 * through their own dedicated hooks below, not through this list, since
 * neither is a flat stat modifier.
 * @param {string} type
 * @param {string} key
 * @returns {Array<{stat: string, mode: string, value: number}>}
 */
export function specializationModifiers(type, key) {
  if (type === 'skill' && key === 'intellect') {
    return [{ stat: 'mana.max', mode: 'add', value: 50 }];
  }
  return [];
}

/**
 * §4.3/§5.6: Доспехи specialization's "1/2 урона от всех физических
 * атак" — composed into the SAME target-state multiplier rollAttack
 * already applies for prone/unconscious (rolls.mjs's
 * `resolveTargetStateMultiplier`), not a second, separate multiplier
 * bolted on afterward. The book gives no rule for combining this with
 * prone/unconscious (the same kind of gap that function's own
 * unconscious-over-prone choice already had to fill) — multiplying them
 * together is this project's own explicit interpretation, not a book
 * rule.
 * @param {{type: string, key: string}|null|undefined} specialization
 * @returns {boolean}
 */
export function hasArmorSpecialization(specialization) {
  return specialization?.type === 'skill' && specialization?.key === 'armor';
}

/**
 * §4.3: Воскрешение specialization's "Воскрешение стоит на 4 Маны
 * меньше" — the mana-cost half only ("не получает Ранение" stays text,
 * §5.9's wound counter is manual). Matched by exact spell name, same
 * "no stable key" reasoning as SPECIALIZATION_SPELLS above — only
 * applies when the spell actually being cast is "Воскрешение" itself,
 * not merely because the hero has this specialization.
 * @param {{type: string, key: string}|null|undefined} specialization
 * @param {string} spellName
 * @returns {number}   0 or 4.
 */
export function specializationManaDiscount(specialization, spellName) {
  if (specialization?.type === 'spell' && specialization?.key === 'Воскрешение' && spellName === 'Воскрешение') {
    return 4;
  }
  return 0;
}

/**
 * §4.3: which specializations `actor` currently qualifies for — Expert
 * tier in one of the 7 skills, or owning one of the 5 spells by exact
 * name. Pure: takes plain {skillKey, tier} shapes and a plain list of
 * owned spell names, not real Foundry Items — same "thread the data in"
 * pattern as `secondarySkillSlotCount` (rolls.mjs).
 * @param {Array<{skillKey: string, tier: string}>} ownedSkills
 * @param {string[]} ownedSpellNames
 * @returns {Array<{type: 'skill'|'spell', key: string}>}
 */
export function availableSpecializations(ownedSkills, ownedSpellNames) {
  const skillOptions = SPECIALIZATION_SKILLS
    .filter((key) => ownedSkills.some((s) => s.skillKey === key && s.tier === 'expert'))
    .map((key) => ({ type: 'skill', key }));
  const spellOptions = SPECIALIZATION_SPELLS
    .filter((name) => ownedSpellNames.includes(name))
    .map((name) => ({ type: 'spell', key: name }));
  return [...skillOptions, ...spellOptions];
}
