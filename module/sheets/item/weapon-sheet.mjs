import { HeroesGloryItemSheet, HG_ITEM_WINDOW_WIDTH } from './base-item-sheet.mjs';

export class HeroesGloryWeaponSheet extends HeroesGloryItemSheet {
  static DEFAULT_OPTIONS = {
    classes: ['hg-item-app'],
    window: { resizable: false },
    position: { width: HG_ITEM_WINDOW_WIDTH, height: 'auto' },
    actions: {
      toggleEpicTable: this.#onToggleEpicTable,
    },
  };

  static PARTS = {
    sheet: { template: 'systems/heroes-glory/templates/item/item-weapon-sheet.hbs' },
  };

  /**
   * Epic table open or closed — per open window, starts collapsed. Kept
   * here, not in the DOM, so a field save (submitOnChange re-renders the
   * sheet) doesn't fold it back up.
   * @type {boolean}
   */
  #epicTableExpanded = false;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.epicTableExpanded = this.#epicTableExpanded;
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // An epic row is one line of text that wraps on screen; Enter must
    // not put a line break into it (it used to be a single-line input).
    this.element.querySelectorAll('.hg-item__textarea').forEach((textarea) => {
      textarea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') event.preventDefault();
      });
    });
  }

  /**
   * The document keeps this sheet instance between openings — fold the
   * table back up so every opening starts collapsed.
   * @override
   */
  _onClose(options) {
    super._onClose(options);
    this.#epicTableExpanded = false;
  }

  /**
   * @this {HeroesGloryWeaponSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onToggleEpicTable(event, target) {
    this.#epicTableExpanded = !this.#epicTableExpanded;
    target.closest('.hg-item__section').classList.toggle('is-expanded', this.#epicTableExpanded);
  }
}
