import { HeroesGloryItemSheet } from './base-item-sheet.mjs';

export class HeroesGloryArtifactSheet extends HeroesGloryItemSheet {
  static PARTS = {
    form: { template: 'systems/heroes-glory/templates/item/item-artifact-sheet.hbs' },
  };
}
