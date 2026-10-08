import { buildEffectChanges } from '../helpers/modifiers.mjs';
import { followWeaponTypeSlots } from '../helpers/paperdoll-slots.mjs';
import { SPELLBOOK_IMG } from '../helpers/item-images.mjs';
import { secondarySkillIconPath, specializationIconPath } from '../helpers/skill-icons.mjs';
import {
  SPECIALIZATIONS_PACK, SPECIALIZATION_SPELL_ICON_FRAMES, specializationFromKey, specializationLabel,
  specializationCreateRefusal, specializationHero, specializationRequirement,
} from '../helpers/specializations.mjs';

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
   * A new Книга Магии without an image of its own gets HOMM3's «Книга
   * заклинаний» — core reads this for the `img` default of every created
   * item, so it covers the book granted at hero creation, Джинн's, and one
   * made by hand.
   * @override
   */
  static getDefaultArtwork(itemData) {
    if (itemData?.type === 'spellbook') return { img: SPELLBOOK_IMG };
    return super.getDefaultArtwork(itemData);
  }

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
   * §4.3: the rules of a hero's specialization, for every way an item gets
   * created (a drop, the window, a macro, another sheet): only a hero takes
   * one; never a second one — the GM too, a replacement deletes the old one
   * first; a player only one of the 12 whose condition is met. Refused here
   * with a notification on the creating client.
   * @override
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (this.type !== 'specialization') return;
    const actor = this.parent instanceof Actor ? this.parent : null;
    const spec = specializationFromKey(this.system.key);
    const refusal = specializationCreateRefusal({
      parentType: actor?.type ?? null,
      isGM: user.isGM,
      existingCount: actor ? actor.items.filter((i) => i.type === 'specialization').length : 0,
      valid: !!spec,
      met: !!(actor && spec && specializationRequirement(spec, specializationHero(actor)).met),
    });
    if (!refusal) return;
    if (user.id === game.user.id) {
      const name = spec ? specializationLabel(spec, (k) => game.i18n.localize(k)) : this.name;
      ui.notifications.warn(game.i18n.format(`HEROES_GLORY.SpecializationUi.Refuse.${refusal}`, { name }));
    }
    return false;
  }

  /**
   * §4.3: `_preCreate` sees one document at a time, so two specializations
   * created in one batch would both pass it — only the first of the batch
   * stays (its own `_preCreate` already checked the hero has none).
   * @override
   */
  static async _preCreateOperation(documents, operation, user) {
    const allowed = await super._preCreateOperation(documents, operation, user);
    if (allowed === false) return false;
    if (operation.parent?.type !== 'hero') return;
    const extra = documents.filter((d) => d.type === 'specialization').slice(1);
    if (!extra.length) return;
    for (const doc of extra) documents.splice(documents.indexOf(doc), 1);
    if (user.id === game.user.id) ui.notifications.warn(game.i18n.localize('HEROES_GLORY.SpecializationUi.Refuse.batch'));
    if (!documents.length) return false;
  }

  /**
   * §4.3: a player neither deletes the hero's specialization nor changes it —
   * only the GM does (rules.md §11). A world or compendium item is free.
   * @override
   */
  async _preDelete(options, user) {
    const allowed = await super._preDelete(options, user);
    if (allowed === false) return false;
    if (this.type === 'specialization' && this.parent?.type === 'hero' && !user.isGM) {
      if (user.id === game.user.id) ui.notifications.warn(game.i18n.localize('HEROES_GLORY.SpecializationUi.Refuse.onlyGm'));
      return false;
    }
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
   * §8.2: an enchanted weapon re-typed (bow → sword) moves its paperdoll
   * mark along with the type — unless its marks were set by hand
   * (followWeaponTypeSlots, paperdoll-slots.mjs).
   * @override
   */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;
    if (this.type === 'specialization') return this.#preUpdateSpecialization(changed, user);
    // A skill item is named after its skill: choosing another skill renames
    // it and, if it still shows the old skill's icon (or none of its own),
    // swaps the icon too.
    const newKey = changed.system?.skillKey;
    if (this.type === 'skill' && newKey && newKey !== this.system.skillKey) {
      const labelKey = CONFIG.HEROES_GLORY.secondarySkills[newKey];
      if (labelKey && !('name' in changed)) changed.name = game.i18n.localize(labelKey);
      const oldIcon = this.system.skillKey ? secondarySkillIconPath(this.system.skillKey, 'base', { large: true }) : null;
      const defaultIcon = this.constructor.getDefaultArtwork({ type: 'skill' }).img;
      // The sheet's form always sends the header image back unchanged —
      // only a different image counts as set by hand.
      const imgByHand = 'img' in changed && changed.img !== this.img;
      if (!imgByHand && (!this.img || this.img === oldIcon || this.img === defaultIcon)) {
        changed.img = secondarySkillIconPath(newKey, 'base', { large: true });
      }
      // Everything else that describes the skill — its three tiers' texts —
      // comes from the compendium entry of the new skill (the owned tier
      // stays). Not there: the texts are left alone.
      const effects = await HeroesGloryItem.#compendiumSkillEffects(newKey);
      if (effects) changed.system.effects = effects;
      else console.warn(`heroes-glory | skill "${newKey}" not found in heroes-glory.skills; its tier texts were left as they were`);
    }
    const newType = changed.system?.weaponType;
    if (this.type === 'artifact' && this.system.artifactType === 'enchantedWeapon'
      && newType !== undefined && newType !== this.system.weaponType && !('targetSlots' in changed.system)) {
      changed.system.targetSlots = followWeaponTypeSlots(this.system.targetSlots, this.system.weaponType, newType);
    }
  }

  /**
   * §8.1: a hero can have at most one equipped melee weapon and one
   * equipped ranged weapon. When this item transitions to `equipped: true`,
   * unequip whatever else currently occupies its weapon-type slot instead
   * of silently letting two items share it. Applies equally to a real
   * weapon and to an artifact whose `artifactType` is "enchantedWeapon" —
   * see #isWeaponLike below — so a hero can't dual-wield a real sword and
   * an enchanted one, or two enchanted ones, any more than two real ones.
   *
   * The old "one equipped artifact per artifactType" rule this method used
   * to also enforce was never a book rule (rules.md §8.2 has no such text)
   * — it was a stand-in for a paperdoll that didn't exist yet. Now that the
   * hero sheet has a real 19-slot paperdoll (module/sheets/actor/
   * hero-sheet.mjs's #placeItem), same-slot displacement for artifacts is
   * handled there instead, keyed off `system.paperdollSlot`, and multiple
   * artifacts of the same type are allowed in different slots.
   *
   * Also keeps an artifact's structured `system.modifiers` (§8.2) — plus,
   * for a shield, its level-derived Defense bonus (§5.5) — synced onto a
   * real embedded ActiveEffect, so the bonuses actually apply instead of
   * just being displayed as text — see module/helpers/modifiers.mjs and
   * #syncModifierEffect/#effectiveModifiers below. This runs independently
   * of the weapon-slot logic above: an enchanted weapon's `+N к Атаке`
   * keeps applying via its own ActiveEffect (gated on `equipped` alone)
   * regardless of whether it's sitting in the weapon paperdoll slot, the
   * backpack, or nowhere in particular — `#syncModifierEffect` never
   * looks at `paperdollSlot`.
   * @override
   */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    // Only the client that made this change drives these cascades, so
    // they don't get attempted redundantly on every connected client.
    if (userId !== game.user.id) return;

    if (this.type === 'artifact' && (
      'modifiers' in (changed.system ?? {})
      || 'equipped' in (changed.system ?? {})
      // §5.5/§8.2: a shield's level feeds the synthesized +level Defense
      // modifier below — a level-only edit (GM setting the level on a
      // handed-out shield) needs the same resync as a modifiers edit.
      || 'level' in (changed.system ?? {})
    )) {
      this.#syncModifierEffect();
    }

    if (!this.actor) return;
    if (!HeroesGloryItem.#isWeaponLike(this)) return;
    if (changed.system?.equipped !== true) return;

    const conflict = this.#findEquippedSlotConflict();
    conflict?.update({ 'system.equipped': false });
  }

  /**
   * §4.3: on a hero only the GM changes the specialization (its key, name,
   * image, text). A new key renames the item and swaps its image, as a skill
   * does, and brings the book text of that entry of the compendium
   * «Специализации» (not there — the text is left, a console warning).
   * @param {object} changed
   * @param {User} user
   * @returns {Promise<boolean|void>}
   */
  async #preUpdateSpecialization(changed, user) {
    const touches = ['name', 'img', 'system'].some((k) => k in changed);
    if (touches && this.parent?.type === 'hero' && !user.isGM) {
      if (user.id === game.user.id) ui.notifications.warn(game.i18n.localize('HEROES_GLORY.SpecializationUi.Refuse.onlyGm'));
      return false;
    }
    const newKey = changed.system?.key;
    const spec = newKey && newKey !== this.system.key ? specializationFromKey(newKey) : null;
    if (!spec) return;
    changed.name = specializationLabel(spec, (k) => game.i18n.localize(k));
    const oldSpec = specializationFromKey(this.system.key);
    const oldIcon = oldSpec ? specializationIconPath(oldSpec, SPECIALIZATION_SPELL_ICON_FRAMES, { large: true }) : null;
    const defaultIcon = this.constructor.getDefaultArtwork({ type: 'specialization' }).img;
    const imgByHand = 'img' in changed && changed.img !== this.img;
    if (!imgByHand && (!this.img || this.img === oldIcon || this.img === defaultIcon)) {
      changed.img = specializationIconPath(spec, SPECIALIZATION_SPELL_ICON_FRAMES, { large: true });
    }
    const entry = await HeroesGloryItem.specializationEntry(newKey);
    if (entry) changed.system.description = entry.system.description;
    else console.warn(`heroes-glory | specialization "${newKey}" not found in ${SPECIALIZATIONS_PACK}; its text was left as it was`);
  }

  /**
   * The compendium «Специализации» entry of one key, or null.
   * @param {string} key
   * @returns {Promise<Item|null>}
   */
  static async specializationEntry(key) {
    const pack = game.packs.get(SPECIALIZATIONS_PACK);
    if (!pack) return null;
    const entry = (await pack.getIndex({ fields: ['system.key'] })).find((e) => e.system?.key === key);
    return entry ? pack.getDocument(entry._id) : null;
  }

  /**
   * The three tier texts of a skill's compendium entry, or null if the
   * compendium has no entry for that skill key.
   * @param {string} skillKey
   * @returns {Promise<{base: string, advanced: string, expert: string}|null>}
   */
  static async #compendiumSkillEffects(skillKey) {
    const pack = game.packs.get('heroes-glory.skills');
    if (!pack) return null;
    const entry = (await pack.getIndex({ fields: ['system.skillKey'] })).find((e) => e.system?.skillKey === skillKey);
    if (!entry) return null;
    const doc = await pack.getDocument(entry._id);
    return doc ? foundry.utils.deepClone(doc.system.effects) : null;
  }

  /**
   * Whether `item` behaves as a weapon for the one-melee/one-ranged
   * exclusivity rule (§8.1) and the weapon paperdoll slot (helpers/
   * paperdoll-slots.mjs) — a real weapon, or an artifact whose
   * `artifactType` is "enchantedWeapon" (§8.2, made to behave exactly
   * like a real weapon once equipped).
   * @param {Item} item
   * @returns {boolean}
   */
  static #isWeaponLike(item) {
    return item.type === 'weapon'
      || (item.type === 'artifact' && item.system.artifactType === 'enchantedWeapon');
  }

  /**
   * Find another owned weapon (or enchanted-weapon artifact) of the same
   * melee/ranged category currently equipped, per §8.1's one-melee/
   * one-ranged rule.
   * @returns {Item|undefined}
   */
  #findEquippedSlotConflict() {
    const ranged = this.system.weaponType === 'ranged';
    return this.actor.items.find((i) =>
      i.id !== this.id && i.system.equipped && HeroesGloryItem.#isWeaponLike(i)
      && (i.system.weaponType === 'ranged') === ranged
    );
  }

  /**
   * §5.5/§8.2: `system.modifiers` (the book's own printed table bonus)
   * plus, for an enchanted shield with a level set, a synthesized
   * `+level` Defense modifier — "Герой, который держит в руках щит,
   * имеет бонус +1-5 в зависимости от уровня щита" (стр. 48), and the
   * table's own bonus is explicitly "дополнительный бонус сверх
   * описанного выше" — on top of the level bonus, not instead of it.
   * Synthesized here only, never written back into `system.modifiers`
   * itself — that field stays exactly what the book's table prints (or
   * empty, for an unbranded "Щит (N уровень)" compendium entry).
   * `level` is null by default even for a named shield (docs/rules.md
   * §11: the book never assigns a level to any of the 10 named
   * entries) — a GM fills it in on the specific item once handed out.
   * @returns {Array<{stat:string, mode:string, value:number}>}
   */
  #effectiveModifiers() {
    const modifiers = [...(this.system.modifiers ?? [])];
    if (this.system.artifactType === 'enchantedShield' && this.system.level != null) {
      modifiers.push({ stat: 'defense', mode: 'add', value: this.system.level });
    }
    return modifiers;
  }

  /**
   * Keep this artifact's single auto-managed ActiveEffect in sync with
   * `system.modifiers`/`system.level`/`system.equipped` (via
   * #effectiveModifiers above). Always rebuilds the full effect data and
   * calls `update()` rather than diffing — Foundry only writes an actual
   * change if something differs, so this is simple without being
   * wasteful in practice (an equip toggle recomputes the same `changes`
   * and only `disabled` actually differs; a modifiers/level edit
   * recomputes `changes` and `disabled` stays the same).
   *
   * The effect has `transfer: true` (Foundry's own default for
   * ActiveEffect), so it applies to the owning actor automatically once
   * enabled — no manual transfer plumbing needed.
   * @returns {Promise<void>}
   */
  async #syncModifierEffect() {
    const modifiers = this.#effectiveModifiers();
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
    // v14: visibility is `core.messageMode` passed as a creation option —
    // `core.rollMode` is deprecated, and a `rollMode` key in the message
    // data itself was never read at all.
    const messageMode = game.settings.get('core', 'messageMode');
    const label = `[${item.type}] ${item.name}`;

    // If there's no roll data, send a chat message.
    if (!this.system.formula) {
      ChatMessage.create({
        speaker: speaker,
        flavor: label,
        content: item.system.description ?? '',
      }, { messageMode });
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
        flavor: label,
      }, { messageMode });
      return roll;
    }
  }
}
