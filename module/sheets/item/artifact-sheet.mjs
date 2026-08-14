import { HeroesGloryItemSheet } from './base-item-sheet.mjs';

export class HeroesGloryArtifactSheet extends HeroesGloryItemSheet {
  static PARTS = {
    header: { template: 'systems/heroes-glory/templates/item/parts/item-sheet-header.hbs' },
    body: { template: 'systems/heroes-glory/templates/item/item-artifact-sheet.hbs' },
  };

  static DEFAULT_OPTIONS = {
    actions: {
      addModifier: this.#onAddModifier,
      deleteModifier: this.#onDeleteModifier,
      addTargetSlot: this.#onAddTargetSlot,
      deleteTargetSlot: this.#onDeleteTargetSlot,
    },
  };

  /**
   * Append a default modifier row (§8.2 structured bonuses).
   * @this {HeroesGloryArtifactSheet}
   */
  static async #onAddModifier() {
    const modifiers = [...this.item.system.modifiers, { stat: 'attack', mode: 'add', value: 0 }];
    return this.item.update({ 'system.modifiers': modifiers });
  }

  /**
   * Remove the modifier row at `data-index`.
   * @this {HeroesGloryArtifactSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onDeleteModifier(event, target) {
    const index = Number(target.dataset.index);
    const modifiers = this.item.system.modifiers.filter((_, i) => i !== index);
    return this.item.update({ 'system.modifiers': modifiers });
  }

  /**
   * Append a default targetSlots row (§8.2 hand-curated paperdoll slots).
   * @this {HeroesGloryArtifactSheet}
   */
  static async #onAddTargetSlot() {
    const targetSlots = [...this.item.system.targetSlots, 1];
    return this.item.update({ 'system.targetSlots': targetSlots });
  }

  /**
   * Remove the targetSlots row at `data-index`.
   * @this {HeroesGloryArtifactSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onDeleteTargetSlot(event, target) {
    const index = Number(target.dataset.index);
    const targetSlots = this.item.system.targetSlots.filter((_, i) => i !== index);
    return this.item.update({ 'system.targetSlots': targetSlots });
  }
}
