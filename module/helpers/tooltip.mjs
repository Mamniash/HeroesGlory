/**
 * Custom floating tooltip/modal layer for the hero sheet's left-half
 * stats (primary skills, Health/Mana/Experience, morale/luck, secondary
 * skills). Deliberately NOT Foundry's core `data-tooltip`/`data-tooltip-html`
 * machinery and NOT a separate ApplicationV2 window — this same
 * component is meant to be reused later for a level-up modal
 * (`mode: 'modal'`, reserved below but not implemented here).
 */

/** px gap kept between the cursor and the tooltip's edge. */
const GAP = 12;

/** @type {HTMLElement|null} */
let layerEl = null;

function ensureLayer() {
  if (!layerEl) {
    layerEl = document.createElement('div');
    // `heroes-glory` here is load-bearing, not decorative: this element
    // is a *sibling* of the sheet DOM (appended to document.body), so
    // the SCSS wrapper `.heroes-glory { @import ... }` in
    // heroes-glory.scss only matches descendants of an element carrying
    // this class — src/scss/components/_tooltip.scss relies on the
    // layer itself carrying both classes at once, not on nesting.
    layerEl.className = 'heroes-glory hg-tooltip';
    layerEl.hidden = true;
    document.body.appendChild(layerEl);
  }
  return layerEl;
}

/**
 * Hide/remove whatever the layer is currently showing. No-op if nothing
 * is shown. Safe to call unconditionally — the hero sheet calls this at
 * the start of every `_onRender` (a re-render can swap the hovered
 * trigger element out from under a still-hovering cursor, and the old
 * element's `mouseleave` will never fire) and from `_preClose` (closing
 * the sheet with the cursor still over a trigger has the same problem —
 * the layer lives in `document.body`, so it would otherwise survive the
 * sheet closing).
 */
export function hideTooltip() {
  if (!layerEl) return;
  layerEl.hidden = true;
  layerEl.innerHTML = '';
}

/**
 * @param {Node} content   Content to show (typically a cloned `<template>`).
 * @param {object} options
 * @param {number} options.x   clientX of the triggering pointer event.
 * @param {number} options.y   clientY of the triggering pointer event.
 * @param {HTMLElement} options.boundsEl   The tooltip must not overflow
 *   this element's `getBoundingClientRect()` — the hero sheet passes its
 *   `.hero-paperdoll` canvas, not the whole application window.
 * @param {'tooltip'|'modal'} [options.mode]   Only `'tooltip'` is
 *   implemented. `'modal'` is a reserved value for the future level-up
 *   window (centered position, backdrop, click interception, closes via
 *   a confirm button) — see the TODO below.
 * @param {string} [options.color]   A `CONFIG.HEROES_GLORY.panelColors` key.
 */
export function showTooltip(content, { x, y, boundsEl, mode = 'tooltip', color = 'red' }) {
  const layer = ensureLayer();
  layer.dataset.mode = mode;
  layer.dataset.color = color;
  layer.replaceChildren(content);

  // Measure before revealing at the final position — width/height
  // depend on how the text wraps, which only exists after a real
  // layout pass, so there's no way to compute the position first.
  layer.style.visibility = 'hidden';
  layer.hidden = false;

  if (mode === 'modal') {
    // TODO(level-up modal): centered positioning + backdrop + click
    // interception + confirm-button close. Not implemented — nothing
    // passes `mode: 'modal'` yet, this branch only reserves the shape.
    positionAsTooltip(layer, { x, y, boundsEl });
  } else {
    positionAsTooltip(layer, { x, y, boundsEl });
  }

  layer.style.visibility = 'visible';
}

/**
 * Anchor at the cursor, flipped left/up when it would overflow `boundsEl`,
 * clamped into `boundsEl` if it still doesn't fit even after flipping.
 * @param {HTMLElement} layer
 * @param {{x: number, y: number, boundsEl: HTMLElement}} anchor
 */
function positionAsTooltip(layer, { x, y, boundsEl }) {
  const bounds = boundsEl.getBoundingClientRect();
  const { width, height } = layer.getBoundingClientRect();

  let left = x + GAP;
  let top = y + GAP;
  if (left + width > bounds.right) left = x - width - GAP;
  if (top + height > bounds.bottom) top = y - height - GAP;
  left = Math.min(Math.max(left, bounds.left), Math.max(bounds.left, bounds.right - width));
  top = Math.min(Math.max(top, bounds.top), Math.max(bounds.top, bounds.bottom - height));

  layer.style.left = `${left}px`;
  layer.style.top = `${top}px`;
}

/**
 * Wire one hover target to one `<template>` of content, shown/hidden on
 * mouseenter/mouseleave.
 * @param {HTMLElement} triggerEl
 * @param {HTMLTemplateElement} templateEl
 * @param {object} [options]
 * @param {HTMLElement} [options.boundsEl]   Defaults to
 *   `triggerEl.closest('.hero-paperdoll')`.
 * @param {'tooltip'|'modal'} [options.mode]
 * @returns {() => void} detach   Removes the listeners this call added.
 */
export function attachTooltip(triggerEl, templateEl, options = {}) {
  const boundsEl = options.boundsEl ?? triggerEl.closest('.hero-paperdoll');
  const mode = options.mode ?? 'tooltip';
  const color = boundsEl?.dataset.panelColor ?? 'red';

  const onEnter = (event) => {
    showTooltip(templateEl.content.cloneNode(true), { x: event.clientX, y: event.clientY, boundsEl, mode, color });
  };
  const onLeave = () => hideTooltip();

  triggerEl.addEventListener('mouseenter', onEnter);
  triggerEl.addEventListener('mouseleave', onLeave);

  return () => {
    triggerEl.removeEventListener('mouseenter', onEnter);
    triggerEl.removeEventListener('mouseleave', onLeave);
  };
}

// Hides the tooltip the instant ANY drag starts anywhere on the page.
// Installed once at module load (ES module caching guarantees this runs
// exactly once regardless of how many sheets import this module) rather
// than per-sheet in some `_onRender` — dragging an item has nothing to
// do with which sheet happens to be open, and this way the requirement
// holds even for the future level-up modal without any extra wiring.
// Capture phase so it fires before any per-item drag handler.
document.addEventListener('dragstart', hideTooltip, true);
