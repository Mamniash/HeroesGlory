import { HeroesGloryItemSheet } from './base-item-sheet.mjs';

export class HeroesGlorySkillSheet extends HeroesGloryItemSheet {
  static PARTS = {
    form: { template: 'systems/heroes-glory/templates/item/item-skill-sheet.hbs' },
  };
}
