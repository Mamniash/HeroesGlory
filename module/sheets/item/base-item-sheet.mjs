import { PixelScaleController } from '../../helpers/pixel-scale.mjs';
import { resolveEffectivePanelColor } from '../../helpers/panel-color.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * Native width of `.hg-item` (the hero-style item frame, templates/item/
 * parts/hg-item-frame.hbs) at which `--hg-pixel-scale` is exactly 1 —
 * `HG_ITEM_WINDOW_WIDTH` minus the window's own 1px border on each side,
 * same +2px relationship as the level-up window's 488/486.
 */
const HG_ITEM_REFERENCE_WIDTH_PX = 458;

/** Fixed window width for item sheets in the hero-style frame. */
export const HG_ITEM_WINDOW_WIDTH = HG_ITEM_REFERENCE_WIDTH_PX + 2;

/**
 * Shared behaviour for every Heroes & Glory item sheet. Type-specific
 * sheets (weapon/spell/artifact/skill) supply their own `PARTS` — each
 * declares its parts in full (either `header` + `body`, or a single part
 * wrapped in the hero-style frame partial). PARTS is not defined here and
 * left for each subclass to declare in full: a subclass's `static PARTS`
 * replaces rather than merges with an ancestor's, unlike
 * `DEFAULT_OPTIONS`, so a header-only PARTS entry here would silently
 * do nothing once a subclass adds its own `PARTS`.
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

  /**
   * Drives `--hg-pixel-scale` on `.hg-item` for sheets that use the
   * hero-style frame; sheets still on the old layout never render one.
   * @type {PixelScaleController}
   */
  #pixelScaleController = new PixelScaleController(HG_ITEM_REFERENCE_WIDTH_PX);

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
   * Core applies the window's position only after `_onRender`, so the
   * frame would first be measured at its unpositioned width; size the
   * window now, as the level-up window does, so the first
   * `--hg-pixel-scale` reading is already the real one.
   * @override
   */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    if (this.element.querySelector('.hg-item')) this.setPosition({ width: this.options.position.width });
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const frameEl = this.element.querySelector('.hg-item');
    if (frameEl) this.#pixelScaleController.observe(frameEl);
  }

  /** @override */
  async _preClose(options) {
    await super._preClose(options);
    this.#pixelScaleController.disconnect();
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
