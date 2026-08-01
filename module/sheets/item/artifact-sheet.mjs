import { HeroesGloryItemSheet } from './base-item-sheet.mjs';

export class HeroesGloryArtifactSheet extends HeroesGloryItemSheet {
  static PARTS = {
    header: { template: 'systems/heroes-glory/templates/item/parts/item-sheet-header.hbs' },
    body: { template: 'systems/heroes-glory/templates/item/item-artifact-sheet.hbs' },
  };
}
