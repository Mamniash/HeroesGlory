/**
 * §2–§8, book pp. 16–18: the hero-creation steps, shown inside the level-up
 * window (module/apps/level-up-app.mjs): «Начальная настройка» → the target
 * level → the ordinary level-ups → complete. Everything the steps decide is
 * pure (helpers/hero-creation.mjs); this file rolls the dice, turns the
 * decisions into items/updates, and builds the screens' render context.
 *
 * State lives on the actor, never in the window: `system.pendingCreation`
 * (dice + step) until completion, `system.creation` (what was handed out,
 * for «Сбросить создание»). Closing the window at any step and reopening it
 * lands on the same step with the same dice.
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
  startingWeaponSpecs, startingSpellbookGrant, isValidSpellChoice, missingIdentityFields,
  pickFreeSlot, resolveCreationRollback,
} from './hero-creation.mjs';
import { WEAPON_EPIC_TABLES } from './weapon-epic-tables.mjs';

const FLAG_SCOPE = 'heroes-glory';
const SPELLS_PACK = 'heroes-glory.spells';
const ARTIFACTS_PACK = 'heroes-glory.artifacts';

/** Safety cap on rerolling a 12 on a 2–11 artifact table. */
const MAX_ARTIFACT_ROW_ROLLS = 50;

/** The creation level picker's list: 0 (keep, the book's start, p. 21) up to 20 (the table's last row). */
export const MAX_CREATION_LEVEL = 20;

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
 * The foundry notification for a blank race/faction/class, or null when all
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
 * Rolls the creation dice once and stores them in `system.pendingCreation`;
 * a window reopened later reads the same dice.
 * @param {Actor} actor
 */
export async function ensurePendingCreation(actor) {
  if (actor._source.system.pendingCreation) return;
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
  await actor.update({
    'system.pendingCreation': {
      step: 'setup', targetLevel: null,
      skillDie, goldDice, artifactTypeDie, artifactRow: pick.row, artifactRerolls: pick.rerolls,
    },
  });
}

/** 1st-level spells offered at creation (p. 17), by name. */
async function firstLevelSpellNames() {
  const pack = game.packs.get(SPELLS_PACK);
  const index = await pack.getIndex({ fields: ['system.level'] });
  return index.filter((e) => e.system?.level === 1).map((e) => e.name).sort((a, b) => a.localeCompare(b, 'ru'));
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
 * Everything the setup step will hand out, decided purely from the actor
 * and the persisted dice — shared by the screen and by the apply, so what
 * is shown is what is granted.
 * @param {Actor} actor
 */
async function resolveCreationPlan(actor) {
  const system = actor.system;
  const pending = system.pendingCreation;
  const classKey = concreteClassKey(system.faction, system.classType);
  const baseSkillKey = statsForClass(classKey)?.secondarySkillKey ?? null;
  const skill = resolveStartingSecondarySkill({ die: pending.skillDie, faction: system.faction, baseSkillKey });
  const skillAlreadyOwned = !skill.upgradesBase
    && actor.items.some((i) => i.type === 'skill' && i.system.skillKey === skill.skillKey);

  const spellbook = startingSpellbookGrant({ classKey, classType: system.classType, rolledSkillKey: skill.skillKey });
  const ownsBook = actor.items.some((i) => i.type === 'spellbook');
  // Джинн (p. 12): the spell depends on starting with a book at all —
  // from the class, a rolled Мудрость, or already owned.
  const raceItems = CREATION_TIME_RACE_GRANTS.has(system.race)
    ? raceGrantedItems(system.race, system.raceSubchoice || null, { hasSpellbook: spellbook.book || ownsBook })
    : [];

  const artifactType = artifactTypeForDie(pending.artifactTypeDie);
  const artifactEntry = await findArtifactEntry(artifactType, pending.artifactRow);

  const goldSum = pending.goldDice.reduce((a, b) => a + b, 0);
  return {
    classKey, baseSkillKey, skill, skillAlreadyOwned, spellbook, ownsBook, raceItems,
    artifactType, artifactEntry,
    gold: goldSum * STARTING_GOLD_MULTIPLIER, goldSum,
  };
}

/** Джинн's items as display text. */
function describeRaceItems(raceItems) {
  return raceItems.map((want) => (want.itemType === 'spellbook' ? 'Книга Магии' : `«${want.spellName}»`)).join(', ');
}

/**
 * Render context for «Начальная настройка».
 * @param {Actor} actor
 * @param {{archer: boolean, spells: string[]}} choices   The window's own state.
 */
export async function buildCreationSetupContext(actor, choices) {
  const config = CONFIG.HEROES_GLORY;
  const pending = actor.system.pendingCreation;
  const plan = await resolveCreationPlan(actor);
  const offered = plan.spellbook.spellChoices ? await firstLevelSpellNames() : [];
  const weapons = startingWeaponSpecs({ classType: actor.system.classType, archer: choices.archer })
    .map((spec) => ({ name: game.i18n.localize(spec.nameKey), damage: spec.damage }));
  return {
    pending,
    plan,
    goldDiceText: pending.goldDice.join(' + '),
    skillLabelKey: config.secondarySkills[plan.skill.skillKey],
    baseSkillLabelKey: config.secondarySkills[plan.baseSkillKey],
    spells: offered.map((name) => ({ name, checked: choices.spells.includes(name) })),
    raceItems: describeRaceItems(plan.raceItems),
    archer: choices.archer,
    weapons,
    artifactTypeLabelKey: config.artifactTypes[plan.artifactType],
    artifactName: plan.artifactEntry?.name ?? null,
    artifactBonus: plan.artifactEntry ? (await game.packs.get(ARTIFACTS_PACK).getDocument(plan.artifactEntry._id)).system.bonus : '',
    canNext: !!plan.artifactEntry && choices.spells.length === plan.spellbook.spellChoices,
  };
}

/**
 * Render context for the level picker.
 * @param {number} selectedLevel
 */
export function buildCreationLevelContext(selectedLevel) {
  const levels = [];
  for (let level = 0; level <= MAX_CREATION_LEVEL; level++) {
    levels.push({
      level,
      label: level === 0
        ? game.i18n.localize('HEROES_GLORY.Creation.LevelKeep')
        : game.i18n.format('HEROES_GLORY.Creation.LevelOption', { level, xp: experienceForLevel(level) }),
      current: level === selectedLevel,
    });
  }
  return { levels };
}

/**
 * Paperdoll placement for a granted item: its first free valid slot
 * (weapon → 1/16, book → 10, an artifact → its targetSlots), else the
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

/**
 * «Далее» on «Начальная настройка»: hands out the second skill, the book
 * and the chosen spells, the weapon, the gold and the artifact, posts the
 * summary card and moves on to the level step. Every validation runs
 * before the first write, so a rejected apply changes nothing.
 * @param {Actor} actor
 * @param {{archer: boolean, spells: string[]}} choices
 * @returns {Promise<boolean>} whether it was applied
 */
export async function applyCreationSetup(actor, choices) {
  const system = actor.system;
  if (system.pendingCreation?.step !== 'setup' || missingIdentityFields(system).length) return false;
  const plan = await resolveCreationPlan(actor);
  if (!plan.artifactEntry) {
    ui.notifications.error(game.i18n.localize('HEROES_GLORY.Creation.ArtifactMissing'));
    return false;
  }
  const offered = await firstLevelSpellNames();
  if (!isValidSpellChoice(choices.spells, plan.spellbook.spellChoices, offered)) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Creation.SpellChoiceInvalid', { count: plan.spellbook.spellChoices }));
    return false;
  }

  const dice = foundry.utils.deepClone(actor._source.system.pendingCreation);
  const grant = (kind) => ({ [FLAG_SCOPE]: { [CREATION_GRANT_FLAG]: kind } });
  const occupied = new Set(actor.items
    .filter((i) => i.system.equipped && i.system.paperdollSlot != null)
    .map((i) => i.system.paperdollSlot));
  const itemData = [];

  // p. 16: second skill — new at base tier, or the base skill raised.
  let upgradedSkillKey = '';
  if (plan.skill.upgradesBase) {
    const baseItem = actor.items.find((i) => i.type === 'skill' && i.system.skillKey === plan.baseSkillKey);
    if (baseItem) {
      if (baseItem.system.tier === 'base') {
        await baseItem.update({ 'system.tier': 'advanced' });
        upgradedSkillKey = plan.baseSkillKey;
      }
    } else {
      await grantSecondarySkill(actor, plan.baseSkillKey, 'advanced', { flags: { [CLASS_BASE_SKILL_FLAG]: plan.baseSkillKey } });
      upgradedSkillKey = plan.baseSkillKey;
    }
  } else if (!plan.skillAlreadyOwned) {
    await grantSecondarySkill(actor, plan.skill.skillKey, 'base', { flags: { [CREATION_GRANT_FLAG]: 'skill' } });
  }

  // p. 17: Книга Магии (slot 10) and chosen spells. The item name is fixed
  // Russian text, not a localized label — it is persisted (same as the
  // race grant).
  let hasBook = plan.ownsBook;
  const bookData = (kind) => placeInPaperdoll({ name: 'Книга Магии', type: 'spellbook', system: {}, flags: grant(kind) }, occupied);
  if (plan.spellbook.book && !hasBook) {
    itemData.push(bookData('spellbook'));
    hasBook = true;
  }
  const spellIndex = await game.packs.get(SPELLS_PACK).getIndex();
  const ownedSpellNames = new Set(actor.items.filter((i) => i.type === 'spell').map((i) => i.name));
  const addSpell = async (name, kind) => {
    if (ownedSpellNames.has(name)) return;
    const entry = spellIndex.find((e) => e.name === name);
    if (!entry) return;
    ownedSpellNames.add(name);
    itemData.push(await compendiumItemData(SPELLS_PACK, entry._id, kind));
  };
  for (const name of choices.spells) await addSpell(name, 'spell');

  // p. 12: Джинн's grant, decided now that the starting book is known.
  for (const want of plan.raceItems) {
    if (want.itemType === 'spellbook') {
      if (!hasBook) itemData.push(bookData('race'));
      hasBook = true;
    } else {
      await addSpell(want.spellName, 'race');
    }
  }

  // p. 17: the ready-made starting weapon(s), damage by class.
  const weapons = startingWeaponSpecs({ classType: system.classType, archer: choices.archer })
    .map((spec) => ({ ...spec, name: game.i18n.localize(spec.nameKey) }));
  for (const weapon of weapons) {
    itemData.push(placeInPaperdoll({
      name: weapon.name,
      type: 'weapon',
      img: weapon.ranged ? 'icons/svg/target.svg' : 'icons/svg/sword.svg',
      system: {
        weaponType: weapon.weaponType,
        damage: weapon.damage,
        epicTable: [...WEAPON_EPIC_TABLES[weapon.category]],
      },
      flags: grant('weapon'),
    }, occupied));
  }

  // p. 18: the random artifact — worn if its slot is free, else the backpack.
  const artifactData = await compendiumItemData(ARTIFACTS_PACK, plan.artifactEntry._id, 'artifact');
  itemData.push(placeInPaperdoll(artifactData, occupied));

  await actor.createEmbeddedDocuments('Item', itemData);
  await actor.update({
    'system.gold': actor._source.system.gold + plan.gold,
    'system.pendingCreation.step': 'level',
    'system.creation': {
      complete: false, gold: plan.gold, upgradedSkillKey,
      experienceBefore: actor._source.system.experience, levelUps: [],
    },
  });

  await postCreationCard(actor, dice, plan, choices.spells, weapons);
  return true;
}

/**
 * «Далее» on the level picker. 0 completes creation at once; N sets the
 * experience to level N's threshold (the same way the GM's level picker
 * raises a level) and starts the level-ups.
 * @param {Actor} actor
 * @param {number} targetLevel
 * @returns {Promise<'complete'|'levels'|null>}
 */
export async function chooseCreationLevel(actor, targetLevel) {
  const pending = actor._source.system.pendingCreation;
  if (pending?.step !== 'level') return null;
  if (!targetLevel) {
    await completeCreation(actor);
    return 'complete';
  }
  await actor.update({
    'system.experience': Math.max(actor._source.system.experience, experienceForLevel(targetLevel)),
    'system.pendingCreation.step': 'levels',
    'system.pendingCreation.targetLevel': targetLevel,
  });
  return 'levels';
}

/**
 * After each level-up applied inside creation: record it for «Сбросить
 * создание» and complete creation once the target level is reached.
 * @param {Actor} actor
 * @param {object} record   applyLevelUp's result
 * @returns {Promise<boolean>} whether creation just completed
 */
export async function recordCreationLevelUp(actor, record) {
  const source = actor._source.system;
  const levelUps = [...(source.creation.levelUps ?? []), record];
  await actor.update({ 'system.creation.levelUps': levelUps });
  if (source.level < (source.pendingCreation?.targetLevel ?? 0)) return false;
  await completeCreation(actor);
  return true;
}

/**
 * Completion: Health and Mana full (after every +5 ОЗ from the level-ups
 * and the worn artifact), creation marked complete, the dice cleared.
 * @param {Actor} actor
 */
async function completeCreation(actor) {
  await actor.update({
    'system.pendingCreation': null,
    'system.pendingLevelUp': null,
    'system.creation.complete': true,
  });
  await actor.update({
    'system.health.value': actor.system.health.max,
    'system.mana.value': actor.system.mana.max,
  });
}

/**
 * The summary card — whispered to the hero's owners and the GM. No
 * `rolls`: the dice are in the card text (same as the level-up cards).
 */
async function postCreationCard(actor, pending, plan, spells, weapons) {
  const config = CONFIG.HEROES_GLORY;
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/hero-creation.hbs',
    {
      actorName: actor.name,
      pending,
      goldDiceText: pending.goldDice.join(' + '),
      skillLabelKey: config.secondarySkills[plan.skill.skillKey],
      baseSkillLabelKey: config.secondarySkills[plan.baseSkillKey],
      plan,
      spells: spells.join(', '),
      raceItems: describeRaceItems(plan.raceItems),
      weapons: weapons.map((w) => ({ name: w.name, damage: w.damage })),
      artifactTypeLabelKey: config.artifactTypes[plan.artifactType],
      artifactName: plan.artifactEntry?.name ?? '',
    },
  );
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, whisper: ownersAndGmIds(actor) });
}

/**
 * GM-only, after completion: take back everything creation handed out —
 * the flagged items, the gold (never below 0), the coincidence tier raise,
 * the level-ups made inside creation (resolveCreationRollback) — so the
 * level cell shows «Создать» again and the next creation rolls fresh dice.
 * @param {Actor} actor
 */
export async function resetHeroCreation(actor) {
  if (!game.user.isGM) return;
  const source = actor._source.system;
  const creation = source.creation;
  if (!creation.complete) return;
  // Only the levels creation itself raised come off — a creation completed
  // before level-ups were recorded (or at level 0) keeps the hero's level
  // and experience.
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
    'system.experience': levelUps.length ? creation.experienceBefore : source.experience,
    'system.gold': Math.max(0, source.gold - creation.gold),
    'system.health.base': Math.max(0, source.health.base + rollback.healthDelta),
    'system.health.value': Math.max(0, source.health.value + rollback.healthDelta),
    'system.pendingCreation': null,
    'system.pendingLevelUp': null,
    'system.creation': { complete: false, gold: 0, upgradedSkillKey: '', experienceBefore: 0, levelUps: [] },
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
