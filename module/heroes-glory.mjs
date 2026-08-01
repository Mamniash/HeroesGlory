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
// Import helper/utility classes and constants.
import { preloadHandlebarsTemplates } from './helpers/templates.mjs';
import { HEROES_GLORY } from './helpers/config.mjs';
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

  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: '1d20 + @speed',
    decimals: 2,
  };

  // Define custom Document and DataModel classes
  CONFIG.Actor.documentClass = HeroesGloryActor;

  CONFIG.Actor.dataModels = {
    hero: models.HeroesGloryHero,
    creature: models.HeroesGloryCreature
  }
  CONFIG.Item.documentClass = HeroesGloryItem;
  CONFIG.Item.dataModels = {
    weapon: models.HeroesGloryWeapon,
    spell: models.HeroesGlorySpell,
    artifact: models.HeroesGloryArtifact,
    skill: models.HeroesGlorySkill
  }

  // Active Effects are never copied to the Actor,
  // but will still apply to the Actor from within the Item
  // if the transfer property on the Active Effect is true.
  CONFIG.ActiveEffect.legacyTransferral = false;

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
