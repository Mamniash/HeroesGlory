/**
 * Our dialogs and the picker resize like the hero sheet: in proportion —
 * the whole content grows or shrinks 1:1, the aspect stays, nothing
 * reflows. The same mechanism as the sheet (pixel-scale.mjs): a
 * `PixelScaleController` keeps `--hg-pixel-scale` on `.window-content` at
 * its width ÷ the reference width, clamped like the sheet's (0.6…3). The
 * reference is the content's natural width at scale 1, measured on every
 * render — each picker screen has its own shape; the scale carries over.
 * These windows' CSS is in native px, so the frame inside is zoomed whole
 * by that ratio (`zoom`, _dialog.scss); the window's height follows its
 * width (`_prePosition`: height «auto», as the hero sheet).
 */
import { PixelScaleController, PIXEL_SCALE_MIN, PIXEL_SCALE_MAX } from './pixel-scale.mjs';

export class ScaledWindow {
  /** @type {foundry.applications.api.ApplicationV2} */
  #app;

  /** @type {PixelScaleController} */
  #controller;

  /** @param {foundry.applications.api.ApplicationV2} app */
  constructor(app) {
    this.#app = app;
    // A new scale changes the content's height — the window follows.
    this.#controller = new PixelScaleController(1, { onChange: () => this.#app.setPosition({ height: 'auto' }) });
  }

  /**
   * Call from `_onRender`, every render: measure the content's natural
   * width at scale 1 (the reference), keep the scale it had, set the
   * window's width to match, bound the window between the scale's limits.
   */
  fit() {
    const el = this.#app.element;
    const content = el?.querySelector('.window-content');
    if (!content) return;
    const scale = Number(content.style.getPropertyValue('--hg-pixel-scale')) || 1;
    this.#controller.disconnect();
    content.style.setProperty('--hg-pixel-scale', '1');
    Object.assign(el.style, { minWidth: '', maxWidth: '' });
    this.#app.setPosition({ width: 'auto', height: 'auto' });
    const natural = content.getBoundingClientRect().width;
    const chrome = el.getBoundingClientRect().width - natural;
    // Core keeps a resize within the window's CSS min/max-width.
    el.style.minWidth = `${natural * PIXEL_SCALE_MIN + chrome}px`;
    el.style.maxWidth = `${natural * PIXEL_SCALE_MAX + chrome}px`;
    this.#controller.setReference(natural);
    this.#app.setPosition({ width: natural * scale + chrome, height: 'auto' });
    this.#controller.observe(content);
  }

  /** Stop watching — from `_preClose`. */
  disconnect() {
    this.#controller.disconnect();
  }
}
