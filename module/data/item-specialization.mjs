import HeroesGloryDataModel from "./base-model.mjs";
import { specializationFromKey, specializationLabelKeys } from "../helpers/specializations.mjs";

/**
 * Data model for a hero's specialization (rules.md §4.3, book p. 23) — one of
 * the 12, as an item so it can be seen in the compendium «Специализации» and
 * dragged onto a hero. Only the key and the book text are stored: the name,
 * icon, condition and effect all follow the key (helpers/specializations.mjs);
 * the hero derives `system.specialization` from this item (actor-hero.mjs).
 */
export default class HeroesGlorySpecialization extends HeroesGloryDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    // One of the 12 (a closed list): a secondary-skill key or the book's
    // spell name — the two never overlap, so the key says which group.
    // Blank — a fresh item, not a specialization yet.
    schema.key = new fields.StringField({
      required: true, blank: true, initial: "", choices: () => specializationLabelKeys(),
    });

    // The book's text (p. 23), copied from the compendium entry.
    schema.description = new fields.StringField({ required: true, blank: true, initial: "" });

    return schema;
  }

  /**
   * `{type, key}` — the same shape as the hero's `system.specialization` —
   * or null for a blank key.
   * @type {{type: 'skill'|'spell', key: string}|null}
   */
  get spec() {
    return specializationFromKey(this.key);
  }
}
