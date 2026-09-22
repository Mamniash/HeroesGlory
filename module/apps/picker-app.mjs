import { hideTooltip } from '../helpers/tooltip.mjs';
import { PRESS_HOLD_MS } from '../helpers/button-press.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

/**
 * @typedef {object} PickerListOption
 * @property {string} key
 * @property {string} label   Already localized.
 * @property {boolean} current   Highlighted as the presently active value.
 */

/**
 * @typedef {object} PickerScreen
 * One step in a picker chain (Раса/Фракция/Класс/Цвет панели) — what
 * `HeroesGloryPickerApp` renders on top of its own step stack. Built by the
 * caller (hero-sheet.mjs), never by this file — this class only knows how
 * to render whichever screen it's handed and how to walk the stack;
 * everything race/faction/classType/panelColor-specific (what the next
 * screen should be, what "Да" actually applies) lives in the closures a
 * screen carries. Note there's no `windowTitle` here — that's constant for
 * the whole chain, passed once to `open()` instead (see `#windowTitle`'s
 * own comment).
 * @property {'list'|'confirm'} type
 * // 'list' only:
 * @property {PickerListOption[]} [options]
 * @property {string} [emptyMessage]   Shown instead of the (empty) options
 *   list when `options` has zero entries — e.g. Специализация's picker at
 *   level 10+ with no Expert skill and no listed spell owned yet. Already
 *   localized, like every other user-facing string a screen carries.
 *   Ignored whenever `options` is non-empty.
 * @property {(key: string) => Promise<PickerScreen|null>} [onPick]   Called
 *   when an option is clicked. A returned screen is pushed (rendered next);
 *   `null`/`undefined` means "already applied, nothing further to show" —
 *   the window closes (this is panelColor's whole flow: pick -> apply ->
 *   close, no confirm step at all).
 * // 'confirm' only:
 * @property {string} [title]   The confirm question itself (e.g. "Сменить
 *   расу?") — shown as `.hg-tooltip__title` INSIDE the body, distinct from
 *   `windowTitle` in the OS window chrome above it.
 * @property {string} [iconPath]   Portrait path — omit for no portrait
 *   (single-column layout instead of the two-column split).
 * @property {boolean} [pixelated]   Faction crests are pixel art
 *   (`image-rendering: pixelated`); race portraits are smooth painterly art
 *   (the CSS default) — see race-stats.mjs/faction-icons.mjs's own icon-path
 *   comments for which is which.
 * @property {string} [bodyHtml]   Pre-built HTML — the exact same
 *   `#buildRecomputeDialogContent` output the old pinConfirm flow passed to
 *   `innerHTML`, not re-templated here.
 * @property {() => Promise<void>} [onConfirm]   Called on "Да" — applies
 *   whatever this screen represents. Always ends the chain (the window
 *   closes right after, unconditionally) — no existing confirm screen ever
 *   leads to another screen after Yes.
 */

/**
 * §Раса/Фракция/Класс/Цвет панели identity pickers — a standalone
 * `ApplicationV2` replacing the old pinTooltip/pinConfirm floating-layer
 * chain (tooltip.mjs) for these four fields. Same architecture as
 * `HeroesGloryLevelUpApp` (level-up-app.mjs): framed window (Foundry's own
 * default chrome — title bar, close button, dragging — not hidden, same
 * choice as that window and as `HeroesGloryHeroSheet` itself), `resizable:
 * false`, centered on the sheet that opened it. Deliberately does NOT close
 * on an outside click — that was this task's own initial premise, dropped
 * once it was pointed out that no other window in this system (or in
 * Foundry) behaves that way; Escape and the close button are enough, both
 * free from Foundry's own `core.dismiss` keybinding exactly like the
 * level-up window's.
 *
 * One instance per chain: `open()` is called once per "the player clicked
 * the Race block", and that SAME instance walks every step of that
 * chain (список -> опциональный подвыбор -> подтверждение) by pushing/
 * popping `PickerScreen`s onto `#stack` and re-rendering itself — no
 * separate windows opening/closing mid-chain, and no more need for the old
 * `reopenList` closures/`triggerEl` threading `#openOptionPicker` used to
 * need (`#onConfirmNo` below just pops the stack; the popped screen is the
 * exact same object that was already on it, so "Нет" always lands back on
 * the same list with the same highlighted current value for free).
 *
 * `.hg-tooltip`/`.hg-confirm`/`.hg-option-list` markup and CSS are reused
 * unchanged from the old floating-layer chain (this app's own `PARTS.body`,
 * templates/apps/picker.hbs) — bare `.hg-tooltip`, with none of
 * tooltip.mjs's own `.hg-tooltip--floating` modifier (self-centering
 * position, `--hg-pixel-scale` transform, `pointer-events: none`): this
 * window handles its own positioning and is always interactive, so it
 * never needs that modifier at all — a plain `class="hg-tooltip"` renders
 * as a normal in-flow block that Foundry's own `position: {width: 'auto',
 * height: 'auto'}` can size the window around correctly (see
 * `.hg-tooltip`'s own header comment in _tooltip.scss for the specificity
 * trap an earlier override-based attempt at this hit — content stuck
 * `position: absolute` outside the window's own flow, unclickable, the
 * window auto-sizing to nothing). No `PixelScaleController` here either,
 * unlike the hero sheet/level-up window: `.hg-tooltip`'s own internal
 * sizing is flat native px with no `--hg-pixel-scale` multiplication of
 * its own (see that class's file-header comment) — the ONLY thing that
 * variable ever drove for this markup was the floating layer's own
 * whole-box `transform: scale()`, which `.hg-tooltip--floating` alone
 * carries now. This window always renders its content at native size,
 * which is the right behavior for a standalone dialog (unlike the hero
 * sheet, it isn't something the player resizes).
 */
export class HeroesGloryPickerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'hg-picker-{id}',
    classes: ['heroes-glory', 'hg-picker-app'],
    tag: 'div',
    window: { resizable: false },
    position: { width: 'auto', height: 'auto' },
    actions: {
      pick: this.#onPick,
      confirmYes: this.#onConfirmYes,
      confirmNo: this.#onConfirmNo,
    },
  };

  static PARTS = {
    body: { template: 'systems/heroes-glory/templates/apps/picker.hbs' },
  };

  /**
   * The screen the player picked this whole chain FROM (Race/Faction/
   * ClassType/PanelColor block) — always at least one entry, the initial
   * screen `open()` was called with. `#currentScreen` is always the top.
   * @type {PickerScreen[]}
   */
  #stack;

  /** @type {HTMLElement|null} The sheet element to center on — see `_onFirstRender`. */
  #openerEl;

  /** @type {string} A `CONFIG.HEROES_GLORY.panelColors` key — rendered as `data-color` on the template's own root (picker.hbs's own comment has why that attribute name, not `data-panel-color`). */
  #panelColor;

  /**
   * Constant across every screen of one chain (set once at `open()`, never
   * changed afterward) rather than swapped per-step the way the in-body
   * `.hg-tooltip__title` is — Foundry's own window-header text isn't wired
   * to re-render on this app's OWN `render()` calls the way its body is,
   * and a stable "Раса" title for the whole chain reads fine (the same way
   * a native OS dialog's title bar doesn't change between screens of the
   * same wizard).
   * @type {string}
   */
  #windowTitle;

  /**
   * @param {HTMLElement|null} openerEl
   * @param {string} panelColor
   * @param {string} windowTitle
   * @param {PickerScreen} initialScreen
   * @param {object} [options]
   */
  constructor(openerEl, panelColor, windowTitle, initialScreen, options = {}) {
    super(options);
    this.#openerEl = openerEl;
    this.#panelColor = panelColor;
    this.#windowTitle = windowTitle;
    this.#stack = [initialScreen];
  }

  /** @override */
  get title() {
    return this.#windowTitle;
  }

  /**
   * @param {HTMLElement|null} openerEl   The hero sheet's own `.element` —
   *   this window centers on it (see `_onFirstRender`), same as
   *   `HeroesGloryLevelUpApp` centers on `actor.sheet.element`. `null`
   *   falls back to viewport-center, same fallback that window already has.
   * @param {string} panelColor
   * @param {string} windowTitle   Already localized (e.g. "Раса") — constant
   *   for the whole chain, see `#windowTitle`'s own comment.
   * @param {PickerScreen} initialScreen
   * @returns {Promise<HeroesGloryPickerApp>}
   */
  static open(openerEl, panelColor, windowTitle, initialScreen) {
    const app = new HeroesGloryPickerApp(openerEl, panelColor, windowTitle, initialScreen);
    return app.render(true);
  }

  /** @returns {PickerScreen} */
  #currentScreen() {
    return this.#stack[this.#stack.length - 1];
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.screen = this.#currentScreen();
    context.panelColor = this.#panelColor;
    return context;
  }

  /**
   * Centers this window on the hero sheet that opened it — verbatim copy of
   * `HeroesGloryLevelUpApp`'s own override (see that method's comment for
   * why the real `setPosition` call has to happen first, before measuring,
   * rather than reading `getBoundingClientRect()` on an unsized element).
   * `width: 'auto'` here instead of a fixed number: unlike the level-up
   * window's single fixed-aspect-ratio canvas, this app's content varies by
   * screen (a short option list vs. the wide split-portrait confirm), so
   * there's no one fixed width to lock to — Foundry sizes the window to
   * whatever `.hg-tooltip`'s own CSS (max-width + shrink-wrap) resolves to
   * for the CURRENT screen, same "auto" resolution level-up-app already
   * uses for `height`.
   * @override
   */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.setPosition({ width: 'auto', height: 'auto' });
    const rect = this.element.getBoundingClientRect();
    const openerRect = this.#openerEl?.isConnected ? this.#openerEl.getBoundingClientRect() : null;
    const centerX = openerRect ? openerRect.left + (openerRect.width / 2) : window.innerWidth / 2;
    const centerY = openerRect ? openerRect.top + (openerRect.height / 2) : window.innerHeight / 2;
    this.setPosition({ left: centerX - (rect.width / 2), top: centerY - (rect.height / 2) });
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // A stray right-click-hold info tooltip on the opener sheet shouldn't
    // stay up once this window takes focus — same defensive clear
    // level-up-app.mjs's own _onRender does.
    hideTooltip();

    // §task: long lists (the level picker, 0-99) now scroll instead of
    // growing the window off-screen (`.hg-option-list`'s own `max-height`,
    // _tooltip.scss) — without this, the currently-selected value could
    // open dozens of rows out of view. Runs on every render of a list
    // screen, not just the first: coming back here via "Нет" re-renders
    // the same screen object from scratch (a fresh template pass replaces
    // the DOM, it doesn't just reveal the old node), so the scroll
    // position needs re-establishing then too.
    if (this.#currentScreen().type === 'list') {
      this.element.querySelector('.hg-option-list__item[data-current="true"]')
        ?.scrollIntoView({ block: 'center' });
    }
  }

  /**
   * @this {HeroesGloryPickerApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onPick(event, target) {
    const screen = this.#currentScreen();
    const nextScreen = await screen.onPick(target.dataset.key);
    if (nextScreen) {
      this.#stack.push(nextScreen);
      return this.render();
    }
    return this.close();
  }

  /**
   * Same press-then-release pattern `pinConfirm` used (tooltip.mjs, now
   * dead there) — the pressed frame is added synchronously, both buttons
   * disabled immediately so a second click can't double-apply while
   * `onConfirm`'s own `actor.update()` is in flight, then a beat later the
   * window closes.
   * @this {HeroesGloryPickerApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onConfirmYes(event, target) {
    if (target.disabled) return;
    target.classList.add('hg-confirm__yes--pressed');
    target.disabled = true;
    const noButton = this.element.querySelector('.hg-confirm__no');
    if (noButton) noButton.disabled = true;
    await new Promise((resolve) => setTimeout(resolve, PRESS_HOLD_MS));
    const screen = this.#currentScreen();
    try {
      await screen.onConfirm();
    } finally {
      await this.close();
    }
  }

  /**
   * Pops back to whatever screen led here — always a list (a confirm screen
   * is only ever pushed from a list's own `onPick`) — with that list's own
   * `options`/highlighted `current` untouched, since it's the exact same
   * object, not recomputed.
   * @this {HeroesGloryPickerApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onConfirmNo(event, target) {
    if (target.disabled) return;
    target.classList.add('hg-confirm__no--pressed');
    target.disabled = true;
    const yesButton = this.element.querySelector('.hg-confirm__yes');
    if (yesButton) yesButton.disabled = true;
    await new Promise((resolve) => setTimeout(resolve, PRESS_HOLD_MS));
    if (this.#stack.length > 1) this.#stack.pop();
    return this.render();
  }
}
