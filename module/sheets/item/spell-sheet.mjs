import { HeroesGloryItemSheet } from './base-item-sheet.mjs';

export class HeroesGlorySpellSheet extends HeroesGloryItemSheet {
  static PARTS = {
    form: { template: 'systems/heroes-glory/templates/item/item-spell-sheet.hbs' },
  };
}
