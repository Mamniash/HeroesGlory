import HeroesGloryDataModel from "./base-model.mjs";

/**
 * Data model for one owned secondary skill (rules.md §3).
 *
 * A hero owns these as items rather than storing them inline, so a
 * skill can be dragged/dropped and its tier/effects text edited
 * independently.
 */
export default class HeroesGlorySkill extends HeroesGloryDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.skillKey = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.secondarySkills,
    });
    schema.tier = new fields.StringField({
      required: true, blank: false, initial: "base", choices: CONFIG.HEROES_GLORY.skillTiers,
    });

    // Effect text per tier, transcribed from the book's tables (pp. 36-39).
    schema.effects = new fields.SchemaField({
      base: new fields.StringField({ required: true, blank: true }),
      advanced: new fields.StringField({ required: true, blank: true }),
      expert: new fields.StringField({ required: true, blank: true }),
    });

    return schema;
  }
}
