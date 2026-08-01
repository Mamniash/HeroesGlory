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

    // Deviation from §8.1, which ties the epic table to the weapon's
    // CATEGORY rather than the individual weapon — kept on the weapon
    // item itself per explicit project decision.
    schema.epicTable = new fields.ArrayField(
      new fields.StringField({ blank: true }), { initial: () => Array(6).fill("") }
    );

    return schema;
  }
}
