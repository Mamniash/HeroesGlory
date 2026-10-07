// Import document classes.
import { HeroesGloryActor } from './documents/actor.mjs';
import { HeroesGloryItem } from './documents/item.mjs';
// Import sheet classes.
import { HeroesGloryHeroSheet } from './sheets/actor/hero-sheet.mjs';
import { HeroesGloryCreatureSheet } from './sheets/actor/creature-sheet.mjs';
import { HeroesGloryWeaponSheet } from './sheets/item/weapon-sheet.mjs';
import { HeroesGlorySpellSheet } from './sheets/item/spell-sheet.mjs';
import { HeroesGloryArtifactSheet } from './sheets/item/artifact-sheet.mjs';
import { HeroesGlorySkillSheet } from './sheets/item/skill-sheet.mjs';
import { HeroesGlorySpellbookSheet } from './sheets/item/spellbook-sheet.mjs';
// Import helper/utility classes and constants.
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { HEROES_GLORY } from './helpers/config.mjs';
import { activateChatListeners } from './helpers/chat.mjs';
import { decorateInitiativeCard } from './helpers/initiative.mjs';
import { HeroesGloryCombat, HeroesGloryCombatant, drawCombatantCoin, markLateJoiner, recordRolledSpeed } from './documents/combat.mjs';
import {
  resetMoraleAfterCombat, clearCombatStatesAfterCombat, expireDefending, expireSpellEffect, clearSpellEffectsAfterCombat,
  stampEffectStartFromActorCombat, endTemporaryResurrections, advanceBlindness,
  expireFieldSpells, clearFieldSpellsAfterCombat, expireSummons, clearSummonsAfterCombat, excludeAmbushOrSurprise,
} from './helpers/combat.mjs';
import { addMassRestButton } from './helpers/rest.mjs';
import { registerSpellFxSetting, playSpellFx } from './helpers/spell-fx.mjs';
import { offerCombatExperience } from './helpers/experience-award.mjs';
// Import DataModel classes
import * as models from './data/_module.mjs';

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', function () {
  // Add utility classes to the global game object so that they're more easily
  // accessible in global contexts.
  game.heroesglory = {
    HeroesGloryActor,
    HeroesGloryItem,
    rollItemMacro,
  };

  // Add custom constants for configuration.
  CONFIG.HEROES_GLORY = HEROES_GLORY;

  // «Анимации заклинаний» — each client switches its own (spell-fx.mjs).
  registerSpellFxSetting();

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    // §5.1: `initiativeBonus` — Минотавр +2 (p. 12), «не обнаружил врага»
    // −10 (p. 25); the latter also drops Тактика (initiativeRollParts).
    formula: '1d20 + @speed + @tactics + @initiativeBonus',
    decimals: 2,
  };

  // Define custom Document and DataModel classes
  CONFIG.Actor.documentClass = HeroesGloryActor;
  // §5.1: ties in initiative — Скорость, then a coin (documents/combat.mjs).
  CONFIG.Combat.documentClass = HeroesGloryCombat;
  CONFIG.Combatant.documentClass = HeroesGloryCombatant;

  CONFIG.Actor.dataModels = {
    hero: models.HeroesGloryHero,
    creature: models.HeroesGloryCreature
  }
  CONFIG.Item.documentClass = HeroesGloryItem;
  CONFIG.Item.dataModels = {
    weapon: models.HeroesGloryWeapon,
    spell: models.HeroesGlorySpell,
    artifact: models.HeroesGloryArtifact,
    skill: models.HeroesGlorySkill,
    spellbook: models.HeroesGlorySpellbook
  }
  // §6.4, group Г: the region behavior of a Стена Огня — a system type is
  // named with the system's prefix, as in system.json.
  CONFIG.RegionBehavior.dataModels['heroes-glory.fireWall'] = models.HeroesGloryFireWallBehavior;
  CONFIG.RegionBehavior.typeLabels['heroes-glory.fireWall'] = 'HEROES_GLORY.Region.FireWall';
  CONFIG.RegionBehavior.typeIcons['heroes-glory.fireWall'] = 'fa-solid fa-fire';
  CONFIG.RegionBehavior.dataModels['heroes-glory.forceField'] = models.HeroesGloryForceFieldBehavior;
  CONFIG.RegionBehavior.typeLabels['heroes-glory.forceField'] = 'HEROES_GLORY.Region.ForceField';
  CONFIG.RegionBehavior.typeIcons['heroes-glory.forceField'] = 'fa-solid fa-shield-halved';
  CONFIG.RegionBehavior.dataModels['heroes-glory.quicksand'] = models.HeroesGloryQuicksandBehavior;
  CONFIG.RegionBehavior.typeLabels['heroes-glory.quicksand'] = 'HEROES_GLORY.Region.Quicksand';
  CONFIG.RegionBehavior.typeIcons['heroes-glory.quicksand'] = 'fa-solid fa-hourglass-half';
  // ...the Силовое Поле's impassable cells need a terrain that keeps a `null` difficulty infinite.
  CONFIG.Token.movement.TerrainData = models.HeroesGloryTerrainData;

  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;

  // §5.6/§5.9: the 3 combat states, registered through Foundry's own
  // status-effect mechanism (not bespoke flags) so they get real token
  // icons and can also be toggled by hand from the token HUD for cases
  // our own automation doesn't cover (rules.md §5.6: "Падение — любая
  // потеря равновесия", not just the specific epic-hit trigger we
  // automate). `CONFIG.statusEffects` is a live, push-appendable array.
  CONFIG.statusEffects.push(
    { id: HEROES_GLORY.statusEffects.prone, name: 'HEROES_GLORY.Status.Prone', img: 'icons/svg/falling.svg' },
    { id: HEROES_GLORY.statusEffects.unconscious, name: 'HEROES_GLORY.Status.Unconscious', img: 'icons/svg/unconscious.svg' },
    { id: HEROES_GLORY.statusEffects.incapacitated, name: 'HEROES_GLORY.Status.Incapacitated', img: 'icons/svg/blood.svg' },
    // §5.2 (p. 27): «Защита» — "эффект длится до начала следующего хода".
    // ActiveEffect.fromStatusEffect copies this duration into the effect,
    // so the core registry expires it at the defender's next turn start,
    // whether the status is toggled from the token HUD or by our code;
    // expireDefending (combat.mjs) then deletes the expired effect.
    {
      id: HEROES_GLORY.statusEffects.defending, name: 'HEROES_GLORY.Status.Defending', img: 'icons/svg/shield.svg',
      duration: { value: 1, units: 'turns', expiry: 'turnStart' },
    },
    // §5.10 (p. 33): «Без отдыха» — set by the GM "на начало нового дня",
    // lifted by a rest; halves the primary skills' base (actor-hero.mjs).
    { id: HEROES_GLORY.statusEffects.unrested, name: 'HEROES_GLORY.Status.Unrested', img: 'icons/svg/sleep.svg' },
    // §5.1 (p. 25): «Тот, кто не обнаружил врага до начала боя» — the GM
    // marks it before initiative is rolled: −10 and no Тактика. Lifted at
    // the end of the battle.
    { id: HEROES_GLORY.statusEffects.surprised, name: 'HEROES_GLORY.Status.Surprised', img: 'icons/svg/daze.svg' },
    // §5.1 (p. 25): joining a battle under way «в засаде» — the GM marks it
    // before the roll: +10 and Тактика. Excludes «Не обнаружил врага»
    // (excludeAmbushOrSurprise); lifted at the end of the battle.
    { id: HEROES_GLORY.statusEffects.ambush, name: 'HEROES_GLORY.Status.Ambush', img: 'icons/svg/trap.svg' },
  );

  // Register sheet application classes.
  //
  // v13 moved sheet (un)registration off the old `Actors`/`Items` collection
  // statics and the bare `ActorSheet`/`ItemSheet` globals onto
  // DocumentSheetConfig, with the legacy v1 sheet classes now living under
  // `foundry.appv1.sheets`.
  const { DocumentSheetConfig } = foundry.applications.apps;

  DocumentSheetConfig.unregisterSheet(Actor, 'core', foundry.appv1.sheets.ActorSheet);
  DocumentSheetConfig.registerSheet(Actor, 'heroes-glory', HeroesGloryHeroSheet, {
    types: ['hero'],
    makeDefault: true,
    label: 'HEROES_GLORY.SheetLabels.Hero',
  });
  DocumentSheetConfig.registerSheet(Actor, 'heroes-glory', HeroesGloryCreatureSheet, {
    types: ['creature'],
    makeDefault: true,
    label: 'HEROES_GLORY.SheetLabels.Creature',
  });

  DocumentSheetConfig.unregisterSheet(Item, 'core', foundry.appv1.sheets.ItemSheet);
  DocumentSheetConfig.registerSheet(Item, 'heroes-glory', HeroesGloryWeaponSheet, {
    types: ['weapon'],
    makeDefault: true,
    label: 'HEROES_GLORY.SheetLabels.Weapon',
  });
  DocumentSheetConfig.registerSheet(Item, 'heroes-glory', HeroesGlorySpellSheet, {
    types: ['spell'],
    makeDefault: true,
    label: 'HEROES_GLORY.SheetLabels.Spell',
  });
  DocumentSheetConfig.registerSheet(Item, 'heroes-glory', HeroesGloryArtifactSheet, {
    types: ['artifact'],
    makeDefault: true,
    label: 'HEROES_GLORY.SheetLabels.Artifact',
  });
  DocumentSheetConfig.registerSheet(Item, 'heroes-glory', HeroesGlorySkillSheet, {
    types: ['skill'],
    makeDefault: true,
    label: 'HEROES_GLORY.SheetLabels.Skill',
  });
  DocumentSheetConfig.registerSheet(Item, 'heroes-glory', HeroesGlorySpellbookSheet, {
    types: ['spellbook'],
    makeDefault: true,
    label: 'HEROES_GLORY.SheetLabels.Spellbook',
  });

  // Preload Handlebars templates.
  return preloadHandlebarsTemplates();
});

/* -------------------------------------------- */
/*  Handlebars Helpers                          */
/* -------------------------------------------- */

// If you need to add Handlebars helpers, here is a useful example:
Handlebars.registerHelper('toLowerCase', function (str) {
  return str.toLowerCase();
});

// Used to print 1-based row numbers next to `{{#each}}`-rendered fields
// (e.g. the weapon epic table's 6 rows).
Handlebars.registerHelper('inc', function (value) {
  return Number(value) + 1;
});

/* -------------------------------------------- */
/*  Chat & Combat Hooks                         */
/* -------------------------------------------- */

// §2.2: wires up the "Reroll (Удача)" buttons on attack/check chat cards —
// visibility is per-viewer (owner for positive Удача, GM for negative), so
// it has to be decided at render time on each client, not baked into the
// stored HTML.
Hooks.on('renderChatMessageHTML', activateChatListeners);
// §5.1 (p. 9): the Эльф's initiative reroll button.
Hooks.on('renderChatMessageHTML', decorateInitiativeCard);
// Spell animations (rules.md §11): the GM's confirm reaches every client as
// the card's update — each one plays it over the tokens it sees.
Hooks.on('updateChatMessage', (message, changed) => {
  if (changed.flags?.['heroes-glory']?.spell?.confirmed !== true) return;
  playSpellFx(message.getFlag('heroes-glory', 'spell'));
});
// §5.1: the tie coin, drawn once per combatant.
// §5.1 (p. 25): who joins a battle under way — no Тактика, waits the round
// out. Before the coin, whose recorded Скорость reads the mark.
Hooks.on('preCreateCombatant', markLateJoiner);
Hooks.on('preCreateCombatant', drawCombatantCoin);
// «Из засады» and «Не обнаружил врага» exclude each other.
Hooks.on('createActiveEffect', excludeAmbushOrSurprise);
// §5.1: the Скорость an initiative roll used, kept for a tie (p. 24).
Hooks.on('preUpdateCombatant', recordRolledSpeed);

// §5.8: Боевой дух resets to 0, and its per-battle attempt counter clears,
// once the encounter ends.
Hooks.on('deleteCombat', resetMoraleAfterCombat);

// §5.6: Падение and Без сознания both clear at the end of the battle.
Hooks.on('deleteCombat', clearCombatStatesAfterCombat);
Hooks.on('updateActiveEffect', expireDefending);
// §6.4, stage 2: spell effects end with their rounds and with the battle.
Hooks.on('updateActiveEffect', expireSpellEffect);
Hooks.on('deleteCombat', clearSpellEffectsAfterCombat);
// An effect's duration counts in its actor's own combat, not the one on screen.
Hooks.on('preCreateActiveEffect', stampEffectStartFromActorCombat);

// §6.4, group А2: Слепота — the blinded one skips its next turn.
Hooks.on('combatTurnChange', advanceBlindness);
// §6.4, group Г: Силовое Поле and Стена Огня end with their rounds and with the battle.
Hooks.on('combatTurnChange', expireFieldSpells);
Hooks.on('deleteCombat', clearFieldSpellsAfterCombat);
// §6.4, group Д: a summoned elemental or a clone runs out at its caster's
// turn and goes with the battle.
Hooks.on('combatTurnChange', expireSummons);
Hooks.on('deleteCombat', clearSummonsAfterCombat);
// §6.4, group В: Воскрешение without Продвинутый ends with the battle —
// before the experience window reads who is down.
Hooks.on('deleteCombat', endTemporaryResurrections);

// §4.1: the GM's experience window for the battle that just ended.
Hooks.on('deleteCombat', offerCombatExperience);

// §5.10: «Отдых всем героям» in the Actors directory header, GM only.
Hooks.on('renderActorDirectory', addMassRestButton);

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once('ready', function () {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on('hotbarDrop', (bar, data, slot) => createItemMacro(data, slot));
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(data, slot) {
  // First, determine if this is a valid owned item.
  if (data.type !== 'Item') return;
  if (!data.uuid.includes('Actor.') && !data.uuid.includes('Token.')) {
    return ui.notifications.warn(
      'You can only create macro buttons for owned Items'
    );
  }
  // If it is, retrieve it based on the uuid.
  const item = await Item.fromDropData(data);

  // Create the macro command using the uuid.
  const command = `game.heroesglory.rollItemMacro("${data.uuid}");`;
  let macro = game.macros.find(
    (m) => m.name === item.name && m.command === command
  );
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: 'script',
      img: item.img,
      command: command,
      flags: { 'heroes-glory.itemMacro': true },
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemUuid
 */
function rollItemMacro(itemUuid) {
  // Reconstruct the drop data so that we can load the item.
  const dropData = {
    type: 'Item',
    uuid: itemUuid,
  };
  // Load the item from the uuid.
  Item.fromDropData(dropData).then((item) => {
    // Determine if the item loaded and if it's an owned item.
    if (!item || !item.parent) {
      const itemName = item?.name ?? itemUuid;
      return ui.notifications.warn(
        `Could not find item ${itemName}. You may need to delete and recreate this macro.`
      );
    }

    // Trigger the item roll
    item.roll();
  });
}
