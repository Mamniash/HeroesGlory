import {
  rollLevelUp, rollUpgradeCandidateItemId, buildLevelUpViewContext, resolveInitialSelection,
  eligibleUpgradeSkillItems, buildUpgradeCandidateSlot,
} from '../helpers/roll-actions.mjs';
import { nextTier } from '../helpers/rolls.mjs';
import { experienceToNextLevel } from '../helpers/experience.mjs';
import { attachTooltip, hideTooltip, pinOptionList } from '../helpers/tooltip.mjs';
import { resolveEffectivePanelColor } from '../helpers/panel-color.mjs';
import { PRESS_HOLD_MS } from '../helpers/button-press.mjs';
import { PixelScaleController } from '../helpers/pixel-scale.mjs';
import { grantSecondarySkill } from '../helpers/skill-grant.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

/**
 * The canvas's own rendered width (`.hg-lvlup`, `getBoundingClientRect().width`)
 * at this window's fixed `position.width` — NOT that width itself (see
 * `DEFAULT_OPTIONS.position.width`'s own comment for the +2px border
 * relationship, the same arithmetic hero-sheet.mjs's own
 * `REFERENCE_CANVAS_WIDTH_PX` documents). Picked to match the hero sheet's
 * own font density (758 window canvas / 600 native art width ratio, scaled
 * to this window's 385-native-px-wide art) rather than measured fresh from
 * scratch — confirm live (`document.querySelector('.hg-lvlup')
 * .getBoundingClientRect().width` while this window is open) and adjust
 * alongside `DEFAULT_OPTIONS.position.width` if it comes back different.
 * @type {number}
 */
const REFERENCE_CANVAS_WIDTH_PX = 486;

/**
 * One open level-up window per actor at a time, keyed by `actor.uuid` — a
 * second `open()` call for the same actor (another click on "Опыт" while
 * the window is already up, or a second client with the sheet open) raises
 * the existing instance instead of spawning a duplicate. Module-scope, not
 * a class field: needs to survive independently of any one sheet or window
 * instance, same reasoning as tooltip.mjs's module-scope `layerEl`.
 * @type {Map<string, HeroesGloryLevelUpApp>}
 */
const openInstances = new Map();

/**
 * §6/exploit-fix: guarantees `system.pendingLevelUp` holds dice that are
 * both FOR the level the hero is about to reach and still consistent with
 * the hero's current state, rerolling only what's actually stale rather
 * than the whole thing. Ported unchanged from the in-sheet-overlay
 * iteration of this feature (previously hero-sheet.mjs's own
 * `#ensurePendingLevelUp`) — the persisted-dice exploit fix and its
 * revalidation rules don't depend on how the result gets displayed.
 *
 * - No pending roll, or one banked for a different target level (the hero
 *   already applied a previous level-up since it was rolled, or experience
 *   regressed below the threshold it was rolled for) — discard and roll
 *   everything fresh via rollLevelUp().
 * - A pending roll for the right level, but its upgradeCandidateItemId no
 *   longer checks out (the item was deleted, or hand-promoted to Expert,
 *   since it was rolled — including a manual pick made through this
 *   window's own picker, §task) — reroll a fresh default
 *   (rollUpgradeCandidateItemId). The primary-skill roll is NEVER redone
 *   once made ("Первичный навык не переигрывается никогда"), and
 *   newCandidateSkillKey is left exactly as it was.
 * - Otherwise the existing pending roll is left untouched.
 * @param {Actor} actor
 */
async function ensurePendingLevelUp(actor) {
  const source = actor._source.system;
  const targetLevel = source.level + 1;
  const stillAffordable = experienceToNextLevel(source.level, source.experience) <= 0;
  const pending = source.pendingLevelUp;

  if (!pending || pending.targetLevel !== targetLevel || !stillAffordable) {
    const rolls = await rollLevelUp(actor);
    return actor.update({ 'system.pendingLevelUp': { targetLevel, ...rolls } });
  }

  const id = pending.upgradeCandidateItemId;
  if (id) {
    const item = actor.items.get(id);
    const stillValid = item && item.system.tier !== 'expert';
    if (!stillValid) {
      const refilled = await rollUpgradeCandidateItemId(actor);
      return actor.update({ 'system.pendingLevelUp.upgradeCandidateItemId': refilled });
    }
  }
}

/**
 * §10: apply the pending level-up. Re-validates against fresh state
 * immediately before writing — two clients (a player and the GM, say)
 * could each have this same actor's level-up window open at once; without
 * this, both confirming would grant two levels for one crossed threshold.
 * If anything no longer checks out, nothing is written — the whole apply
 * is skipped as one unit, not partially applied. Ported unchanged from the
 * in-sheet-overlay iteration (previously hero-sheet.mjs's own
 * `#applyLevelUp`), except for how `selectedChoice` is read — see that
 * parameter's own doc.
 * @param {Actor} actor
 * @param {{kind:"upgrade", itemId:string}|{kind:"new", skillKey:string}|null} selectedChoice
 *   The same shape produced by `resolveInitialSelection`/the template's
 *   `selectChoice`/`pickUpgradeCandidate` actions (roll-actions.mjs) — a
 *   self-contained identifier, compared against `pending.
 *   upgradeCandidateItemId` directly rather than trusted blindly, in case
 *   `ensurePendingLevelUp` rerolled it out from under an already-open
 *   window between roll and confirm. Every branch below is keyed off
 *   `selectedChoice.kind` alone; none of them need to know which of
 *   `resolveLevelUpChoiceSlots`'s outcomes produced it.
 */
async function applyLevelUp(actor, selectedChoice) {
  const source = actor._source.system;
  const pending = source.pendingLevelUp;

  if (!pending || pending.targetLevel !== source.level + 1
    || experienceToNextLevel(source.level, source.experience) > 0) {
    ui.notifications.warn(game.i18n.localize('HEROES_GLORY.LevelUp.AlreadyAppliedWarning'));
    return;
  }

  let upgradeItem = null;
  if (selectedChoice?.kind === 'upgrade') {
    const stillOffered = selectedChoice.itemId === pending.upgradeCandidateItemId;
    upgradeItem = stillOffered ? actor.items.get(selectedChoice.itemId) : null;
    if (!upgradeItem || upgradeItem.system.tier === 'expert') {
      ui.notifications.warn(game.i18n.localize('HEROES_GLORY.LevelUp.AlreadyAppliedWarning'));
      return;
    }
  }

  const update = {
    'system.level': source.level + 1,
    'system.pendingLevelUp': null,
  };
  update[`system.${pending.primarySkillKey}`] = source[pending.primarySkillKey] + 1;

  // §4.2 rules.md с.23: "прибавьте вашему Герою 5 ед. ОЗ" — the current
  // value grows too, not just the max (the hero becomes tougher right
  // away, not merely given more headroom while still at the old current
  // value). health.max is derived (applyWoundPenalty(base, wounds),
  // helpers/wounds.mjs) and recomputes on its own — Ранения (§5.9, -5 to
  // max each) subtract from this same base on every prepareDerivedData(),
  // so the +5 here and any wound penalty combine in one derived
  // calculation rather than one overwriting the other.
  if (pending.primarySkillKey === 'defense') {
    update['system.health.base'] = source.health.base + 5;
    update['system.health.value'] = source.health.value + 5;
  }
  // system.mana.value is deliberately NOT touched when Знание grows —
  // Mana is a spent-and-rested resource (§5.10), not a toughness stat like
  // Health; only its derived max should grow (it does, on its own, from
  // the Knowledge increase above). Not an oversight.

  if (upgradeItem) {
    await upgradeItem.update({ 'system.tier': nextTier(upgradeItem.system.tier) });
  }

  await actor.update(update);

  if (selectedChoice?.kind === 'new' && selectedChoice.skillKey === pending.newCandidateSkillKey) {
    await grantSecondarySkill(actor, pending.newCandidateSkillKey);
  }

  // Explicitly out of scope (§11 задания) — extension points, not implemented:
  //  - Человек's level-up reroll passive (race-stats.mjs RACE_FEATURE_NOTES.human)
  //  - Обучаемость Продвинутая (a second primary-skill roll) / Экспертная (10-skill slot cap)
  //  - Специализация (from level 10)
}

/**
 * §4.2/§6: the level-up confirmation window — a standalone `ApplicationV2`,
 * not a layer inside the hero sheet's own canvas. An earlier iteration
 * tried an in-sheet overlay (a darkened layer over the paperdoll's own
 * content); reverted because darkening a whole separate window's content
 * to host what is really a distinct dialog read as a defect, and because a
 * genuinely separate window needs no bespoke backdrop/click-outside/Escape
 * handling at all — see this class's own DEFAULT_OPTIONS comment and
 * `_onFirstRender` for what's actually custom here versus what Foundry's
 * own `ApplicationV2` already provides for free.
 *
 * Chrome and dragging are deliberately Foundry's own defaults — same as
 * `HeroesGloryHeroSheet` (`base-actor-sheet.mjs`): a visible header
 * (title/close button), standard header-drag (`_attachFrameListeners`
 * wires this automatically for any framed window), and no reset of
 * `.application`'s own background/border/border-radius/box-shadow. The
 * hero sheet already carries both its own window chrome AND the art's own
 * baked-in border at once without reading as a defect; this window matches
 * that rather than inventing a second visual treatment. The one deliberate
 * divergence from the hero sheet is `window.resizable: false` — the
 * confirm button sits in the same bottom-right corner
 * `.window-resize-handle` would occupy (checked directly in foundry.mjs:
 * `_renderFrame` only inserts that handle when `resizable` is true), so
 * resizing is turned off entirely rather than fighting that overlap.
 *
 * Closing needs no code of its own either: the close button and Escape
 * both already work through Foundry's own core keybinding (`core.dismiss`,
 * `ClientKeybindings`) which closes every open framed `ApplicationV2` —
 * confirmed directly in foundry.mjs, not assumed. Only the confirm button
 * (`#onConfirm`) is custom, and it always ends in `this.close()` via its
 * own `finally`, applied or not.
 */
export class HeroesGloryLevelUpApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'hg-lvlup-{id}',
    classes: ['heroes-glory', 'hg-lvlup-app'],
    tag: 'div',
    window: {
      title: 'HEROES_GLORY.LevelUp.WindowTitle',
      resizable: false,
    },
    // `488`, not `385` (the art's own native width) or `486`
    // (REFERENCE_CANVAS_WIDTH_PX above) — two different numbers, not a
    // typo: this is the WINDOW's width, which loses 2px to `.application`'s
    // own 1px-per-side border (foundry2.css) before the `.hg-lvlup` canvas
    // inside `.window-content` ever sees it — same arithmetic hero-sheet.mjs's
    // own REFERENCE_CANVAS_WIDTH_PX comment documents for the main sheet
    // (760 window -> 758 canvas). 488 - 2 = 486, landing the canvas exactly
    // on REFERENCE_CANVAS_WIDTH_PX above so --hg-pixel-scale starts at 1.
    position: { width: 488, height: 'auto' },
    actions: {
      selectChoice: this.#onSelectChoice,
      pickUpgradeCandidate: this.#onPickUpgradeCandidate,
      confirm: this.#onConfirm,
    },
  };

  static PARTS = {
    body: { template: 'systems/heroes-glory/templates/apps/level-up.hbs' },
  };

  /** @type {Actor} */
  #actor;

  /**
   * Which secondary-skill choice is picked — `null` until the player
   * clicks one, or until `_prepareContext` fills it in for a solo
   * candidate (`resolveInitialSelection`, roll-actions.mjs). This field IS
   * the selection — `buildLevelUpViewContext` only ever reads it to decide
   * what's highlighted, it never computes an "effective" selection of its
   * own; keeping exactly one source of truth is what fixes the bug where
   * solo mode looked pre-selected but confirming applied nothing (the
   * highlight and the applied choice used to come from two independent
   * computations that could disagree). Transient, per-window-instance
   * state, same as the in-sheet-overlay iteration's own
   * `#levelUpSelectedChoice`.
   * @type {{kind:"upgrade", itemId:string}|{kind:"new", skillKey:string}|null}
   */
  #selectedChoice = null;

  /**
   * Watches `.hg-lvlup` for width changes and keeps `--hg-pixel-scale` in
   * step — same reasoning and pattern as hero-sheet.mjs's own
   * `#pixelScaleController` (a plain `_onRender` recompute alone wouldn't
   * react to the window's own resize-drag... except this window isn't
   * resizable at all, see `DEFAULT_OPTIONS.window.resizable`'s own
   * comment. Kept anyway for consistency with the sheet's established
   * pattern and because a future change could make this window resizable
   * again without silently losing live pixel-scale updates. See
   * helpers/pixel-scale.mjs for the mechanism itself.
   * @type {PixelScaleController}
   */
  #pixelScaleController = new PixelScaleController(REFERENCE_CANVAS_WIDTH_PX);

  /**
   * @param {Actor} actor
   * @param {object} [options]
   */
  constructor(actor, options = {}) {
    super(options);
    this.#actor = actor;
  }

  /** @type {Actor} */
  get actor() {
    return this.#actor;
  }

  /**
   * Open (or re-focus) the level-up window for `actor`. Rolls/validates
   * `system.pendingLevelUp` BEFORE constructing the window — mirrors the
   * in-sheet-overlay iteration's own open-time sequencing (roll first,
   * render second), so the window's first paint already has real dice to
   * show rather than a flash of empty state.
   * @param {Actor} actor
   * @returns {Promise<HeroesGloryLevelUpApp|void>}
   */
  static async open(actor) {
    if (!actor.isOwner) return;
    const existing = openInstances.get(actor.uuid);
    if (existing?.rendered) {
      existing.bringToFront();
      return existing;
    }
    await ensurePendingLevelUp(actor);
    const app = new HeroesGloryLevelUpApp(actor);
    openInstances.set(actor.uuid, app);
    return app.render(true);
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const pending = this.#actor.system.pendingLevelUp;
    if (pending) {
      // Resolved BEFORE building the render context (not after) so the
      // very first paint and whatever `#onConfirm` eventually reads are
      // the exact same value — see `#selectedChoice`'s own doc.
      this.#selectedChoice = resolveInitialSelection(this.#actor, pending, this.#selectedChoice);
      Object.assign(context, buildLevelUpViewContext(this.#actor, pending, this.#selectedChoice));
    }
    context.effectivePanelColor = resolveEffectivePanelColor(this.#actor.system);
    return context;
  }

  /**
   * Centers this window on the hero sheet that opened it, not the
   * viewport — the sheet may be sitting off to one side, and the level-up
   * window should appear next to it, not jump to screen center. Deferred
   * to AFTER a real `setPosition({width, height:'auto'})` call, not read
   * straight off `getBoundingClientRect()` on first paint: at that point
   * the element has never been sized by Foundry's own positioning
   * pipeline at all (confirmed directly in foundry.mjs — nothing calls
   * `setPosition` before `_onFirstRender` runs) and sits at its bare CSS
   * minimum (`.application`'s own `min-width`/`min-height` floors, ~few
   * hundred px), not its real ~488px-wide canvas size. An earlier version
   * of this window measured its size at that premature moment and
   * centered THAT smaller phantom box — the window then rendered at its
   * real (larger) size around a center computed for a smaller one,
   * landing visibly offset down-right of the intended center. Fixed by
   * resolving the real size first (this call also happens to already
   * clamp left/top into the viewport for free — `_updatePosition`'s own
   * `Math.clamp` against `clientWidth`/`clientHeight`, not reimplemented
   * here), then measuring, then positioning.
   * @override
   */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.setPosition({ width: 488, height: 'auto' });
    const rect = this.element.getBoundingClientRect();
    const openerRect = this.#actor.sheet?.rendered ? this.#actor.sheet.element.getBoundingClientRect() : null;
    const centerX = openerRect ? openerRect.left + (openerRect.width / 2) : window.innerWidth / 2;
    const centerY = openerRect ? openerRect.top + (openerRect.height / 2) : window.innerHeight / 2;
    this.setPosition({ left: centerX - (rect.width / 2), top: centerY - (rect.height / 2) });
  }

  /**
   * Locks this window to `.hg-lvlup`'s own CSS aspect-ratio — verbatim
   * copy of hero-sheet.mjs's own `_prePosition` override (see that
   * method's comment for the full mechanism), applied here for the same
   * reason: this window's fixed width (`DEFAULT_OPTIONS.position.width`)
   * combined with `height: 'auto'` needs every position update to
   * re-derive height from the canvas's own aspect-ratio rather than
   * keeping whatever explicit height a previous update resolved to.
   * @override
   */
  _prePosition(position) {
    super._prePosition(position);
    position.height = 'auto';
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    hideTooltip();

    const canvasEl = this.element.querySelector('.hg-lvlup');
    if (canvasEl) {
      this.#pixelScaleController.observe(canvasEl);
    }

    // §3 (task): `skill` gets a tooltip on both triggers (right-click-hold
    // AND left-click-pin, via the template's `data-tooltip-click`);
    // `choice_icon_1/2/solo` only right-click-hold — their left click
    // already selects the secondary-skill choice (`data-action=
    // "selectChoice"`), so the template deliberately omits
    // `data-tooltip-click` on those triggers rather than this loop needing
    // its own exemption logic (contrast hero-sheet.mjs's own binding loop,
    // which DOES need one, because its triggers mix contexts with
    // different left-click semantics — this window has only one).
    this.element.querySelectorAll('[data-tooltip-trigger]').forEach((triggerEl) => {
      const key = triggerEl.dataset.tooltipTrigger;
      const template = this.element.querySelector(`template[data-tooltip-key="${key}"]`);
      if (!template) return;
      const clickToPin = triggerEl.hasAttribute('data-tooltip-click');
      attachTooltip(triggerEl, template, { boundsEl: canvasEl, clickToPin });
    });
  }

  /** @override */
  async _preClose(options) {
    await super._preClose(options);
    hideTooltip();
    this.#pixelScaleController.disconnect();
    if (openInstances.get(this.#actor.uuid) === this) openInstances.delete(this.#actor.uuid);
  }

  /**
   * `data-kind`/`data-item-id`/`data-skill-key` come straight off the
   * clicked slot's own `choice1`/`choice2` render data (level-up.hbs) —
   * reading them back into the same `{kind, itemId}`/`{kind, skillKey}`
   * shape `resolveInitialSelection`/`applyLevelUp` already use, rather
   * than a mode label, is what lets a two-way choice's upgrade side and
   * its "learn new" side share this one handler despite meaning different
   * things. NOT wired on `choice1` any more when it's `pickable` (§task) —
   * that side opens `#onPickUpgradeCandidate` instead, and picking FROM
   * that list is itself what selects it (see that method's own comment);
   * a plain click here would otherwise mean "select this side without
   * opening anything," which the task this shipped with deliberately
   * removed as a separate gesture.
   * @this {HeroesGloryLevelUpApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onSelectChoice(event, target) {
    this.#selectedChoice = target.dataset.kind === 'upgrade'
      ? { kind: 'upgrade', itemId: target.dataset.itemId }
      : { kind: 'new', skillKey: target.dataset.skillKey };
    return this.render();
  }

  /**
   * §task (book p.16 — "raise ANY already-owned skill by one tier", not
   * whichever candidate was rolled): opens a pinned tooltip-layer list
   * (`pinOptionList`, tooltip.mjs) — NOT the standalone
   * `HeroesGloryPickerApp` window race/faction/classType/level use on the
   * hero sheet — listing every `eligibleUpgradeSkillItems` entry as
   * "{Skill} — {Tier-after-raising}" with its own target-tier icon
   * (`buildUpgradeCandidateSlot`'s own `.icon`, the same icon the offered
   * slot itself shows once picked — never bare text), current
   * pre-selection highlighted. Centered on THIS window's own `.hg-lvlup`
   * canvas (`boundsEl`) rather than the viewport, same mechanism the
   * primary-skill/choice-icon right-click-hold tooltips on this same
   * window already use (`_onRender`'s own binding loop, `boundsEl:
   * canvasEl`). Only ever wired up (level-up.hbs) when there's more than
   * one eligible skill — with exactly one, nothing to choose, so the slot
   * stays non-interactive exactly like today's "нет свободного слота,
   * единственный подходящий навык" case.
   *
   * Picking an entry (even re-picking the one already showing) does BOTH
   * of these atomically, in one action — no separate "select this side"
   * click exists any more (see `#onSelectChoice`'s own comment for why
   * that split was dropped):
   *   1. persists the pick to `system.pendingLevelUp.upgradeCandidateItemId`
   *      immediately, so it survives closing and reopening this window
   *      (same contract every other part of `pendingLevelUp` already
   *      has — see that field's own schema comment, actor-hero.mjs);
   *   2. sets `#selectedChoice` to that same pick, so the upgrade side
   *      becomes (or stays) the one that applies on confirm.
   * Closing the list WITHOUT picking anything (Escape/click outside)
   * touches neither — the window's own state is exactly what it was
   * before the icon was clicked.
   * @this {HeroesGloryLevelUpApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onPickUpgradeCandidate(event, target) {
    const pending = this.#actor.system.pendingLevelUp;
    if (!pending) return;
    const eligible = eligibleUpgradeSkillItems(this.#actor);
    if (eligible.length <= 1) return;

    const options = eligible.map((item) => {
      const slot = buildUpgradeCandidateSlot(this.#actor, item.id);
      // §task: tier over name, no separator — matches the hero sheet's
      // own secondary-skill cell (see pinOptionList's own comment).
      return {
        key: item.id,
        tierLabel: slot.tierLabel,
        skillLabel: slot.skillLabel,
        icon: slot.icon,
        current: item.id === pending.upgradeCandidateItemId,
      };
    });
    const canvasEl = this.element.querySelector('.hg-lvlup');
    pinOptionList(options, async (itemId) => {
      await this.#actor.update({ 'system.pendingLevelUp.upgradeCandidateItemId': itemId });
      this.#selectedChoice = { kind: 'upgrade', itemId };
      await this.render();
    }, { boundsEl: canvasEl, color: resolveEffectivePanelColor(this.#actor.system) });
  }

  /**
   * @this {HeroesGloryLevelUpApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onConfirm(event, target) {
    if (target.disabled) return;
    target.classList.add('hg-lvlup__slot--pressed');
    target.disabled = true;
    await new Promise((resolve) => setTimeout(resolve, PRESS_HOLD_MS));
    try {
      await applyLevelUp(this.#actor, this.#selectedChoice);
    } catch (err) {
      console.error('heroes-glory | level-up apply failed', err);
      ui.notifications.error(game.i18n.localize('HEROES_GLORY.LevelUp.ApplyError'));
    } finally {
      await this.close();
    }
  }
}

// If the actor is deleted (by another client, say) while its level-up
// window is open here, close the window instead of leaving it pointed at
// a document that no longer exists — module-scope, registered once, same
// pattern as tooltip.mjs's own module-scope `dragstart` listener.
Hooks.on('deleteActor', (actor) => {
  openInstances.get(actor.uuid)?.close();
  openInstances.delete(actor.uuid);
});
