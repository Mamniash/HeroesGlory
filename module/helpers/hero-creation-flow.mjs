/**
 * §2–§8, book pp. 16–18: hero creation. A new hero sits at level 0 "not
 * created"; the first time the level picker raises it, everything without a
 * choice is handed out at once (grantCreation) and creation is complete.
 * The level-ups up to the picked level then go through the ordinary
 * level-up window and are recorded here (recordCreationLevelUp) for
 * «Сбросить создание». What to hand out is decided by pure functions
 * (helpers/hero-creation.mjs); this file rolls the dice and writes.
 *
 * Not handed out — the player's own choice, added by hand from the
 * compendiums: a shooter's ranged weapon, and the 1st-level spells of the
 * starting Книга Магии (docs/rules.md §11).
 */
import { concreteClassKey, statsForClass } from './class-stats.mjs';
import { raceGrantedItems, CREATION_TIME_RACE_GRANTS } from './race-granted-items.mjs';
import { grantSecondarySkill } from './skill-grant.mjs';
import { ownersAndGmIds } from './roll-actions.mjs';
import { experienceForLevel } from './experience.mjs';
import { paperdollValidSlots } from './paperdoll-slots.mjs';
import {
  CREATION_GRANT_FLAG, CLASS_BASE_SKILL_FLAG, ARTIFACT_TABLE_ROW_FLAG, ARTIFACT_TABLE_ROWS,
  STARTING_GOLD_MULTIPLIER, resolveStartingSecondarySkill, artifactTypeForDie, pickArtifactRow,
  startingWeaponSpecs, startingSpellbookGrant, missingIdentityFields, pickFreeSlot,
  resolveCreationRollback, isCreationLevelUp, creationResetExperience,
} from './hero-creation.mjs';
import { WEAPON_EPIC_TABLES } from './weapon-epic-tables.mjs';

const FLAG_SCOPE = 'heroes-glory';
const SPELLS_PACK = 'heroes-glory.spells';
const ARTIFACTS_PACK = 'heroes-glory.artifacts';

/** Safety cap on rerolling a 12 on a 2–11 artifact table. */
const MAX_ARTIFACT_ROW_ROLLS = 50;

/**
 * Evaluates one Roll and returns its dice results.
 * @param {string} formula
 * @returns {Promise<number[]>}
 */
async function rollDice(formula) {
  const roll = new Roll(formula);
  await roll.evaluate();
  return roll.dice.flatMap((die) => die.results.map((r) => r.result));
}

/**
 * The Foundry notification for a blank race/faction/class, or null when all
 * three are chosen.
 * @param {object} system
 * @returns {string|null}
 */
export function missingIdentityMessage(system) {
  const missing = missingIdentityFields(system);
  if (!missing.length) return null;
  const fields = missing.map((field) => game.i18n.localize(`HEROES_GLORY.Creation.MissingField.${field}`)).join(', ');
  return game.i18n.format('HEROES_GLORY.Creation.MissingIdentity', { fields });
}

/**
 * The creation dice (p. 16 second skill, p. 18 gold and artifact).
 * @returns {Promise<{skillDie: number, goldDice: number[], artifactTypeDie: number, artifactRow: number, artifactRerolls: number}>}
 */
async function rollCreationDice() {
  const [skillDie] = await rollDice('1d20');
  const goldDice = await rollDice('2d6');
  const [artifactTypeDie] = await rollDice('1d6');
  const rowCount = ARTIFACT_TABLE_ROWS[artifactTypeForDie(artifactTypeDie)];
  const totals = [];
  let pick = null;
  while (!pick && totals.length < MAX_ARTIFACT_ROW_ROLLS) {
    const [a, b] = await rollDice('2d6');
    totals.push(a + b);
    pick = pickArtifactRow(totals, rowCount);
  }
  return { skillDie, goldDice, artifactTypeDie, artifactRow: pick.row, artifactRerolls: pick.rerolls };
}

/**
 * The artifact compendium entry for a table row, or null when the pack
 * predates the row flag (rebuild the artifacts pack).
 * @param {string} artifactType
 * @param {number} row
 */
async function findArtifactEntry(artifactType, row) {
  const pack = game.packs.get(ARTIFACTS_PACK);
  const index = await pack.getIndex({ fields: ['system.artifactType', `flags.${FLAG_SCOPE}.${ARTIFACT_TABLE_ROW_FLAG}`] });
  return index.find((e) => e.system?.artifactType === artifactType
    && e.flags?.[FLAG_SCOPE]?.[ARTIFACT_TABLE_ROW_FLAG] === row) ?? null;
}

/**
 * Copies a compendium document into item data for the actor, marked as a
 * creation grant.
 * @param {string} packId
 * @param {string} id
 * @param {string} kind
 */
async function compendiumItemData(packId, id, kind) {
  const data = (await game.packs.get(packId).getDocument(id)).toObject();
  delete data._id;
  data.flags = { ...data.flags, [FLAG_SCOPE]: { ...data.flags?.[FLAG_SCOPE], [CREATION_GRANT_FLAG]: kind } };
  return data;
}

/**
 * Paperdoll placement for a granted item: its first free valid slot
 * (weapon → 1, book → 10, an artifact → its targetSlots), else the
 * backpack. `occupied` collects the slots taken so far, this batch included.
 * @param {object} data       item data (type + system)
 * @param {Set<number>} occupied
 */
function placeInPaperdoll(data, occupied) {
  const slot = pickFreeSlot(paperdollValidSlots(data), occupied);
  data.system = { ...data.system, equipped: slot !== null, paperdollSlot: slot };
  if (slot !== null) occupied.add(slot);
  return data;
}

/** Джинн's items as display text. */
function describeRaceItems(raceItems) {
  return raceItems.map((want) => (want.itemType === 'spellbook' ? 'Книга Магии' : `«${want.spellName}»`)).join(', ');
}

/**
 * Health and Mana to their maxima — read after the update that changed
 * them (both maxima are derived).
 * @param {Actor} actor
 */
async function fillHealthAndMana(actor) {
  await actor.update({
    'system.health.value': actor.system.health.max,
    'system.mana.value': actor.system.mana.max,
  });
}

/**
 * The level picker raised a hero not created yet: hand out everything
 * without a choice, fill Health and Mana, mark creation complete, post the
 * card, and set the experience to the picked level's threshold (the
 * level-ups then go through the ordinary window). Called by the hero
 * sheet's level picker instead of its plain experience write.
 * @param {Actor} actor
 * @param {number} targetLevel   ≥ 1
 * @returns {Promise<boolean>} whether creation was applied
 */
export async function grantCreation(actor, targetLevel) {
  const system = actor.system;
  if (system.creation.complete || missingIdentityFields(system).length) return false;

  const dice = await rollCreationDice();
  const classKey = concreteClassKey(system.faction, system.classType);
  const baseSkillKey = statsForClass(classKey)?.secondarySkillKey ?? null;
  const skill = resolveStartingSecondarySkill({ die: dice.skillDie, faction: system.faction, baseSkillKey });
  const artifactType = artifactTypeForDie(dice.artifactTypeDie);
  const artifactEntry = await findArtifactEntry(artifactType, dice.artifactRow);
  if (!artifactEntry) {
    ui.notifications.error(game.i18n.localize('HEROES_GLORY.Creation.ArtifactMissing'));
    return false;
  }

  const grant = (kind) => ({ [FLAG_SCOPE]: { [CREATION_GRANT_FLAG]: kind } });
  const occupied = new Set(actor.items
    .filter((i) => i.system.equipped && i.system.paperdollSlot != null)
    .map((i) => i.system.paperdollSlot));
  const itemData = [];

  // p. 16: second skill — new at base tier, or the base skill raised.
  let upgradedSkillKey = '';
  if (skill.skillKey === baseSkillKey) {
    const baseItem = actor.items.find((i) => i.type === 'skill' && i.system.skillKey === baseSkillKey);
    if (baseItem) {
      if (baseItem.system.tier === 'base') {
        await baseItem.update({ 'system.tier': 'advanced' });
        upgradedSkillKey = baseSkillKey;
      }
    } else {
      await grantSecondarySkill(actor, baseSkillKey, 'advanced', { flags: { [CLASS_BASE_SKILL_FLAG]: baseSkillKey } });
      upgradedSkillKey = baseSkillKey;
    }
  } else if (!actor.items.some((i) => i.type === 'skill' && i.system.skillKey === skill.skillKey)) {
    await grantSecondarySkill(actor, skill.skillKey, 'base', { flags: { [CREATION_GRANT_FLAG]: 'skill' } });
  }

  // p. 17: an empty Книга Магии in slot 10 for those who start with one —
  // the spells are the player's choice. The item name is fixed Russian
  // text, not a localized label — it is persisted (same as the race grant).
  const spellbook = startingSpellbookGrant({ classKey, classType: system.classType, rolledSkillKey: skill.skillKey });
  let hasBook = actor.items.some((i) => i.type === 'spellbook');
  const bookData = (kind) => placeInPaperdoll({ name: 'Книга Магии', type: 'spellbook', system: {}, flags: grant(kind) }, occupied);
  if (spellbook.book && !hasBook) {
    itemData.push(bookData('spellbook'));
    hasBook = true;
  }

  // p. 11: Джинн — no choice: a book and «Волшебная Стрела» without a
  // starting book, «Молния» with one.
  const raceItems = CREATION_TIME_RACE_GRANTS.has(system.race)
    ? raceGrantedItems(system.race, system.raceSubchoice || null, { hasSpellbook: hasBook })
    : [];
  const spellIndex = await game.packs.get(SPELLS_PACK).getIndex();
  const ownedSpellNames = new Set(actor.items.filter((i) => i.type === 'spell').map((i) => i.name));
  for (const want of raceItems) {
    if (want.itemType === 'spellbook') {
      if (!hasBook) itemData.push(bookData('race'));
      hasBook = true;
    } else if (!ownedSpellNames.has(want.spellName)) {
      const entry = spellIndex.find((e) => e.name === want.spellName);
      if (entry) {
        ownedSpellNames.add(want.spellName);
        itemData.push(await compendiumItemData(SPELLS_PACK, entry._id, 'race'));
      }
    }
  }

  // p. 17: the standard starting weapon by class, slot 1.
  const weapons = startingWeaponSpecs({ classType: system.classType, archer: false })
    .map((spec) => ({ ...spec, name: game.i18n.localize(spec.nameKey) }));
  for (const weapon of weapons) {
    itemData.push(placeInPaperdoll({
      name: weapon.name,
      type: 'weapon',
      img: 'icons/svg/sword.svg',
      system: {
        weaponType: weapon.weaponType,
        damage: weapon.damage,
        epicTable: [...WEAPON_EPIC_TABLES[weapon.category]],
      },
      flags: grant('weapon'),
    }, occupied));
  }

  // p. 18: the random artifact — worn if its slot is free, else the backpack.
  itemData.push(placeInPaperdoll(await compendiumItemData(ARTIFACTS_PACK, artifactEntry._id, 'artifact'), occupied));

  await actor.createEmbeddedDocuments('Item', itemData);

  const goldSum = dice.goldDice.reduce((a, b) => a + b, 0);
  const gold = goldSum * STARTING_GOLD_MULTIPLIER;
  await actor.update({
    'system.gold': actor._source.system.gold + gold,
    'system.experience': Math.max(actor._source.system.experience, experienceForLevel(targetLevel)),
    'system.creation': {
      complete: true, gold, upgradedSkillKey, targetLevel,
      experienceBefore: actor._source.system.experience, levelUps: [],
    },
  });
  await fillHealthAndMana(actor);

  await postCreationCard(actor, {
    dice, goldSum, gold, skill, baseSkillKey, book: spellbook.book,
    raceItems, weapons, artifactType, artifactName: artifactEntry.name,
  });
  return true;
}

/**
 * After every applied level-up (level-up-app.mjs): a level-up up to the
 * level picked at creation is recorded for «Сбросить создание», and Health
 * and Mana are filled again. Anything past that level is ordinary.
 * @param {Actor} actor
 * @param {object} record   applyLevelUp's result
 */
export async function recordCreationLevelUp(actor, record) {
  const source = actor._source.system;
  if (!isCreationLevelUp(source.creation, source.level)) return;
  await actor.update({ 'system.creation.levelUps': [...(source.creation.levelUps ?? []), record] });
  await fillHealthAndMana(actor);
}

/**
 * The creation card — whispered to the hero's owners and the GM. No
 * `rolls`: the dice are in the card text (same as the level-up cards).
 */
async function postCreationCard(actor, { dice, goldSum, gold, skill, baseSkillKey, book, raceItems, weapons, artifactType, artifactName }) {
  const config = CONFIG.HEROES_GLORY;
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/hero-creation.hbs',
    {
      actorName: actor.name,
      dice,
      goldDiceText: dice.goldDice.join(' + '),
      goldSum,
      gold,
      skillLabelKey: config.secondarySkills[skill.skillKey],
      upgradesBase: skill.skillKey === baseSkillKey,
      baseSkillLabelKey: config.secondarySkills[baseSkillKey],
      book,
      raceItems: describeRaceItems(raceItems),
      weapons: weapons.map((w) => ({ name: w.name, damage: w.damage })),
      artifactTypeLabelKey: config.artifactTypes[artifactType],
      artifactName,
    },
  );
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, whisper: ownersAndGmIds(actor) });
}

/**
 * GM-only, after completion: take back everything creation handed out —
 * the flagged items, the gold (never below 0), the coincidence tier raise,
 * and the level-ups recorded up to the picked level (resolveCreationRollback).
 * The level drops by those level-ups; the experience goes back to what it
 * was before creation plus anything earned past the picked level's
 * threshold. The hero is "not created" again when that leaves level 0.
 * @param {Actor} actor
 */
export async function resetHeroCreation(actor) {
  if (!game.user.isGM) return;
  const source = actor._source.system;
  const creation = source.creation;
  if (!creation.complete) return;
  const levelUps = creation.levelUps ?? [];
  const levelAfter = Math.max(0, source.level - levelUps.length);
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize('HEROES_GLORY.Creation.ResetConfirmTitle') },
    content: `<p>${game.i18n.format('HEROES_GLORY.Creation.ResetConfirmText', {
      gold: creation.gold, level: source.level, levelAfter,
    })}</p>`,
  });
  if (!confirmed) return;

  const rollback = resolveCreationRollback(levelUps);
  const deleteIds = new Set(rollback.deleteItemIds);
  for (const item of actor.items) {
    if (item.getFlag(FLAG_SCOPE, CREATION_GRANT_FLAG)) deleteIds.add(item.id);
  }
  const existingDeletes = [...deleteIds].filter((id) => actor.items.has(id));
  if (existingDeletes.length) await actor.deleteEmbeddedDocuments('Item', existingDeletes);

  for (const { itemId, tier } of rollback.tierRestores) {
    const item = actor.items.get(itemId);
    if (item) await item.update({ 'system.tier': tier });
  }
  if (creation.upgradedSkillKey) {
    const raised = actor.items.find((i) => i.type === 'skill' && i.system.skillKey === creation.upgradedSkillKey);
    if (raised?.system.tier === 'advanced') await raised.update({ 'system.tier': 'base' });
  }

  const update = {
    'system.level': levelAfter,
    'system.experience': creation.targetLevel
      ? creationResetExperience({
        experienceBefore: creation.experienceBefore,
        experience: source.experience,
        targetThreshold: experienceForLevel(creation.targetLevel),
      })
      : source.experience,
    'system.gold': Math.max(0, source.gold - creation.gold),
    'system.health.base': Math.max(0, source.health.base + rollback.healthDelta),
    'system.health.value': Math.max(0, source.health.value + rollback.healthDelta),
    'system.pendingLevelUp': null,
    'system.creation': {
      complete: false, gold: 0, upgradedSkillKey: '', experienceBefore: 0, targetLevel: 0, levelUps: [],
    },
  };
  for (const [key, delta] of Object.entries(rollback.primaryDeltas)) {
    update[`system.${key}`] = Math.max(0, source[key] + delta);
  }
  await actor.update(update);
  // The maxima are derived — known only after the update (fewer Знания,
  // less base Health); current values never stay above them.
  await actor.update({
    'system.health.value': Math.min(actor._source.system.health.value, actor.system.health.max),
    'system.mana.value': Math.min(actor._source.system.mana.value, actor.system.mana.max),
  });
}

/**
 * Items creation handed out, for the warning in the race/class change
 * dialog after creation is complete.
 * @param {Actor} actor
 * @returns {string[]}
 */
export function creationGrantedItemNames(actor) {
  return actor.items.filter((i) => i.getFlag(FLAG_SCOPE, CREATION_GRANT_FLAG)).map((i) => i.name);
}
