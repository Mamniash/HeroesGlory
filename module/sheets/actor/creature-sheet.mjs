import { HeroesGloryActorSheet } from './base-actor-sheet.mjs';
import { HeroesGloryFramedSheetMixin } from '../framed-sheet-mixin.mjs';
import {
  isCreatureArcher, moraleAttemptsRemaining, moraleCheckVariant, parseHealthInput, quickHealthClearsIncapacitated,
} from '../../helpers/rolls.mjs';
import { resolveTagAbilities } from '../../helpers/creature-abilities.mjs';
import { KNOWLEDGE_BASE_PACK, CREATURE_ABILITIES_ENTRY } from '../../helpers/knowledge-base.mjs';
import { resolveEffectivePanelColor } from '../../helpers/panel-color.mjs';
import { moraleIconPath } from '../../helpers/skill-icons.mjs';
import { summonedData } from '../../helpers/combat.mjs';

let abilityPagesPromise = null;

/**
 * §9: the «Способности существ» entry's pages by name, from the «База
 * знаний» compendium, loaded once per session. A failed load is not
 * cached, so the next render retries.
 * @returns {Promise<Map<string, JournalEntryPage>>}
 */
function abilityPages() {
  abilityPagesPromise ??= (async () => {
    const pack = game.packs.get(KNOWLEDGE_BASE_PACK);
    if (!pack) return new Map();
    const entryId = (await pack.getIndex()).find((e) => e.name === CREATURE_ABILITIES_ENTRY)?._id;
    const journal = entryId ? await pack.getDocument(entryId) : null;
    return new Map((journal?.pages ?? []).map((page) => [page.name, page]));
  })().catch((err) => {
    console.error(err);
    abilityPagesPromise = null;
    return new Map();
  });
  return abilityPagesPromise;
}

/** Stat-row icons: HOMM3's creature window (CrStkPu), scripts/crop_creature_stat_icons.py. */
const STAT_ICON = (name) => `systems/heroes-glory/assets/crstkpu/crstkpu_${name}.png`;

/**
 * §9 creature sheet, laid out as HOMM3's creature window: portrait, a
 * column of stat rows, abilities, action buttons. The GM's own — nobody
 * else opens it at any ownership level (see `render`). Numbers are text;
 * the current Health has its own quick field; everything else is edited in
 * edit mode, toggled as on the hero sheet.
 */
export class HeroesGloryCreatureSheet extends HeroesGloryFramedSheetMixin(HeroesGloryActorSheet) {
  static DEFAULT_OPTIONS = {
    classes: ['hg-creature-app'],
    actions: {
      toggleDefending: this.#onToggleDefending,
      toggleEditMode: this.#onToggleEditMode,
      deleteSpecialSkill: this.#onDeleteSpecialSkill,
    },
  };

  static PARTS = {
    sheet: { template: 'systems/heroes-glory/templates/actor/actor-creature-sheet.hbs' },
  };

  /**
   * Edit mode (GM only, like the hero sheet's). Kept per sheet instance;
   * every opening starts in the ordinary mode.
   * @type {boolean}
   */
  #editMode = false;

  /**
   * The creature sheet is the GM's: whatever ownership a player holds, any
   * way of opening it (token double-click, the actors list, a link in chat
   * or a journal, the combat tracker) ends here, and only a note is shown —
   * but for the owner of a summoned elemental's or a clone's token.
   * A re-render request (not `force`) for a sheet that isn't open does
   * nothing anyway, so it stays silent.
   * @override
   */
  render(options = {}, _options = {}) {
    // Group Д: a summoned elemental or a clone is the caster's player's to
    // command — its token's owner opens the sheet (rules.md §11).
    const ownSummon = !!summonedData(this.actor) && this.actor.isOwner;
    if (!game.user.isGM && !ownSummon) {
      const force = options === true || options?.force;
      if (force) ui.notifications.warn('HEROES_GLORY.Creature.GmOnly', { localize: true });
      return Promise.resolve(this);
    }
    return super.render(options, _options);
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    this.#editMode = false;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    context.editMode = this.#editMode;
    // Editing stays the GM's, the owner of a summon or a clone only reads and acts.
    context.canEdit = game.user.isGM;
    context.panelColor = resolveEffectivePanelColor({ panelColor: 'auto', faction: system.faction });
    const factionKey = CONFIG.HEROES_GLORY.factions[system.faction];
    context.subline = factionKey
      ? game.i18n.format('HEROES_GLORY.Creature.Subline', { faction: game.i18n.localize(factionKey), level: system.level })
      : game.i18n.format('HEROES_GLORY.Creature.SublineNoFaction', { level: system.level });

    // The window's stat column. Ordinary mode shows the effective values
    // (artifact-style effects included); edit mode edits the stored ones,
    // as every other sheet does (base-actor-sheet.mjs, `source`).
    const source = context.source;
    context.statRows = [
      { key: 'attack', label: 'HEROES_GLORY.Creature.Attack', value: system.attack, stored: source.attack },
      { key: 'defense', label: 'HEROES_GLORY.Creature.Defense', value: system.defense, stored: source.defense },
      { key: 'damage', label: 'HEROES_GLORY.Creature.Damage', value: system.damage, stored: source.damage },
      { key: 'attacksCount', icon: 'shots', label: 'HEROES_GLORY.Creature.AttacksPerRound', value: system.attacksCount, stored: source.attacksCount },
      { key: 'health', label: 'HEROES_GLORY.Creature.Health', health: true },
      { key: 'speed', label: 'HEROES_GLORY.Creature.Speed', value: system.speed, stored: source.speed },
    ].map((row) => ({ ...row, icon: STAT_ICON(row.icon ?? row.key) }));
    context.moraleIcon = moraleIconPath(system.morale, { small: true });

    // §11: a «Стрелок» gets separate melee and ranged attack buttons.
    context.isArcher = isCreatureArcher(system.specialSkills);
    // §9: a tag with an article opens it (the first of two, where a tag
    // names two abilities); one the book has no article for stays text.
    const pages = await abilityPages();
    const pageNames = [...pages.keys()];
    context.tags = system.specialSkills.filter((tag) => tag.trim()).map((tag) => ({
      tag,
      uuid: pages.get(resolveTagAbilities(tag, pageNames)[0])?.uuid ?? null,
    }));
    // Edit mode: one field per stored tag, under its own index (a blank one
    // left from before is not shown and drops out on the next save), and
    // one empty field after them for a new tag.
    context.tagRows = system.specialSkills.map((tag, index) => ({ tag, index })).filter((row) => row.tag.trim());
    context.newTagIndex = system.specialSkills.length;
    // §5.8: the Боевой дух test button — shown only while this user may
    // roll one (extra turn — owner; skip turn — GM).
    const moraleUsed = this.actor.getFlag('heroes-glory', 'moraleUsed') ?? 0;
    const moraleVariant = moraleCheckVariant({
      morale: system.morale, used: moraleUsed, isOwner: this.actor.isOwner, isGM: game.user.isGM,
    });
    context.moraleCheck = moraleVariant && {
      negative: moraleVariant === 'negative',
      threshold: system.moraleThreshold ?? 4,
      remaining: moraleAttemptsRemaining(system.morale, moraleUsed),
      total: Math.abs(system.morale),
    };
    context.defending = this.actor.statuses.has(CONFIG.HEROES_GLORY.statusEffects.defending);
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description, { relativeTo: this.actor },
    );
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Quick Health: «12» sets, «−7» / «+3» change it, applied on Enter or
    // on leaving the field. Its own update, not the form's — the field
    // has no name, and its change stops here. The value goes through the
    // same actor update as attack damage, so 0 brings «недееспособен» the
    // same way (documents/actor.mjs, `_onUpdate`); raised from 0 above 0
    // here, it lifts «недееспособен» again (not «повержен»).
    const healthInput = this.element.querySelector('[data-health-input]');
    healthInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      healthInput.blur();
    });
    healthInput?.addEventListener('change', async (event) => {
      event.stopPropagation();
      const current = this.actor.system.health.value;
      const next = parseHealthInput(healthInput.value, current);
      if (next === null || next === current) {
        healthInput.value = current;
        return;
      }
      await this.actor.update({ 'system.health.value': next });
      if (quickHealthClearsIncapacitated(current, next)) {
        await this.actor.toggleStatusEffect(CONFIG.HEROES_GLORY.statusEffects.incapacitated, { active: false });
      }
    });
  }

  /**
   * Tags come as `system.specialSkills.<n>` fields plus an empty one for a
   * new tag: drop the empty ones, keep the order.
   * @override
   */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const tags = data.system?.specialSkills;
    if (tags) data.system.specialSkills = Object.values(tags).filter((tag) => String(tag).trim());
    return data;
  }

  /**
   * §5.2 (p. 27): take the «Защита» action — or drop it early. The status
   * carries its own duration (heroes-glory.mjs), same as from the token HUD.
   * @this {HeroesGloryCreatureSheet}
   */
  static #onToggleDefending() {
    return this.actor.toggleStatusEffect(CONFIG.HEROES_GLORY.statusEffects.defending);
  }

  /**
   * @this {HeroesGloryCreatureSheet}
   */
  static #onToggleEditMode() {
    if (!game.user.isGM) return;
    this.#editMode = !this.#editMode;
    this.render();
  }

  /**
   * @this {HeroesGloryCreatureSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target   The row's delete button.
   */
  static #onDeleteSpecialSkill(event, target) {
    // The row leaves the form and the form is saved as it stands — so a
    // tag being typed in another row is saved with it, not overwritten.
    // The empty new-tag field keeps `specialSkills` in the form even when
    // the last tag goes.
    target.closest('.hg-item__list-row').remove();
    return this.submit();
  }
}
