import HeroesGloryDataModel from "./base-model.mjs";

/**
 * Data model for a "книга магии" (Книга Магии) item (rules.md §6.1/§8.2).
 * Pure presence/placement marker — owning one of these is what makes an
 * actor "have a spellbook" (module/sheets/actor/hero-sheet.mjs's
 * `hasSpellbook` context field), no mechanical fields of its own.
 */
export default class HeroesGlorySpellbook extends HeroesGloryDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    // §8.3: worn/carried status — same shape as weapon/artifact, only
    // relevant to the paperdoll/backpack placement UI, not any rule.
    schema.equipped = new fields.BooleanField({ initial: false });

    // Which of the hero sheet's 19 paperdoll positions this is dragged
    // onto (null = in the backpack instead). See item-weapon.mjs/
    // item-artifact.mjs for the identical pattern this mirrors.
    schema.paperdollSlot = new fields.NumberField({
      required: false, nullable: true, integer: true, initial: null, min: 1, max: 19,
    });

    return schema;
  }
}
