import { HeroesGloryActorSheet } from './base-actor-sheet.mjs';
import { moraleAttemptsRemaining } from '../../helpers/rolls.mjs';
import { isMaxDepleted } from '../../helpers/wounds.mjs';

export class HeroesGloryHeroSheet extends HeroesGloryActorSheet {
  static PARTS = {
    header: { template: 'systems/heroes-glory/templates/actor/parts/actor-hero-header.hbs' },
    body: { template: 'systems/heroes-glory/templates/actor/actor-hero-sheet.hbs', scrollable: [''] },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const config = CONFIG.HEROES_GLORY;
    const system = this.actor.system;

    context.raceLabel = config.races[system.race] ?? '';
    context.factionLabel = config.factions[system.faction] ?? '';
    context.classLabel = config.classes[system.heroClass] ?? '';

    // §5.8: how many Боевой дух tests are left this battle, for the
    // sheet's morale-test buttons.
    context.isGM = game.user.isGM;
    const moraleUsed = this.actor.getFlag('heroes-glory', 'moraleUsed') ?? 0;
    context.moraleRemaining = moraleAttemptsRemaining(system.morale, moraleUsed);

    // §5.9: warn on the sheet once Ранения have driven a max to 0.
    context.healthDepleted = isMaxDepleted(system.health.max);
    context.manaDepleted = isMaxDepleted(system.mana.max);

    // §5.9: gates the GM-only post-battle-resolution buttons.
    context.isIncapacitated = this.actor.statuses.has(config.statusEffects.incapacitated);

    const weapons = this.actor.items.filter((i) => i.type === 'weapon');
    const artifacts = this.actor.items.filter((i) => i.type === 'artifact');

    // §8.1: at most one equipped melee weapon and one equipped ranged weapon.
    context.meleeWeapon = weapons.find((i) => i.system.equipped && i.system.weaponType !== 'ranged') ?? null;
    context.rangedWeapon = weapons.find((i) => i.system.equipped && i.system.weaponType === 'ranged') ?? null;

    // §8.2: one equipped slot per artifact type.
    context.artifactSlots = Object.entries(config.artifactTypes).map(([key, labelKey]) => ({
      key,
      labelKey,
      item: artifacts.find((i) => i.system.equipped && i.system.artifactType === key) ?? null,
    }));

    // §8.3: everything else carried but not worn/wielded.
    context.inventory = [
      ...weapons.filter((i) => !i.system.equipped),
      ...artifacts.filter((i) => !i.system.equipped),
    ];

    // §3: owned secondary-skill items, with their tier/skill labels resolved.
    context.secondarySkills = this.actor.items
      .filter((i) => i.type === 'skill')
      .map((i) => ({
        item: i,
        tierLabel: config.skillTiers[i.system.tier] ?? '',
        skillLabel: config.secondarySkills[i.system.skillKey] ?? '',
      }));

    context.spells = this.actor.items.filter((i) => i.type === 'spell');

    return context;
  }
}
