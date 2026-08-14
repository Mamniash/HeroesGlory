import { HeroesGloryActorSheet } from './base-actor-sheet.mjs';
import { moraleAttemptsRemaining } from '../../helpers/rolls.mjs';
import { isMaxDepleted, applyWoundPenalty } from '../../helpers/wounds.mjs';
import { useSkill, findSpellVariant, SPELL_VARIANT_LABELS } from '../../helpers/roll-actions.mjs';
import {
  primarySkillIconPath, secondarySkillIconPath, moraleIconPath, luckIconPath, schoolFramePath,
} from '../../helpers/skill-icons.mjs';
import { manaMultiplier } from '../../helpers/mana.mjs';
import { experienceToNextLevel } from '../../helpers/experience.mjs';
import { attachTooltip, hideTooltip } from '../../helpers/tooltip.mjs';
import { compareSpellsForBook } from '../../helpers/spellbook.mjs';

/** rules.md: the hero sheet's paperdoll has this many equip positions. */
const PAPERDOLL_SLOT_COUNT = 19;

/** How many backpack items are shown per page (arrow_left/arrow_right). */
const BACKPACK_PAGE_SIZE = 5;

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
      // buttons:[0,2] opts into right-click (auxclick) alongside the
      // default left-click-only behavior a bare handler function gets.
      useSkill: { handler: this.#onUseSkill, buttons: [0, 2] },
      backpackPage: this.#onBackpackPage,
      openSpellbook: this.#onOpenSpellbook,
      closeSpellbook: this.#onCloseSpellbook,
      spellbookPage: this.#onSpellbookPage,
      editPrimaryStat: this.#onEditPrimaryStat,
    },
  };

  /**
   * Which page of the backpack is currently shown (0-indexed). Transient
   * UI state, not persisted — survives across this sheet instance's own
   * re-renders while the window stays open, reset when the window closes.
   * @type {number}
   */
  #backpackPage = 0;

  /**
   * Whether the spellbook overlay is currently showing instead of the
   * paperdoll. Same transient-UI-state pattern as #backpackPage.
   * @type {boolean}
   */
  #spellbookOpen = false;

  /**
   * Which spread of the spellbook is currently shown (0-indexed).
   * @type {number}
   */
  #spellbookPage = 0;

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const config = CONFIG.HEROES_GLORY;
    const system = this.actor.system;

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
    context.backpackMaxPage = Math.max(0, Math.ceil(backpackItems.length / BACKPACK_PAGE_SIZE) - 1);
    this.#backpackPage = Math.min(this.#backpackPage, context.backpackMaxPage);
    context.backpackPage = this.#backpackPage;
    // Padded to a fixed length rather than a raw slice, like paperdollSlots/
    // secondarySkillSlots below — an empty backpack still needs 5 rendered
    // `[data-slot="backpack"]` drop targets, not zero, or dragging a
    // paperdoll item back to an otherwise-empty backpack would have
    // nowhere in the DOM to land on.
    const pageSlice = backpackItems.slice(
      this.#backpackPage * BACKPACK_PAGE_SIZE, (this.#backpackPage + 1) * BACKPACK_PAGE_SIZE,
    );
    context.backpackPageItems = Array.from({ length: BACKPACK_PAGE_SIZE }, (_, i) => pageSlice[i] ?? null);

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
    // Padded to a fixed length, like paperdollSlots/backpackPageItems/
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
    // The `useSkill` action already opts into right-click via `auxclick`
    // (see DEFAULT_OPTIONS.actions above); without this, the browser's own
    // context menu would also flash on right-click before auxclick fires.
    this.element.querySelectorAll('[data-action="useSkill"]').forEach((el) => {
      el.addEventListener('contextmenu', (event) => event.preventDefault());
    });

    // A re-render can swap the hovered trigger element out from under a
    // still-hovering cursor — its `mouseleave` would then never fire, so
    // a tooltip from the previous render would otherwise keep floating
    // over the new one. Unconditionally clear it before re-binding.
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
      attachTooltip(triggerEl, template, { boundsEl });
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
   * @override
   */
  async _onDropItem(event, item) {
    if (!this.actor.isOwner) return null;
    const isPlaceable = EQUIPABLE_TYPES.includes(item.type);
    const slotEl = event.target.closest('[data-slot]');
    const targetSlot = !slotEl ? undefined : slotEl.dataset.slot === 'backpack' ? null : Number(slotEl.dataset.slot);

    if (this.actor.uuid === item.parent?.uuid) {
      // Same-actor re-drag: skip the default `_onSortItem` behavior
      // (irrelevant to slot placement) entirely rather than calling super.
      if (!isPlaceable || targetSlot === undefined) return null;
      return this.#placeItem(item, targetSlot);
    }

    const created = await super._onDropItem(event, item);
    if (created && isPlaceable && targetSlot != null) await this.#placeItem(created, targetSlot);
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
   * Left-click a secondary-skill slot: post its current tier to chat.
   * Right-click: open the skill item's own sheet.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onUseSkill(event, target) {
    const skill = this.actor.items.get(target.dataset.itemId);
    if (!skill) return;
    if (event.button === 2) return skill.sheet.render(true);
    return useSkill(this.actor, skill);
  }

  /**
   * Page the backpack strip left/right (`data-direction="prev"|"next"`),
   * clamped in `_prepareContext` on every render.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onBackpackPage(event, target) {
    const delta = target.dataset.direction === 'prev' ? -1 : 1;
    this.#backpackPage = Math.max(0, this.#backpackPage + delta);
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
   * clamped in `_prepareContext` on every render — mirrors #onBackpackPage.
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
}
