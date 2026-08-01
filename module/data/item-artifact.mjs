import HeroesGloryDataModel from "./base-model.mjs";

/**
 * Data model for an artifact (rules.md §8.2).
 */
export default class HeroesGloryArtifact extends HeroesGloryDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.artifactType = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.artifactTypes,
    });
    // Bonuses are written as free text in the book (e.g. "+4 к Атаке"),
    // not structured modifiers.
    schema.bonus = new fields.StringField({ required: true, blank: true });

    // §5.5/§8.2: only enchanted armor and enchanted shields carry a level
    // (1-5) — null for the other 4 artifact types.
    schema.level = new fields.NumberField({
      required: false, nullable: true, integer: true, initial: null, min: 1, max: 5,
    });

    // §8.3: worn/wielded status, relevant to the 5-item / 4-magic-item
    // inventory limits.
    schema.equipped = new fields.BooleanField({ initial: false });

    return schema;
  }
}
