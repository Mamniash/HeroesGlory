import {
  rollAttack,
  castSpell,
  rollAbilityCheck,
  rollPositiveMoraleCheck,
  rollNegativeMoraleCheck,
  rollPostBattleCheck,
  helpIncapacitatedActor,
} from '../../helpers/roll-actions.mjs';

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * Shared behaviour for every Heroes & Glory actor sheet. Type-specific
 * sheets (hero/creature) supply their own `PARTS` — each declares both
 * `header` and `body`, in full, for the same reason documented on the
 * item sheets' base class: `static PARTS` replaces rather than merges
 * across a class hierarchy, unlike `DEFAULT_OPTIONS`.
 */
export class HeroesGloryActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ['heroes-glory', 'sheet', 'actor'],
    tag: 'form',
    position: { width: 760, height: 'auto' },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      editImage: this.#onEditImage,
      openItem: this.#onOpenItem,
      rollAttack: this.#onRollAttack,
      castSpell: this.#onCastSpell,
      rollAbilityCheck: this.#onRollAbilityCheck,
      rollMoraleCheck: this.#onRollMoraleCheck,
      adjustWounds: this.#onAdjustWounds,
      postBattleCheck: this.#onPostBattleCheck,
      unequipItem: this.#onUnequipItem,
      deleteItem: this.#onDeleteItem,
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.system = this.actor.system;
    // Raw stored values, untouched by ActiveEffects (artifact modifiers,
    // rules.md §8.2). `system.*` above is the *effective* value after
    // effects apply, so any editable number input bound to a stat an
    // artifact can target (see CONFIG.HEROES_GLORY.artifactModifierStats)
    // must render from `source`, not `system` — otherwise submitOnChange
    // (which resubmits the whole form on any field's change) writes the
    // already-bonused value back as the new base, and the bonus stacks on
    // every unrelated edit.
    context.source = this.actor._source.system;
    context.config = CONFIG.HEROES_GLORY;
    return context;
  }

  /**
   * Open the file picker to change the actor's image.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target   The element carrying `data-edit`.
   */
  static async #onEditImage(event, target) {
    const attribute = target.dataset.edit;
    const current = foundry.utils.getProperty(this.document, attribute);
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: 'image',
      current,
      callback: (path) => this.document.update({ [attribute]: path }),
    });
    return picker.browse();
  }

  /**
   * Open an owned item's own sheet — how equipment, skills and spells
   * listed on the actor sheet are actually edited (tier, equipped,
   * variants, ...), rather than duplicating that editing UI here.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target   The element carrying `data-item-id`.
   */
  static #onOpenItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    return item?.sheet.render(true);
  }

  /**
   * §5.3/§5.4: roll an attack. With `data-item-id`, attacks with that
   * owned weapon (hero); without it, attacks with the actor's own stats
   * (creature).
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onRollAttack(event, target) {
    const itemId = target.dataset.itemId;
    const weapon = itemId ? this.actor.items.get(itemId) : null;
    return rollAttack(this.actor, weapon);
  }

  /**
   * §6.3: cast the owned spell identified by `data-item-id`.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onCastSpell(event, target) {
    const spell = this.actor.items.get(target.dataset.itemId);
    if (!spell) return;
    return castSpell(this.actor, spell);
  }

  /**
   * §7: roll a non-combat check for the primary skill named by `data-skill`.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onRollAbilityCheck(event, target) {
    return rollAbilityCheck(this.actor, target.dataset.skill);
  }

  /**
   * §5.8: roll a Боевой дух test — "positive" for the actor's own
   * end-of-turn extra-turn attempt, "negative" for a skip-turn test an
   * opponent or the Рассказчик declares against them. The template only
   * renders the positive button for the sheet's owner and the negative
   * one for the GM, but `data-variant` is trusted at face value here
   * since both underlying functions re-check the per-battle attempt cap
   * themselves regardless of who called them.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onRollMoraleCheck(event, target) {
    if (target.dataset.variant === 'negative') return rollNegativeMoraleCheck(this.actor);
    return rollPositiveMoraleCheck(this.actor);
  }

  /**
   * §5.9: manually add or remove one Ранение — `data-delta` is "1" or
   * "-1". Clamped at 0 explicitly rather than relying on the schema
   * field's own `min: 0` to reject the update, since that would just
   * silently fail the whole submit instead of clamping.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onAdjustWounds(event, target) {
    const delta = Number(target.dataset.delta);
    const next = Math.max(0, this.actor.system.wounds + delta);
    return this.actor.update({ 'system.wounds': next });
  }

  /**
   * §5.9: resolve a Недееспособен hero after the battle — "roll" spends
   * the d20 survival check, "help" skips straight to the guaranteed
   * recovery. The template only renders these for the GM, matching how
   * the book frames both as something decided about the hero, not by
   * them.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onPostBattleCheck(event, target) {
    if (target.dataset.variant === 'help') return helpIncapacitatedActor(this.actor);
    return rollPostBattleCheck(this.actor);
  }

  /**
   * §8.1/§8.2: take an equipped weapon or artifact off, returning it to
   * the unequipped inventory.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static #onUnequipItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    return item?.update({ 'system.equipped': false });
  }

  /**
   * Delete an owned item after confirming, since there was previously no
   * way to remove an item dropped onto the actor sheet.
   * @this {HeroesGloryActorSheet}
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async #onDeleteItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'HEROES_GLORY.Item.DeleteConfirmTitle' },
      content: `<p>${game.i18n.format('HEROES_GLORY.Item.DeleteConfirmContent', { name: item.name })}</p>`,
    });
    if (confirmed) return item.delete();
  }
}
