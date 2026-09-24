import { concreteClassKey, statsForClass } from '../helpers/class-stats.mjs';
import { raceTextKeysFor } from '../helpers/race-stats.mjs';
import { raceGrantedItems, CREATION_TIME_RACE_GRANTS } from '../helpers/race-granted-items.mjs';
import { grantSecondarySkill } from '../helpers/skill-grant.mjs';
import { ownersAndGmIds } from '../helpers/roll-actions.mjs';
import {
  CREATION_GRANT_FLAG, CLASS_BASE_SKILL_FLAG, ARTIFACT_TABLE_ROW_FLAG, ARTIFACT_TABLE_ROWS,
  STARTING_GOLD_MULTIPLIER, resolveStartingSecondarySkill, artifactTypeForDie, pickArtifactRow,
  startingWeaponSpecs, startingSpellbookGrant, isValidSpellChoice,
} from '../helpers/hero-creation.mjs';
import { WEAPON_EPIC_TABLES, MELEE_WEAPON_CATEGORIES } from '../helpers/weapon-epic-tables.mjs';

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;

const FLAG_SCOPE = 'heroes-glory';
const SPELLS_PACK = 'heroes-glory.spells';
const ARTIFACTS_PACK = 'heroes-glory.artifacts';

/** Safety cap on rerolling a 12 on a 2–11 artifact table. */
const MAX_ARTIFACT_ROW_ROLLS = 50;

/** One open creation window per actor, same as the level-up window. */
const openInstances = new Map();

/**
 * Whether the hero's race, faction and class are all chosen — creation
 * needs the class (base skill, weapon damage, book) and the faction
 * (d20 row 20).
 * @param {object} system
 * @returns {boolean}
 */
export function isIdentityComplete(system) {
  return Boolean(system.race && system.faction && system.classType);
}

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
 * Rolls the creation dice once and stores them in `system.pendingCreation`;
 * a window reopened later reads the same dice.
 * @param {Actor} actor
 */
async function ensurePendingCreation(actor) {
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
 * Everything creation will hand out, decided purely from the actor and the
 * persisted dice — shared by the window's display and by the apply, so
 * what is shown is what is granted.
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

/**
 * §2–§8: apply creation. Every validation runs before the first write, so
 * a rejected apply changes nothing.
 * @param {Actor} actor
 * @param {{archer: boolean, weapons: Array<{name: string, weaponType: string, category: string}>, spells: string[]}} choices
 * @returns {Promise<boolean>} whether it was applied
 */
async function applyHeroCreation(actor, choices) {
  const system = actor.system;
  if (system.creation.complete || !system.pendingCreation || !isIdentityComplete(system)) {
    ui.notifications.warn(game.i18n.localize('HEROES_GLORY.Creation.AlreadyComplete'));
    return false;
  }
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
  const specs = startingWeaponSpecs({ classType: system.classType, archer: choices.archer });
  const weapons = specs.map((spec, i) => ({ ...spec, ...choices.weapons[i] }));
  for (const weapon of weapons) {
    if (!weapon.name?.trim()
      || (!weapon.ranged && (!(weapon.category in MELEE_WEAPON_CATEGORIES) || !weapon.weaponType || weapon.weaponType === 'ranged'))) {
      ui.notifications.warn(game.i18n.localize('HEROES_GLORY.Creation.WeaponIncomplete'));
      return false;
    }
  }

  // The card is posted after the update below clears pendingCreation.
  const dice = foundry.utils.deepClone(actor._source.system.pendingCreation);
  const grant = (kind) => ({ [FLAG_SCOPE]: { [CREATION_GRANT_FLAG]: kind } });
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

  // p. 17: Книга Магии and chosen spells. The item name is fixed Russian
  // text, not a localized label — it is persisted (same as the race grant).
  let hasBook = plan.ownsBook;
  if (plan.spellbook.book && !hasBook) {
    itemData.push({ name: 'Книга Магии', type: 'spellbook', flags: grant('spellbook') });
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
      if (!hasBook) itemData.push({ name: 'Книга Магии', type: 'spellbook', flags: grant('race') });
      hasBook = true;
    } else {
      await addSpell(want.spellName, 'race');
    }
  }

  // p. 17: starting weapons — the player's name and type, damage by class.
  for (const weapon of weapons) {
    itemData.push({
      name: weapon.name.trim(),
      type: 'weapon',
      img: weapon.ranged ? 'icons/svg/target.svg' : 'icons/svg/sword.svg',
      system: {
        weaponType: weapon.ranged ? 'ranged' : weapon.weaponType,
        damage: weapon.damage,
        epicTable: [...(weapon.ranged ? WEAPON_EPIC_TABLES.ranged : WEAPON_EPIC_TABLES[weapon.category])],
      },
      flags: grant('weapon'),
    });
  }

  // p. 18: the random artifact, into the backpack.
  const artifactData = await compendiumItemData(ARTIFACTS_PACK, plan.artifactEntry._id, 'artifact');
  artifactData.system.equipped = false;
  artifactData.system.paperdollSlot = null;
  itemData.push(artifactData);

  await actor.createEmbeddedDocuments('Item', itemData);
  await actor.update({
    'system.gold': actor._source.system.gold + plan.gold,
    'system.pendingCreation': null,
    'system.creation': { complete: true, gold: plan.gold, upgradedSkillKey },
  });

  await postCreationCard(actor, dice, plan, choices.spells, weapons);
  return true;
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
      weapons: weapons.map((w) => ({ name: w.name.trim(), damage: w.damage, ranged: w.ranged })),
      artifactTypeLabelKey: config.artifactTypes[plan.artifactType],
      artifactName: plan.artifactEntry?.name ?? '',
    },
  );
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, whisper: ownersAndGmIds(actor) });
}

/** Джинн's items as display text. */
function describeRaceItems(raceItems) {
  return raceItems.map((want) => (want.itemType === 'spellbook' ? 'Книга Магии' : `«${want.spellName}»`)).join(', ');
}

/**
 * GM-only: take back everything creation handed out — the flagged items,
 * the gold (never below 0), the coincidence tier raise — and reopen
 * creation with fresh dice.
 * @param {Actor} actor
 */
export async function resetHeroCreation(actor) {
  if (!game.user.isGM) return;
  const creation = actor.system.creation;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize('HEROES_GLORY.Creation.ResetConfirmTitle') },
    content: `<p>${game.i18n.format('HEROES_GLORY.Creation.ResetConfirmText', { gold: creation.gold })}</p>`,
  });
  if (!confirmed) return;

  const granted = actor.items.filter((i) => i.getFlag(FLAG_SCOPE, CREATION_GRANT_FLAG));
  if (granted.length) await actor.deleteEmbeddedDocuments('Item', granted.map((i) => i.id));
  if (creation.upgradedSkillKey) {
    const raised = actor.items.find((i) => i.type === 'skill' && i.system.skillKey === creation.upgradedSkillKey);
    if (raised?.system.tier === 'advanced') await raised.update({ 'system.tier': 'base' });
  }
  await actor.update({
    'system.gold': Math.max(0, actor._source.system.gold - creation.gold),
    'system.pendingCreation': null,
    'system.creation': { complete: false, gold: 0, upgradedSkillKey: '' },
  });
  return HeroesGloryCreationApp.open(actor);
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

/**
 * §2–§8, book pp. 16–18: the hero-creation window. Dice are persisted in
 * `system.pendingCreation` (rolled on first open), so reopening the window
 * shows the same results; the player's choices (weapon, spells) live only
 * in the open window until applied.
 */
export class HeroesGloryCreationApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'hg-creation-{id}',
    classes: ['heroes-glory', 'hg-creation-app'],
    tag: 'form',
    window: { title: 'HEROES_GLORY.Creation.WindowTitle', resizable: false },
    position: { width: 520, height: 'auto' },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: { apply: this.#onApply },
  };

  static PARTS = {
    body: { template: 'systems/heroes-glory/templates/apps/hero-creation.hbs' },
  };

  /** @type {Actor} */
  #actor;

  /** The player's choices, kept across re-renders of this window. */
  #choices = { archer: false, weapons: [{}, {}], spells: [] };

  constructor(actor, options = {}) {
    super(options);
    this.#actor = actor;
  }

  get actor() {
    return this.#actor;
  }

  /** @override */
  get title() {
    return `${game.i18n.localize(this.options.window.title)}: ${this.#actor.name}`;
  }

  /**
   * Open (or focus) the creation window. Rolls the dice before the first
   * render, so the window never shows an empty state.
   * @param {Actor} actor
   */
  static async open(actor) {
    if (!actor.isOwner) return;
    if (actor.system.creation.complete) {
      ui.notifications.warn(game.i18n.localize('HEROES_GLORY.Creation.AlreadyComplete'));
      return;
    }
    if (!isIdentityComplete(actor.system)) {
      ui.notifications.warn(game.i18n.localize('HEROES_GLORY.Creation.IdentityRequired'));
      return;
    }
    const existing = openInstances.get(actor.uuid);
    if (existing?.rendered) {
      existing.bringToFront();
      return existing;
    }
    await ensurePendingCreation(actor);
    const app = new HeroesGloryCreationApp(actor);
    openInstances.set(actor.uuid, app);
    return app.render(true);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.#actor;
    const system = actor.system;
    const config = CONFIG.HEROES_GLORY;
    const pending = system.pendingCreation;
    if (!pending) return context;
    const plan = await resolveCreationPlan(actor);

    const offered = plan.spellbook.spellChoices ? await firstLevelSpellNames() : [];
    const specs = startingWeaponSpecs({ classType: system.classType, archer: this.#choices.archer });
    const meleeTypes = Object.fromEntries(Object.entries(config.weaponTypes).filter(([key]) => key !== 'ranged'));

    Object.assign(context, {
      pending,
      goldDiceText: pending.goldDice.join(' + '),
      plan,
      skillLabelKey: config.secondarySkills[plan.skill.skillKey],
      baseSkillLabelKey: config.secondarySkills[plan.baseSkillKey],
      spells: offered.map((name) => ({ name, checked: this.#choices.spells.includes(name) })),
      raceItems: describeRaceItems(plan.raceItems),
      raceWeaponKey: raceTextKeysFor(system.race)?.weaponKey ?? null,
      archer: this.#choices.archer,
      weapons: specs.map((spec, index) => ({
        ...spec,
        index,
        name: this.#choices.weapons[index]?.name ?? '',
        weaponType: this.#choices.weapons[index]?.weaponType ?? '',
        category: this.#choices.weapons[index]?.category ?? '',
      })),
      meleeTypes,
      categories: MELEE_WEAPON_CATEGORIES,
      artifactTypeLabelKey: config.artifactTypes[plan.artifactType],
      artifactName: plan.artifactEntry?.name ?? null,
      artifactBonus: plan.artifactEntry ? (await game.packs.get(ARTIFACTS_PACK).getDocument(plan.artifactEntry._id)).system.bonus : '',
    });
    return context;
  }

  /**
   * Listeners on the window's own element, which survives re-renders —
   * attached once, not per render.
   * @override
   */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.element.addEventListener('change', (event) => {
      const archerBefore = this.#choices.archer;
      this.#readForm();
      if (event.target.name === 'archer' && this.#choices.archer !== archerBefore) this.render();
    });
    this.element.addEventListener('input', () => this.#readForm());
  }

  /** Reads the player's choices off the form into `#choices`. */
  #readForm() {
    const form = this.element;
    this.#choices.archer = form.querySelector('[name="archer"]')?.checked ?? false;
    this.#choices.spells = [...form.querySelectorAll('[name="spell"]:checked')].map((el) => el.value);
    form.querySelectorAll('[data-weapon-index]').forEach((block) => {
      const index = Number(block.dataset.weaponIndex);
      this.#choices.weapons[index] = {
        name: block.querySelector('[name="weaponName"]')?.value ?? '',
        weaponType: block.querySelector('[name="weaponType"]')?.value ?? '',
        category: block.querySelector('[name="weaponCategory"]')?.value ?? '',
      };
    });
  }

  /** @override */
  async _preClose(options) {
    await super._preClose(options);
    if (openInstances.get(this.#actor.uuid) === this) openInstances.delete(this.#actor.uuid);
  }

  /**
   * @this {HeroesGloryCreationApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onApply(event, target) {
    if (target.disabled) return;
    target.disabled = true;
    this.#readForm();
    const specs = startingWeaponSpecs({ classType: this.#actor.system.classType, archer: this.#choices.archer });
    const choices = {
      archer: this.#choices.archer,
      spells: this.#choices.spells,
      weapons: specs.map((_, i) => this.#choices.weapons[i] ?? {}),
    };
    try {
      if (await applyHeroCreation(this.#actor, choices)) await this.close();
    } catch (err) {
      console.error('heroes-glory | hero creation failed', err);
      ui.notifications.error(game.i18n.localize('HEROES_GLORY.Creation.ApplyError'));
    } finally {
      if (this.rendered) target.disabled = false;
    }
  }
}

Hooks.on('deleteActor', (actor) => {
  openInstances.get(actor.uuid)?.close();
  openInstances.delete(actor.uuid);
});
