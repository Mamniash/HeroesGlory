import HeroesGloryDataModel from "./base-model.mjs";

/**
 * Data model for a player hero (rules.md §2).
 */
export default class HeroesGloryHero extends HeroesGloryDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = {};

    // Primary skills (§2.1)
    schema.attack = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.defense = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.magicPower = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.knowledge = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // Mana (§2.1). `value` is the spendable pool and is the only field that
    // is actually hand-edited/decremented during play. `max` is recomputed
    // every prepareDerivedData() pass from Знания × Интеллект multiplier —
    // it exists as a schema field only so Foundry's token resource-bar
    // picker can target it, not because it should ever be edited directly.
    schema.mana = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
    });

    // Здоровье / ОЗ (§2.2)
    schema.health = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
    });

    schema.speed = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    schema.vision = new fields.StringField({
      required: true, blank: false, initial: "normal",
      choices: CONFIG.HEROES_GLORY.visionTypes,
    });

    schema.luck = new fields.NumberField({ ...requiredInteger, initial: 0, min: -3, max: 3 });
    schema.morale = new fields.NumberField({ ...requiredInteger, initial: 0 });
    schema.level = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.experience = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.gold = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // §2.3-2.5
    schema.race = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.races,
    });
    schema.faction = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.factions,
    });
    // Named `heroClass`, not `class` — `class` is a reserved word in JS.
    schema.heroClass = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.classes,
    });

    // Not present in rules.md — generic free-text notes field for the sheet.
    schema.biography = new fields.StringField({ required: true, blank: true });

    return schema;
  }

  prepareDerivedData() {
    this.mana.max = this.knowledge * this.#getManaMultiplier();
    if (this.mana.value > this.mana.max) this.mana.value = this.mana.max;
  }

  /**
   * §2.1 / §3: Мана = Знания × 10, or × 12/14/15 if the hero owns a
   * secondary-skill item "Интеллект" at base/advanced/expert tier.
   * @returns {number}
   */
  #getManaMultiplier() {
    const intellectSkill = this.parent?.items?.find(
      (i) => i.type === "skill" && i.system.skillKey === "intellect"
    );
    if (!intellectSkill) return 10;
    switch (intellectSkill.system.tier) {
      case "advanced": return 14;
      case "expert": return 15;
      case "base":
      default: return 12;
    }
  }

  /**
   * Exposes `speed` at the top level of roll data so the default
   * initiative formula `1d20 + @speed` (rules.md §5.1) resolves.
   */
  getRollData() {
    return { ...this };
  }
}
