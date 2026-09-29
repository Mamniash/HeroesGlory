import { HeroesGloryItemSheet } from './base-item-sheet.mjs';
import { HeroesGloryFramedSheetMixin } from '../framed-sheet-mixin.mjs';

/**
 * Base for item sheets in the hero's style: the shared frame, drop-down
 * and fold-outs of framed-sheet-mixin.mjs on the item sheet base.
 */
export class HeroesGloryFramedItemSheet extends HeroesGloryFramedSheetMixin(HeroesGloryItemSheet) {}
