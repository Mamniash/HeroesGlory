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
   * §8.1/§8.3: a hero can have at most one equipped melee weapon, one
   * equipped ranged weapon, and one equipped artifact per artifact type.
   * When this item transitions to `equipped: true`, unequip whatever else
   * currently occupies its slot instead of silently letting two items
   * share it (which made the previous occupant unreachable — not shown in
   * the equipped slot, and not shown in inventory either).
   * @override
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // Only the client that made this change drives the cascade, so it
    // doesn't get attempted redundantly on every connected client.
    if (userId !== game.user.id) return;
    if (!this.actor) return;
    if (changed.system?.equipped !== true) return;
    if (this.type !== 'weapon' && this.type !== 'artifact') return;

    const conflict = this.#findEquippedSlotConflict();
    conflict?.update({ 'system.equipped': false });
  }

  /**
   * Find another owned item occupying the same equip slot as this one.
   * @returns {Item|undefined}
   */
  #findEquippedSlotConflict() {
    if (this.type === 'weapon') {
      const ranged = this.system.weaponType === 'ranged';
      return this.actor.items.find((i) =>
        i.id !== this.id && i.type === 'weapon' && i.system.equipped
        && (i.system.weaponType === 'ranged') === ranged
      );
    }
    return this.actor.items.find((i) =>
      i.id !== this.id && i.type === 'artifact' && i.system.equipped
      && i.system.artifactType === this.system.artifactType
    );
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
