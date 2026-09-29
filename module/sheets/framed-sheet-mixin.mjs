import { PixelScaleController } from '../helpers/pixel-scale.mjs';
import { activateHgSelects, closeHgSelect } from '../helpers/hg-select.mjs';
import { trackKeyboardFocus } from '../helpers/focus-modality.mjs';

/**
 * Native width of the `.hg-item` frame (templates/item/parts/hg-item-frame.hbs,
 * templates/actor/actor-creature-sheet.hbs) at which `--hg-pixel-scale` is
 * exactly 1 — the opening window width minus its 1px border on each side
 * (same +2px as the level-up window's 488/486).
 */
export const HG_FRAME_REFERENCE_WIDTH_PX = 458;

/**
 * Sheets in the hero's style — item sheets and the creature sheet: the
 * `.hg-item` frame, the shared drop-down list (hg-select.hbs), fold-out
 * sections. `Base` is a document sheet (ItemSheetV2 / ActorSheetV2 with the
 * Handlebars mixin); its `_prepareContext` must supply `panelColor`.
 *
 * Resizing works like the hero sheet (hero-sheet.mjs): the window is
 * dragged by its corner, only the width is taken from the drag, and
 * `--hg-pixel-scale` follows that width through the same
 * PixelScaleController (same 0.6…3 clamp) — every size inside is native
 * px × the scale; the window's min-width (_item-frame.scss) is where the
 * scale reaches its floor, as the hero sheet's own min-width is. The hero's canvas gets its height from a fixed aspect
 * ratio; here the height is the content's own (an opened section makes
 * it taller), so `_prePosition` pins the height to `auto` exactly as the
 * hero sheet does and the window always wraps its content.
 * @param {typeof foundry.applications.api.DocumentSheetV2} Base
 */
export function HeroesGloryFramedSheetMixin(Base) {
  return class HeroesGloryFramedSheet extends Base {
    static DEFAULT_OPTIONS = {
      classes: ['hg-item-app'],
      position: { width: HG_FRAME_REFERENCE_WIDTH_PX + 2, height: 'auto' },
      window: { resizable: true },
      actions: {
        toggleSection: this.#onToggleSection,
      },
    };

    /** @type {PixelScaleController} */
    #pixelScaleController = new PixelScaleController(HG_FRAME_REFERENCE_WIDTH_PX);

    /**
     * Open fold-out sections (`data-section` keys) — per opening, all
     * closed at first. Kept here, not in the DOM, so a field save
     * (submitOnChange re-renders the sheet) doesn't fold them back.
     * @type {Set<string>}
     */
    #openSections = new Set();

    /** @override */
    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      context.openSections = Object.fromEntries([...this.#openSections].map((key) => [key, true]));
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
      // Focus frames only for keyboard focus (helpers/focus-modality.mjs).
      trackKeyboardFocus(this.element);
      this.setPosition({ width: this.options.position.width });
    }

    /** @override */
    async _onRender(context, options) {
      closeHgSelect();
      await super._onRender(context, options);
      const frameEl = this.element.querySelector('.hg-item');
      this.#pixelScaleController.observe(frameEl);
      activateHgSelects(this.element, { color: context.panelColor, scaleEl: frameEl });
      // Fold-out titles and mini-paperdoll cells are role="button" elements,
      // not <button>s (a locked sheet disables every form control; a fold-out
      // must keep working there, a cell keeps its hover hint): Enter/Space
      // act like a click.
      this.element.querySelectorAll('[role="button"][data-action]').forEach((el) => {
        el.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          el.click();
        });
      });
      // One line of text that wraps on screen (.hg-item__textarea): Enter
      // must not put a line break into it.
      this.element.querySelectorAll('.hg-item__textarea').forEach((textarea) => {
        textarea.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') event.preventDefault();
        });
      });
    }

    /**
     * As on the hero sheet: whatever height a move or a corner drag asks
     * for, the window re-measures its content.
     * @override
     */
    _prePosition(position) {
      super._prePosition(position);
      position.height = 'auto';
    }

    /** @override */
    async _preClose(options) {
      await super._preClose(options);
      closeHgSelect();
      this.#pixelScaleController.disconnect();
    }

    /**
     * The document keeps this sheet instance between openings — close the
     * sections so every opening starts folded.
     * @override
     */
    _onClose(options) {
      super._onClose(options);
      this.#openSections.clear();
    }

    /**
     * @this {HeroesGloryFramedSheet}
     * @param {PointerEvent} event
     * @param {HTMLElement} target
     */
    static #onToggleSection(event, target) {
      const section = target.closest('.hg-item__section');
      const key = section.dataset.section;
      const open = !this.#openSections.has(key);
      if (open) this.#openSections.add(key);
      else this.#openSections.delete(key);
      section.classList.toggle('is-expanded', open);
      target.setAttribute('aria-expanded', String(open));
    }
  };
}
