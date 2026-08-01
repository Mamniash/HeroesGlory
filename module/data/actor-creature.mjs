import HeroesGloryDataModel from "./base-model.mjs";

/**
 * Data model for a bestiary creature (rules.md §9).
 */
export default class HeroesGloryCreature extends HeroesGloryDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = {};

    schema.attack = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.defense = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    // Flat number; the ×0.5/×1/×2 hit-table multiplier (§5.3) is applied
    // at attack-roll time, not stored as separate values.
    schema.damage = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.attacksCount = new fields.NumberField({ ...requiredInteger, initial: 1, min: 0 });

    // §9 only says "Здоровье: число" — split into value/max purely so
    // Foundry's token resource bars have something to target.
    schema.health = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
    });

    schema.speed = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // §9 says "текст/список" for Особые навыки — modeled as a tag list.
    // Entries are blank-ok so the sheet can render one extra empty input
    // to append a new tag without that blank slot failing validation on
    // every unrelated field edit (the whole form resubmits on each change).
    schema.specialSkills = new fields.ArrayField(
      new fields.StringField({ blank: true }), { initial: [] }
    );

    schema.level = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    schema.faction = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.factions,
    });

    // §5.7 flag only — no legendary combat-rule automation in this pass.
    schema.legendary = new fields.BooleanField({ initial: false });

    // 6 lines of flavour text for an epic hit (§9).
    schema.epicTable = new fields.ArrayField(
      new fields.StringField({ blank: true }), { initial: () => Array(6).fill("") }
    );

    return schema;
  }

  /**
   * Exposes `speed` at the top level of roll data so the default
   * initiative formula `1d20 + @speed` (rules.md §5.1) resolves.
   */
  getRollData() {
    return { ...this };
  }
}
