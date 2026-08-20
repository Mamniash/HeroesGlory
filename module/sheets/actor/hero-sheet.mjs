import { HeroesGloryActorSheet } from './base-actor-sheet.mjs';
import { moraleAttemptsRemaining } from '../../helpers/rolls.mjs';
import { isMaxDepleted, applyWoundPenalty } from '../../helpers/wounds.mjs';
import { findSpellVariant, SPELL_VARIANT_LABELS } from '../../helpers/roll-actions.mjs';
import {
  primarySkillIconPath, secondarySkillIconPath, moraleIconPath, luckIconPath, schoolFramePath,
} from '../../helpers/skill-icons.mjs';
import { manaMultiplier } from '../../helpers/mana.mjs';
import { experienceToNextLevel } from '../../helpers/experience.mjs';
import { attachTooltip, hideTooltip } from '../../helpers/tooltip.mjs';
import { compareSpellsForBook } from '../../helpers/spellbook.mjs';
import { paperdollSlotAccepts, paperdollValidSlots } from '../../helpers/paperdoll-slots.mjs';

/** rules.md: the hero sheet's paperdoll has this many equip positions. */
const PAPERDOLL_SLOT_COUNT = 19;

/** How many backpack slots are visible at once (arrow_left/arrow_right scroll the strip by one item). */
const BACKPACK_VISIBLE_COUNT = 5;

/**
 * How long (ms) the backpack arrow's pressed frame (hsbtns3/hsbtns5 f001)
 * stays visible after a click before the button's real state (enabled or
 * disabled) takes over — long enough to read as a press, short enough not
 * to feel laggy. About the length of a couple of animation frames at a
 * human-perceptible pace, not tied to any actual frame rate.
 */
const BACKPACK_PRESS_HOLD_MS = 150;

/** §6: spells shown per spellbook spread (6 left page + 6 right page). */
const SPELLBOOK_PAGE_SIZE = 12;

/** Item types that can be dragged into a paperdoll slot or the backpack. */
const EQUIPABLE_TYPES = ['weapon', 'artifact', 'spellbook'];

export class HeroesGloryHeroSheet extends HeroesGloryActorSheet {
  static PARTS = {
    // A single continuous background (assets/ui/heroscr4_<color>.png) can't
    // span two PARTS — each renders into its own sibling DOM block — so
    // portrait/name/race/class/faction (previously their own `header`
    // PART) are folded into this one body template instead.
    body: { template: 'systems/heroes-glory/templates/actor/actor-hero-sheet.hbs', scrollable: [] },
  };

  static DEFAULT_OPTIONS = {
    actions: {
      backpackScroll: this.#onBackpackScroll,
      openSpellbook: this.#onOpenSpellbook,
      closeSpellbook: this.#onCloseSpellbook,
      spellbookPage: this.#onSpellbookPage,
      editPrimaryStat: this.#onEditPrimaryStat,
      toggleEditMode: this.#onToggleEditMode,
    },
  };

  /**
   * Index into the (non-paperdoll) equipable items of the first one shown
   * in the backpack strip — the strip scrolls by one slot at a time, not
   * by a full page, and is clamped in `_prepareContext` so the strip stays
   * full (last item flush against the right edge) rather than ever
   * showing trailing empty slots while items remain off to the left.
   * Transient UI state, not persisted — survives across this sheet
   * instance's own re-renders while the window stays open, reset when the
   * window closes.
   * @type {number}
   */
  #backpackOffset = 0;

  /**
   * `'prev'`/`'next'` while that arrow's pressed frame is being held after
   * a click, else `null` — see `BACKPACK_PRESS_HOLD_MS`. Same transient
   * lifetime as #backpackOffset.
   * @type {'prev'|'next'|null}
   */
  #backpackPressedDirection = null;

  /**
   * Handle for the pending #backpackPressedDirection reset, so a second
   * click before the first hold expires restarts the timer instead of
   * stacking two, and #_preClose can cancel it if the sheet closes first.
   * @type {number|null}
   */
  #backpackPressTimeout = null;

  /**
   * Whether the spellbook overlay is currently showing instead of the
   * paperdoll. Same transient-UI-state pattern as #backpackOffset.
   * @type {boolean}
   */
  #spellbookOpen = false;

  /**
   * Which spread of the spellbook is currently shown (0-indexed).
   * @type {number}
   */
  #spellbookPage = 0;

  /**
   * Gates the hover-reveal delete buttons on paperdoll/backpack/secondary-
   * skill slots, the primary-stat click-to-edit affordance, the name
   * field's own `disabled` state (see the template — off means it can't
   * even be focused, not just that submitting it is blocked), and which
   * action a left click on a weapon/artifact/secondary-skill icon
   * performs (its game action — attack for an equipped weapon, use for a
   * secondary skill — or nothing at all (an unequipped weapon, any
   * artifact — tooltip.mjs's click-to-pin never applies to these, only
   * to the left-half stat icons and secondary-skill icon, see the
   * template's `data-tooltip-click`) when off; open that item's own
   * sheet when on; see the template's per-icon `data-action`) — all
   * unrelated to any game rule, off by default so a freshly opened sheet
   * doesn't invite accidental deletes. Sheet-local rather than a
   * `system.*` field: same transient-UI-state pattern as #spellbookOpen
   * above, chosen because this is a per-viewer editing-workflow toggle,
   * not actor data — a `system.*` field would sync to every client
   * looking at this actor (including players, if they can see this
   * sheet) and would need its own migration/schema entry for something
   * that isn't part of the character at all. If edit mode ever needs to
   * survive a sheet close/reopen or be visible to other clients, that's
   * the point to revisit this as a `system.*` (or actor flag) field
   * instead — and, if that ever happens, `_prepareContext`'s own
   * `context.editMode` line (not just #onToggleEditMode) is what has to
   * keep gating this on `game.user.isGM`, since a persisted flag is
   * exactly the kind of thing that could otherwise leave a GM's own
   * edit-mode session visible to a player opening the same actor.
   * GM-only (#onToggleEditMode/`_prepareContext` both enforce it): a
   * player has no legitimate use for it and it gates real capability
   * (deleting items, editing base stats), not just a display preference.
   * @type {boolean}
   */
  #editMode = false;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const config = CONFIG.HEROES_GLORY;
    const system = this.actor.system;

    // Gates the hover-reveal delete buttons and primary-stat click-to-edit
    // affordance across the whole template — see #editMode's own comment.
    // `&& game.user.isGM` on top of the field itself, not instead of it:
    // #onToggleEditMode already refuses to flip #editMode for a non-GM (see
    // its own comment), so in practice this can't currently diverge — but
    // this line is what actually decides what the template renders, and it
    // shouldn't rely on that other guard alone to keep a non-GM out. Belt
    // and suspenders against the field ever being true for a non-GM by some
    // path that isn't #onToggleEditMode (a future persisted flag, say).
    context.editMode = this.#editMode && game.user.isGM;

    context.raceLabel = config.races[system.race] ?? '';
    context.factionLabel = config.factions[system.faction] ?? '';
    context.classLabel = config.classes[system.heroClass] ?? '';

    // Primary-skill/Experience/Mana icons are static per slot. Health has
    // no dedicated icon — reusing the Experience frame is a deliberate
    // placeholder per the design doc, not a bug.
    context.icons = {
      attack: primarySkillIconPath('attack'),
      defense: primarySkillIconPath('defense'),
      magicPower: primarySkillIconPath('magicPower'),
      knowledge: primarySkillIconPath('knowledge'),
      health: primarySkillIconPath('experience'),
      experience: primarySkillIconPath('experience'),
      mana: primarySkillIconPath('mana'),
      morale: moraleIconPath(system.morale),
      luck: luckIconPath(system.luck),
      // Large (82×93) variants for the new hover tooltips — same frame
      // numbering as the small icons above, health keeps reusing the
      // Experience frame as the same documented placeholder.
      attackLarge: primarySkillIconPath('attack', { large: true }),
      defenseLarge: primarySkillIconPath('defense', { large: true }),
      magicPowerLarge: primarySkillIconPath('magicPower', { large: true }),
      knowledgeLarge: primarySkillIconPath('knowledge', { large: true }),
      healthLarge: primarySkillIconPath('experience', { large: true }),
      experienceLarge: primarySkillIconPath('experience', { large: true }),
      manaLarge: primarySkillIconPath('mana', { large: true }),
      moraleLarge: moraleIconPath(system.morale, { large: true }),
      luckLarge: luckIconPath(system.luck, { large: true }),
    };

    // §2.1/§3: the Mана formula shown in the Mana tooltip — same tier
    // lookup as the DataModel's own (private) mana multiplier, see
    // helpers/mana.mjs for why the tier→number mapping itself isn't
    // duplicated here.
    const intellectSkill = this.actor.items.find(
      (i) => i.type === 'skill' && i.system.skillKey === 'intellect',
    );
    context.manaMultiplier = manaMultiplier(intellectSkill?.system.tier ?? null);
    context.manaBeforeWounds = system.knowledge * context.manaMultiplier;

    // §5.9: the Health tooltip's wound-breakdown line.
    context.healthAfterWounds = applyWoundPenalty(system.health.base, system.wounds);

    // §4.1: the Experience tooltip's "XP to next level" line.
    context.experienceToNext = experienceToNextLevel(system.level, system.experience);

    // §5.8: how many Боевой дух tests are left this battle, for the
    // sheet's morale-test buttons.
    // `isGM`/`moraleRemaining` only ever drove the now-removed <details
    // class="hero-paperdoll__more"> markup (templates/actor/actor-hero-sheet.hbs)
    // — kept computed and working, just unread by the template until an
    // edit-mode UI brings this back. Do not delete.
    context.isGM = game.user.isGM;
    const moraleUsed = this.actor.getFlag('heroes-glory', 'moraleUsed') ?? 0;
    context.moraleRemaining = moraleAttemptsRemaining(system.morale, moraleUsed);

    // §5.9: warn on the sheet once Ранения have driven a max to 0.
    // Same as isGM/moraleRemaining above — only the removed <details>
    // markup read these; still computed, not deleted.
    context.healthDepleted = isMaxDepleted(system.health.max);
    context.manaDepleted = isMaxDepleted(system.mana.max);

    // §5.9: gates the GM-only post-battle-resolution buttons. Same as
    // isGM/moraleRemaining above — only the removed <details> markup
    // read this; still computed, not deleted.
    context.isIncapacitated = this.actor.statuses.has(config.statusEffects.incapacitated);

    const equipable = this.actor.items.filter((i) => EQUIPABLE_TYPES.includes(i.type));

    // The 19-slot paperdoll: a slot is filled only when an item is both
    // equipped AND has that exact slot assigned. Body-part meaning per
    // slot is documented in docs/rules.md, not enforced here — this
    // iteration accepts any weapon/artifact in any slot.
    context.paperdollSlots = Array.from({ length: PAPERDOLL_SLOT_COUNT }, (_, i) => {
      const index = i + 1;
      return { index, item: equipable.find((it) => it.system.equipped && it.system.paperdollSlot === index) ?? null };
    });

    // Backpack membership: everything NOT shown on the paperdoll above —
    // not simply `!equipped`. An item can be flipped to `equipped: true`
    // via its own item sheet's checkbox (kept working, see the sheet's
    // <details> fallback) without ever being dragged to a slot; without
    // this check it would render nowhere despite an active bonus. See the
    // approved plan's "Orphan-equipped item handling."
    const backpackItems = equipable.filter((it) => !(it.system.equipped && it.system.paperdollSlot !== null));
    // Conveyor-scroll by one slot, not by a full page: the strip stays
    // full (offset capped so the last item lands in the rightmost slot)
    // rather than ever scrolling past into trailing empty slots.
    context.backpackMaxOffset = Math.max(0, backpackItems.length - BACKPACK_VISIBLE_COUNT);
    this.#backpackOffset = Math.min(this.#backpackOffset, context.backpackMaxOffset);
    context.backpackOffset = this.#backpackOffset;
    // Padded to a fixed length rather than a raw slice, like paperdollSlots/
    // secondarySkillSlots below — an empty backpack still needs 5 rendered
    // `[data-slot="backpack"]` drop targets, not zero, or dragging a
    // paperdoll item back to an otherwise-empty backpack would have
    // nowhere in the DOM to land on.
    const visibleSlice = backpackItems.slice(this.#backpackOffset, this.#backpackOffset + BACKPACK_VISIBLE_COUNT);
    context.backpackVisibleItems = Array.from({ length: BACKPACK_VISIBLE_COUNT }, (_, i) => visibleSlice[i] ?? null);
    context.backpackPressedDirection = this.#backpackPressedDirection;

    // §3: owned secondary-skill items, padded/sliced to the sheet's slot
    // count (never hardcoded in the template — see config.secondarySkillSlotCount).
    const secondarySkills = this.actor.items
      .filter((i) => i.type === 'skill')
      .map((i) => ({
        item: i,
        tierLabel: config.skillTiers[i.system.tier] ?? '',
        skillLabel: config.secondarySkills[i.system.skillKey] ?? '',
        icon: secondarySkillIconPath(i.system.skillKey, i.system.tier),
        iconLarge: secondarySkillIconPath(i.system.skillKey, i.system.tier, { large: true }),
        // Free text transcribed from the book (item-skill.mjs), only the
        // hero's current tier — the tooltip shows just this, not all 3.
        effectText: i.system.effects[i.system.tier],
      }));
    context.secondarySkillSlots = Array.from(
      { length: config.secondarySkillSlotCount },
      (_, i) => secondarySkills[i] ?? null,
    );

    // Was read by the now-removed <details> fallback's Spells list (raw,
    // unsorted, with its own cast/delete/open buttons) — the spellbook
    // overlay below builds its own sorted/paged/tooltip-ready shape
    // instead of reusing this array. Still computed, not deleted, for
    // when that fallback list's markup comes back in an edit-mode UI.
    context.spells = this.actor.items.filter((i) => i.type === 'spell');

    // §6.1: possession is item-based — see the removed `hasSpellbook`
    // field's replacement note in docs/rules.md §8.2. Only the removed
    // <details> markup's Spells-list gate read this directly; still
    // computed, not deleted.
    context.hasSpellbook = this.actor.items.some((i) => i.type === 'spellbook');

    // §6.3: sorted once (level, then school order, then name — see
    // spellbook.mjs), then paged 12-per-spread like the backpack's own
    // 5-per-page pattern above.
    const sortedSpells = this.actor.items
      .filter((i) => i.type === 'spell')
      .sort((a, b) => compareSpellsForBook(
        { level: a.system.level, school: a.system.school, name: a.name },
        { level: b.system.level, school: b.system.school, name: b.name },
      ));
    context.spellbookMaxPage = Math.max(0, Math.ceil(sortedSpells.length / SPELLBOOK_PAGE_SIZE) - 1);
    this.#spellbookPage = Math.min(this.#spellbookPage, context.spellbookMaxPage);
    context.spellbookPage = this.#spellbookPage;
    context.spellbookOpen = this.#spellbookOpen;

    const spellbookPageSpells = sortedSpells.slice(
      this.#spellbookPage * SPELLBOOK_PAGE_SIZE, (this.#spellbookPage + 1) * SPELLBOOK_PAGE_SIZE,
    );
    const spellbookSlotsFilled = spellbookPageSpells.map((spell) => {
      // §6.3: the variant (and its description/cost) matching the hero's
      // current tier in the spell's school — same resolution castSpell
      // uses to actually cast it, see roll-actions.mjs.
      const { variant, variantData } = findSpellVariant(this.actor, spell);
      const school = spell.system.school;
      return {
        item: spell,
        variantLabelKey: SPELL_VARIANT_LABELS[variant],
        variantData,
        schoolLabelKey: `HEROES_GLORY.School.${school.charAt(0).toUpperCase()}${school.slice(1)}`,
        // null for Universal-school spells — no corner-ornament set exists
        // for them, see skill-icons.mjs's schoolFramePath.
        frame: schoolFramePath(school, variant),
      };
    });
    // Padded to a fixed length, like paperdollSlots/backpackVisibleItems/
    // secondarySkillSlots above — empty grid cells render nothing (no
    // placeholder icon), just the page background showing through.
    context.spellbookSlots = Array.from(
      { length: SPELLBOOK_PAGE_SIZE },
      (_, i) => spellbookSlotsFilled[i] ?? null,
    );

    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // A re-render can swap out a trigger element mid right-click-hold or
    // mid-pin — attachTooltip's own listeners on the old (now-detached)
    // element would never fire again either way. Unconditionally clear
    // before re-binding.
    hideTooltip();
    this.element.querySelectorAll('[data-tooltip-trigger]').forEach((triggerEl) => {
      const key = triggerEl.dataset.tooltipTrigger;
      const template = this.element.querySelector(`template[data-tooltip-key="${key}"]`);
      if (!template) return;
      // Explicit boundsEl rather than attachTooltip's own default (which
      // only knows about `.hero-paperdoll`) — the spellbook overlay's
      // triggers live under `.hero-spellbook` instead, a sibling canvas,
      // never both at once.
      const boundsEl = triggerEl.closest('.hero-paperdoll, .hero-spellbook');
      // A left click only pins the tooltip open on triggers that opt in
      // via the template's bare `data-tooltip-click` (the left-half stat
      // icons, the secondary-skill icon, the spellbook's mana slot) and
      // only while edit mode is off. Deliberately NOT inferred from "has
      // no `data-action`" — paperdoll/backpack item icons (weapon/
      // artifact/spellbook) never opt in even when they have none (an
      // unequipped weapon or an artifact, edit mode off): left click is a
      // no-op there, not a tooltip, so it stays free for a future drag/
      // interact feature without this fighting it.
      const clickToPin = !this.#editMode && triggerEl.hasAttribute('data-tooltip-click');
      attachTooltip(triggerEl, template, { boundsEl, clickToPin });
    });

    // Primary-skill cells show the effective (post-artifact) value by
    // default (#onEditPrimaryStat reveals the base-value input on click);
    // blur reverts to that display regardless of whether anything changed.
    // If the value DID change, submitOnChange's own `change` handler has
    // already run by this point (it fires before `blur` for number inputs)
    // and a full re-render is already in flight, making this toggle-back
    // redundant but harmless; if nothing changed, this is the only thing
    // that puts the display back.
    this.element.querySelectorAll('.hero-paperdoll__primary-value').forEach((input) => {
      input.addEventListener('blur', () => {
        input.hidden = true;
        const display = input.previousElementSibling;
        if (display?.classList.contains('hero-paperdoll__primary-value-display')) display.hidden = false;
      });
    });

    // §8.2 slot-type validation's other half: as soon as a paperdoll or
    // backpack item is picked up, highlight every paperdoll slot it could
    // legally land on (helpers/paperdoll-slots.mjs) — not per-slot
    // dragover, so the whole set lights up together for the drag's
    // duration, matching the requested UX. Native HTML5 drag events, not
    // Foundry's own DragDrop hook (there isn't one to tap here — see
    // paperdoll-slots.mjs's own dragstart/dragend wiring precedent in
    // this file, none existed before); added on top of whatever
    // dragstart/dragend Foundry core itself already binds to `.draggable`
    // to actually carry the drag, not replacing it.
    this.element.querySelectorAll('.draggable').forEach((el) => {
      el.addEventListener('dragstart', () => {
        const item = this.actor.items.get(el.dataset.itemId);
        if (!item) return;
        for (const slot of paperdollValidSlots(item)) {
          this.element.querySelector(`[data-slot="${slot}"]`)?.classList.add('hero-paperdoll__slot--drop-target');
        }
      });
      el.addEventListener('dragend', () => {
        this.element.querySelectorAll('.hero-paperdoll__slot--drop-target').forEach((slotEl) => {
          slotEl.classList.remove('hero-paperdoll__slot--drop-target');
        });
      });
    });
  }

  /**
   * The tooltip layer lives inside whichever canvas
   * (`.hero-paperdoll`/`.hero-spellbook`) is currently showing, not
   * `document.body` (see tooltip.mjs's own header comment) — so it's
   * normally torn down along with that canvas on every re-render already.
   * Still called defensively here: closing the sheet with the cursor over
   * a trigger leaves nothing to fire that trigger's own `mouseleave`, and
   * without this the (now-detached) layer would stay `hidden = false` in
   * memory, showing stale content if `ensureLayer` ever reused it.
   * @override
   */
  async _preClose(options) {
    await super._preClose(options);
    hideTooltip();
    // Closing mid-hold would otherwise fire #onBackpackScroll's timeout's
    // render() against a torn-down application.
    clearTimeout(this.#backpackPressTimeout);
  }

  /**
   * Locks the ApplicationV2 window itself to the canvas's own aspect
   * ratio (whichever of `.hero-paperdoll`/`.hero-spellbook` is currently
   * showing — both share `$hg-canvas-ratio`, see _hero-paperdoll.scss)
   * by always discarding whatever height a position update requested and
   * letting it re-derive from width instead. Mirrors Foundry core's own
   * `CameraPopout#_prePosition` (foundry.mjs) verbatim — same
   * `HandlebarsApplicationMixin(ApplicationV2)` base, same trick, same
   * reason: `ApplicationV2#_updatePosition`'s "Implicit height" branch
   * (foundry.mjs) responds to `height === 'auto'` by clearing the
   * element's inline height and re-measuring its natural rendered
   * height via `getBoundingClientRect()` — which, for this element, is
   * the window header's own height plus the canvas's own height (CSS
   * `aspect-ratio` off the width that was just set), summed by the
   * browser's normal layout with no arithmetic needed here. `setPosition`
   * always routes through `_prePosition` before `_updatePosition`
   * (foundry.mjs), and every position-changing interaction — the resize
   * handle (Foundry v14 only renders one, bottom-right, but this doesn't
   * care which corner it's dragged from), plain window moves,
   * minimize/maximize's restore step, and the initial render — all call
   * `setPosition`, so this one override reaches all of them. Width is
   * left untouched: it's the one dimension actually being requested (via
   * the drag handle, or DEFAULT_OPTIONS.position.width at first render),
   * and `_updatePosition`'s own existing min/max-width clamping (from
   * CSS, e.g. the core `.application` min-width floor — unrelated to
   * this override) still runs on it before this ever executes.
   * @override
   */
  _prePosition(position) {
    super._prePosition(position);
    position.height = 'auto';
  }

  /**
   * §8.1/§8.2/§6.1: drop handling for the 19-slot paperdoll and the
   * backpack. Dropping a weapon/artifact/spellbook (EQUIPABLE_TYPES) this
   * actor already owns onto a `[data-slot]` element repositions it;
   * dropping one from elsewhere (compendium, another actor) creates it
   * first, then places it if the drop also landed on a slot. A dropped
   * spell falls through to plain item creation below — it's never in
   * EQUIPABLE_TYPES, so it never reaches #placeItem — and the spellbook
   * overlay picks it up straight from the actor's owned items.
   *
   * A paperdoll slot (unlike the backpack, `targetSlot === null`, which
   * always accepts anything — it's just "unequip") rejects an item whose
   * type doesn't fit it (see helpers/paperdoll-slots.mjs). For a
   * same-actor re-drag this is a pure no-op — the item is left exactly
   * where it was, nothing is written. For a drop from elsewhere the item
   * is still created on the actor (so it isn't silently lost), just not
   * placed into that slot — same as dropping outside any slot at all.
   * @override
   */
  async _onDropItem(event, item) {
    if (!this.actor.isOwner) return null;
    const isPlaceable = EQUIPABLE_TYPES.includes(item.type);
    const slotEl = event.target.closest('[data-slot]');
    const targetSlot = !slotEl ? undefined : slotEl.dataset.slot === 'backpack' ? null : Number(slotEl.dataset.slot);
    const fitsTarget = targetSlot == null || paperdollSlotAccepts(item, targetSlot);

    if (this.actor.uuid === item.parent?.uuid) {
      // Same-actor re-drag: skip the default `_onSortItem` behavior
      // (irrelevant to slot placement) entirely rather than calling super.
      if (!isPlaceable || targetSlot === undefined || !fitsTarget) return null;
      return this.#placeItem(item, targetSlot);
    }

    const created = await super._onDropItem(event, item);
    if (created && isPlaceable && targetSlot != null && fitsTarget) await this.#placeItem(created, targetSlot);
    return created;
  }

  /**
   * Move an equipable item (weapon/artifact/spellbook) onto paperdoll
   * slot `slot`, or back to the backpack if `slot` is `null` —
   * displacing whatever already occupies the target slot back to the
   * backpack first. The §8.1 melee/ranged weapon conflict is still
   * auto-resolved separately by module/documents/item.mjs's
   * #findEquippedSlotConflict on this same `equipped: true` update
   * (gated to `type === 'weapon'` there, so a spellbook is unaffected).
   * @param {Item} item
   * @param {number|null} slot
   * @returns {Promise<Item>}
   */
  async #placeItem(item, slot) {
    if (slot === null) return item.update({ 'system.equipped': false });

    const occupant = this.actor.items.find((i) =>
      i.id !== item.id && EQUIPABLE_TYPES.includes(i.type)
      && i.system.equipped && i.system.paperdollSlot === slot
    );
    if (occupant) await occupant.update({ 'system.equipped': false, 'system.paperdollSlot': null });

    return item.update({ 'system.equipped': true, 'system.paperdollSlot': slot });
  }

  /**
   * Scroll the backpack strip left/right by one slot
   * (`data-direction="prev"|"next"`), clamped in `_prepareContext` on
   * every render. Also holds the clicked arrow's pressed frame for
   * `BACKPACK_PRESS_HOLD_MS` (see #backpackPressedDirection) — otherwise,
   * at a scroll boundary, the very same render that shows the press also
   * flips the button to :disabled, and the pressed frame never gets a
   * chance to be seen.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onBackpackScroll(event, target) {
    const direction = target.dataset.direction;
    const delta = direction === 'prev' ? -1 : 1;
    this.#backpackOffset = Math.max(0, this.#backpackOffset + delta);

    this.#backpackPressedDirection = direction;
    clearTimeout(this.#backpackPressTimeout);
    this.#backpackPressTimeout = setTimeout(() => {
      this.#backpackPressedDirection = null;
      this.#backpackPressTimeout = null;
      this.render();
    }, BACKPACK_PRESS_HOLD_MS);

    return this.render();
  }

  /**
   * Click a spellbook item (paperdoll or backpack slot) — swap the
   * paperdoll canvas for the spellbook overlay in this same window.
   * @this {HeroesGloryHeroSheet}
   */
  static #onOpenSpellbook() {
    this.#spellbookOpen = true;
    return this.render();
  }

  /**
   * Click the book's `back` zone — return to the paperdoll canvas.
   * @this {HeroesGloryHeroSheet}
   */
  static #onCloseSpellbook() {
    this.#spellbookOpen = false;
    return this.render();
  }

  /**
   * Page the spellbook spread left/right (`data-direction="prev"|"next"`),
   * clamped in `_prepareContext` on every render — same defensive-floor-clamp
   * pattern as #onBackpackScroll, minus its pressed-frame hold timer (the
   * spellbook's own turn-corner art has no pressed frame to hold).
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onSpellbookPage(event, target) {
    const delta = target.dataset.direction === 'prev' ? -1 : 1;
    this.#spellbookPage = Math.max(0, this.#spellbookPage + delta);
    return this.render();
  }

  /**
   * Click a primary-skill cell's effective-value display — swap in the
   * base-value input beneath it for editing. Pure DOM toggle, no
   * `this.render()`: the blur handler in `_onRender` (or a submitOnChange
   * re-render, if the value actually changes) is what puts the display
   * back.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target   The `.hero-paperdoll__primary-value-display` clicked.
   */
  static #onEditPrimaryStat(event, target) {
    const input = target.nextElementSibling;
    if (!input?.classList.contains('hero-paperdoll__primary-value')) return;
    target.hidden = true;
    input.hidden = false;
    input.focus();
    input.select();
  }

  /**
   * Toggle #editMode (the free zone's edit-mode button, below the
   * inventory) — gates the delete buttons and primary-stat edit
   * affordance across the whole template, see #editMode's own comment.
   * GM-only: the template already renders this button `disabled` for a
   * non-GM (so a real click can't reach this at all), but that's a DOM
   * attribute, not a security boundary — this guard is what actually
   * keeps a non-GM from flipping their own #editMode, e.g. via a
   * hand-crafted `dispatchEvent` from the console.
   * @this {HeroesGloryHeroSheet}
   */
  static #onToggleEditMode() {
    if (!game.user.isGM) return;
    this.#editMode = !this.#editMode;
    return this.render();
  }
}
