import { buildEffectChanges } from '../helpers/modifiers.mjs';

/**
 * The flag namespace/key marking the ActiveEffect this system auto-manages
 * on an artifact from its `system.modifiers` — distinguishes it from any
 * effect a GM might add by hand through Foundry's own effects UI.
 */
const MODIFIER_EFFECT_FLAG = ['heroes-glory', 'artifactModifiers'];

/**
 * Extend the basic Item with some very simple modifications.
 * @extends {Item}
 */
export class HeroesGloryItem extends Item {
  /**
   * Augment the basic Item data model with additional dynamic data.
   */
  prepareData() {
    // As with the actor class, items are documents that can have their data
    // preparation methods overridden (such as prepareBaseData()).
    super.prepareData();
  }

  /**
   * Prepare a data object which defines the data schema used by dice roll commands against this Item
   * @override
   */
  getRollData() {
    // Starts off by populating the roll data with a shallow copy of `this.system`
    const rollData = { ...this.system };

    // Quit early if there's no parent actor
    if (!this.actor) return rollData;

    // If present, add the actor's roll data
    rollData.actor = this.actor.getRollData();

    return rollData;
  }

  /**
   * Convert the actor document to a plain object.
   *
   * The built in `toObject()` method will ignore derived data when using Data Models.
   * This additional method will instead use the spread operator to return a simplified
   * version of the data.
   *
   * @returns {object} Plain object either via deepClone or the spread operator.
   */
  toPlainObject() {
    const result = { ...this };

    // Simplify system data.
    result.system = this.system.toPlainObject();

    // Add effects.
    result.effects = this.effects?.size > 0 ? this.effects.contents : [];

    return result;
  }

  /**
   * A brand-new artifact might already carry `system.modifiers` (e.g.
   * imported from a compendium), so the backing ActiveEffect needs to
   * exist from creation, not just from a later edit.
   * @override
   */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (userId !== game.user.id) return;
    if (this.type === 'artifact') this.#syncModifierEffect();
  }

  /**
   * §8.1: a hero can have at most one equipped melee weapon and one
   * equipped ranged weapon. When this item transitions to `equipped: true`,
   * unequip whatever else currently occupies its weapon-type slot instead
   * of silently letting two items share it.
   *
   * The old "one equipped artifact per artifactType" rule this method used
   * to also enforce was never a book rule (rules.md §8.2 has no such text)
   * — it was a stand-in for a paperdoll that didn't exist yet. Now that the
   * hero sheet has a real 19-slot paperdoll (module/sheets/actor/
   * hero-sheet.mjs's #placeItem), same-slot displacement for artifacts is
   * handled there instead, keyed off `system.paperdollSlot`, and multiple
   * artifacts of the same type are allowed in different slots.
   *
   * Also keeps an artifact's structured `system.modifiers` (§8.2) synced
   * onto a real embedded ActiveEffect, so the bonuses actually apply
   * instead of just being displayed as text — see module/helpers/
   * modifiers.mjs and #syncModifierEffect below.
   * @override
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // Only the client that made this change drives these cascades, so
    // they don't get attempted redundantly on every connected client.
    if (userId !== game.user.id) return;

    if (this.type === 'artifact' && ('modifiers' in (changed.system ?? {}) || 'equipped' in (changed.system ?? {}))) {
      this.#syncModifierEffect();
    }

    if (!this.actor) return;
    if (this.type !== 'weapon') return;
    if (changed.system?.equipped !== true) return;

    const conflict = this.#findEquippedSlotConflict();
    conflict?.update({ 'system.equipped': false });
  }

  /**
   * Find another owned weapon of the same melee/ranged category currently
   * equipped, per §8.1's one-melee/one-ranged rule.
   * @returns {Item|undefined}
   */
  #findEquippedSlotConflict() {
    const ranged = this.system.weaponType === 'ranged';
    return this.actor.items.find((i) =>
      i.id !== this.id && i.type === 'weapon' && i.system.equipped
      && (i.system.weaponType === 'ranged') === ranged
    );
  }

  /**
   * Keep this artifact's single auto-managed ActiveEffect in sync with
   * `system.modifiers` and `system.equipped`. Always rebuilds the full
   * effect data and calls `update()` rather than diffing — Foundry only
   * writes an actual change if something differs, so this is simple
   * without being wasteful in practice (an equip toggle recomputes the
   * same `changes` and only `disabled` actually differs; a modifiers
   * edit recomputes `changes` and `disabled` stays the same).
   *
   * The effect has `transfer: true` (Foundry's own default for
   * ActiveEffect), so it applies to the owning actor automatically once
   * enabled — no manual transfer plumbing needed.
   * @returns {Promise<void>}
   */
  async #syncModifierEffect() {
    const modifiers = this.system.modifiers ?? [];
    const existing = this.effects.find((e) => e.getFlag(...MODIFIER_EFFECT_FLAG));

    if (modifiers.length === 0) {
      if (existing) await existing.delete();
      return;
    }

    const effectData = {
      name: this.name,
      img: this.img,
      transfer: true,
      disabled: !this.system.equipped,
      origin: this.uuid,
      system: { changes: buildEffectChanges(modifiers) },
      flags: { [MODIFIER_EFFECT_FLAG[0]]: { [MODIFIER_EFFECT_FLAG[1]]: true } },
    };

    if (existing) await existing.update(effectData);
    else await this.createEmbeddedDocuments('ActiveEffect', [effectData]);
  }

  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  async roll() {
    const item = this;

    // Initialize chat data.
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });
    const rollMode = game.settings.get('core', 'rollMode');
    const label = `[${item.type}] ${item.name}`;

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      ChatMessage.create({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
        content: item.system.description ?? '',
      });
    }
    // Otherwise, create a roll and send a chat message from it.
    else {
      // Retrieve roll data.
      const rollData = this.getRollData();

      // Invoke the roll and submit it to chat.
      const roll = new Roll(rollData.formula, rollData.actor);
      // If you need to store the value first, uncomment the next line.
      // const result = await roll.evaluate();
      roll.toMessage({
        speaker: speaker,
        rollMode: rollMode,
        flavor: label,
      });
      return roll;
    }
  }
}
