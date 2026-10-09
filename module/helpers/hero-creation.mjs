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

/**
 * The key of an artifact from a book table: "<artifactType>:<tableRow>".
 * Read from the type and the row flag, both copied onto the hero's item —
 * so a renamed or duplicated item keeps it. No row flag (an unbranded
 * «Доспех/Щит (N уровень)», a weapon, anything else) — no key.
 * @param {{system?: {artifactType?: string}, flags?: object}} item
 * @returns {string|null}
 */
export function artifactKey(item) {
  const type = item?.system?.artifactType;
  const row = item?.flags?.['heroes-glory']?.[ARTIFACT_TABLE_ROW_FLAG];
  if (!type || !Number.isInteger(row)) return null;
  return `${type}:${row}`;
}

/** Every key a starting artifact can have: the 61 rows of the six tables. */
export const STARTING_ARTIFACT_KEYS = ARTIFACT_TYPE_BY_D6.flatMap((type) =>
  Array.from({ length: ARTIFACT_TABLE_ROWS[type] }, (_, i) => `${type}:${i + 2}`));

/**
 * Starting artifacts taken in the world (§11, Сеня's request: the random
 * starting artifact is unique): the keys of every item with one on every
 * hero — however it got there, the GM's hand included.
 * @param {Iterable<{type: string, items: Iterable<object>}>} actors
 * @returns {Set<string>}
 */
export function takenStartingArtifactKeys(actors) {
  const taken = new Set();
  for (const actor of actors) {
    if (actor.type !== 'hero') continue;
    for (const item of actor.items) {
      const key = artifactKey(item);
      if (key) taken.add(key);
    }
  }
  return taken;
}

/**
 * The starting artifact from the attempts rolled so far. Each attempt is a
 * d6 for the type and the 2d6 totals for the row (a 12 on a 2–11 table is
 * rerolled inside the attempt, pickArtifactRow). An artifact some hero
 * already has throws out the whole attempt — type and row are rolled again.
 * With no free artifact among the attempts, the fallback is the first
 * attempt as it fell, not unique.
 * @param {Array<{typeDie: number, rowTotals: number[]}>} dice
 * @param {Set<string>} taken   takenStartingArtifactKeys
 * @returns {{artifactType: string, typeDie: number, row: number, rowRerolls: number,
 *   takenRerolls: number, unique: boolean}|null}  null if no attempt has a row yet
 */
export function pickUniqueArtifact(dice, taken) {
  let fallback = null;
  let valid = 0;
  for (const { typeDie, rowTotals } of dice) {
    const artifactType = artifactTypeForDie(typeDie);
    const pick = pickArtifactRow(rowTotals, ARTIFACT_TABLE_ROWS[artifactType]);
    if (!pick) continue;
    const result = { artifactType, typeDie, row: pick.row, rowRerolls: pick.rerolls, takenRerolls: valid };
    if (!taken.has(`${artifactType}:${pick.row}`)) return { ...result, unique: true };
    fallback ??= { ...result, takenRerolls: 0, unique: false };
    valid += 1;
  }
  return fallback;
}

/**
 * What the active GM does with a hero's waiting starting artifact, decided
 * inside its queue task: nothing if creation isn't complete or nothing
 * waits (reset, already handed out); only clear the mark if the hero
 * already holds the creation artifact (the item was created but clearing
 * the mark failed); otherwise hand it out.
 * @param {{complete?: boolean, artifactPending?: boolean}|null|undefined} creation
 * @param {Iterable<{flags?: object}>} items
 * @returns {'grant'|'clearOnly'|'skip'}
 */
export function startingArtifactAction(creation, items) {
  if (!creation?.complete || !creation.artifactPending) return 'skip';
  for (const item of items) {
    if (item?.flags?.['heroes-glory']?.[CREATION_GRANT_FLAG] === 'artifact') return 'clearOnly';
  }
  return 'grant';
}

/**
 * A queue that runs tasks strictly one at a time, in the order added — the
 * GM hands out starting artifacts through one, so two creations at once
 * can't both see the same artifact free.
 * @returns {(task: () => Promise<any>) => Promise<any>}
 */
export function createSerialQueue() {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task);
    tail = run.catch(() => {});
    return run;
  };
}

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
 * created" until the level picker first raises it (creation hands out
 * everything then); a hero already above level 0 without a completed
 * creation (made before creation existed) counts as created, with nothing
 * handed out.
 * @param {{level: number, creation: {complete: boolean}}} system
 * @returns {boolean}
 */
export function isHeroCreated(system) {
  return !!system.creation?.complete || (system.level ?? 0) > 0;
}

/**
 * Whether a level-up just applied belongs to creation — one of the level-ups
 * up to the level picked at creation, recorded for «Сбросить создание» and
 * followed by full Health and Mana. Level-ups past that level, earned in
 * play, are ordinary.
 * @param {{complete: boolean, targetLevel: number}} creation
 * @param {number} levelAfter   the hero's level after the level-up
 * @returns {boolean}
 */
export function isCreationLevelUp(creation, levelAfter) {
  return !!creation?.complete && levelAfter <= (creation.targetLevel ?? 0);
}

/**
 * The experience «Сбросить создание» leaves: what the hero had before
 * creation, plus whatever was earned past the picked level's threshold
 * (creation set the experience to that threshold; anything above it came
 * from play and stays).
 * @param {{experienceBefore: number, experience: number, targetThreshold: number}} args
 * @returns {number}
 */
export function creationResetExperience({ experienceBefore, experience, targetThreshold }) {
  return experienceBefore + Math.max(0, experience - targetThreshold);
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
