/**
 * Shared logic for this system's two independent canvases that scale a
 * HOMM3 pixel font against their own live width — the hero sheet's
 * `.hero-paperdoll`/`.hero-spellbook` (hero-sheet.mjs) and the level-up
 * window's `.hg-lvlup` (level-up-app.mjs). Both used to carry their own
 * copy of the exact same `REFERENCE_CANVAS_WIDTH_PX`-relative formula and
 * `ResizeObserver` wiring — factored out here so there's one place to get
 * it right.
 *
 * `--hg-pixel-scale` is a continuous ratio, updated on every
 * `ResizeObserver` tick, driving every `calc(Npx * var(--hg-pixel-scale))`
 * in the SCSS — layout, padding, borders, sprites, AND font-size
 * (`hg-pixel-font`, utils/_mixins.scss). One ratio for everything; nothing
 * here is font-specific.
 *
 * A crisp/continuous split — a second variable read only by
 * `hg-pixel-font`, snapped to whichever multiplier of a font's native
 * height lands its bitmap grid on whole device pixels, updated after a
 * settle pause so nothing jumps mid-drag — was built and then reverted.
 * Not because the settle/pause mechanism didn't work; it did. Because
 * the crispness condition it was chasing turns out to be unreachable for
 * most real devicePixelRatio values:
 *
 * A HOMM3 bitmap font (utils/_fonts.scss's `$hg-font-h3-*-height`, 14/15/
 * 24px) renders crisply only when ONE NATIVE PIXEL of the font lands on a
 * WHOLE NUMBER of physical device pixels — i.e. `k * devicePixelRatio`
 * must be an integer, where `k` is the multiplier applied to the native
 * height (font-size = nativeHeight × k). Not "font-size × DPR is an
 * integer" — that weaker condition can hold by coincidence (native height
 * supplying a factor that cancels DPR's own denominator) while individual
 * ROWS of the bitmap still land at a fractional number of physical pixels
 * each, which is exactly as blurry as not snapping at all. Concretely:
 *
 *   DPR 1       -> k=1  (font-size 14px)   — reachable
 *   DPR 1.5     -> k=2  (font-size 28px)   — reachable
 *   DPR 1.25    -> k=4  (font-size 56px)   — needs `--hg-pixel-scale` ≥ 4,
 *                                             past any width this sheet
 *                                             will ever realistically be
 *   DPR 1.6875  -> k=16 (font-size 224px)  — hopeless
 *
 * `devicePixelRatio` is whatever the PLAYER's OS display scaling happens
 * to be (100%, 125%, 150%, 175%, 200%, arbitrary laptop values) — not
 * something this system controls, and not something a player should be
 * asked to change just to make one character sheet readable. Since the
 * condition above is unreachable at a sane font size for most real DPR
 * values, no purely CSS-driven scale (continuous OR snapped) can
 * guarantee crisp bitmap-font rendering across players. Confirmed
 * unreachable via `--force-device-scale-factor`-style Electron flags too:
 * forcing Chromium to report DPR 1 while Windows itself is still scaling
 * the display just moves the resampling from the font to the whole
 * window's compositor upscale — same blur, different layer, now
 * affecting the sheet's pixel-art sprites too.
 *
 * The one path that actually WOULD work regardless of DPR: draw glyphs
 * straight from the source .FNT bitmap data onto a `<canvas>`, sized in
 * real physical pixels, with smoothing disabled — full manual control
 * over every pixel, independent of the browser's font rasterizer. Not
 * done here, on purpose: it replaces this sheet's entire text-rendering
 * pipeline (every `hg-pixel-font` call site), which is a project of its
 * own, not a follow-up to a resize-settle tweak. Continuous scaling
 * (smooth resize, no frozen-then-jumping text, no snap that can outgrow
 * its own shrinking container — see the clipping this pass caused) was
 * judged more important than chasing crispness that only a minority of
 * players' displays could ever actually reach. If this gets revisited,
 * start from the canvas-glyph approach above, not from re-deriving a CSS
 * scale snap — that path has now been tried twice.
 */

/**
 * Lower/upper clamp for `--hg-pixel-scale`. The scale itself is a
 * continuous ratio, not an integer step — these two just stop it
 * collapsing toward 0 on an extreme narrow window or growing unboundedly
 * on a very wide one.
 *
 * MIN is 0.6, not 1 — deliberately BELOW the reference ratio, so text
 * keeps shrinking (SmallFont's 14px native height reaches ~8.4px here,
 * and read as still legible when this was picked) instead of freezing
 * while the sheet's own boxes keep shrinking around it. A frozen MIN=1 is
 * exactly what would reopen the overflow risk this constant and
 * `_hero-paperdoll.scss`'s own window `min-width` jointly guard against.
 * First iteration, not a measured optimum; adjust together with that
 * min-width if it turns out too small/large in practice.
 * @type {number}
 */
export const PIXEL_SCALE_MIN = 0.6;
export const PIXEL_SCALE_MAX = 3;

/**
 * @param {number} widthPx Canvas's own rendered width.
 * @param {number} referenceWidthPx Width at which the returned scale is 1.
 * @returns {number}
 */
export function computeContinuousScale(widthPx, referenceWidthPx) {
  return Math.min(PIXEL_SCALE_MAX, Math.max(PIXEL_SCALE_MIN, widthPx / referenceWidthPx));
}

/**
 * Owns one canvas element's `--hg-pixel-scale`, keeping it in step with
 * the canvas's own live width. One instance per sheet/app; call
 * `observe(canvasEl)` from `_onRender` (safe to call again on every
 * render — see its own comment) and `disconnect()` from `_preClose`.
 */
export class PixelScaleController {
  /** @type {HTMLElement|null} */
  #canvasEl = null;

  /** @type {number} */
  #referenceWidthPx;

  /** @type {ResizeObserver|null} */
  #observer = null;

  /** @param {number} referenceWidthPx Canvas width at which the continuous scale is 1 — see each caller's own `REFERENCE_CANVAS_WIDTH_PX` doc. */
  constructor(referenceWidthPx) {
    this.#referenceWidthPx = referenceWidthPx;
  }

  /**
   * (Re)watch `canvasEl` for width changes. Disconnects any previous
   * observer first — a re-render's `{{#if spellbookOpen}}` swap (or the
   * level-up window's own equivalent) replaces the whole canvas element,
   * so the old observer's target is already detached and would never
   * fire again anyway, but nothing tears down the observer *itself*
   * without this.
   * @param {HTMLElement} canvasEl
   */
  observe(canvasEl) {
    this.disconnect();
    this.#canvasEl = canvasEl;
    this.#update();
    this.#observer = new ResizeObserver(() => this.#update());
    this.#observer.observe(canvasEl);
  }

  /** Stop watching. Safe to call even if never `observe()`d. */
  disconnect() {
    this.#observer?.disconnect();
    this.#observer = null;
  }

  #update() {
    const canvasEl = this.#canvasEl;
    const width = canvasEl.getBoundingClientRect().width;
    const scale = computeContinuousScale(width, this.#referenceWidthPx);
    canvasEl.style.setProperty('--hg-pixel-scale', String(scale));
  }
}
