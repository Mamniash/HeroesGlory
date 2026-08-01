import { HeroesGloryActorSheet } from './base-actor-sheet.mjs';

export class HeroesGloryCreatureSheet extends HeroesGloryActorSheet {
  static PARTS = {
    header: { template: 'systems/heroes-glory/templates/actor/parts/actor-creature-header.hbs' },
    body: { template: 'systems/heroes-glory/templates/actor/actor-creature-sheet.hbs', scrollable: [''] },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    // §5.3 hit-table multipliers, display-only — no roll automation here.
    context.damageWeak = Math.floor(system.damage * 0.5);
    context.damageStrong = Math.floor(system.damage * 2);

    return context;
  }
}
