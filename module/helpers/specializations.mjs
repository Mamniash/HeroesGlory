/**
 * §4.3 p.23: specialization from level 10 — pure data/logic, no Foundry
 * globals, so it's unit-testable (`node --test`) the same way as
 * race-granted-items.mjs. module/documents/actor.mjs's
 * `#syncSpecializationEffect`, module/apps/specialization-window.mjs (the
 * sheet's cell and window) and roll-actions.mjs are the Foundry-facing
 * callers.
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

/** §4.3 p. 23: «Достигнув 10-го уровня». */
export const SPECIALIZATION_MIN_LEVEL = 10;

/**
 * The spell specializations' icons — frames of `assets/spells/` (the spell
 * compendium's own, scripts/data/spell-compendium-data.mjs), fixed here so
 * the sheet's cell never depends on the hero's copy of the spell.
 * @type {Record<string, number>}
 */
export const SPECIALIZATION_SPELL_ICON_FRAMES = {
  'Цепная Молния': 19,
  'Воскрешение': 38,
  'Ускорение': 53,
  'Стена Огня': 13,
  'Клон': 65,
};

/**
 * Specializations with no automation — the GM applies them by hand
 * (Некромантия: the system has no necromancy; Лечение: waits for the skill's
 * own action, rules.md §11).
 * @type {Set<string>}
 */
const MANUAL_SPECIALIZATIONS = new Set(['skill:necromancy', 'skill:healing']);

/**
 * All 12 specializations in the book's order (p. 23): skills, then spells.
 * @returns {Array<{type: 'skill'|'spell', key: string}>}
 */
export function specializationList() {
  return [
    ...SPECIALIZATION_SKILLS.map((key) => ({ type: 'skill', key })),
    ...SPECIALIZATION_SPELLS.map((key) => ({ type: 'spell', key })),
  ];
}

/**
 * @param {string} type
 * @param {string} key
 * @returns {boolean}   whether `{type, key}` is one of the 12.
 */
export function isSpecialization(type, key) {
  return type === 'skill' ? SPECIALIZATION_SKILLS.includes(key) : type === 'spell' && SPECIALIZATION_SPELLS.includes(key);
}

/**
 * @param {string} type
 * @param {string} key
 * @returns {boolean}   no automation — «Применяет Ведущий вручную».
 */
export function isManualSpecialization(type, key) {
  return MANUAL_SPECIALIZATIONS.has(`${type}:${key}`);
}

/**
 * The tier order of a secondary skill, for "the highest one owned".
 * @type {string[]}
 */
const TIER_ORDER = ['base', 'advanced', 'expert'];

/**
 * The highest tier owned of one skill, or null.
 * @param {Array<{skillKey: string, tier: string}>} ownedSkills
 * @param {string} key
 * @returns {string|null}
 */
function ownedTier(ownedSkills, key) {
  let best = -1;
  for (const s of ownedSkills) {
    if (s.skillKey === key) best = Math.max(best, TIER_ORDER.indexOf(s.tier));
  }
  return best >= 0 ? TIER_ORDER[best] : null;
}

/**
 * §4.3 p. 23: what one specialization still needs for this hero — the level
 * (10), and Expert in its skill or owning its spell (rules.md §11: «владеть
 * заклинанием» — the spell is among the hero's items; whether it can be cast
 * yet is a separate note, not a condition).
 * @param {{type: string, key: string}} spec
 * @param {object} hero
 * @param {number} hero.level
 * @param {Array<{skillKey: string, tier: string}>} hero.ownedSkills
 * @param {string[]} hero.ownedSpellNames   by compendium origin, name as fallback
 *   (`specializationSpellName`).
 * @returns {{met: boolean, missingLevel: boolean, missingSkill: boolean, ownedTier: string|null, missingSpell: boolean}}
 */
export function specializationRequirement(spec, { level, ownedSkills, ownedSpellNames }) {
  const missingLevel = level < SPECIALIZATION_MIN_LEVEL;
  const tier = spec.type === 'skill' ? ownedTier(ownedSkills, spec.key) : null;
  const missingSkill = spec.type === 'skill' && tier !== 'expert';
  const missingSpell = spec.type === 'spell' && !ownedSpellNames.includes(spec.key);
  return {
    met: !missingLevel && !missingSkill && !missingSpell,
    missingLevel,
    missingSkill,
    ownedTier: tier,
    missingSpell,
  };
}

/**
 * §4.3 p. 23: why this hero can't take any specialization yet — for the
 * cell's short hint («Не хватает: …»). `null` when one can be taken.
 * @param {object} hero   same shape as `specializationRequirement`'s.
 * @returns {{level: number|null, skills: Array<{key: string, tier: string}>|null, spells: boolean}|null}
 *   `level` — the hero's level when below 10; `skills` — when no skill of the
 *   7 is Expert: the ones owned below Expert (closest first); `spells` — when
 *   none of the 5 spells is owned.
 */
export function specializationShortage(hero) {
  const requirements = specializationList().map((spec) => ({ spec, req: specializationRequirement(spec, hero) }));
  if (requirements.some(({ req }) => req.met)) return null;
  const skillMet = requirements.some(({ spec, req }) => spec.type === 'skill' && !req.missingSkill);
  const spellMet = requirements.some(({ spec, req }) => spec.type === 'spell' && !req.missingSpell);
  const anyQualifies = skillMet || spellMet;
  const closest = requirements
    .filter(({ spec, req }) => spec.type === 'skill' && req.ownedTier && req.missingSkill)
    .map(({ spec, req }) => ({ key: spec.key, tier: req.ownedTier }))
    .sort((a, b) => TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier));
  return {
    level: hero.level < SPECIALIZATION_MIN_LEVEL ? hero.level : null,
    skills: anyQualifies ? null : closest,
    spells: !anyQualifies,
  };
}

/**
 * Which name a spell item counts under for a specialization (rules.md §11):
 * its compendium entry's (`_stats.compendiumSource` in the system's spell
 * compendium), so a renamed copy still counts; its own name otherwise.
 * @param {{name?: string, _stats?: {compendiumSource?: string|null}}|null} spell
 * @param {object} [options]
 * @param {(uuid: string, options: object) => ({name?: string}|null)} [options.lookup]
 *   `fromUuidSync` by default (a compendium uuid resolves to its index entry).
 * @returns {string}
 */
export function specializationSpellName(spell, { lookup = globalThis.fromUuidSync } = {}) {
  const source = spell?._stats?.compendiumSource ?? '';
  if (source.startsWith('Compendium.heroes-glory.spells.') && typeof lookup === 'function') {
    const name = lookup(source, { strict: false })?.name;
    if (name) return name;
  }
  return spell?.name ?? '';
}

/**
 * §4.3 p. 23, specialization «Цепная Молния» on that spell (rules.md §11,
 * our reading — Сеня may adjust): +1d6 to the damage, every extra target
 * takes the full damage, and two more targets the player picks, on top of
 * the ordinary chain.
 * @param {{type?: string, key?: string}|null} specialization
 * @param {string} spellName
 * @returns {{active: boolean, bonusDice: number, extraFactor: number|null, chosenTargets: number}}
 */
export function chainLightningSpecialization(specialization, spellName) {
  const active = specialization?.type === 'spell' && specialization?.key === 'Цепная Молния' && spellName === 'Цепная Молния';
  return active
    ? { active: true, bonusDice: 1, extraFactor: 1, chosenTargets: 2 }
    : { active: false, bonusDice: 0, extraFactor: null, chosenTargets: 0 };
}

/**
 * §4.3 p. 23, specialization «Ускорение» on that spell: «Ускоренные
 * персонажи получают еще +3 к Скорости» — added to the spell's own Скорость
 * at the cast.
 * @param {{type?: string, key?: string}|null} specialization
 * @param {string} spellName
 * @returns {number}   0 or 3
 */
export function hasteSpecializationBonus(specialization, spellName) {
  return specialization?.type === 'spell' && specialization?.key === 'Ускорение' && spellName === 'Ускорение' ? 3 : 0;
}

/**
 * §4.3 p. 23, specialization «Воскрешение» on that spell: «Воскрешенный
 * персонаж не получает ранение».
 * @param {{type?: string, key?: string}|null} specialization
 * @param {string} spellName
 * @returns {boolean}
 */
export function resurrectionSpecialization(specialization, spellName) {
  return specialization?.type === 'spell' && specialization?.key === 'Воскрешение' && spellName === 'Воскрешение';
}

/**
 * §4.3 p. 23, specialization «Стена Огня» on that spell: «Урон увеличен на
 * 5d6, добавляет одну дополнительную клетку со Стеной Огня».
 * @param {{type?: string, key?: string}|null} specialization
 * @param {string} spellName
 * @returns {{active: boolean, bonusDice: number, extraCells: number}}
 */
export function fireWallSpecialization(specialization, spellName) {
  const active = specialization?.type === 'spell' && specialization?.key === 'Стена Огня' && spellName === 'Стена Огня';
  return active ? { active: true, bonusDice: 5, extraCells: 1 } : { active: false, bonusDice: 0, extraCells: 0 };
}

/**
 * §4.3 p. 23, specialization «Клон» on that spell: «Вы создаёте двух клонов
 * вместо одного, если потратите вдвое больше Маны» — the player's choice at
 * the cast (rules.md §11).
 * @param {{type?: string, key?: string}|null} specialization
 * @param {string} spellName
 * @returns {{active: boolean, clones: number, manaFactor: number}}   with two clones
 */
export function cloneSpecialization(specialization, spellName) {
  const active = specialization?.type === 'spell' && specialization?.key === 'Клон' && spellName === 'Клон';
  return active ? { active: true, clones: 2, manaFactor: 2 } : { active: false, clones: 1, manaFactor: 1 };
}
