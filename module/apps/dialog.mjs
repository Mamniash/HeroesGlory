import { PRESS_HOLD_MS } from '../helpers/button-press.mjs';
import { activateHgSelects, closeHgSelect } from '../helpers/hg-select.mjs';
import { trackKeyboardFocus } from '../helpers/focus-modality.mjs';
import { resolveEffectivePanelColor } from '../helpers/panel-color.mjs';

/** Button actions drawn with the «Отмена» sprite (icn6432); every other button is «OK» (iok6432). */
const CANCEL_ACTIONS = new Set(['no', 'cancel']);

/**
 * The picker's own button classes (picker.hbs, _tooltip.scss) — reused, not
 * restyled. @param {string} action @returns {string}
 */
function buttonClass(action) {
  return CANCEL_ACTIONS.has(action) ? 'hg-confirm__no' : 'hg-confirm__yes';
}

/**
 * One checkbox line of a dialog's list — the item sheets' SYSOPCHK checkbox
 * (`.hg-item__checkbox`, _item-frame.scss).
 * @param {string} name
 * @param {string} value
 * @param {string} label   Plain text.
 * @param {boolean} checked
 * @returns {string}
 */
export function checkboxRow(name, value, label, checked) {
  const esc = foundry.utils.escapeHTML;
  return `<label class="hg-item__checkbox">
      <input class="hg-item__checkbox-box" type="checkbox" name="${esc(name)}" value="${esc(value)}" ${checked ? 'checked' : ''}>
      <span class="hg-dialog__check-label">${esc(label)}</span>
    </label>`;
}

/**
 * One line of a dialog's single choice — the same SYSOPCHK sprite as
 * checkboxRow, on a radio input (one of the group checked at a time).
 * @param {string} name
 * @param {string} value
 * @param {string} label   Plain text.
 * @param {boolean} checked
 * @returns {string}
 */
export function radioRow(name, value, label, checked) {
  const esc = foundry.utils.escapeHTML;
  return `<label class="hg-item__checkbox">
      <input class="hg-item__checkbox-box" type="radio" name="${esc(name)}" value="${esc(value)}" ${checked ? 'checked' : ''}>
      <span class="hg-dialog__check-label">${esc(label)}</span>
    </label>`;
}

/**
 * Every small dialog the system opens itself (confirmations, rest, the
 * experience window) — core's `DialogV2` with the picker's look: the
 * `.hg-tooltip` frame and leather (picker.hbs), OK/Отмена as the HOMM3
 * iok6432/icn6432 sprites with the picker's pressed frame. Only the markup
 * changes: `confirm`/`wait`, the callbacks, the button order, the default
 * button, Enter (the form's implicit submit) and Escape are core's own.
 *
 * Extra option: `hgColor` — the frame color (`data-color`, a
 * `CONFIG.HEROES_GLORY.panelColors` key); the actor's own panel color where
 * the dialog is about one actor, `red` otherwise (the panel color's own
 * fallback, panel-color.mjs).
 */
export class HeroesGloryDialog extends foundry.applications.api.DialogV2 {
  static DEFAULT_OPTIONS = {
    classes: ['heroes-glory', 'hg-dialog-app'],
    hgColor: 'red',
  };

  /**
   * The frame color for a dialog about one actor: its panel color (a
   * creature has none of its own — its faction's, as on its sheet).
   * @param {Actor} actor
   * @returns {string}
   */
  static actorColor(actor) {
    return resolveEffectivePanelColor({ panelColor: actor.system.panelColor ?? 'auto', faction: actor.system.faction });
  }

  /**
   * The window wraps the frame, as the picker's does — core's `confirm`
   * asks for a fixed 400px width.
   * @override
   */
  _initializeApplicationOptions(options) {
    options = super._initializeApplicationOptions(options);
    options.position.width = 'auto';
    return options;
  }

  /** Set while the pressed frame holds, so a second click can't submit twice. */
  #submitting = false;

  /** @override */
  async _renderHTML(context, options) {
    const form = await super._renderHTML(context, options);
    form.className = 'dialog-form hg-tooltip hg-dialog';
    form.dataset.color = this.options.hgColor;
    // Core's `standard-form`/`form-footer` layout (stretched buttons, form
    // gaps) is replaced by the picker's confirm layout.
    const content = form.querySelector('.dialog-content');
    if (content) content.className = 'dialog-content hg-dialog__content';
    form.querySelector('.form-footer').className = 'hg-confirm__buttons';
    return form;
  }

  /**
   * Core's buttons carry an icon and a text label; here each is a bare
   * sprite with the label as its accessible name. Same attributes
   * otherwise: type, action, disabled, autofocus on the default button.
   * @override
   */
  _renderButtons() {
    const buttons = Object.values(this.options.buttons);
    return buttons.map((buttonOptions, i) => {
      const { action, label, type = 'submit', disabled } = buttonOptions;
      const isDefault = !!buttonOptions.default || ((i === 0) && !buttons.some((b) => b.default));
      const button = document.createElement('button');
      button.setAttribute('type', type);
      button.setAttribute('data-action', action);
      button.className = buttonClass(action);
      button.setAttribute('aria-label', game.i18n.localize(label));
      button.toggleAttribute('disabled', !!disabled);
      button.toggleAttribute('autofocus', isDefault);
      return button.outerHTML;
    }).join('');
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    trackKeyboardFocus(this.element);
    activateHgSelects(this.element, { color: this.options.hgColor, scaleEl: this.element });
  }

  /**
   * The picker's pressed frame (picker-app.mjs's `#onConfirmYes`): shown on
   * the button that submits, held for PRESS_HOLD_MS, then core's submit.
   * @override
   */
  async _onSubmit(target, event) {
    event.preventDefault();
    if (this.#submitting) return this;
    this.#submitting = true;
    if (target) target.classList.add(`${buttonClass(target.dataset.action)}--pressed`);
    await new Promise((resolve) => setTimeout(resolve, PRESS_HOLD_MS));
    try {
      return await super._onSubmit(target, event);
    } finally {
      this.#submitting = false;
    }
  }

  /** @override */
  async _preClose(options) {
    await super._preClose(options);
    closeHgSelect();
  }
}
