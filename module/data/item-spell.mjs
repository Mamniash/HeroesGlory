import HeroesGloryDataModel from "./base-model.mjs";

/**
 * Data model for a spell (rules.md §6.1-6.3).
 *
 * Every spell has FOUR variants, one per level of school mastery, each
 * with its own effect description AND its own mana cost — the schema
 * must not be collapsed to a single description/cost pair.
 *
 * There is no `duration` field: default duration equals the caster's
 * Сила Магии in rounds (§6.1), a runtime value dependent on whoever is
 * casting, not a property of the spell definition itself.
 */
export default class HeroesGlorySpell extends HeroesGloryDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.school = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.schools,
    });
    schema.level = new fields.NumberField({
      required: true, nullable: false, integer: true, initial: 1, min: 1, max: 5,
    });
    // §6.1: default range is 24 cells unless the spell says otherwise.
    schema.range = new fields.NumberField({
      required: true, nullable: false, integer: true, initial: 24, min: 0,
    });

    const variant = () => new fields.SchemaField({
      description: new fields.StringField({ required: true, blank: true }),
      manaCost: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
    });

    schema.variants = new fields.SchemaField({
      none: variant(),      // Без Навыка
      basic: variant(),     // Базовый Навык
      advanced: variant(),  // Продвинутый Навык
      expert: variant(),    // Экспертный Навык
    });

    return schema;
  }
}
