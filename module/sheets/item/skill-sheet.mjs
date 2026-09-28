import { HeroesGloryFramedItemSheet } from './framed-item-sheet.mjs';

export class HeroesGlorySkillSheet extends HeroesGloryFramedItemSheet {
  static PARTS = {
    sheet: { template: 'systems/heroes-glory/templates/item/item-skill-sheet.hbs' },
  };

  static DEFAULT_OPTIONS = {
    actions: {
      setTier: this.#onSetTier,
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const config = CONFIG.HEROES_GLORY;
    // The skill is picked in the header instead of a name field: the
    // item's name (and image) follow the chosen skill.
    context.headerSelect = {
      name: 'system.skillKey',
      choices: config.secondarySkills,
      value: this.item.system.skillKey,
      placeholder: game.i18n.localize('HEROES_GLORY.Skill.KeyPlaceholder'),
    };
    context.tierRows = [
      ['base', 'HEROES_GLORY.Skill.EffectBase'],
      ['advanced', 'HEROES_GLORY.Skill.EffectAdvanced'],
      ['expert', 'HEROES_GLORY.Skill.EffectExpert'],
    ].map(([key, effectLabel]) => ({
      key, effectLabel, label: config.skillTiers[key],
      text: this.item.system.effects[key], active: this.item.system.tier === key,
    }));
    return context;
  }

  /**
   * A click on another tier's block makes it the owned tier (a click
   * inside its text field only edits the text).
   * @this {HeroesGlorySkillSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onSetTier(event, target) {
    if (!this.isEditable || event.target.closest('textarea')) return;
    return this.item.update({ 'system.tier': target.dataset.tier });
  }
}
