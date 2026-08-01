import { HeroesGloryItemSheet } from './base-item-sheet.mjs';

export class HeroesGloryWeaponSheet extends HeroesGloryItemSheet {
  static PARTS = {
    form: { template: 'systems/heroes-glory/templates/item/item-weapon-sheet.hbs' },
  };
}
