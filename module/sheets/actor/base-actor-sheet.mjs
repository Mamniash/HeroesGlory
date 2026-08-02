import {
  rollAttack,
  castSpell,
  rollAbilityCheck,
  rollPositiveMoraleCheck,
  rollNegativeMoraleCheck,
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
      unequipItem: this.#onUnequipItem,
      deleteItem: this.#onDeleteItem,
    },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.system = this.actor.system;
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
