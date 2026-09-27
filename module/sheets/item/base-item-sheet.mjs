import { resolveEffectivePanelColor } from '../../helpers/panel-color.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * Shared behaviour for every Heroes & Glory item sheet. Type-specific
 * sheets (weapon/spell/artifact/skill) supply their own `PARTS` — each
 * declares its parts in full (either `header` + `body`, or a single part
 * wrapped in the hero-style frame partial, see framed-item-sheet.mjs).
 * PARTS is not defined here and left for each subclass to declare in
 * full: a subclass's `static PARTS` replaces rather than merges with an
 * ancestor's, unlike `DEFAULT_OPTIONS`, so a header-only PARTS entry here
 * would silently do nothing once a subclass adds its own `PARTS`.
 */
export class HeroesGloryItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['heroes-glory', 'sheet', 'item'],
    tag: 'form',
    position: { width: 480, height: 'auto' },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: this.#onEditImage,
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;
    context.config = CONFIG.HEROES_GLORY;
    // Frame color: the owning hero's panel color; anything else (a world
    // or compendium item, a creature's item) gets the system's fallback.
    const owner = this.item.actor;
    context.panelColor = owner?.type === 'hero'
      ? resolveEffectivePanelColor(owner.system)
      : resolveEffectivePanelColor({ panelColor: 'auto', faction: '' });
    return context;
  }

  /**
   * Open the file picker to change the item's image. A read-only sheet
   * (locked compendium, no rights) leaves the image alone.
   * @this {HeroesGloryItemSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target   The element carrying `data-edit`.
   */
  static async #onEditImage(event, target) {
    if (!this.isEditable) return;
    const attribute = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attribute);
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: 'image',
      current,
      callback: (path) => this.document.update({ [attribute]: path }),
    });
    return picker.browse();
  }
}
