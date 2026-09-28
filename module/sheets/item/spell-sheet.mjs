import { HeroesGloryFramedItemSheet } from './framed-item-sheet.mjs';

export class HeroesGlorySpellSheet extends HeroesGloryFramedItemSheet {
  static PARTS = {
    sheet: { template: 'systems/heroes-glory/templates/item/item-spell-sheet.hbs' },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // §6.3: the four mastery variants, each its own description and cost.
    // Only these two fields are on the sheet — `variants.*.effect` (§6.4)
    // is left out, and a form save only sends the fields it has, so the
    // effect stays as it is.
    context.variantRows = [
      ['none', 'HEROES_GLORY.Spell.VariantNone'],
      ['basic', 'HEROES_GLORY.Spell.VariantBasic'],
      ['advanced', 'HEROES_GLORY.Spell.VariantAdvanced'],
      ['expert', 'HEROES_GLORY.Spell.VariantExpert'],
    ].map(([key, label]) => ({ key, label, ...this.item.system.variants[key] }));
    return context;
  }
}
