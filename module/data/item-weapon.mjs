import HeroesGloryDataModel from "./base-model.mjs";

/**
 * Data model for a weapon (rules.md §8.1).
 */
export default class HeroesGloryWeapon extends HeroesGloryDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.weaponType = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.weaponTypes,
    });
    schema.damage = new fields.NumberField({
      required: true, nullable: false, integer: true, initial: 2, min: 2, max: 50,
    });
    // "где встречается" — free text on origin/source.
    schema.source = new fields.StringField({ required: true, blank: true });
    // Двуручное
    schema.twoHanded = new fields.BooleanField({ initial: false });

    // §8.1/§8.3: whether this weapon is currently wielded — a hero can
    // have at most one equipped melee weapon and one equipped ranged
    // weapon at a time.
    schema.equipped = new fields.BooleanField({ initial: false });

    // Which of the hero sheet's 19 paperdoll positions this weapon is
    // dragged onto (null = not placed there — either unequipped, or
    // equipped via the item sheet's checkbox without ever being dragged
    // to a slot; see hero-sheet.mjs's backpack-membership handling for
    // that case). Purely a display/placement detail — the actual §8.1
    // melee/ranged uniqueness rule is still enforced off `equipped` alone
    // in module/documents/item.mjs, not off this slot number.
    schema.paperdollSlot = new fields.NumberField({
      required: false, nullable: true, integer: true, initial: null, min: 1, max: 19,
    });

    // Deviation from §8.1, which ties the epic table to the weapon's
    // CATEGORY rather than the individual weapon — kept on the weapon
    // item itself per explicit project decision.
    schema.epicTable = new fields.ArrayField(
      new fields.StringField({ blank: true }), { initial: () => Array(6).fill("") }
    );

    return schema;
  }
}
