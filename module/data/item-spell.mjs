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

    const int = (initial = 0) => new fields.NumberField({ required: true, nullable: false, integer: true, initial, min: 0 });

    // rules.md §6.4: the variant's effect in structured form, read by
    // castSpell (helpers/spell-effects.mjs). An empty `kind` is a spell
    // still described by text only — it casts as before. Stage 1 fills
    // `damage` for five spells; the other kinds and target modes are
    // reserved for the later stages.
    const effect = () => new fields.SchemaField({
      kind: new fields.StringField({
        required: true, blank: true, initial: '',
        choices: ['damage', 'heal', 'modifier', 'dispel', 'resurrect', 'summon', 'utility'],
      }),
      targeting: new fields.SchemaField({
        // single — one chosen target; chain — the chosen one, then the
        // nearest to each previous; area / visible — later stages.
        mode: new fields.StringField({ required: true, blank: true, initial: '', choices: ['single', 'chain', 'area', 'visible'] }),
        // Экспертный «Работает на количество …, равное СМ» — later stages.
        perMagicPowerTargets: new fields.BooleanField({ initial: false }),
        extraTargets: int(),
        extraFactor: new fields.NumberField({ required: true, nullable: false, initial: 1, min: 0, max: 1 }),
      }),
      // d6 count and flat bonus; `perMagicPower` — «X за СМ», rolled Сила
      // Магии times; `addMagicPower` — «+ СМ» once.
      dice: new fields.SchemaField({
        count: int(),
        flat: int(),
        perMagicPower: new fields.BooleanField({ initial: false }),
        addMagicPower: new fields.BooleanField({ initial: false }),
      }),
      element: new fields.StringField({ required: true, blank: true, initial: '', choices: ['fire', 'ice', 'lightning'] }),
    });

    const variant = () => new fields.SchemaField({
      description: new fields.StringField({ required: true, blank: true }),
      manaCost: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
      effect: effect(),
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
