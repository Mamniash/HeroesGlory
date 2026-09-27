import { HeroesGloryFramedItemSheet } from './framed-item-sheet.mjs';

export class HeroesGloryWeaponSheet extends HeroesGloryFramedItemSheet {
  static PARTS = {
    sheet: { template: 'systems/heroes-glory/templates/item/item-weapon-sheet.hbs' },
  };
}
