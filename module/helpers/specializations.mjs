/**
 * §4.3 p.23: specialization from level 10 — pure data/logic, no Foundry
 * globals, so it's unit-testable (`node --test`) the same way as
 * race-granted-items.mjs. A hero's specialization is an item of type
 * `specialization` (module/data/item-specialization.mjs) from the
 * compendium «Специализации» (scripts/data/specialization-compendium-data.mjs);
 * module/data/actor-hero.mjs derives `system.specialization` ({type, key})
 * from it, module/documents/item.mjs guards it, module/apps/
 * specialization-window.mjs and the hero sheet show and assign it.
 *
 * One place for each thing about a specialization (rules.md §4.3):
 *  - which 12 there are, their keys, condition, effects, «применяет Ведущий»,
 *    icon — this file (icons through skill-icons.mjs);
 *  - the name — a skill's: its secondary skill's label in lang/
 *    (CONFIG.HEROES_GLORY.secondarySkills); a spell's: its key below, the
 *    book's spell name (`specializationLabel`);
 *  - the book text — scripts/data/specialization-compendium-data.mjs, read
 *    from the compendium entry (or the hero's copy of it).
 */

import { HEROES_GLORY } from './config.mjs';

/** The compendium of the 12 (system.json). */
export const SPECIALIZATIONS_PACK = 'heroes-glory.specializations';

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
 * race-granted-items.mjs's own comment on this same asymmetry). The key is
 * the specialization's name too.
 * @type {string[]}
 */
export const SPECIALIZATION_SPELLS = ['Цепная Молния', 'Воскрешение', 'Ускорение', 'Стена Огня', 'Клон'];

/**
 * Which of the two groups a key belongs to — the namespaces never overlap
 * (Latin skill keys, Russian spell names), so the key alone says it.
 * @param {string} key
 * @returns {'skill'|'spell'|null}   null — not one of the 12
 */
export function specializationTypeOf(key) {
  if (SPECIALIZATION_SKILLS.includes(key)) return 'skill';
  if (SPECIALIZATION_SPELLS.includes(key)) return 'spell';
  return null;
}

/**
 * A key as the `{type, key}` the rest of the system reads, or null.
 * @param {string} key
 * @returns {{type: 'skill'|'spell', key: string}|null}
 */
export function specializationFromKey(key) {
  const type = specializationTypeOf(key);
  return type ? { type, key } : null;
}

/**
 * The name's source for each of the 12, book order: a skill's — the lang key
 * of its secondary skill; a spell's — the spell name itself (localizing a
 * string that is no key returns it unchanged). The item's `system.key`
 * choices and its sheet's drop-down.
 * @returns {Record<string, string>}
 */
export function specializationLabelKeys() {
  return Object.fromEntries([
    ...SPECIALIZATION_SKILLS.map((key) => [key, HEROES_GLORY.secondarySkills[key]]),
    ...SPECIALIZATION_SPELLS.map((key) => [key, key]),
  ]);
}

/**
 * The specialization's name.
 * @param {{type: string, key: string}} spec
 * @param {(key: string) => string} localize   `game.i18n.localize`, or a
 *   lang/ru.json lookup at build time
 * @returns {string}
 */
export function specializationLabel(spec, localize) {
  if (spec.type === 'skill' && HEROES_GLORY.secondarySkills[spec.key]) return localize(HEROES_GLORY.secondarySkills[spec.key]);
  return spec.key;
}

/**
 * The hero's specialization among its `specialization` items (rules.md §4.3:
 * one per hero). Should two be there anyway, the first by `sort`, then by id,
 * counts. An item whose key is none of the 12 never counts.
 * @param {Array<{id: string, sort: number, key: string}>} items
 * @returns {{spec: {type: string, key: string}|null, itemId: string|null, count: number, unresolved: Array<{id: string, key: string}>}}
 *   `count` — all specialization items; `unresolved` — those with no valid key
 */
export function pickSpecialization(items) {
  const ordered = [...items].sort((a, b) => ((a.sort ?? 0) - (b.sort ?? 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const unresolved = ordered.filter((i) => !specializationTypeOf(i.key)).map((i) => ({ id: i.id, key: i.key }));
  const first = ordered.find((i) => specializationTypeOf(i.key));
  return {
    spec: first ? specializationFromKey(first.key) : null,
    itemId: first?.id ?? null,
    count: ordered.length,
    unresolved,
  };
}

/**
 * Why a specialization item may not be created (rules.md §4.3, §11), or null
 * when it may. One rule for everyone, the GM too: a hero has at most one — a
 * replacement deletes the old one first. Only a hero takes one. A player
 * takes one of the 12 whose condition is met; the GM any of the 12.
 * @param {object} args
 * @param {string|null} args.parentType   the actor's type; null — a world or compendium item
 * @param {boolean} args.isGM
 * @param {number} args.existingCount   specialization items the hero has
 * @param {boolean} args.valid   the key is one of the 12
 * @param {boolean} args.met   its condition is met for this hero
 * @returns {'notHero'|'already'|'invalid'|'unmet'|null}
 */
export function specializationCreateRefusal({ parentType, isGM, existingCount, valid, met }) {
  if (parentType === null) return null;
  if (parentType !== 'hero') return 'notHero';
  if (existingCount > 0) return 'already';
  if (!valid) return 'invalid';
  if (!isGM && !met) return 'unmet';
  return null;
}

/**
 * A specialization dropped on the hero sheet (rules.md §4.3): what happens.
 *  - a player: one of the 12, none on the hero yet, the condition met — asked
 *    to confirm («Сменить потом сможет только Ведущий»); otherwise refused;
 *  - the GM, in any mode: any of the 12 — asked to confirm, «Заменить «X»?»
 *    when one is there, «Условие не выполнено» when not met; the very one
 *    already there — nothing to do.
 * @param {object} args
 * @param {boolean} args.isGM
 * @param {string|null} args.existingKey   the hero's specialization key, if any
 * @param {number} args.existingCount   specialization items on the hero
 * @param {string} args.key   the dropped one's key
 * @param {boolean} args.met
 * @returns {{action: 'refuse', reason: 'invalid'|'already'|'unmet'|'same'}|{action: 'confirm', replace: boolean, unmet: boolean}}
 */
export function specializationDropDecision({ isGM, existingKey, existingCount, key, met }) {
  if (!specializationTypeOf(key)) return { action: 'refuse', reason: 'invalid' };
  if (!isGM) {
    if (existingCount > 0) return { action: 'refuse', reason: 'already' };
    if (!met) return { action: 'refuse', reason: 'unmet' };
    return { action: 'confirm', replace: false, unmet: false };
  }
  if (existingCount === 1 && existingKey === key) return { action: 'refuse', reason: 'same' };
  return { action: 'confirm', replace: existingCount > 0, unmet: !met };
}

/**
 * The world migration of one hero from the old `system.specialization` field
 * (its stored value, `_source`; actor-hero.mjs) to an item: which key to
 * create, if any. Nothing when the hero is migrated already, the old field is
 * blank or none of the 12, or a specialization item is there already.
 * @param {object} args
 * @param {{type?: string, key?: string}|null} args.legacy
 * @param {boolean} args.migrated   the actor's migration flag
 * @param {number} args.itemCount   specialization items on the hero
 * @returns {{create: string|null}}
 */
export function legacySpecializationPlan({ legacy, migrated, itemCount }) {
  const key = legacy?.key ?? '';
  const valid = !!key && specializationTypeOf(key) === legacy?.type;
  return { create: !migrated && valid && itemCount === 0 ? key : null };
}

/**
 * §4.3: the one numeric specialization — Интеллект, +50 to max Mana —
 * applied through the same modifiers.mjs/ActiveEffect change pipeline an
 * artifact's `system.modifiers` uses (`mana.max` resolves to the "final"
 * phase there). Not stored on the actor: documents/actor.mjs yields an
 * in-memory effect built from this list in `allApplicableEffects`, so the
 * +50 is sorted among the artifacts' own Mana changes by the same priority
 * as before (multiply first, then add) — see that method's comment for why
 * prepareDerivedData was not the place. Every other specialization is
 * procedural text with no number to automate this way; Доспехи/Воскрешение
 * are automated too, but through their own dedicated hooks below, not
 * through this list, since neither is a flat stat modifier.
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
 * The hero-only notes on a specialization's sheet (rules.md §4.3): «эта не
 * действует» on a second item that doesn't count, «действует эта» on the one
 * that does while the hero has more than one, and «Сотворить пока нельзя: …»
 * (`castNote`) for a spell he can't cast yet. Nothing off a hero (the
 * compendium entry, an item in the sidebar).
 * @param {object} args
 * @param {boolean} args.onHero
 * @param {string} args.itemId
 * @param {string|null} [args.countingItemId]   the hero's `specializationItemId`
 * @param {number} [args.count]                 the hero's `specializationCount`
 * @param {string|null} [args.castNote]
 * @returns {{notCounted: boolean, duplicate: boolean, castNote: string|null}}
 */
export function specializationSheetNotes({ onHero, itemId, countingItemId = null, count = 0, castNote = null }) {
  if (!onHero) return { notCounted: false, duplicate: false, castNote: null };
  const counts = !!countingItemId && countingItemId === itemId;
  return {
    notCounted: !!countingItemId && !counts,
    duplicate: counts && count > 1,
    castNote: castNote || null,
  };
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
 * What the conditions read off a hero (a Foundry actor, or anything with its
 * `system.level` and `items`).
 * @param {{system: {level: number}, items: Iterable<object>}} actor
 * @param {object} [options]   passed to `specializationSpellName`
 * @returns {{level: number, ownedSkills: Array<{skillKey: string, tier: string}>, ownedSpellNames: string[]}}
 */
export function specializationHero(actor, options) {
  const items = [...(actor.items ?? [])];
  return {
    level: actor.system.level,
    ownedSkills: items.filter((i) => i.type === 'skill').map((i) => ({ skillKey: i.system.skillKey, tier: i.system.tier })),
    ownedSpellNames: items.filter((i) => i.type === 'spell').map((i) => specializationSpellName(i, options)),
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
