/**
 * Custom tooltip layer for the hero sheet's left-half stats (primary
 * skills, Health/Mana/Experience, morale/luck, secondary skills), the
 * paperdoll/backpack item icons, the spellbook's per-spell tooltips, and
 * the level-up window's own skill/choice icons (module/apps/level-up-app.mjs
 * — a separate `ApplicationV2`, not part of the hero sheet's own DOM).
 * Deliberately NOT Foundry's core `data-tooltip`/`data-tooltip-html`
 * machinery — that only shows plain text/HTML on hover, not the
 * pinned/interactive content this layer also needs to support (option
 * lists, the OK button).
 *
 * §task: the Раса/Фракция/Класс/Цвет панели option pickers moved OFF this
 * layer onto a standalone window (`module/apps/picker-app.mjs`) earlier in
 * this project's history — `pinOptionList` below (added back for the
 * level-up window's own "pick a skill to upgrade" list,
 * module/apps/level-up-app.mjs's `#onPickUpgradeCandidate`) is a fresh,
 * standalone-window-independent revival of that same "list of options,
 * click one" capability, not a resurrection of whatever `hero-sheet.mjs`'s
 * old (now fully deleted) `#openOptionPicker` used to build inline — that
 * code is gone, this is a new implementation of the same idea, built on
 * the same `pinTooltip`/`.hg-option-list` foundation `pinConfirm` already
 * demonstrates working (see this file's own history if the exact old
 * shape ever matters again). Positions by living inside whichever
 * `boundsEl` the caller passes — the level-up window's own `.hg-lvlup`
 * canvas, so `_tooltip.scss`'s `top/left: 50%; transform: translate(-50%,
 * -50%)` centers it on THAT window, not the viewport (see this file's own
 * "Lives as a child of..." paragraph below for why that's automatic).
 *
 * `layerEl` itself is a SINGLE reusable slot shared across every caller,
 * regardless of which window it's currently living in — `showTooltip`/
 * `pinTooltip` both call `layer.replaceChildren(content)`, discarding
 * whatever was already there. That's fine for "one tooltip/picker at a
 * time anywhere in the whole client", which is the only thing any caller
 * has ever needed — the hero sheet and the level-up window are never both
 * showing a tooltip at once, so there's nothing to arbitrate between them.
 * `ensureLayer`'s own `boundsEl` param is what lets one layer serve every
 * caller: it re-parents `layerEl` to whichever canvas asks (hero-paperdoll,
 * hero-spellbook, or the level-up window's own `.hg-lvlup`) and recreates
 * it if the previous owner's canvas got replaced by a re-render — the
 * exact same mechanism that already handled the paperdoll<->spellbook
 * toggle before the level-up window existed as a separate case at all.
 * The `mode: 'modal'` branch below (reserved, still unused by any caller)
 * predates an earlier in-sheet-overlay iteration of the level-up window
 * that was later reverted to a standalone window instead; kept in case a
 * future single-content modal actually wants it.
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
 * `pinConfirm` (below `pinTooltip`) is the Yes/No variant — this project's
 * own replacement for `DialogV2.confirm`, styled through this same layer
 * instead of Foundry's plain dialog chrome. Same single-layer/single-slot
 * rules apply: opening one discards whatever was pinned before it (in
 * practice, always the option-list picker it's opened FROM — see
 * `hero-sheet.mjs`'s `#confirmRaceChange`/`#confirmClassEffectiveChange`,
 * whose option-list button already calls `hideTooltip()` before invoking
 * the callback that opens the confirm, so the two are never both showing
 * at once, not a stacked pair of layers).
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

import { PRESS_HOLD_MS } from './button-press.mjs';

/** @type {HTMLElement|null} */
let layerEl = null;

/**
 * The document-level listener that closes a pinned tooltip on an
 * outside click, while it's attached — `null` when nothing is pinned.
 * @type {((event: MouseEvent) => void)|null}
 */
let pinOutsideClickHandler = null;

/**
 * The document-level listener that closes a pinned tooltip on Escape,
 * while it's attached — `null` when nothing is pinned. Shares
 * `options.onDismiss` with `pinOutsideClickHandler` (same "closed without
 * committing" meaning both call it for) rather than needing its own
 * separate signal.
 * @type {((event: KeyboardEvent) => void)|null}
 */
let pinKeydownHandler = null;

/**
 * Handle for the deferred `pinOutsideClickHandler`/`pinKeydownHandler`
 * attachment (see `pinTooltip`'s own comment for why it's deferred), so
 * `hideTooltip` can cancel it if the tooltip closes before the attach
 * ever runs.
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
    // `hg-tooltip--floating` (_tooltip.scss) carries this layer's own
    // self-centering position/transform/pointer-events — the OTHER
    // consumer of bare `.hg-tooltip` markup, module/apps/picker-app.mjs's
    // real window, never adds this modifier, since a real window handles
    // its own positioning and is always interactive.
    layerEl.className = 'hg-tooltip hg-tooltip--floating';
    layerEl.hidden = true;
    boundsEl.appendChild(layerEl);
  }
  return layerEl;
}

/**
 * Tears down whatever pin-only state is active (the outside-click and
 * Escape listeners and/or their pending deferred attach), without
 * touching the layer's visibility/content — shared by `hideTooltip` and
 * by `showTooltip`/`pinTooltip` themselves so re-showing (pinned or not)
 * never leaves a stale listener behind.
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
  if (pinKeydownHandler) {
    document.removeEventListener('keydown', pinKeydownHandler, true);
    pinKeydownHandler = null;
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
 *   implemented; nothing currently passes `'modal'` — the level-up
 *   overlay is a separate layer, not this one in a different mode, see
 *   this file's header comment for why. Reserved, not removed — see the
 *   TODO below.
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
    // TODO: backdrop + click interception + confirm-button close, if this
    // mode ever gets a caller. Not implemented — nothing passes
    // `mode: 'modal'` (the level-up overlay is a separate layer instead,
    // see this file's header comment), this branch only reserves the
    // shape. Centering itself is already shared with `'tooltip'` mode via
    // plain CSS (`_tooltip.scss`), so
    // there's nothing extra to do for that part.
  }
}

/**
 * Same as `showTooltip`, but the tooltip stays open (survives the click
 * that opened it, and doesn't respond to hover/right-button-release at
 * all) until the OK button is clicked or the user clicks anywhere
 * outside the tooltip. `_tooltip.scss`'s `[data-pinned='true']` rule
 * switches the layer from `pointer-events: none` (plain tooltip mode
 * never intercepts clicks) to `auto`, which is what lets the OK button
 * (and, with `okButton: false`, whatever interactive content the caller
 * put in `content` instead — e.g. hero-sheet.mjs's identity/panel-color
 * option pickers) receive its own click at all.
 * @param {Node} content
 * @param {object} options   Same shape as `showTooltip`'s `options`.
 * @param {boolean} [options.okButton=true]   Set false to skip the OK
 *   button — for content that already closes itself on selection (an
 *   option picker), where a second explicit close button would be
 *   redundant. The outside-click-close listener below is unconditional
 *   either way, so the tooltip always stays dismissable.
 * @param {() => void} [options.onDismiss]   Called right before
 *   `hideTooltip()` when the layer closes via the outside-click listener
 *   specifically — not on any other close path (the OK button, or
 *   whatever the caller's own content does on selection, already run
 *   their own logic before/instead of relying on this). Lets a caller
 *   distinguish "closed by clicking outside" from "closed by an explicit
 *   choice" — `pinConfirm` below is the reason this exists: it needs to
 *   resolve its promise `false` on an outside click, not leave it hanging
 *   forever.
 */
export function pinTooltip(content, options = {}) {
  showTooltip(content, options);
  const layer = layerEl;
  layer.dataset.pinned = 'true';

  if (options.okButton !== false) {
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
      setTimeout(hideTooltip, PRESS_HOLD_MS);
    });
    layer.appendChild(okButton);
  }

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
      options.onDismiss?.();
    };
    document.addEventListener('click', pinOutsideClickHandler, true);
    // Escape always closes the whole layer, never just "one step back"
    // (a confirm dialog opened from an option list doesn't reopen the
    // list on Escape, only on the No button — see pinConfirm/hero-sheet.mjs's
    // #confirmRaceChange) — this project's and Foundry's own universal
    // "get me out of here" gesture, same as the level-up window's close
    // and every native Foundry dialog. Shares `onDismiss` with the
    // outside-click handler above rather than a separate signal — both
    // mean exactly the same thing to a caller.
    pinKeydownHandler = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      hideTooltip();
      options.onDismiss?.();
    };
    document.addEventListener('keydown', pinKeydownHandler, true);
  }, 0);
}

/**
 * §task: a pinned list of clickable text (optionally icon+text) rows —
 * the level-up window's "which skill to upgrade" picker
 * (module/apps/level-up-app.mjs's `#onPickUpgradeCandidate`). Built on
 * `pinTooltip` exactly the way `pinConfirm` already is (a pinned layer
 * holding whatever interactive content the caller needs, `okButton:
 * false` since picking a row already closes it) — see this file's own
 * header comment for why this is a fresh implementation of "list of
 * options, click one" rather than a revived copy of the deleted
 * `hero-sheet.mjs` code that used to do this for a different (now
 * window-based) set of pickers.
 *
 * Reuses `.hg-option-list`/`.hg-option-list__item` (`_tooltip.scss`) —
 * the SAME classes `templates/apps/picker.hbs` renders for its own list
 * screens — rather than inventing a second option-list look; an `icon`
 * on any option additionally gets `.hg-option-list__item--icon` (icon
 * left, text right), left off entirely for a plain text-only list so an
 * icon-less caller's rows render exactly as before this modifier existed.
 *
 * §task: an icon row's text is two stacked lines (`tierLabel` over
 * `skillLabel`, `.hg-option-list__item-text` — matching how a secondary
 * skill's own cell reads on the hero sheet, tier above name, no
 * separator), NOT the single "{label}" text node a plain (icon-less) row
 * gets — pass `tierLabel`/`skillLabel` for an icon row, `label` for a
 * plain one; a row can't sensibly mix both shapes, so exactly one pair
 * is expected per option depending on whether `icon` is set.
 * @param {{key:string, label?:string, icon?:string, tierLabel?:string, skillLabel?:string, current?:boolean}[]} options
 * @param {(key: string) => void} onPick   Called with the clicked row's
 *   `key` — the tooltip is already hidden by the time this runs, so a
 *   caller that itself opens something else (another tooltip, a window)
 *   never has to fight this layer for it first.
 * @param {object} [pinOptions]   Same shape as `pinTooltip`'s own options
 *   (`boundsEl`, `color`) — `okButton` is fixed by this function itself,
 *   passing it here has no effect.
 */
export function pinOptionList(options, onPick, pinOptions = {}) {
  const list = document.createElement('div');
  list.className = 'hg-option-list';
  for (const option of options) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = option.icon ? 'hg-option-list__item hg-option-list__item--icon' : 'hg-option-list__item';
    if (option.current) item.dataset.current = 'true';
    if (option.icon) {
      const img = document.createElement('img');
      img.className = 'hg-option-list__icon';
      img.src = option.icon;
      img.alt = '';
      item.appendChild(img);

      const text = document.createElement('span');
      text.className = 'hg-option-list__item-text';
      const tierEl = document.createElement('span');
      tierEl.textContent = option.tierLabel;
      const skillEl = document.createElement('span');
      skillEl.textContent = option.skillLabel;
      text.append(tierEl, skillEl);
      item.appendChild(text);
    } else {
      item.appendChild(document.createTextNode(option.label));
    }
    item.addEventListener('click', () => {
      hideTooltip();
      onPick(option.key);
    });
    list.appendChild(item);
  }
  pinTooltip(list, { ...pinOptions, okButton: false });
}

/**
 * The pixel-art counterpart to Foundry's own `DialogV2.confirm` — a
 * pinned tooltip holding the caller's content plus a Yes/No button row,
 * resolving a promise with the user's choice instead of applying anything
 * itself (callers still decide what Yes/No each mean). Built on `pinTooltip`
 * rather than a new layer: this project already treats the option pickers
 * (race/faction/classType/panelColor, `hero-sheet.mjs`'s `#openOptionPicker`)
 * as "the same pinned layer, different content", and a confirm dialog is
 * the same shape again — content plus interactive controls that close it.
 *
 * Closing any way at all — Yes, No, clicking outside, or Escape — settles
 * the promise exactly once; there's no third "still open, unresolved"
 * state a caller has to guard against, and no way for the returned
 * promise to hang forever. Three distinct outcomes, not a boolean:
 * `'yes'` and `'no'` are the two buttons; `'dismiss'` is outside-click or
 * Escape — a caller that wants "No" and "dismiss" to mean the same thing
 * (apply nothing) can still treat them the same, but `hero-sheet.mjs`'s
 * `#confirmRaceChange`/`#confirmClassEffectiveChange` treat them
 * differently on purpose (`'no'` reopens the option list this was opened
 * from, `'dismiss'` closes everything) — collapsing them back into one
 * boolean would lose that distinction.
 * @param {Node} content   Shown above the Yes/No row.
 * @param {object} [options]   Same shape as `pinTooltip`'s own `options`
 *   (`boundsEl`, `color`) — `okButton`/`onDismiss` are set by this function
 *   itself, passing either here has no effect.
 * @returns {Promise<'yes'|'no'|'dismiss'>}
 */
export function pinConfirm(content, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const wrapper = document.createElement('div');
    wrapper.className = 'hg-confirm';
    wrapper.appendChild(content);

    const row = document.createElement('div');
    row.className = 'hg-confirm__buttons';
    const yesButton = document.createElement('button');
    yesButton.type = 'button';
    yesButton.className = 'hg-confirm__yes';
    yesButton.setAttribute('aria-label', game.i18n.localize('HEROES_GLORY.Tooltip.ConfirmYesHint'));
    const noButton = document.createElement('button');
    noButton.type = 'button';
    noButton.className = 'hg-confirm__no';
    noButton.setAttribute('aria-label', game.i18n.localize('HEROES_GLORY.Tooltip.ConfirmNoHint'));

    // Same press-then-release pattern as .hg-tooltip__ok above: the pressed
    // frame is added synchronously, before either button is disabled and
    // the whole tooltip torn down a beat later — otherwise there'd be
    // nothing left in the DOM for a real `:active` state to paint onto.
    const pressAndSettle = (pressedButton, pressedClass, outcome) => {
      pressedButton.classList.add(pressedClass);
      yesButton.disabled = true;
      noButton.disabled = true;
      setTimeout(() => { hideTooltip(); settle(outcome); }, PRESS_HOLD_MS);
    };
    yesButton.addEventListener('click', () => pressAndSettle(yesButton, 'hg-confirm__yes--pressed', 'yes'));
    noButton.addEventListener('click', () => pressAndSettle(noButton, 'hg-confirm__no--pressed', 'no'));
    row.append(yesButton, noButton);

    // Always a direct child of `wrapper`, never inside a caller's own
    // `.hg-confirm__text` split column (race confirm's two-column layout,
    // see hero-sheet.mjs's #confirmRaceChange) — `wrapper` itself is a
    // centered column flex (`.hg-confirm`), so the row ends up centered
    // under BOTH columns, not tucked into the left one. An earlier version
    // appended into `.hg-confirm__text` when present, which also crushed
    // that column's own width fighting the portrait for space — reverted
    // together with that layout fix.
    wrapper.appendChild(row);

    pinTooltip(wrapper, { ...options, okButton: false, onDismiss: () => settle('dismiss') });
  });
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
 *   `triggerEl.closest('.hero-paperdoll, .hero-spellbook, .hg-lvlup')` —
 *   every caller so far (hero-sheet.mjs, level-up-app.mjs) passes this
 *   explicitly anyway (each already has its own canvas element in hand),
 *   so the default mainly exists as a safety net rather than something
 *   any current call site actually relies on.
 * @param {'tooltip'|'modal'} [options.mode]
 * @param {boolean} [options.clickToPin]   Whether a left click pins the
 *   tooltip open (see `pinTooltip`). Left off for triggers whose left
 *   click is already some other action.
 * @returns {() => void} detach   Removes the listeners this call added.
 */
export function attachTooltip(triggerEl, templateEl, options = {}) {
  const boundsEl = options.boundsEl ?? triggerEl.closest('.hero-paperdoll, .hero-spellbook, .hg-lvlup');
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
// do with which sheet happens to be open. Capture phase so it fires
// before any per-item drag handler.
document.addEventListener('dragstart', hideTooltip, true);
