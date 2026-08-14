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
    // inventory limits (the limits themselves aren't enforced in code —
    // see docs/rules.md §8.3).
    schema.equipped = new fields.BooleanField({ initial: false });

    // Which of the hero sheet's 19 paperdoll positions this artifact is
    // dragged onto (null = not placed there). Superseded the old "one
    // equipped slot per artifactType" rule — see module/documents/item.mjs.
    schema.paperdollSlot = new fields.NumberField({
      required: false, nullable: true, integer: true, initial: null, min: 1, max: 19,
    });

    // §8.2: which paperdoll slot(s) this specific artifact is *allowed*
    // to be dragged onto — curated by hand per item (e.g. a ring artifact
    // would list both forearm slots, [2, 7]), not derived from
    // `artifactType` above: several artifact types share the same body
    // slots (both "Зачарованные доспехи" and "Волшебная одежда" can cover
    // head/torso/cloak/legs) and some slots (the rings) have no
    // artifactType of their own, so `artifactType` stays a loot-table
    // category only — see helpers/paperdoll-slots.mjs, which reads this
    // field to validate/highlight paperdoll drops. Empty by default: an
    // artifact with no curated targetSlots can't be placed on the
    // paperdoll yet (still fine in the backpack) until someone sets it.
    schema.targetSlots = new fields.ArrayField(
      new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, max: 19 }),
      { initial: [] },
    );

    // Structured bonuses (§8.2), separate from the free-text `bonus` above
    // — many book bonuses aren't a single number ("Восстанавливает 1 ОЗ за
    // каждый факт нанесения урона") and stay text-only, unmodeled. These
    // are the ones that are just a number on a stat. module/documents/
    // item.mjs syncs this list onto a real embedded ActiveEffect so it
    // actually affects the actor, not just the sheet.
    schema.modifiers = new fields.ArrayField(new fields.SchemaField({
      stat: new fields.StringField({
        required: true, blank: false, initial: 'attack', choices: CONFIG.HEROES_GLORY.artifactModifierStats,
      }),
      mode: new fields.StringField({
        required: true, blank: false, initial: 'add', choices: CONFIG.HEROES_GLORY.artifactModifierModes,
      }),
      value: new fields.NumberField({ required: true, nullable: false, initial: 0 }),
    }), { initial: [] });

    return schema;
  }
}
