import { HeroesGloryFramedItemSheet } from './framed-item-sheet.mjs';
import { ARTIFACT_LOCKED_SLOTS, toggleArtifactSlot } from '../../helpers/paperdoll-slots.mjs';
import { showTooltip, hideTooltip } from '../../helpers/tooltip.mjs';

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
    context.weaponSlotName = slotName(system.weaponType === 'ranged' ? 16 : 1);

    const chosen = new Set(system.targetSlots);
    context.dollCells = Array.from({ length: SLOT_COUNT }, (_, i) => {
      const slot = i + 1;
      const locked = ARTIFACT_LOCKED_SLOTS.includes(slot);
      return { slot, name: slotName(slot), on: chosen.has(slot), locked, clickable: !locked && this.isEditable };
    });
    const names = [...new Set([...chosen].sort((a, b) => a - b).map(slotName))];
    context.slotSummary = names.length ? names.join(', ') : game.i18n.localize('HEROES_GLORY.Artifact.SlotsNone');

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
    hideTooltip();
    await super._onRender(context, options);
    const side = this.element.querySelector('.hg-doll-side');
    for (const cell of this.element.querySelectorAll('.hg-doll__cell')) {
      cell.addEventListener('mouseenter', () => showTooltip(this.#slotHint(cell), { boundsEl: side, color: context.panelColor }));
      cell.addEventListener('mouseleave', () => hideTooltip());
    }
    // New modifier: picking a characteristic in the empty row adds it (+1).
    // Stopped here so the form doesn't also submit for this unnamed select.
    this.element.querySelector('[data-hg-select-role="add-modifier"]')?.addEventListener('change', (event) => {
      event.stopPropagation();
      const stat = event.target.value;
      if (!stat || !this.isEditable) return;
      this.item.update({ 'system.modifiers': [...this.item.system.modifiers, { stat, mode: 'add', value: 1 }] });
    });
  }

  /** @override */
  async _preClose(options) {
    hideTooltip();
    await super._preClose(options);
  }

  /**
   * The hover hint for a mini-paperdoll cell: its slot name, and a note on
   * the locked ones.
   * @param {HTMLElement} cell
   * @returns {DocumentFragment}
   */
  #slotHint(cell) {
    const fragment = document.createDocumentFragment();
    const title = document.createElement('p');
    title.className = 'hg-tooltip__title';
    title.textContent = cell.dataset.name;
    fragment.append(title);
    if (cell.classList.contains('is-locked')) {
      const note = document.createElement('p');
      note.textContent = game.i18n.localize('HEROES_GLORY.Artifact.SlotLocked');
      fragment.append(note);
    }
    return fragment;
  }

  /**
   * §8.2: mark or unmark a slot (rings and «прочее» as one group).
   * @this {HeroesGloryArtifactSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onToggleSlot(event, target) {
    if (!this.isEditable) return;
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
