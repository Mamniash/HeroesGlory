const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Shared behaviour for every Heroes & Glory actor sheet. Type-specific
 * sheets (hero/creature) supply their own `PARTS` — each declares both
 * `header` and `body`, in full, for the same reason documented on the
 * item sheets' base class: `static PARTS` replaces rather than merges
 * across a class hierarchy, unlike `DEFAULT_OPTIONS`.
 */
export class HeroesGloryActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['heroes-glory', 'sheet', 'actor'],
    tag: 'form',
    position: { width: 760, height: 'auto' },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: this.#onEditImage,
      openItem: this.#onOpenItem,
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.system = this.actor.system;
    context.config = CONFIG.HEROES_GLORY;
    return context;
  }

  /**
   * Open the file picker to change the actor's image.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target   The element carrying `data-edit`.
   */
  static async #onEditImage(event, target) {
    const attribute = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attribute);
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: 'image',
      current,
      callback: (path) => this.document.update({ [attribute]: path }),
    });
    return picker.browse();
  }

  /**
   * Open an owned item's own sheet — how equipment, skills and spells
   * listed on the actor sheet are actually edited (tier, equipped,
   * variants, ...), rather than duplicating that editing UI here.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target   The element carrying `data-item-id`.
   */
  static #onOpenItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    return item?.sheet.render(true);
  }
}
