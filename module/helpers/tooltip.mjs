/**
 * Custom hover-tooltip layer for the hero sheet's left-half stats
 * (primary skills, Health/Mana/Experience, morale/luck, secondary
 * skills) and the spellbook's per-spell tooltips. Deliberately NOT
 * Foundry's core `data-tooltip`/`data-tooltip-html` machinery and NOT a
 * separate ApplicationV2 window — this same component is meant to be
 * reused later for a level-up modal (`mode: 'modal'`, reserved below but
 * not implemented here).
 *
 * Lives as a child of whichever canvas (.hero-paperdoll/.hero-spellbook)
 * is currently showing — NOT appended to document.body — so it falls
 * inside that canvas's own `container-type: inline-size` (all of
 * _tooltip.scss's sizing is in `cqw`, resolved against the canvas, same
 * convention as .hero-paperdoll__slot's own font-size) and CSS
 * `position: absolute; top/left: 50%; transform: translate(-50%,-50%);`
 * centers it on that same canvas, not the viewport — no cursor-position
 * math needed here at all anymore. Since it's a normal descendant of
 * whatever the current canvas element is, it's torn down along with that
 * canvas on every re-render (hero-sheet.mjs's `{{#if spellbookOpen}}`
 * swap replaces the whole canvas element) — hideTooltip() is still
 * called defensively in the same two places as before (start of
 * `_onRender`'s tooltip-binding loop, and `_preClose`), since a
 * still-hovering cursor's `mouseleave` can still race a re-render either
 * way, even though the DOM cleanup itself is now automatic.
 */

/** @type {HTMLElement|null} */
let layerEl = null;

/**
 * @param {HTMLElement} boundsEl   The canvas (.hero-paperdoll or
 *   .hero-spellbook) the layer should live inside.
 */
function ensureLayer(boundsEl) {
  // Re-create whenever there's no layer yet, or the one we have is
  // detached (its canvas got replaced by a re-render) or belongs to a
  // different canvas than the one currently asking (paperdoll <-> book
  // toggle) — the stale element is just garbage-collected along with its
  // now-detached former parent, nothing to explicitly tear down.
  if (!layerEl || !layerEl.isConnected || layerEl.parentElement !== boundsEl) {
    layerEl = document.createElement('div');
    layerEl.className = 'hg-tooltip';
    layerEl.hidden = true;
    boundsEl.appendChild(layerEl);
  }
  return layerEl;
}

/**
 * Hide/remove whatever the layer is currently showing. No-op if nothing
 * is shown.
 */
export function hideTooltip() {
  if (!layerEl) return;
  layerEl.hidden = true;
  layerEl.innerHTML = '';
}

/**
 * @param {Node} content   Content to show (typically a cloned `<template>`).
 * @param {object} options
 * @param {HTMLElement} options.boundsEl   The canvas this tooltip belongs
 *   to and centers on — the hero sheet passes whichever of
 *   `.hero-paperdoll`/`.hero-spellbook` is currently showing.
 * @param {'tooltip'|'modal'} [options.mode]   Only `'tooltip'` is
 *   implemented. `'modal'` is a reserved value for the future level-up
 *   window (backdrop, click interception, closes via a confirm button)
 *   — see the TODO below.
 * @param {string} [options.color]   A `CONFIG.HEROES_GLORY.panelColors` key.
 */
export function showTooltip(content, { boundsEl, mode = 'tooltip', color = 'red' }) {
  const layer = ensureLayer(boundsEl);
  layer.dataset.mode = mode;
  layer.dataset.color = color;
  layer.replaceChildren(content);
  layer.hidden = false;
  if (mode === 'modal') {
    // TODO(level-up modal): backdrop + click interception + confirm-
    // button close. Not implemented — nothing passes `mode: 'modal'`
    // yet, this branch only reserves the shape. Centering itself is
    // already shared with `'tooltip'` mode via plain CSS (`_tooltip.scss`),
    // so there's nothing extra to do for that part.
  }
}

/**
 * Wire one hover target to one `<template>` of content, shown/hidden on
 * mouseenter/mouseleave.
 * @param {HTMLElement} triggerEl
 * @param {HTMLTemplateElement} templateEl
 * @param {object} [options]
 * @param {HTMLElement} [options.boundsEl]   Defaults to
 *   `triggerEl.closest('.hero-paperdoll, .hero-spellbook')`.
 * @param {'tooltip'|'modal'} [options.mode]
 * @returns {() => void} detach   Removes the listeners this call added.
 */
export function attachTooltip(triggerEl, templateEl, options = {}) {
  const boundsEl = options.boundsEl ?? triggerEl.closest('.hero-paperdoll, .hero-spellbook');
  const mode = options.mode ?? 'tooltip';
  const color = boundsEl?.dataset.panelColor ?? 'red';

  const onEnter = () => {
    showTooltip(templateEl.content.cloneNode(true), { boundsEl, mode, color });
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
