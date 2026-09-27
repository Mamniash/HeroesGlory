import { HeroesGloryFramedItemSheet } from './framed-item-sheet.mjs';
import { ARTIFACT_LOCKED_SLOTS, paperdollValidSlots, toggleArtifactSlot } from '../../helpers/paperdoll-slots.mjs';

const SLOT_COUNT = 19;

export class HeroesGloryArtifactSheet extends HeroesGloryFramedItemSheet {
  static PARTS = {
    sheet: { template: 'systems/heroes-glory/templates/item/item-artifact-sheet.hbs' },
  };

  static DEFAULT_OPTIONS = {
    actions: {
      toggleSlot: this.#onToggleSlot,
      deleteModifier: this.#onDeleteModifier,
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.item.system;
    const slotName = (slot) => game.i18n.localize(`HEROES_GLORY.Artifact.SlotName.${slot}`);

    context.isWeapon = system.artifactType === 'enchantedWeapon';
    context.hasLevel = system.artifactType === 'enchantedArmor' || system.artifactType === 'enchantedShield';
    // Marked = where the hero's paperdoll accepts this item — the same
    // paperdollSlotAccepts the hero sheet's drop uses: targetSlots for most
    // artifacts, the weapon type (1 or 16) for an enchanted weapon, whose
    // doll therefore only shows and never toggles.
    const accepted = new Set(paperdollValidSlots(this.item));
    context.dollCells = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const slot = i + 1;
      const locked = ARTIFACT_LOCKED_SLOTS.includes(slot);
      return {
        slot, name: slotName(slot), on: accepted.has(slot), locked,
        clickable: !locked && !context.isWeapon && this.isEditable,
      };
    });

    // «Прибавить N» shown as a signed number; a book «вычесть» (older items)
    // is shown the same way and saved back as «прибавить −N». Any other mode
    // (hand-made, none in the book) is kept as it is.
    context.modifierRows = system.modifiers.map((modifier, index) => {
      const signed = modifier.mode === 'subtract' ? -modifier.value : modifier.value;
      const plain = modifier.mode === 'add' || modifier.mode === 'subtract';
      const value = plain ? signed : modifier.value;
      return {
        index, stat: modifier.stat,
        mode: plain ? 'add' : modifier.mode,
        shown: plain && value > 0 ? `+${value}` : String(value),
      };
    });
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // New modifier: picking a characteristic in the empty row adds it (+1).
    // Stopped here so the form doesn't also submit for this unnamed select.
    this.element.querySelector('[data-hg-select-role="add-modifier"]')?.addEventListener('change', (event) => {
      event.stopPropagation();
      const stat = event.target.value;
      if (!stat || !this.isEditable) return;
      this.item.update({ 'system.modifiers': [...this.item.system.modifiers, { stat, mode: 'add', value: 1 }] });
    });
  }

  /**
   * §8.2: mark or unmark a slot (rings and «прочее» as one group).
   * @this {HeroesGloryArtifactSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onToggleSlot(event, target) {
    if (!this.isEditable || this.item.system.artifactType === 'enchantedWeapon') return;
    const targetSlots = toggleArtifactSlot(this.item.system.targetSlots, Number(target.dataset.slot));
    return this.item.update({ 'system.targetSlots': targetSlots });
  }

  /**
   * Remove the modifier row at `data-index`.
   * @this {HeroesGloryArtifactSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onDeleteModifier(event, target) {
    if (!this.isEditable) return;
    const index = Number(target.dataset.index);
    const modifiers = this.item.system.modifiers.filter((_, i) => i !== index);
    return this.item.update({ 'system.modifiers': modifiers });
  }
}
