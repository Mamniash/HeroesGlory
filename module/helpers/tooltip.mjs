/**
 * Custom tooltip layer for the hero sheet's left-half stats (primary
 * skills, Health/Mana/Experience, morale/luck, secondary skills), the
 * paperdoll/backpack item icons, and the spellbook's per-spell tooltips.
 * Deliberately NOT Foundry's core `data-tooltip`/`data-tooltip-html`
 * machinery and NOT a separate ApplicationV2 window — this same
 * component is meant to be reused later for a level-up modal
 * (`mode: 'modal'`, reserved below but not implemented here).
 *
 * Two ways to trigger a tooltip (hover shows nothing anymore):
 *  - Holding the RIGHT mouse button down over a trigger shows the
 *    tooltip for as long as the button stays down, everywhere a tooltip
 *    exists, in both edit-mode states. The browser/Foundry context menu
 *    is suppressed on every trigger so it doesn't fight this.
 *  - A single LEFT click "pins" the same tooltip open (see `pinTooltip`)
 *    on triggers that opt in via `clickToPin` — the caller (hero-sheet.mjs)
 *    only passes that for elements whose left click isn't already some
 *    other game action (attack/cast/use-skill/open-item/...). A pinned
 *    tooltip stays open until the OK button is clicked or the user
 *    clicks anywhere outside it — that outside click is swallowed (it
 *    only closes the tooltip, never also fires whatever it landed on).
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
 * still-held right button or an in-flight pin can still race a
 * re-render either way, even though the DOM cleanup itself is now
 * automatic.
 */

/** @type {HTMLElement|null} */
let layerEl = null;

/**
 * How long (ms) the pinned tooltip's OK button holds its pressed frame
 * (assets/buttons/iok6432 f001) before actually closing — same value and
 * same rationale as hero-sheet.mjs's own BACKPACK_PRESS_HOLD_MS for the
 * backpack scroll arrows (long enough to read as a press, short enough
 * not to feel laggy). Kept as its own constant rather than importing
 * that one — this module has no other reason to depend on hero-sheet.mjs,
 * and re-deriving one small number isn't worth the coupling.
 */
const PIN_OK_PRESS_HOLD_MS = 150;

/**
 * The document-level listener that closes a pinned tooltip on an
 * outside click, while it's attached — `null` when nothing is pinned.
 * @type {((event: MouseEvent) => void)|null}
 */
let pinOutsideClickHandler = null;

/**
 * Handle for the deferred `pinOutsideClickHandler` attachment (see
 * `pinTooltip`'s own comment for why it's deferred), so `hideTooltip`
 * can cancel it if the tooltip closes before the attach ever runs.
 * @type {number|null}
 */
let pinAttachTimeout = null;

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
 * Tears down whatever pin-only state is active (the outside-click
 * listener and/or its pending deferred attach), without touching the
 * layer's visibility/content — shared by `hideTooltip` and by
 * `showTooltip`/`pinTooltip` themselves so re-showing (pinned or not)
 * never leaves a stale outside-click listener behind.
 */
function teardownPin() {
  if (pinAttachTimeout !== null) {
    clearTimeout(pinAttachTimeout);
    pinAttachTimeout = null;
  }
  if (pinOutsideClickHandler) {
    document.removeEventListener('click', pinOutsideClickHandler, true);
    pinOutsideClickHandler = null;
  }
}

/**
 * Hide/remove whatever the layer is currently showing. No-op if nothing
 * is shown.
 */
export function hideTooltip() {
  teardownPin();
  if (!layerEl) return;
  layerEl.hidden = true;
  layerEl.innerHTML = '';
  delete layerEl.dataset.pinned;
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
  teardownPin();
  const layer = ensureLayer(boundsEl);
  layer.dataset.mode = mode;
  layer.dataset.color = color;
  delete layer.dataset.pinned;
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
 * Same as `showTooltip`, but the tooltip stays open (survives the click
 * that opened it, and doesn't respond to hover/right-button-release at
 * all) until the OK button is clicked or the user clicks anywhere
 * outside the tooltip. `_tooltip.scss`'s `[data-pinned='true']` rule
 * switches the layer from `pointer-events: none` (plain tooltip mode
 * never intercepts clicks) to `auto`, which is what lets the OK button
 * receive its own click at all.
 * @param {Node} content
 * @param {object} options   Same shape as `showTooltip`'s `options`.
 */
function pinTooltip(content, options) {
  showTooltip(content, options);
  const layer = layerEl;
  layer.dataset.pinned = 'true';

  const okButton = document.createElement('button');
  okButton.type = 'button';
  okButton.className = 'hg-tooltip__ok';
  okButton.setAttribute('aria-label', game.i18n.localize('HEROES_GLORY.Tooltip.CloseHint'));
  okButton.addEventListener('click', () => {
    // Same press-then-release pattern as the backpack scroll arrows
    // (hero-sheet.mjs's #onBackpackScroll/#backpackPressedDirection):
    // hold the pressed frame for a beat so it's actually seen before the
    // tooltip (and this button along with it) disappears.
    okButton.classList.add('hg-tooltip__ok--pressed');
    okButton.disabled = true;
    setTimeout(hideTooltip, PIN_OK_PRESS_HOLD_MS);
  });
  layer.appendChild(okButton);

  // The click that pinned this tooltip is still bubbling/being dispatched
  // right now — attaching the outside-click listener synchronously would
  // risk it also seeing that same click on some browsers/paths and
  // instantly closing what it just opened. Deferring to the next tick
  // sidesteps that without needing to reason about exact dispatch timing.
  pinAttachTimeout = setTimeout(() => {
    pinAttachTimeout = null;
    pinOutsideClickHandler = (event) => {
      if (layer.contains(event.target)) return;
      // Capture phase + stopPropagation: an outside click only closes the
      // tooltip, it never also fires whatever it actually landed on
      // (another icon, a button, ...) — decided explicitly rather than
      // left ambiguous, see the task this came from.
      event.stopPropagation();
      hideTooltip();
    };
    document.addEventListener('click', pinOutsideClickHandler, true);
  }, 0);
}

/**
 * Wire one trigger element to one `<template>` of content:
 *  - holding the right mouse button down shows the tooltip for as long
 *    as it's held (released anywhere, not just back over the trigger);
 *  - a left click pins it open instead, if `clickToPin` is set.
 * The context menu is always suppressed on `triggerEl`, regardless of
 * `clickToPin`, so right-click-hold never fights it.
 * @param {HTMLElement} triggerEl
 * @param {HTMLTemplateElement} templateEl
 * @param {object} [options]
 * @param {HTMLElement} [options.boundsEl]   Defaults to
 *   `triggerEl.closest('.hero-paperdoll, .hero-spellbook')`.
 * @param {'tooltip'|'modal'} [options.mode]
 * @param {boolean} [options.clickToPin]   Whether a left click pins the
 *   tooltip open (see `pinTooltip`). Left off for triggers whose left
 *   click is already some other action.
 * @returns {() => void} detach   Removes the listeners this call added.
 */
export function attachTooltip(triggerEl, templateEl, options = {}) {
  const boundsEl = options.boundsEl ?? triggerEl.closest('.hero-paperdoll, .hero-spellbook');
  const mode = options.mode ?? 'tooltip';
  const color = boundsEl?.dataset.panelColor ?? 'red';
  const clickToPin = options.clickToPin ?? false;
  const showOptions = { boundsEl, mode, color };

  const onContextMenu = (event) => event.preventDefault();

  const onMouseDown = (event) => {
    if (event.button !== 2) return;
    event.preventDefault();
    showTooltip(templateEl.content.cloneNode(true), showOptions);
    const onMouseUp = () => {
      document.removeEventListener('mouseup', onMouseUp);
      hideTooltip();
    };
    document.addEventListener('mouseup', onMouseUp);
  };

  const onClick = clickToPin
    ? () => pinTooltip(templateEl.content.cloneNode(true), showOptions)
    : null;

  triggerEl.addEventListener('contextmenu', onContextMenu);
  triggerEl.addEventListener('mousedown', onMouseDown);
  if (onClick) triggerEl.addEventListener('click', onClick);

  return () => {
    triggerEl.removeEventListener('contextmenu', onContextMenu);
    triggerEl.removeEventListener('mousedown', onMouseDown);
    if (onClick) triggerEl.removeEventListener('click', onClick);
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
