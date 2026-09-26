/**
 * §2/§3/§6.1/§8 (book pp. 16–18): what a new hero receives at creation.
 * Pure — no Foundry globals; the creation flow (helpers/hero-creation-flow.mjs,
 * shown in the level-up window) rolls the dice and turns these decisions
 * into items and updates.
 */
import { resolveSecondarySkillRoll } from './rolls.mjs';

/** Flag key marking every item handed out by the creation window. */
export const CREATION_GRANT_FLAG = 'creationGrant';

/** Flag key marking the base secondary skill granted by the class. */
export const CLASS_BASE_SKILL_FLAG = 'classBaseSkill';

/**
 * Flag key on artifact compendium entries: the entry's row in its book
 * table (2d6 numbering, pp. 46–51). Absent on the unbranded
 * «Доспех/Щит (N уровень)» entries, which no book table lists.
 */
export const ARTIFACT_TABLE_ROW_FLAG = 'tableRow';

/** p. 18: d6 → artifact type, in the book's own list order. */
export const ARTIFACT_TYPE_BY_D6 = [
  'enchantedWeapon', 'enchantedArmor', 'enchantedShield', 'necklace', 'magicClothing', 'magicItem',
];

/**
 * Rows in each book artifact table (pp. 46–51): numbered 2–12 for enchanted
 * weapons, 2–11 for the other five.
 */
export const ARTIFACT_TABLE_ROWS = {
  enchantedWeapon: 11,
  enchantedArmor: 10,
  enchantedShield: 10,
  necklace: 10,
  magicClothing: 10,
  magicItem: 10,
};

/** p. 18: starting gold is 2d6 × 10. */
export const STARTING_GOLD_MULTIPLIER = 10;

/**
 * p. 16: the random second skill — d20 by the list (20 → Лечение or
 * Некромантия by faction, same rule as level-up). A result equal to the
 * class's base skill raises that skill to advanced instead of adding one.
 * @param {object} args
 * @param {number} args.die            d20
 * @param {string} args.faction
 * @param {string|null} args.baseSkillKey
 * @returns {{skillKey: string, upgradesBase: boolean}}
 */
export function resolveStartingSecondarySkill({ die, faction, baseSkillKey }) {
  const skillKey = resolveSecondarySkillRoll(die, { faction });
  return { skillKey, upgradesBase: skillKey === baseSkillKey };
}

/**
 * p. 18: the artifact type for a d6.
 * @param {number} d6
 * @returns {string}
 */
export function artifactTypeForDie(d6) {
  if (!Number.isInteger(d6) || d6 < 1 || d6 > 6) {
    throw new RangeError(`artifactTypeForDie: d6 must be an integer 1-6, got ${d6}`);
  }
  return ARTIFACT_TYPE_BY_D6[d6 - 1];
}

/**
 * A 2d6 row within an artifact table. The five tables numbered 2–11 have
 * no row 12 — that result is rerolled; given the successive 2d6 totals,
 * returns the first one the table has and how many were rerolled.
 * @param {number[]} totals     2d6 totals in the order rolled
 * @param {number} rowCount     rows in the table (ARTIFACT_TABLE_ROWS)
 * @returns {{row: number, rerolls: number}|null}  null if none fits yet
 */
export function pickArtifactRow(totals, rowCount) {
  const index = totals.findIndex((total) => total >= 2 && total <= 1 + rowCount);
  return index === -1 ? null : { row: totals[index], rerolls: index };
}

/**
 * p. 17: the starting weapon, ready-made — a wizard's weapon has damage 3,
 * a warrior's 5; a shooter ("стрелок (имеет стрелковое оружие)") gets a
 * ranged weapon at 5 and a melee weapon at 3 for close combat. The book
 * names no concrete item (race profiles offer a choice, pp. 8–13), so the
 * item is a standard one by class: a blade (Колющий/рубящий, the Клинковое
 * epic table, p. 41) the player renames on the item sheet.
 * @param {object} args
 * @param {string} args.classType   'warrior' | 'mage'
 * @param {boolean} args.archer
 * @returns {Array<{ranged: boolean, damage: number, weaponType: string, category: string, nameKey: string}>}
 */
export function startingWeaponSpecs({ classType, archer }) {
  const melee = (damage, nameKey) => ({ ranged: false, damage, weaponType: 'piercingSlashing', category: 'blade', nameKey });
  if (archer) {
    return [
      { ranged: true, damage: 5, weaponType: 'ranged', category: 'ranged', nameKey: 'HEROES_GLORY.Creation.WeaponRangedName' },
      melee(3, 'HEROES_GLORY.Creation.WeaponMeleeName'),
    ];
  }
  return classType === 'mage'
    ? [melee(3, 'HEROES_GLORY.Creation.WeaponMageName')]
    : [melee(5, 'HEROES_GLORY.Creation.WeaponWarriorName')];
}

/**
 * Whether the hero counts as created. A new hero sits at level 0 "not
 * created" until the creation window completes; a hero already above level
 * 0 without a completed creation (made before the window existed) counts
 * as created, with nothing handed out — unless a creation is in progress
 * (its level-ups raise the level before it completes).
 * @param {{level: number, creation: {complete: boolean}, pendingCreation: object|null}} system
 * @returns {boolean}
 */
export function isHeroCreated(system) {
  if (system.creation?.complete) return true;
  if (system.pendingCreation) return false;
  return (system.level ?? 0) > 0;
}

/** Identity fields creation needs, in the order the sheet shows them. */
export const IDENTITY_FIELDS = ['race', 'faction', 'classType'];

/**
 * The identity fields still blank — race, faction and class are all needed
 * before creation (the class for the base skill, weapon and book, the
 * faction for the concrete class and d20 row 20).
 * @param {{race: string, faction: string, classType: string}} system
 * @returns {string[]}   Subset of IDENTITY_FIELDS, in its order.
 */
export function missingIdentityFields(system) {
  return IDENTITY_FIELDS.filter((field) => !system[field]);
}

/**
 * The paperdoll slot a granted item goes into: the first of its valid
 * slots nobody occupies, or null (then it goes into the backpack).
 * @param {number[]} validSlots      paperdollValidSlots(item), in order
 * @param {Iterable<number>} occupiedSlots
 * @returns {number|null}
 */
export function pickFreeSlot(validSlots, occupiedSlots) {
  const occupied = new Set(occupiedSlots);
  return validSlots.find((slot) => !occupied.has(slot)) ?? null;
}

/**
 * What «Сбросить создание» takes back from the level-ups made inside
 * creation, given the record of each one (applied in order). Primary skills
 * and the Защита +5 ОЗ are subtracted; a skill a level-up granted is
 * deleted; a skill a level-up raised goes back to the tier it had before
 * the first such raise — unless it is being deleted anyway.
 * @param {Array<{primarySkillKey: string, healthAdded: number,
 *   grantedItemId: string|null, upgradedItemId: string|null, upgradedFromTier: string|null}>} levelUps
 * @returns {{primaryDeltas: Record<string, number>, healthDelta: number,
 *   deleteItemIds: string[], tierRestores: Array<{itemId: string, tier: string}>}}
 */
export function resolveCreationRollback(levelUps) {
  const primaryDeltas = {};
  let healthDelta = 0;
  const deleteItemIds = [];
  const originalTiers = new Map();
  for (const up of levelUps) {
    if (up.primarySkillKey) primaryDeltas[up.primarySkillKey] = (primaryDeltas[up.primarySkillKey] ?? 0) - 1;
    healthDelta -= up.healthAdded ?? 0;
    if (up.grantedItemId) deleteItemIds.push(up.grantedItemId);
    if (up.upgradedItemId && !originalTiers.has(up.upgradedItemId)) {
      originalTiers.set(up.upgradedItemId, up.upgradedFromTier);
    }
  }
  const deleted = new Set(deleteItemIds);
  const tierRestores = [...originalTiers]
    .filter(([itemId, tier]) => !deleted.has(itemId) && tier)
    .map(([itemId, tier]) => ({ itemId, tier }));
  return { primaryDeltas, healthDelta, deleteItemIds, tierRestores };
}

/**
 * p. 17: Книга Магии at creation. A wizard starts with the book and two
 * 1st-level spells of choice, an Алхимик with the book and one (the same
 * rule as for Мудрость, his base skill). Anyone else who rolled Мудрость
 * as the random skill gets the book and one spell. A wizard who rolled
 * Мудрость gets nothing extra; an Алхимик who rolled it only has the skill
 * raised to advanced (resolveStartingSecondarySkill).
 * @param {object} args
 * @param {string} args.classKey          concrete class, e.g. 'alchemist'
 * @param {string} args.classType         'warrior' | 'mage'
 * @param {string} args.rolledSkillKey    the random skill's result
 * @returns {{book: boolean, spellChoices: number}}
 */
export function startingSpellbookGrant({ classKey, classType, rolledSkillKey }) {
  if (classType === 'mage') return { book: true, spellChoices: 2 };
  if (classKey === 'alchemist') return { book: true, spellChoices: 1 };
  if (rolledSkillKey === 'wisdom') return { book: true, spellChoices: 1 };
  return { book: false, spellChoices: 0 };
}

/**
 * Whether the chosen spells are a valid pick: exactly `count` distinct
 * names, each among the offered 1st-level spells.
 * @param {string[]} chosen
 * @param {number} count
 * @param {string[]} offered
 * @returns {boolean}
 */
export function isValidSpellChoice(chosen, count, offered) {
  return chosen.length === count
    && new Set(chosen).size === chosen.length
    && chosen.every((name) => offered.includes(name));
}
