import { HeroesGloryActorSheet } from './base-actor-sheet.mjs';
import { moraleAttemptsRemaining, secondarySkillSlotCount } from '../../helpers/rolls.mjs';
import { isMaxDepleted, applyWoundPenalty } from '../../helpers/wounds.mjs';
import { findSpellVariant, SPELL_VARIANT_LABELS } from '../../helpers/roll-actions.mjs';
import { HeroesGloryLevelUpApp } from '../../apps/level-up-app.mjs';
import { HeroesGloryPickerApp } from '../../apps/picker-app.mjs';
import {
  primarySkillIconPath, secondarySkillIconPath, moraleIconPath, luckIconPath, schoolFramePath,
} from '../../helpers/skill-icons.mjs';
import { manaMultiplier } from '../../helpers/mana.mjs';
import { experienceToNextLevel, experienceForLevel } from '../../helpers/experience.mjs';
import { attachTooltip, hideTooltip } from '../../helpers/tooltip.mjs';
import { PRESS_HOLD_MS } from '../../helpers/button-press.mjs';
import { compareSpellsForBook } from '../../helpers/spellbook.mjs';
import { paperdollSlotAccepts, paperdollValidSlots } from '../../helpers/paperdoll-slots.mjs';
import { statsForClass, classDiff, concreteClassKey, classDescriptionKey, classIconPath } from '../../helpers/class-stats.mjs';
import {
  statsForRace, raceDiff, RACE_FEATURE_NOTES, raceIconPath, raceTextKeysFor,
  subchoiceOptionsFor, subchoiceModifiersFor,
} from '../../helpers/race-stats.mjs';
import { raceGrantedItems } from '../../helpers/race-granted-items.mjs';
import { availableSpecializations, specializationEffectTextKey } from '../../helpers/specializations.mjs';
import { factionIconPath, factionDescriptionKey } from '../../helpers/faction-icons.mjs';
import { resolveEffectivePanelColor } from '../../helpers/panel-color.mjs';
import { PixelScaleController } from '../../helpers/pixel-scale.mjs';
import { grantSecondarySkill } from '../../helpers/skill-grant.mjs';

/** rules.md: the hero sheet's paperdoll has this many equip positions. */
const PAPERDOLL_SLOT_COUNT = 19;

/**
 * §task: top of the level picker's own list — rules.md never states a hard
 * ceiling (§2.2 just says "0 … 20+"), this is a practical bound for a
 * dropdown, not a rule. `system.level` itself carries no `max` (actor-hero.mjs),
 * so this only limits what the PICKER offers, not what the field could
 * otherwise hold (a level past 99 reached some other way, if that ever
 * happens, still displays and computes correctly — `experienceForLevel`
 * has no ceiling of its own either).
 */
const MAX_PICKABLE_LEVEL = 99;

/**
 * §task: correct Russian agreement for "N раз(а)" in the level-raise
 * confirm's multi-step hint — "2 раза", "5 раз", "21 раз", "22 раза",
 * ordinary Russian numeral-noun agreement, not a rules.md concept.
 * Callers only ever use this for `count >= 2` (the `steps === 1` case gets
 * its own, count-free sentence — see `#buildLevelConfirmScreen`), but the
 * standard 11-14 exception is included anyway so it stays correct if that
 * ever changes.
 * @param {number} count
 * @returns {"раз"|"раза"}
 */
function russianTimesWord(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'раз';
  if (mod10 >= 2 && mod10 <= 4) return 'раза';
  return 'раз';
}

/** How many backpack slots are visible at once (arrow_left/arrow_right scroll the strip by one item). */
const BACKPACK_VISIBLE_COUNT = 5;

/** §6: spells shown per spellbook spread (6 left page + 6 right page). */
const SPELLBOOK_PAGE_SIZE = 12;

/**
 * Hard cap on how many characters the Health/Experience/Mana current-value
 * fields (`.hero-paperdoll__value-input`) accept while typing or pasting —
 * see `#clampValueInputLength`. `maxlength` looks like the obvious
 * HTML-native fit but is a no-op here: measured live with real keystrokes
 * (not a scripted `.value` assignment, which `maxlength` never governs on
 * ANY input type) — 15 characters typed straight into a bare
 * `<input type="number" maxlength="7">` all landed, unblocked. The HTML
 * spec's own `maxlength` section lists which input types it applies to and
 * `number` isn't one of them, so this isn't a bug to work around, just the
 * wrong tool for a numeric field.
 * `_hero-paperdoll.scss`'s own `$hg-value-input-max-ch` mirrors this
 * number for the field's width ceiling — keep the two in sync if this
 * ever changes.
 * @type {number}
 */
const VALUE_INPUT_MAX_LENGTH = 7;

/**
 * The canvas's own rendered width (`.hero-paperdoll`/`.hero-spellbook`,
 * `getBoundingClientRect().width`) when the sheet is at its default window
 * width — NOT `DEFAULT_OPTIONS.position.width` (760) itself, which is the
 * *window* element's width, not the canvas's. The two differ by whatever
 * chrome sits between them: Foundry's core reset is `box-sizing: border-box`
 * everywhere, `.application` adds a 1px border on each side (foundry2.css),
 * and `_hero-paperdoll.scss`'s own `.window-content:has(.hero-paperdoll-
 * wrapper) { padding: 0; }` override already zeroes out core's normal
 * `padding: var(--spacer-16)` specifically for this sheet — so the gap is
 * just the border (760 − 1 − 1 = 758), not the padding it might look like at
 * a glance. Traced through the CSS, not measured live — confirm with
 * `document.querySelector('.hero-paperdoll, .hero-spellbook')
 * .getBoundingClientRect().width` the first time this sheet is actually open
 * and adjust this constant (and PIXEL_SCALE_MAX in helpers/pixel-scale.mjs,
 * if it no longer feels right) if it comes back different.
 * @type {number}
 */
const REFERENCE_CANVAS_WIDTH_PX = 758;

/** Item types that can be dragged into a paperdoll slot or the backpack. */
const EQUIPABLE_TYPES = ['weapon', 'artifact', 'spellbook'];

/**
 * §2.3: the flag namespace/key marking a spell or spellbook item this
 * system auto-granted from a race/subchoice feature (Элементаль/Воздух's
 * "Полет", Джинн's spell ± Книга Магии) — see #syncRaceGrantedItems.
 * Stores `{race, subchoice}` (subchoice `null` for a non-subchoice race
 * like Джинн) so a later race/subchoice change can tell exactly which of
 * its OWN grants are now stale, without ever touching an item a player
 * obtained some other way (manually added, learned, looted — none of
 * those carry this flag).
 */
const RACE_GRANTED_ITEM_FLAG = ['heroes-glory', 'raceGrantedItem'];

/**
 * §2.3-2.5 identity block only — a short form for the one concrete class
 * name that doesn't fit the block's fixed single-line width ("Рыцарь
 * Смерти", 80px vs. the ~76px budget every other race/faction/class value
 * fits within, see _hero-paperdoll.scss's own $hg-identity-padding-inline
 * comment for the measured numbers). Everywhere else the full name still
 * shows (option lists, tooltips, confirm dialogs) — this map is consulted
 * ONLY when building `identityClassLabel` below, never `classLabel`
 * itself. Empty for every class that already fits; add an entry here
 * (plus the matching `HEROES_GLORY.ClassShort.*` key in lang/ru.json) if
 * a future rules change ever adds a class name that doesn't.
 * @type {Record<string, string>}
 */
const IDENTITY_SHORT_CLASS_LABELS = {
  deathKnight: 'HEROES_GLORY.ClassShort.DeathKnight',
};

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
      pickRace: this.#onPickRace,
      pickFaction: this.#onPickFaction,
      pickClassType: this.#onPickClassType,
      pickPanelColor: this.#onPickPanelColor,
      pickVision: this.#onPickVision,
      openLevelUp: this.#onOpenLevelUp,
      pickLevel: this.#onPickLevel,
      pickSpecialization: this.#onPickSpecialization,
      unsetSpecialization: this.#onUnsetSpecialization,
    },
  };

  /**
   * §task: Цвет панели's own trigger relocated here from a paperdoll
   * button (`edit_button_panelcolor`, removed — see
   * _hero-paperdoll.scss's own `specialization` $hg-named-slots comment)
   * to Foundry's own per-window "…" header-control menu
   * (`ApplicationV2#_getHeaderControls`, the same mechanism core Foundry
   * itself uses for e.g. a JournalEntry's "Show Players") — a real,
   * already-built Foundry mechanism, not a second picker-trigger
   * convention invented for this. `action: 'pickPanelColor'` dispatches
   * through the exact same `DEFAULT_OPTIONS.actions` entry the old button
   * used; `#onPickPanelColor` itself needed no change at all. `visible`
   * mirrors the old button's own gate exactly (`{{#if editMode}}` in the
   * template) — this relocation doesn't loosen or widen who can use it.
   * @override
   */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.push({
      icon: 'fa-solid fa-palette',
      label: 'HEROES_GLORY.Hero.PanelColor',
      visible: this.#canEdit,
      action: 'pickPanelColor',
    });
    return controls;
  }

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
   * a click, else `null` — see `PRESS_HOLD_MS`. Same transient lifetime as
   * #backpackOffset. `#onBackpackScroll` also adds the pressed class to the
   * clicked button directly, synchronously, before this field's own
   * template-conditional re-render even happens — see that method's own
   * comment for why both are needed.
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
   * Watches the currently-shown canvas (`.hero-paperdoll`/`.hero-spellbook`)
   * for width changes and keeps `--hg-pixel-scale` (utils/_fonts.scss's
   * pixel fonts read it via the `hg-pixel-font` mixin) in step — see
   * helpers/pixel-scale.mjs for the mechanism, and #observePixelScale
   * below for how this instance gets pointed at the right canvas. A
   * `ResizeObserver` rather than only
   * recomputing in `_onRender` because dragging the window's own resize
   * handle goes through `setPosition`/`_updatePosition`, which doesn't
   * necessarily trigger a full re-render (see `_prePosition`'s own comment
   * below on that same distinction) — this needs to react live, mid-drag,
   * not just on the next unrelated data change. One controller, not one
   * per canvas: `.hero-paperdoll`/`.hero-spellbook` are mutually exclusive
   * in the DOM (never both present, `#spellbookOpen` swaps the whole
   * element) and both `width: 100%` of the same `.hero-paperdoll-wrapper`,
   * so whichever one currently exists always has the one width that
   * matters. Re-pointed at the (possibly brand new) canvas element every
   * render via `observe()`, disconnected in `_preClose`.
   * @type {PixelScaleController}
   */
  #pixelScaleController = new PixelScaleController(REFERENCE_CANVAS_WIDTH_PX);

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

  /**
   * Single source of truth for "can edit-mode controls actually be used
   * right now" — the same expression `context.editMode` used to inline
   * directly, now shared with the four identity/panel-color pick-handlers
   * below so the check can't drift between the template gate and the
   * handlers' own guard (both used to say `this.#editMode && game.user.isGM`
   * independently).
   * @returns {boolean}
   */
  get #canEdit() {
    return this.#editMode && game.user.isGM;
  }

  /**
   * §2.3-2.5 (task): the one-time exception to "identity fields only
   * change through edit mode" — a brand-new hero has race/faction/classType
   * all blank (`initial: ""`, actor-hero.mjs), and until the FIRST value is
   * set, any owner (not just the GM) can pick it without ever touching
   * edit mode at all. Once a field holds a real value, this collapses back
   * to `#canEdit` exactly — same gate as every other identity change.
   * Shared between `_prepareContext` (template gate) and the three static
   * pick-handlers below for the same reason `#canEdit` itself is shared —
   * see that getter's own comment.
   *
   * `actor.isOwner` (not `game.user.isGM`): a GM is always an owner too, so
   * this doesn't narrow the GM's own access, it only WIDENS a player's —
   * exactly the requested "любой владелец листа", not "любой владелец,
   * кроме ГМ".
   *
   * No reset path exists to route back through this a second time on the
   * same field: nothing in this file (or anywhere else — checked) ever
   * writes `system.race`/`faction`/`classType` back to `""` at runtime: no
   * `<input>`/`<select>` on this template is bound to any of the three (see
   * actor-creature-sheet.hbs's faction `<select>` for what that WOULD look
   * like, on the other sheet that has one), and none of the three pickers'
   * own option lists ever offers a blank/"clear" entry. The only way to
   * write `""` back is a raw `actor.update({'system.race': ''})` from the
   * console — the schema's own `blank: true` (actor-hero.mjs) doesn't
   * forbid it — but that's the same console-only exposure every other
   * field on this actor already has, not a gap specific to this rule.
   * `classType` additionally requires a faction to already be set —
   * unconditionally, not folded into the `#canEdit`/owner logic above: the
   * concrete class is derived from the PAIR (faction, classType) (§2.5,
   * concreteClassKey in class-stats.mjs), so picking a class type before a
   * faction exists has nothing to resolve against. Applies to the GM in
   * edit mode too — "никому" in the task, not just the one-time-owner
   * exception. Faction changing later (with a class already set) doesn't
   * need any special handling here: every faction has both a warrior and
   * a mage row (config.mjs's classByFactionAndType), so classType alone is
   * always valid for whatever the CURRENT faction is — nothing can end up
   * orphaned — and #buildClassEffectiveConfirmScreen already recomputes
   * the concrete class's stats when faction changes on its own. Faction
   * resetting back to blank after being set isn't a real path to guard
   * against either — see this getter's own comment above on why no such
   * reset path exists in this file.
   * @returns {{race: boolean, faction: boolean, classType: boolean}}
   */
  get #canPickIdentity() {
    const system = this.actor.system;
    const isOwner = this.actor.isOwner;
    return {
      race: this.#canEdit || (isOwner && !system.race),
      faction: this.#canEdit || (isOwner && !system.faction),
      classType: (this.#canEdit || (isOwner && !system.classType)) && Boolean(system.faction),
      // §4.3: level 10+ is an absolute gate, not a GM-in-edit-mode
      // bypass like the other three above — the book ties the whole
      // mechanic to reaching level 10, not to who's clicking (scenario 1:
      // "недоступна" at level 9, even for the GM).
      specialization: (this.#canEdit || (isOwner && !system.specialization.type)) && system.level >= 10,
    };
  }

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
    context.editMode = this.#canEdit;

    // §2.3-2.5 (task): per-field, independent of #editMode — see
    // #canPickIdentity's own comment. A blank field is pickable by any
    // owner even outside edit mode; once set, only edit mode can change it
    // again, same as before this task.
    context.canPickIdentity = this.#canPickIdentity;

    context.heroLevel = system.level;

    context.raceLabel = config.races[system.race] ?? '';
    // §2.3: race-block hover tooltip (see the new "race" template below) —
    // the identity block itself keeps showing the bare race name (fixed
    // width, see IDENTITY_SHORT_CLASS_LABELS' own comment on why nothing
    // gets appended there), this is where the feature text + chosen
    // subchoice (Элементаль's стихия / Минотавр's bonus) actually surface.
    context.raceFeatureNoteKey = RACE_FEATURE_NOTES[system.race] ?? null;
    // Pre-formatted (not a loc key) unlike raceLabel/factionLabel/etc above
    // — avoids a nested `(localize ...)` subexpression in the template
    // just to interpolate the already-localized subchoice label into
    // another string.
    const raceSubchoiceLabelKey = subchoiceOptionsFor(system.race)?.[system.raceSubchoice]?.labelKey ?? null;
    context.raceSubchoiceLine = raceSubchoiceLabelKey
      ? game.i18n.format('HEROES_GLORY.Hero.RaceSubchoiceCurrent', { value: game.i18n.localize(raceSubchoiceLabelKey) })
      : null;
    context.factionLabel = config.factions[system.faction] ?? '';
    // §task: drives the class block's own locked look + hover tooltip —
    // see #canPickIdentity's own comment for why this is unconditional
    // (GM included) rather than folded into canPickIdentity.classType
    // itself: that flag is also false once a class is already set (a
    // DIFFERENT, pre-existing reason — only edit mode may change it), and
    // that ordinary case must NOT show the "pick a faction first" tooltip.
    context.classLocked = !system.faction;
    // §2.5: concrete class is derived from (faction, classType), never
    // stored — see config.mjs's classByFactionAndType. No faction chosen
    // yet (or no concrete class row for this faction, shouldn't happen)
    // falls back to the generic Воин/Волшебник label.
    const classKey = concreteClassKey(system.faction, system.classType);
    context.classLabel = classKey
      ? (config.classes[classKey] ?? '')
      : (config.classTypes[system.classType] ?? '');
    // §2.3-2.5 identity block only — see IDENTITY_SHORT_CLASS_LABELS' own
    // comment. Every other reader of `classLabel` (option lists, tooltips,
    // confirm dialogs, the <details> fallback header) is untouched.
    context.identityClassLabel = (classKey && IDENTITY_SHORT_CLASS_LABELS[classKey]) || context.classLabel;

    // Cosmetic panel color: "auto" resolves through the hero's faction at
    // render time — every [data-panel-color]/[data-panel-color-swatch]
    // consumer (the two canvas roots, tooltip.mjs's attachTooltip reading
    // boundsEl.dataset.panelColor) reads this resolved value instead, so
    // nothing downstream needs to know "auto" exists at all.
    context.effectivePanelColor = resolveEffectivePanelColor(system);

    // §task: Зрение block — bare value like raceLabel/factionLabel above,
    // never genuinely blank (schema.vision's own `initial: "normal"`), so
    // no `--empty` fallback needed the way Раса/Фракция/Класс have one.
    context.visionLabel = config.visionTypes[system.vision] ?? '';

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
    // §4.1: the Experience row's "value / next-threshold" display, same
    // pattern as Health/Mana's own value/max. `system.level` here is the
    // real stored field (not a stub) — experienceToNextLevel always takes
    // its "current level" from the caller, never derives it from experience
    // itself, so this is correct even though system.level starts at 0 for
    // every actor until their first level-up.
    context.experienceForNextLevel = experienceForLevel(system.level + 1);
    // §4.2: gates the "Опыт" label's clickable/highlighted level-up
    // affordance (templates/actor/actor-hero-sheet.hbs) — <= 0, not === 0,
    // since a banked multi-level jump in Опыт still counts as available.
    context.canLevelUp = context.experienceToNext <= 0;
    // §task: direct level-set picker — edit-mode only, unconditionally (no
    // "blank field, any owner" exception the way #canPickIdentity gives
    // race/faction/classType: level already starts at a real value, 0, not
    // blank, and this is a Рассказчик tool, not a one-time character-
    // creation step). See #buildLevelConfirmScreen's own comment for what
    // picking a level actually does.
    context.canPickLevel = this.#canEdit;

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

    // §3: owned secondary-skill items, padded to fill at least the
    // current slot cap's worth of cells (8, or 10 with Экспертная
    // Обучаемость — secondarySkillSlotCount, rolls.mjs) but never SLICED
    // below however many the hero actually owns.
    //
    // §task (corrected): an earlier version capped this array's own
    // length AT the slot count (`Array.from({length: config.
    // secondarySkillSlotCount}, ...)`), which silently drops any skill
    // past index 7 the moment the cap falls back to 8 while the hero
    // still owns 9-10 (lapsed Экспертная Обучаемость, e.g. tier lowered
    // by hand) — not deleted, just never handed to the template at all,
    // a real "owns it but the sheet can't show it" bug, not a
    // hypothetical one (confirmed live before fixing). `Math.max` is what
    // closes that: the array is always at least as long as the owned
    // list, so every owned skill gets a slot regardless of what the cap
    // is doing at render time — the cap only controls how many EMPTY
    // placeholder slots get padded on past the last owned one.
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
    const secondarySkillCap = secondarySkillSlotCount(
      secondarySkills.map((s) => s.item.system),
      config.secondarySkillSlotCount,
    );
    context.secondarySkillSlots = Array.from(
      { length: Math.max(secondarySkills.length, secondarySkillCap) },
      (_, i) => secondarySkills[i] ?? null,
    );
    // §task (part 2): the static 4x2 grid has exactly 8 hand-placed CSS
    // slots — a fact about the ART, fixed regardless of the RULE cap
    // above (which is 8 or 10). Scrolling turns on purely because there
    // are more owned skills than the static grid can physically show, not
    // because Экспертная Обучаемость happens to be active right now — the
    // two agree in the normal case (Обучаемость is the only way to reach
    // 9+ at all), but diverge in exactly the lapsed-cap edge case above:
    // a hero who still owns 9-10 skills after losing Экспертная
    // Обучаемость needs the grid to STAY scrollable to keep showing all
    // of them, even though the cap itself already fell back to 8.
    context.secondarySkillsScrollable = secondarySkills.length > config.secondarySkillSlotCount;

    // §4.3 p.23: the specialization cell — reuses secondarySkillSlots'
    // own {icon, iconLarge, label, effectTextKey} shape as closely as
    // possible (see the template's own comment for why it's the SAME
    // `.hero-paperdoll__skill-cell` markup, not a lookalike) even though
    // there's no `tierLabel` here (a specialization has no tier) — the
    // template shows the fixed word "Специализация" in that slot instead.
    // `null` (nothing chosen, OR chosen but the source skill/spell no
    // longer resolves — e.g. the skill item was deleted outright, not
    // just lowered a tier, which #syncSpecializationEffect's own "don't
    // retroactively strip" policy never had to consider) renders as the
    // same empty cell a never-owned secondary skill slot already does.
    const specializationType = system.specialization.type;
    const specializationKey = system.specialization.key;
    context.specializationSlot = null;
    if (specializationType === 'skill') {
      context.specializationSlot = {
        label: game.i18n.localize(config.secondarySkills[specializationKey] ?? ''),
        icon: secondarySkillIconPath(specializationKey, 'expert'),
        iconLarge: secondarySkillIconPath(specializationKey, 'expert', { large: true }),
        effectTextKey: specializationEffectTextKey('skill', specializationKey),
      };
    } else if (specializationType === 'spell') {
      const spellItem = this.actor.items.find((i) => i.type === 'spell' && i.name === specializationKey);
      if (spellItem) {
        context.specializationSlot = {
          label: spellItem.name,
          icon: spellItem.img,
          iconLarge: spellItem.img,
          effectTextKey: specializationEffectTextKey('spell', specializationKey),
        };
      }
    }

    // The cell is always drawn; it only becomes CLICKABLE (opens the
    // picker) when there's actually something to pick, and only LIGHTS UP
    // (same frame as Опыт's level-up highlight) while nothing is chosen
    // yet — never opens the picker on its own.
    const specializationOptions = availableSpecializations(
      this.actor.items.filter((i) => i.type === 'skill').map((i) => i.system),
      this.actor.items.filter((i) => i.type === 'spell').map((i) => i.name),
    );
    context.specializationPickable = this.#canPickIdentity.specialization && specializationOptions.length > 0;
    context.specializationHighlight = context.specializationPickable && !specializationType;

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
    // A spell whose own icon was never set carries Foundry's own generic
    // item placeholder (or, after a bad import/manual edit, a blank img
    // outright) — compared against the actual API a fresh Item would get
    // that default from, not a guessed path prefix, so a deliberately
    // chosen icon that happens to also live under icons/svg/ is never
    // mistaken for "unset". Computed once here, not per spell below: every
    // entry in spellbookPageSpells is already `type: 'spell'` (see
    // sortedSpells' own filter above), so the default can't differ between
    // them.
    const defaultSpellIcon = Item.implementation.getDefaultArtwork({ type: 'spell' }).img;
    const spellbookSlotsFilled = spellbookPageSpells.map((spell) => {
      // §6.3: the variant (and its description/cost) matching the hero's
      // current tier in the spell's school — same resolution castSpell
      // uses to actually cast it, see roll-actions.mjs.
      const { variant, variantData } = findSpellVariant(this.actor, spell);
      const school = spell.system.school;
      const iconSrc = (!spell.img || spell.img === defaultSpellIcon) ? config.unknownSpellIcon : spell.img;
      return {
        item: spell,
        iconSrc,
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
      const clickToPin = triggerEl.hasAttribute('data-tooltip-click') && !this.#editMode;
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

    // Health/Experience/Mana current-value fields (_hero-paperdoll.scss's
    // own comment on `.hero-paperdoll__value-row` has the full story —
    // both on why this is JS and not `field-sizing: content`, and on why
    // `.value-input` doesn't paint its own digits any more). Every render — this
    // one included — replaces these `<input>` elements outright (Handlebars
    // re-renders the whole part), so the `input` listener has to be
    // re-bound here every time, and the width has to be synced once up
    // front too: a fresh element carries no `--hg-value-content-width` of
    // its own, and the render that just put e.g. "1233" in `value` didn't
    // go through a keystroke to trigger one.
    this.element.querySelectorAll('.hero-paperdoll__value-input').forEach((input) => {
      this.#syncValueInputWidth(input);
      input.addEventListener('input', () => {
        // Length clamp before the width sync, not after: it mutates
        // `input.value` itself, so the width has to be computed from
        // what's left once the excess is already gone, not the pre-trim
        // length.
        this.#clampValueInputLength(input);
        this.#syncValueInputWidth(input);
      });
      // §4.2: the Опыт cell's own `data-action="openLevelUp"` now sits on
      // its WHOLE wrapping `.hero-paperdoll__slot--experience_desc`, this
      // input included — Foundry's own action dispatch
      // (`ApplicationV2#onClick`, foundry.mjs) resolves via
      // `event.target.closest("[data-action]")`, which would find that
      // ancestor from a click on this input too. Stopping propagation here
      // (bubble phase, before it ever reaches the Application root's own
      // delegated listener) is what keeps a click on the field placing the
      // caret instead of also opening the level-up window. Bound on all
      // three (Health/Experience/Mana) rather than Experience alone — the
      // other two have no such ancestor action today, so this is a no-op
      // for them, but stays correct for free if either ever gains one.
      input.addEventListener('click', (event) => event.stopPropagation());
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

    this.#observePixelScale();
  }

  /**
   * (Re)point `#pixelScaleController` at the currently-shown canvas — see
   * that field's own comment for why a `ResizeObserver`-backed controller
   * rather than only recomputing here, and helpers/pixel-scale.mjs for
   * the continuous/crisp split itself. `observe()` disconnects any
   * previous target on its own: `{{#if spellbookOpen}}` replaces the
   * whole canvas element on every render, so the old target is already
   * detached and would never fire again anyway, but nothing tears down
   * the observer *itself* without this.
   * @this {HeroesGloryHeroSheet}
   */
  #observePixelScale() {
    const canvasEl = this.element.querySelector('.hero-paperdoll, .hero-spellbook');
    if (!canvasEl) return;
    this.#pixelScaleController.observe(canvasEl);
  }

  /**
   * Keeps `.hero-paperdoll__value-display` (the visible digits) showing
   * this `<input>`'s current value, and writes that same text's real
   * rendered width, in px, into `--hg-value-content-width`, the custom
   * property `.hero-paperdoll__value-wrap`'s own `width`
   * (_hero-paperdoll.scss) reads via `clamp()`. The floor/ceiling for
   * short/long values live in that CSS rule (`$hg-value-input-min-ch`/
   * `-max-ch`), not here — this only ever reports the raw content width.
   *
   * §task (structural fix): `.value-input` itself no longer renders any
   * visible text at all (`color: transparent` — see that rule's own
   * comment for the full story on why: its internal text layout is a
   * black box neither CSS nor any DOM API can measure, which is what made
   * every earlier version of this method — character count × `ch`, then
   * the input's own `scrollWidth` — only ever an approximation of where
   * the digits actually render). `.value-display` is a plain `<span>`
   * instead, real inline text, so its `getBoundingClientRect()` IS exactly
   * where its digits render — no approximation left to make.
   *
   * Set on `.hero-paperdoll__value-row` (the shared ancestor), not on
   * `.value-wrap` itself: `.hero-paperdoll__value-sep`'s own `margin-left`
   * needs this same measurement too, to compensate for `.value-wrap`'s
   * clamp() floor/ceiling overhang, and `/` is `.value-wrap`'s SIBLING,
   * not its descendant — a custom property set on one element never
   * reaches a sibling, only its own descendants. The row wraps both, so
   * setting it there makes it visible to `.value-wrap`'s own `width` rule
   * (a descendant of the row) AND to `.value-sep`/`.value-max` for free.
   * @param {HTMLInputElement} input
   * @this {HeroesGloryHeroSheet}
   */
  #syncValueInputWidth(input) {
    const wrap = input.closest('.hero-paperdoll__value-wrap');
    const display = wrap.querySelector('.hero-paperdoll__value-display');
    display.textContent = input.value;
    const row = wrap.closest('.hero-paperdoll__value-row');
    row.style.setProperty('--hg-value-content-width', `${display.getBoundingClientRect().width}px`);
  }

  /**
   * Trims this Health/Experience/Mana current-value field back down to
   * `VALUE_INPUT_MAX_LENGTH` characters. Covers typing AND paste with the
   * one `input` listener (see the `_onRender` call site): a paste ends up
   * dispatching this same event with the (already too long) text already
   * sitting in `input.value`, same as a keystroke would — nothing
   * paste-specific to hook separately.
   *
   * Deliberately only reachable from that `input` listener, not called
   * from `#syncValueInputWidth` or anywhere in the render path: a value
   * that arrives some OTHER way (actor update from a migration, a macro,
   * another module) never fires `input` and is left untouched here — this
   * only ever rewrites what a person just typed or pasted, never data
   * that came from elsewhere. `.hero-paperdoll__value-wrap`'s own CSS
   * width cap (`$hg-value-input-max-ch`) is what keeps THAT case from
   * breaking the row's layout instead.
   * @param {HTMLInputElement} input
   * @this {HeroesGloryHeroSheet}
   */
  #clampValueInputLength(input) {
    if (input.value.length > VALUE_INPUT_MAX_LENGTH) {
      input.value = input.value.slice(0, VALUE_INPUT_MAX_LENGTH);
    }
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
    this.#pixelScaleController.disconnect();
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
   * (gated to real weapons and "enchantedWeapon" artifacts there via
   * #isWeaponLike, so a spellbook or any other artifact is unaffected).
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
   * `PRESS_HOLD_MS` (see #backpackPressedDirection) — otherwise, at a
   * scroll boundary, the very same render that shows the press also flips
   * the button to :disabled, and the pressed frame never gets a chance to
   * be seen.
   *
   * The pressed class is added to `target` directly, synchronously, right
   * here — not left to `#backpackPressedDirection`'s template conditional
   * alone. That conditional only takes effect once `this.render()` below
   * actually finishes (a real re-render, `await`ed internally by
   * `ApplicationV2`), which is asynchronous; without this line the pressed
   * frame would appear a beat AFTER the click instead of at the moment of
   * it. Both are still needed together: `this.render()` replaces this
   * button with a brand-new DOM node (Handlebars re-render), so this
   * synchronous class add doesn't survive that swap on its own — the
   * template conditional is what re-applies the class to the new node once
   * the render lands, carrying the pressed look through the swap.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onBackpackScroll(event, target) {
    const direction = target.dataset.direction;
    const delta = direction === 'prev' ? -1 : 1;
    this.#backpackOffset = Math.max(0, this.#backpackOffset + delta);

    target.classList.add('hero-paperdoll__slot--pressed');
    this.#backpackPressedDirection = direction;
    clearTimeout(this.#backpackPressTimeout);
    this.#backpackPressTimeout = setTimeout(() => {
      this.#backpackPressedDirection = null;
      this.#backpackPressTimeout = null;
      this.render();
    }, PRESS_HOLD_MS);

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

  /**
   * Race/Faction/ClassType/PanelColor pickers all go through
   * `HeroesGloryPickerApp` (module/apps/picker-app.mjs) — a standalone
   * window replacing this project's earlier pinTooltip/pinConfirm
   * floating-layer chain (tooltip.mjs) for these four fields, same
   * architecture as the level-up window. One instance per chain, walking
   * список -> опциональный подвыбор -> опциональное подтверждение as
   * internal state (push/pop on its own step stack) rather than as
   * separate reopened tooltips — see that class's own header comment.
   * `#buildListScreen`/the `screen.onConfirm` closures built by
   * `#buildRaceConfirmScreen`/`#buildClassEffectiveConfirmScreen` are what
   * this sheet hands the app; the app itself has no race/faction/class
   * knowledge at all.
   * @this {HeroesGloryHeroSheet}
   * @param {Record<string,string>} choices   value -> already-localized display text.
   * @param {string} currentValue
   * @param {(key: string) => Promise<import('../../apps/picker-app.mjs').PickerScreen|null>} onPick
   * @returns {import('../../apps/picker-app.mjs').PickerScreen}
   */
  #buildListScreen(choices, currentValue, onPick) {
    const options = Object.entries(choices).map(([key, label]) => ({ key, label, current: key === currentValue }));
    return { type: 'list', options, onPick };
  }

  /**
   * @this {HeroesGloryHeroSheet}
   * @param {string} windowTitle   Already localized — constant for the
   *   whole chain (see `HeroesGloryPickerApp`'s own `#windowTitle` comment).
   * @param {import('../../apps/picker-app.mjs').PickerScreen} initialScreen
   * @returns {Promise<import('../../apps/picker-app.mjs').HeroesGloryPickerApp>}
   */
  #openPicker(windowTitle, initialScreen) {
    return HeroesGloryPickerApp.open(
      this.element,
      resolveEffectivePanelColor(this.actor.system),
      windowTitle,
      initialScreen,
    );
  }

  /**
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onPickRace(event, target) {
    if (!this.#canPickIdentity.race) return;
    const config = CONFIG.HEROES_GLORY;
    const choices = Object.fromEntries(Object.entries(config.races).map(([k, v]) => [k, game.i18n.localize(v)]));
    const screen = this.#buildListScreen(choices, this.actor.system.race, (raceKey) => this.#onRacePicked(raceKey));
    return this.#openPicker(game.i18n.localize('HEROES_GLORY.Hero.Race'), screen);
  }

  /**
   * §2.3: a handful of races (Элементаль, Минотавр — see race-stats.mjs's
   * RACE_SUBCHOICES) have an internal fork the player picks at creation.
   * Routed through here rather than straight into `#buildRaceConfirmScreen`
   * so that fork gets its own list step BEFORE the recompute confirmation —
   * picking "Элементаль" from the race list, in other words, doesn't
   * immediately ask "Сменить расу?"; it first asks "какая стихия?", THEN
   * shows the confirm with that стихия's own bonus already in the preview.
   * Returned as the race list's `onPick`, so `HeroesGloryPickerApp` pushes
   * whatever screen this resolves to (a subchoice list, or straight to the
   * confirm screen for a race with no fork) onto its own step stack — see
   * that class's header comment for why this no longer needs a `reopen`
   * closure or a `triggerEl` the way the old tooltip-layer picker did.
   *
   * Also the entry point for changing an EXISTING subchoice without
   * changing race at all: re-picking the hero's current race from the
   * list lands here with `raceKey === this.actor.system.race`, and (for a
   * subchoice race) still opens the subchoice list instead of bailing out
   * — `#buildRaceConfirmScreen` itself is what no-ops (returns `null`,
   * closing the window) if the reselected subchoice also turns out to be
   * the one already active.
   * @this {HeroesGloryHeroSheet}
   * @param {string} raceKey
   * @returns {Promise<import('../../apps/picker-app.mjs').PickerScreen|null>}
   */
  #onRacePicked(raceKey) {
    const options = subchoiceOptionsFor(raceKey);
    if (!options) return this.#buildRaceConfirmScreen(raceKey, null);

    const currentSubchoice = raceKey === this.actor.system.race ? this.actor.system.raceSubchoice : null;
    const choices = Object.fromEntries(Object.entries(options).map(([k, o]) => [k, game.i18n.localize(o.labelKey)]));
    return this.#buildListScreen(choices, currentSubchoice,
      (subchoiceKey) => this.#buildRaceConfirmScreen(raceKey, subchoiceKey));
  }

  /**
   * Faction never triggers the stat-recompute confirmation by itself — see
   * #buildClassEffectiveConfirmScreen, which decides whether one is
   * warranted based on whether the *resolved* concrete class actually
   * changes.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onPickFaction(event, target) {
    if (!this.#canPickIdentity.faction) return;
    const config = CONFIG.HEROES_GLORY;
    const choices = Object.fromEntries(Object.entries(config.factions).map(([k, v]) => [k, game.i18n.localize(v)]));
    const screen = this.#buildListScreen(choices, this.actor.system.faction,
      (factionKey) => this.#buildClassEffectiveConfirmScreen({ faction: factionKey }));
    return this.#openPicker(game.i18n.localize('HEROES_GLORY.Hero.Faction'), screen);
  }

  /**
   * If a faction is already chosen, the list shows that faction's concrete
   * class names (e.g. Замок: "Рыцарь"/"Клерик") instead of the generic
   * "Воин"/"Волшебник" — the value actually written to the system is
   * always classType ("warrior"/"mage"), never the concrete class name.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onPickClassType(event, target) {
    if (!this.#canPickIdentity.classType) return;
    const config = CONFIG.HEROES_GLORY;
    const faction = this.actor.system.faction;
    const byType = faction ? config.classByFactionAndType[faction] : null;
    const choices = byType
      ? { warrior: game.i18n.localize(config.classes[byType.warrior]), mage: game.i18n.localize(config.classes[byType.mage]) }
      : Object.fromEntries(Object.entries(config.classTypes).map(([k, v]) => [k, game.i18n.localize(v)]));
    const screen = this.#buildListScreen(choices, this.actor.system.classType,
      (classType) => this.#buildClassEffectiveConfirmScreen({ classType }));
    return this.#openPicker(game.i18n.localize('HEROES_GLORY.Hero.Class'), screen);
  }

  /**
   * The "auto" entry gets a "— <current resolved color>" suffix, but only
   * once a faction is chosen — with no faction, auto resolves to the
   * global default ('red'), which isn't actually "by faction" and showing
   * it as if it were would be misleading.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onPickPanelColor(event, target) {
    if (!this.#canEdit) return;
    const config = CONFIG.HEROES_GLORY;
    const faction = this.actor.system.faction;
    const choices = Object.fromEntries(Object.entries(config.panelColors).map(([key, labelKey]) => {
      const label = game.i18n.localize(labelKey);
      if (key === 'auto' && faction) {
        const resolvedColor = config.panelColorByFaction[faction] ?? 'red';
        return [key, `${label} — ${game.i18n.localize(config.panelColors[resolvedColor])}`];
      }
      return [key, label];
    }));
    // No confirm step at all — picking a color applies immediately
    // (`onPick` returns `null`, closing the window straight away), same as
    // it always has.
    const screen = this.#buildListScreen(choices, this.actor.system.panelColor, async (colorKey) => {
      await this.actor.update({ 'system.panelColor': colorKey });
      return null;
    });
    return this.#openPicker(game.i18n.localize('HEROES_GLORY.Hero.PanelColor'), screen);
  }

  /**
   * §task: Зрение — same mechanism as `#onPickPanelColor` above
   * (storage/picker/permission gate, immediate apply, no confirm step):
   * unlike Раса, changing Зрение doesn't cascade into any other recompute,
   * it's a plain manual field, same as Скорость's own number input.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onPickVision(event, target) {
    if (!this.#canEdit) return;
    const config = CONFIG.HEROES_GLORY;
    const choices = Object.fromEntries(Object.entries(config.visionTypes).map(([k, v]) => [k, game.i18n.localize(v)]));
    const screen = this.#buildListScreen(choices, this.actor.system.vision, async (visionKey) => {
      await this.actor.update({ 'system.vision': visionKey });
      return null;
    });
    return this.#openPicker(game.i18n.localize('HEROES_GLORY.Hero.Vision'), screen);
  }

  /**
   * §4.3 p.23: only offers specializations the hero actually qualifies
   * for right now (Expert tier in one of the 7 skills, or owning one of
   * the 5 spells by name — `helpers/specializations.mjs`'s
   * `availableSpecializations`) — unavailable ones never appear in the
   * list at all, rather than showing disabled. An empty result still
   * opens the window, with `emptyMessage` explaining why (picker-app.mjs's
   * own new field) instead of a silent blank list.
   *
   * Composite `"type:key"` option keys (e.g. `"skill:intellect"`,
   * `"spell:Ускорение"`) — this picker's one list mixes two option
   * namespaces at once, unlike every other `#buildListScreen` caller,
   * which only ever offers one. `:` is safe as a separator: skill keys
   * are plain lowercase identifiers and spell names are Cyrillic words —
   * neither alphabet contains it.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onPickSpecialization(event, target) {
    if (!this.#canPickIdentity.specialization) return;
    const config = CONFIG.HEROES_GLORY;
    const system = this.actor.system;

    const ownedSkills = this.actor.items.filter((i) => i.type === 'skill').map((i) => i.system);
    const ownedSpellNames = this.actor.items.filter((i) => i.type === 'spell').map((i) => i.name);
    const options = availableSpecializations(ownedSkills, ownedSpellNames);

    const currentKey = system.specialization.type ? `${system.specialization.type}:${system.specialization.key}` : null;
    const choices = Object.fromEntries(options.map((opt) => [
      `${opt.type}:${opt.key}`,
      opt.type === 'skill' ? game.i18n.localize(config.secondarySkills[opt.key]) : opt.key,
    ]));

    // No confirm step, immediate apply — same as panelColor/vision above.
    const screen = options.length
      ? this.#buildListScreen(choices, currentKey, async (compositeKey) => {
        const [type, key] = compositeKey.split(':');
        await this.actor.update({ 'system.specialization': { type, key } });
        return null;
      })
      : { type: 'list', options: [], emptyMessage: game.i18n.localize('HEROES_GLORY.Hero.SpecializationEmptyHint') };

    return this.#openPicker(game.i18n.localize('HEROES_GLORY.Hero.Specialization'), screen);
  }

  /**
   * §4.3 (task addition): manual "снять специализацию" — nothing else
   * ever retracts one automatically (a level dropping back below 10, or
   * the underlying skill lapsing below Expert, both leave an already-
   * chosen specialization and its effect untouched — same "already
   * granted, don't retroactively strip it" precedent rolls.mjs's own
   * secondarySkillSlotCount comment already established for a lapsed
   * Экспертная Обучаемость). This button is the only way to undo a wrong
   * pick. Edit-mode only, same gate as this sheet's other delete buttons
   * (deleteItem) — not `#canPickIdentity.specialization`, which would
   * also allow a non-GM owner to clear their own already-set
   * specialization outside edit mode; that blank-field exception only
   * ever meant "let the owner make the FIRST pick", not "let them undo
   * it too".
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onUnsetSpecialization(event, target) {
    if (!this.#canEdit) return;
    return this.actor.update({ 'system.specialization': { type: '', key: '' } });
  }

  /**
   * §4.2: open the level-up window — available to any owner, not just
   * the GM, and not gated on #editMode: unlike the identity pickers
   * above, this isn't an edit-mode workflow action, it's the level-up
   * flow itself. Everything else (rolling/validating
   * system.pendingLevelUp, rendering, applying) lives in the standalone
   * app (module/apps/level-up-app.mjs, including its own owner check) —
   * this sheet only knows how to open it.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onOpenLevelUp(event, target) {
    return HeroesGloryLevelUpApp.open(this.actor);
  }

  /**
   * §task: direct level-set — opens the same `HeroesGloryPickerApp` chain
   * as Раса/Фракция/Класс, not a second mechanism. One row per level
   * 0-`MAX_PICKABLE_LEVEL`, each showing that level's OWN cumulative XP
   * threshold (`experienceForLevel`, the same pure lookup the Experience
   * tooltip already uses — not duplicated here) so the Рассказчик can see
   * at a glance what a level actually costs without opening the book.
   * `String(system.level)` as the current value: `#buildListScreen` compares
   * by `===` against `Object.entries()`'s own (always-string) keys.
   * @this {HeroesGloryHeroSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onPickLevel(event, target) {
    if (!this.#canEdit) return;
    const choices = {};
    for (let level = 0; level <= MAX_PICKABLE_LEVEL; level++) {
      choices[level] = game.i18n.format('HEROES_GLORY.Hero.LevelPickerOption', {
        level, xp: experienceForLevel(level),
      });
    }
    const screen = this.#buildListScreen(choices, String(this.actor.system.level),
      (levelKey) => this.#buildLevelConfirmScreen(Number(levelKey)));
    return this.#openPicker(game.i18n.localize('HEROES_GLORY.Hero.Level'), screen);
  }

  /**
   * §task main question, resolved for a DOWNWARD move only: writes
   * `system.level` AND `system.experience` (to the picked level's own
   * threshold) directly, plus clears any open `system.pendingLevelUp` (a
   * roll made against the OLD level no longer applies once level itself
   * changes out from under it). Primary stats and secondary skills are
   * left completely untouched, deliberately — nothing on this actor
   * records WHICH primary skill got its point, whether Защита came up
   * (the +5 ОЗ), or which secondary skill was granted at any given level,
   * so there is no correct source of truth to roll back (worse: a granted
   * skill could have been hand-upgraded to advanced/expert independently
   * since, and rules.md has no rule for what "undo" even means there —
   * see this task's own writeup). This is a Рассказчик tool for exactly
   * that reason: it sets the number, the Рассказчик fixes up
   * characteristics by hand exactly the way Ranenия/Боевой дух already
   * work on this sheet. The confirm dialog says so explicitly
   * (`LevelChangeStatsWarning`) — not a footnote, the thing that must be
   * true in the Рассказчик's head at the moment they press Да.
   *
   * §task (corrected): an UPWARD move does NOT write `system.level` at
   * all any more — only `system.experience`, to the picked level's own
   * threshold. Writing the level directly used to let a level-up jump
   * straight past the actual §4.2 level-up window (primary skill roll,
   * +5 ОЗ on Защита, secondary skill choice) — the exact automation this
   * system otherwise always runs a hero through. Raising experience alone
   * instead lights the existing "Опыт" level-up indicator
   * (`canLevelUp`/`experienceToNext`, hero-sheet.mjs's own
   * `_prepareContext`) — already fully general for "several levels' worth
   * of experience banked at once" (`experienceToNextLevel` compares
   * against `level + 1`'s own threshold and is re-evaluated fresh on every
   * render, not aware of how far past it the actor's experience sits), so
   * a jump of several levels just means the SAME indicator stays lit
   * across that many level-up windows in a row, one at a time, through
   * the completely unmodified existing flow — no queue, no new state,
   * nothing else to build. `pendingLevelUp` is deliberately left
   * untouched here (contrast the downward branch): raising experience
   * alone never invalidates an already-rolled pending level-up (same
   * target level, still affordable), so clearing it would only force a
   * pointless reroll the next time the window opens.
   * @this {HeroesGloryHeroSheet}
   * @param {number} newLevel
   * @returns {import('../../apps/picker-app.mjs').PickerScreen|null}
   */
  #buildLevelConfirmScreen(newLevel) {
    const currentLevel = this.actor.system.level;
    if (newLevel === currentLevel) return null;
    const newExperience = experienceForLevel(newLevel);
    const isRaise = newLevel > currentLevel;

    let title;
    let changesHtml;
    if (isRaise) {
      const steps = newLevel - currentLevel;
      title = game.i18n.localize('HEROES_GLORY.Hero.LevelRaiseConfirmTitle');
      const hint = steps === 1
        ? game.i18n.localize('HEROES_GLORY.Hero.LevelRaiseSingleStepHint')
        : game.i18n.format('HEROES_GLORY.Hero.LevelRaiseMultiStepHint', { count: steps, times: russianTimesWord(steps) });
      changesHtml = `<ul class="hg-confirm__stat-list">`
        + `<li>${game.i18n.format('HEROES_GLORY.Hero.ExperienceSetLine', { value: newExperience })}</li>`
        + `</ul>`
        + `<p class="hg-confirm__block-text">${hint}</p>`;
    } else {
      title = game.i18n.localize('HEROES_GLORY.Hero.LevelChangeConfirmTitle');
      changesHtml = `<ul class="hg-confirm__stat-list">`
        + `<li>${game.i18n.format('HEROES_GLORY.Hero.LevelChangeLine', { before: currentLevel, after: newLevel })}</li>`
        + `<li>${game.i18n.format('HEROES_GLORY.Hero.ExperienceSetLine', { value: newExperience })}</li>`
        + `</ul>`
        + `<p class="hg-confirm__block-text">${game.i18n.localize('HEROES_GLORY.Hero.LevelChangeStatsWarning')}</p>`;
    }
    const bodyHtml = this.#buildConfirmBlock('HEROES_GLORY.Hero.ConfirmBlockChanges', changesHtml);
    return {
      type: 'confirm',
      title,
      bodyHtml,
      onConfirm: async () => {
        const update = { 'system.experience': newExperience };
        if (!isRaise) {
          update['system.level'] = newLevel;
          update['system.pendingLevelUp'] = null;
        }
        await this.actor.update(update);
      },
    };
  }

  /**
   * §4: race change shows a "было → станет" confirmation (Health base,
   * Speed, Vision, урон без оружия) before applying anything — built here
   * as a `PickerScreen` for `HeroesGloryPickerApp` to render/step to,
   * not shown directly. That app's own generic "Да"/"Нет" wiring
   * (`#onConfirmYes` applies via `screen.onConfirm`, then closes;
   * `#onConfirmNo` always pops back to whatever list led here) replaces
   * what used to be this method's own `pinConfirm` call and its 3-outcome
   * branch — nothing is written to the actor until "Да" specifically, same
   * guarantee as before ("Нет"/Escape/the window's close button all leave
   * the actor untouched; an earlier version wrote `system.race`
   * unconditionally and only gated the numeric stats on confirm, which was
   * reported as a bug and reversed — there's no "the label changed but
   * nothing it implies did" state to preserve here). Diff is built from
   * `_source` (base values), not `system` (post-ActiveEffect) — an
   * artifact bonus on Speed, say, must not leak into the "before" shown
   * here.
   *
   * `subchoiceKey` folds the Элементаль/Минотавр subchoice into this same
   * screen rather than a separate confirmation: `null` for a race with no
   * subchoice (`#onRacePicked` never routes those through the subchoice
   * list at all); a real key otherwise, from that list. Returns `null`
   * (closing the window, nothing to confirm) the same way a plain
   * unchanged-race pick always has — now also when the race is unchanged
   * AND the subchoice being (re)picked is the one already active, which is
   * what lets `#onRacePicked` unconditionally return a subchoice-list
   * screen on a same-race click without ending up at a spurious confirm
   * when nothing was actually picked differently.
   * @this {HeroesGloryHeroSheet}
   * @param {string} raceKey
   * @param {string|null} subchoiceKey
   * @returns {import('../../apps/picker-app.mjs').PickerScreen|null}
   */
  #buildRaceConfirmScreen(raceKey, subchoiceKey) {
    const sameRace = raceKey === this.actor.system.race;
    if (sameRace && subchoiceKey === (this.actor.system.raceSubchoice || null)) return null;

    // Captured now (before any update happens) so onConfirm below can
    // still tell what to REVOKE after `actor.update` has already
    // overwritten `system.race`/`raceSubchoice` with the new values —
    // see #syncRaceGrantedItems's own comment for why the old pair
    // matters at all.
    const oldRaceKey = this.actor.system.race;
    const oldSubchoiceKey = this.actor.system.raceSubchoice || null;

    const source = this.actor._source.system;
    const diff = raceDiff({
      healthBase: source.health.base,
      speed: source.speed,
      vision: source.vision,
      unarmedDamage: source.unarmedDamage,
    }, raceKey);
    const subchoiceModifiers = subchoiceKey ? subchoiceModifiersFor(raceKey, subchoiceKey) : [];

    // A same-race pick only ever reaches here to change the subchoice
    // itself (see this method's own no-op check above) — "Сменить расу?"
    // would be a wrong question to ask when the race isn't what's changing.
    const title = game.i18n.localize(sameRace
      ? 'HEROES_GLORY.Hero.RaceSubchoiceChangeConfirmTitle'
      : 'HEROES_GLORY.Hero.RaceChangeConfirmTitle');
    const raceTextKeys = raceTextKeysFor(raceKey);
    const bodyHtml = this.#buildRecomputeDialogContent(diff, {
      descriptionKey: raceTextKeys?.descriptionKey ?? null,
      weaponKey: raceTextKeys?.weaponKey ?? null,
      featureNoteKey: RACE_FEATURE_NOTES[raceKey] ?? null,
      subchoiceModifiers,
    });

    return {
      type: 'confirm',
      title,
      iconPath: raceIconPath(raceKey),
      bodyHtml,
      onConfirm: async () => {
        const update = { 'system.raceSubchoice': subchoiceKey ?? '' };
        if (!sameRace) update['system.race'] = raceKey;
        if (diff?.healthBase) update['system.health.base'] = diff.healthBase.after;
        if (diff?.speed) update['system.speed'] = diff.speed.after;
        if (diff?.vision) update['system.vision'] = diff.vision.after;
        if (diff?.unarmedDamage) update['system.unarmedDamage'] = diff.unarmedDamage.after;
        await this.actor.update(update);
        await this.#syncRaceGrantedItems(oldRaceKey, oldSubchoiceKey, raceKey, subchoiceKey ?? null);
      },
    };
  }

  /**
   * §4 (task, corrected): shared confirm-flow for both the Faction and the
   * ClassType picker. Used to skip the dialog and apply silently whenever
   * the *resolved* concrete class didn't change — including, wrongly, the
   * common case where it hasn't RESOLVED YET at all (faction picked with
   * no classType yet, classType picked with no faction yet, or both still
   * blank on a freshly created hero — `concreteClassKey` returns `null`
   * whenever either half of the pair is empty, class-stats.mjs). That's
   * the bug this rewrite fixes: the dialog now ALWAYS shows for a genuine
   * field change, with `stats`/`diff` simply absent (not skipped) when
   * there's no concrete class yet to diff against — the one still-real
   * no-op is re-picking the SAME value that's already there (line below),
   * which isn't a change at all, not even a "changes but nothing recomputes"
   * one.
   *
   * Built as a `PickerScreen` for `HeroesGloryPickerApp`, same shape as
   * `#buildRaceConfirmScreen` — see that method's own comment for how
   * "Да"/"Нет"/Escape/close-button map onto this now that there's no
   * `pinConfirm` 3-outcome branch to write here directly.
   * @this {HeroesGloryHeroSheet}
   * @param {{faction: string}|{classType: string}} changed   Exactly one of the two.
   * @returns {Promise<import('../../apps/picker-app.mjs').PickerScreen|null>}
   */
  async #buildClassEffectiveConfirmScreen(changed) {
    const oldFaction = this.actor.system.faction;
    const oldClassType = this.actor.system.classType;

    const isFactionChange = 'faction' in changed;
    // The one real no-op left: the field itself isn't changing (re-picking
    // what's already there). Not "characteristics won't change" — nothing
    // changes, full stop, same as race's own identical guard just above.
    if (isFactionChange ? changed.faction === oldFaction : changed.classType === oldClassType) return null;

    const newFaction = changed.faction ?? oldFaction;
    const newClassType = changed.classType ?? oldClassType;

    const fieldUpdate = isFactionChange
      ? { 'system.faction': changed.faction }
      : { 'system.classType': changed.classType };

    const config = CONFIG.HEROES_GLORY;
    // `null` here just means "no concrete class to recompute FROM yet" —
    // the other half of the pair is still blank. That's not a reason to
    // skip the dialog any more, only a reason `stats`/`diff` below end up
    // empty — see this method's own header comment.
    const newConcreteKey = concreteClassKey(newFaction, newClassType);
    const stats = newConcreteKey ? statsForClass(newConcreteKey) : null;

    // Diff by _source (base values), not system (post-ActiveEffect) —
    // attack/defense/magicPower/knowledge are all artifact-modifiable
    // (CONFIG.HEROES_GLORY.artifactModifierStats). Empty when `stats` is
    // null — `#buildRecomputeDialogContent` already renders that as "won't
    // change" text instead of an empty list (its own StatBeforeAfterNone
    // branch), this is just the first caller to actually reach it.
    const source = this.actor._source.system;
    const diff = stats
      ? classDiff(
        { attack: source.attack, defense: source.defense, magicPower: source.magicPower, knowledge: source.knowledge },
        stats,
      )
      : {};

    // Slot-limit check BEFORE the dialog, so the GM sees the warning
    // before confirming, not after. No `stats` -> no base skill to grant at
    // all, so both are trivially false/skipped rather than special-cased.
    const alreadyHasSkill = stats
      ? this.actor.items.some((i) => i.type === 'skill' && i.system.skillKey === stats.secondarySkillKey)
      : false;
    const ownedSkills = this.actor.items.filter((i) => i.type === 'skill');
    // §3 стр.39: 8, or 10 with Экспертная Обучаемость — secondarySkillSlotCount
    // (rolls.mjs) re-derives this fresh from the owned list every call, so
    // a lapsed Экспертная Обучаемость (9-10 owned, tier lowered since) is
    // reflected immediately, not stale.
    const slotsFull = Boolean(stats) && !alreadyHasSkill
      && ownedSkills.length >= secondarySkillSlotCount(ownedSkills.map((i) => i.system), config.secondarySkillSlotCount);

    const bodyHtml = this.#buildRecomputeDialogContent(diff, {
      // A faction change describes the FACTION (factionDescriptionKey) —
      // never depends on classType/newConcreteKey, so this is unaffected
      // by whether classType is chosen yet. A classType change describes
      // the resulting CONCRETE CLASS (classDescriptionKey) instead, which
      // DOES need newConcreteKey — null (no faction yet) resolves to null
      // here too (classDescriptionKey's own `in CLASS_STATS` check), same
      // as it already does for any other unknown key; the dialog simply
      // omits that block, same as a classType confirm always has (see
      // `#buildRecomputeDialogContent`'s own header comment).
      descriptionKey: isFactionChange ? factionDescriptionKey(newFaction) : classDescriptionKey(newConcreteKey),
      baseSkillKey: stats?.secondarySkillKey ?? null,
      skillGrantInfo: stats ? { skillKey: alreadyHasSkill ? null : stats.secondarySkillKey, blocked: slotsFull } : null,
    });

    // A faction change shows that FACTION's own crest (unaffected by
    // classType, same reasoning as descriptionKey above); a classType
    // change shows the resulting CONCRETE CLASS's own HOMM3 hero portrait
    // (classIconPath(null) -> null when there's no faction yet, same
    // graceful fallback as descriptionKey) — both dialogs are two-column,
    // matching race, when there IS an icon; single-column (see picker.hbs)
    // when there isn't. Both are genuine low-res pixel art (unlike the
    // race portraits' smooth painterly source), hence `pixelated: true`
    // unconditionally here.
    const iconPath = isFactionChange ? factionIconPath(newFaction) : classIconPath(newConcreteKey);

    return {
      type: 'confirm',
      title: game.i18n.localize('HEROES_GLORY.Hero.ClassStatsRecomputeConfirmTitle'),
      iconPath,
      pixelated: true,
      bodyHtml,
      onConfirm: async () => {
        const statUpdate = {};
        for (const [stat, { after }] of Object.entries(diff)) statUpdate[`system.${stat}`] = after;
        await this.actor.update({ ...fieldUpdate, ...statUpdate });
        if (stats && !alreadyHasSkill && !slotsFull) await this.#grantSecondarySkillIfMissing(stats.secondarySkillKey);
      },
    };
  }

  /**
   * One `<div class="hg-confirm__block">` — a short subheading
   * (`titleKey`, one of `HEROES_GLORY.Hero.ConfirmBlock*`) plus whatever
   * body markup the caller already built. `_tooltip.scss`'s own
   * `$hg-confirm-block-gap` puts visible air between these (and the
   * title/button row above/below them); everything inside is left-aligned
   * by that same rule, overriding `.hg-tooltip`'s own centered body text —
   * fine for a single short line (morale/luck's own info tooltips, say),
   * wrong for a multi-line paragraph, which is all this method's callers
   * ever put in a block.
   * @this {HeroesGloryHeroSheet}
   * @param {string} titleKey
   * @param {string} bodyHtml
   * @returns {string}
   */
  #buildConfirmBlock(titleKey, bodyHtml) {
    return `<div class="hg-confirm__block">`
      + `<p class="hg-confirm__block-title">${game.i18n.localize(titleKey)}</p>`
      + bodyHtml
      + `</div>`;
  }

  /**
   * Builds the confirm dialog's body as a sequence of `.hg-confirm__block`s
   * — description, starting weapon, feature note, then the "было →
   * станет" stat list, in that reading order (who this is, what it comes
   * with, then what actually changes) — a block is simply omitted when
   * the caller has nothing for it (faction confirms have no weapon/feature
   * block at all; classType confirms have neither weapon/feature NOR a
   * description, today only race and faction get one). The stat-list
   * block is the only one always present, since there's always something
   * to say about it, even when nothing changes
   * (`HEROES_GLORY.Hero.StatBeforeAfterNone`).
   * @this {HeroesGloryHeroSheet}
   * @param {Record<string,{before:*,after:*}>|null} diff
   * @param {object} [options]
   * @param {string|null} [options.descriptionKey]   Race or faction
   *   description (`RaceDescription.*`/`FactionDescription.*`) — null for
   *   classType, which has neither.
   * @param {string|null} [options.weaponKey]   Race starting-weapon
   *   paragraph (`RaceStartingWeapon.*`) — race only.
   * @param {string|null} [options.featureNoteKey]   Race feature note
   *   (`RaceFeature.*`) — race only, and only the races with a known note.
   * @param {{skillKey: string|null, blocked: boolean}|null} [options.skillGrantInfo]   Class only.
   * @param {Array<{stat: string, mode: string, value: number}>} [options.subchoiceModifiers]
   *   §2.3: the Элементаль/Минотавр subchoice's own numeric bonus (empty
   *   for a text-only option like Fire/Water, or no subchoice at all) —
   *   race only. Applied as a real ActiveEffect (documents/actor.mjs), not
   *   folded into `diff`'s before/after pair, so shown as its own extra
   *   `<li>` row(s) instead of a third diff column — same shape as
   *   `baseSkillKey`'s own "one more fact, not a transition" line below.
   * @returns {string}
   */
  #buildRecomputeDialogContent(diff, options = {}) {
    const {
      descriptionKey = null, weaponKey = null, featureNoteKey = null,
      skillGrantInfo = null, baseSkillKey = null, subchoiceModifiers = [],
    } = options;
    const config = CONFIG.HEROES_GLORY;
    const STAT_LABEL_KEYS = {
      attack: 'HEROES_GLORY.Hero.Attack', defense: 'HEROES_GLORY.Hero.Defense',
      magicPower: 'HEROES_GLORY.Hero.MagicPower', knowledge: 'HEROES_GLORY.Hero.Knowledge',
      healthBase: 'HEROES_GLORY.Hero.HealthBase', speed: 'HEROES_GLORY.Hero.Speed',
      vision: 'HEROES_GLORY.Hero.Vision', unarmedDamage: 'HEROES_GLORY.Hero.UnarmedDamage',
      'health.max': 'HEROES_GLORY.Hero.Health',
    };
    // health.base/vision/unarmedDamage aren't artifact-modifiable today, so
    // effective===before always for them and the hint never appears — the
    // path is shared for all stats rather than special-cased.
    const STAT_PATHS = {
      attack: 'attack', defense: 'defense', magicPower: 'magicPower', knowledge: 'knowledge',
      healthBase: 'health.base', speed: 'speed', vision: 'vision', unarmedDamage: 'unarmedDamage',
    };
    const rows = Object.entries(diff ?? {}).map(([stat, { before, after }]) => {
      const label = game.i18n.localize(STAT_LABEL_KEYS[stat] ?? stat);
      const fmt = (v) => (stat === 'vision' ? game.i18n.localize(config.visionTypes[v] ?? v) : v);
      let line = game.i18n.format('HEROES_GLORY.Hero.StatBeforeAfter', { stat: label, before: fmt(before), after: fmt(after) });
      const effective = foundry.utils.getProperty(this.actor.system, STAT_PATHS[stat]);
      if (effective !== before) {
        line += ` ${game.i18n.format('HEROES_GLORY.Hero.StatEffectiveHint', { value: fmt(effective) })}`;
      }
      return `<li>${line}</li>`;
    });
    // Item 2: the class's own base secondary skill is a mechanical fact,
    // not a narrative detail — it used to be a trailing sentence inside
    // #buildClassEffectiveConfirmScreen's caller-provided description text
    // ("базовый навык Доспехи роднит его с..."), moved here instead so
    // the description stays purely descriptive and this stays purely
    // mechanical. A plain fact, not a "было -> станет" transition, but
    // still one more `<li>` in the same list — visually one more line of
    // "what's changing", which is what it is. Race confirms never pass
    // this (no class involved); a classType/faction confirm always does,
    // since the dialog only ever shows when the concrete class changes.
    if (baseSkillKey) {
      const skillLabel = game.i18n.localize(config.secondarySkills[baseSkillKey]);
      rows.push(`<li>${game.i18n.format('HEROES_GLORY.Hero.BaseSecondarySkillLine', { skill: skillLabel })}</li>`);
    }
    // §2.3: one row per subchoice modifier, formatted like an artifact's
    // own bonus rather than diff's before/after — there's no "before" here,
    // this is a fresh bonus stacking on top, not a recomputed base value.
    for (const modifier of subchoiceModifiers) {
      const label = game.i18n.localize(STAT_LABEL_KEYS[modifier.stat] ?? modifier.stat);
      const value = modifier.value >= 0 ? `+${modifier.value}` : `${modifier.value}`;
      rows.push(`<li>${game.i18n.format('HEROES_GLORY.Hero.RaceSubchoiceBonusLine', { stat: label, value })}</li>`);
    }
    let changesHtml = rows.length
      ? `<ul class="hg-confirm__stat-list">${rows.join('')}</ul>`
      : `<p class="hg-confirm__block-text">${game.i18n.localize('HEROES_GLORY.Hero.StatBeforeAfterNone')}</p>`;
    if (skillGrantInfo?.skillKey) {
      const skillLabel = game.i18n.localize(config.secondarySkills[skillGrantInfo.skillKey]);
      changesHtml += skillGrantInfo.blocked
        ? `<p class="hg-confirm__block-text">${game.i18n.format('HEROES_GLORY.Hero.SecondarySkillSlotsFullWarning', { skill: skillLabel })}</p>`
        : `<p class="hg-confirm__block-text">${game.i18n.format('HEROES_GLORY.Hero.SecondarySkillGrantHint', { skill: skillLabel })}</p>`;
    }

    let html = '';
    if (descriptionKey) {
      html += this.#buildConfirmBlock('HEROES_GLORY.Hero.ConfirmBlockDescription',
        `<p class="hg-confirm__block-text">${game.i18n.localize(descriptionKey)}</p>`);
    }
    if (weaponKey) {
      html += this.#buildConfirmBlock('HEROES_GLORY.Hero.ConfirmBlockWeapon',
        `<p class="hg-confirm__block-text">${game.i18n.localize(weaponKey)}</p>`);
    }
    if (featureNoteKey) {
      html += this.#buildConfirmBlock('HEROES_GLORY.Hero.ConfirmBlockFeature',
        `<p class="hg-confirm__block-text">${game.i18n.localize(featureNoteKey)}</p>`);
    }
    html += this.#buildConfirmBlock('HEROES_GLORY.Hero.ConfirmBlockChanges', changesHtml);
    return html;
  }

  /**
   * §3: base-tier grant only, only if the hero doesn't already own it and
   * there's a free secondary-skill slot — never touches an existing
   * skill's tier, never removes anything.
   * @this {HeroesGloryHeroSheet}
   * @param {string} skillKey
   */
  async #grantSecondarySkillIfMissing(skillKey) {
    const config = CONFIG.HEROES_GLORY;
    const already = this.actor.items.some((i) => i.type === 'skill' && i.system.skillKey === skillKey);
    if (already) return;
    const ownedSkills = this.actor.items.filter((i) => i.type === 'skill');
    // §3 стр.39: 8, or 10 with Экспертная Обучаемость — see that
    // function's own comment (rolls.mjs) for why this is re-derived here
    // rather than read from a cached/stored value.
    if (ownedSkills.length >= secondarySkillSlotCount(ownedSkills.map((i) => i.system), config.secondarySkillSlotCount)) return;
    return grantSecondarySkill(this.actor, skillKey);
  }

  /**
   * §2.3 p. 12: apply Элементаль/Воздух's/Джинн's item grant after a race
   * or subchoice change — same "grant on confirm, never continuously
   * re-enforced" trigger point as `#grantSecondarySkillIfMissing` above
   * (called from the exact same `onConfirm`, right after the same
   * `actor.update`), not a second mechanism: manually deleting a granted
   * item later does nothing on its own, same as manually deleting a
   * class-granted skill does nothing on its own — only a genuine race/
   * subchoice change (which runs this again) can re-grant it.
   *
   * Revoke-then-grant, in that order:
   * 1. Delete every owned item flagged {@link RACE_GRANTED_ITEM_FLAG} whose
   *    stored `{race, subchoice}` no longer matches the NEW pair — this is
   *    what makes Воздух -> Огонь drop "Полет" (scenario 2) and any race
   *    change away from Джинн drop its spell and, if we gave it, the
   *    Книга Магии together. Only OUR flagged items are ever candidates —
   *    an item the player obtained another way never carries this flag,
   *    so it's never at risk (this was the specific risk flagged before
   *    implementing: rules.md has no "remove on race change" text for
   *    ANYTHING else, so there was no existing removal precedent to
   *    copy — this flag is what makes removal safe to add here).
   * 2. Grant whatever the NEW race/subchoice calls for (`raceGrantedItems`,
   *    helpers/race-granted-items.mjs) and the actor doesn't already own
   *    by name/type —
   *    covers both "never had it" and "already has it from elsewhere,
   *    don't duplicate" (scenario 5) in the same check. `hasSpellbook` is
   *    read AFTER step 1's deletions, so a Книга Магии we just revoked
   *    (race changed away from Джинн) doesn't linger and mask a
   *    still-missing book for whatever the new race needs — moot in
   *    practice today (no OTHER race grants a book), but the ordering is
   *    the actually-correct one, not just the convenient one.
   *
   * A granted spell is copied from the `heroes-glory.spells` compendium by
   * name (§task: "берётся из компендиума... а не создаётся заново с
   * нуля") — its four mana-cost/effect variants are real authored data,
   * unlike a secondary skill's bare {skillKey, tier}, which is genuinely
   * simple enough to construct from scratch the way
   * `#grantSecondarySkillIfMissing` already does. The Книга Магии has the
   * exact same "nothing to get wrong" shape a skill item does
   * (item-spellbook.mjs: no fields besides equipped/paperdollSlot), so
   * IT'S built from scratch here, same as a skill — not sourced from a
   * compendium that doesn't have one, and not a second convention for the
   * same reason.
   * @this {HeroesGloryHeroSheet}
   * @param {string} oldRaceKey
   * @param {string|null} oldSubchoiceKey
   * @param {string} newRaceKey
   * @param {string|null} newSubchoiceKey
   * @returns {Promise<void>}
   */
  async #syncRaceGrantedItems(oldRaceKey, oldSubchoiceKey, newRaceKey, newSubchoiceKey) {
    const stale = this.actor.items.filter((i) => {
      const grant = i.getFlag(...RACE_GRANTED_ITEM_FLAG);
      if (!grant) return false;
      return grant.race !== newRaceKey || (grant.subchoice ?? null) !== newSubchoiceKey;
    });
    if (stale.length) await this.actor.deleteEmbeddedDocuments('Item', stale.map((i) => i.id));

    const hasSpellbook = this.actor.items.some((i) => i.type === 'spellbook');
    const wanted = raceGrantedItems(newRaceKey, newSubchoiceKey, { hasSpellbook });
    const grantFlag = { [RACE_GRANTED_ITEM_FLAG[0]]: { [RACE_GRANTED_ITEM_FLAG[1]]: { race: newRaceKey, subchoice: newSubchoiceKey } } };

    for (const want of wanted) {
      if (want.itemType === 'spellbook') {
        if (this.actor.items.some((i) => i.type === 'spellbook')) continue;
        // Literal name, not a `TYPES.Item.spellbook` lookup (Foundry's
        // own default-name-for-a-new-document key, which is what a
        // hand-created spellbook would otherwise get its name from too):
        // lang/en.json's own TYPES.Item block is simply missing a
        // "spellbook" entry (has weapon/spell/artifact/skill, not
        // spellbook — lang/ru.json's does have all five) — a narrow,
        // pre-existing content gap affecting an English-language client
        // specifically, unrelated to this feature and out of scope to
        // fix here (separate task). Every OTHER literal here (spell
        // names below) is already a plain Cyrillic string for the same
        // reason spell names aren't looked up by key either — this just
        // keeps that same approach consistent, and sidesteps the gap
        // regardless of which language a client runs in.
        await this.actor.createEmbeddedDocuments('Item', [{
          name: 'Книга Магии',
          type: 'spellbook',
          flags: grantFlag,
        }]);
        continue;
      }
      if (this.actor.items.some((i) => i.type === 'spell' && i.name === want.spellName)) continue;
      const pack = game.packs.get('heroes-glory.spells');
      const index = await pack.getIndex();
      const entry = index.find((e) => e.name === want.spellName);
      if (!entry) continue; // Book/config drift — nothing sane to grant, don't crash the confirm flow over it.
      const spellData = (await pack.getDocument(entry._id)).toObject();
      delete spellData._id;
      spellData.flags = { ...spellData.flags, ...grantFlag };
      await this.actor.createEmbeddedDocuments('Item', [spellData]);
    }
  }
}
