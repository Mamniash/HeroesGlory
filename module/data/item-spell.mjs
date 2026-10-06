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
    // `damage` for five spells, stage 2 `modifier` for five more; the
    // other kinds and target modes are reserved for the later stages.
    const effect = () => new fields.SchemaField({
      kind: new fields.StringField({
        required: true, blank: true, initial: '',
        choices: ['damage', 'heal', 'modifier', 'dispel', 'resurrect', 'summon', 'utility'],
      }),
      targeting: new fields.SchemaField({
        // single — one chosen target; chain — the chosen one, then the
        // nearest to each previous; area / visible — later stages.
        mode: new fields.StringField({ required: true, blank: true, initial: '', choices: ['single', 'chain', 'area', 'visible'] }),
        // `visible` («в поле зрения»): which creatures it takes — all, all
        // but Нежить and Элементали (Волна Смерти), Нежить only (Уничтожить
        // Нежить) — and whether the caster too (Армагеддон only).
        filter: new fields.StringField({ required: true, blank: true, initial: '', choices: ['notUndeadOrElemental', 'undeadOnly'] }),
        includeCaster: new fields.BooleanField({ initial: false }),
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
      // Stage 2, `modifier`: what the effect changes while it lasts
      // (Сила Магии rounds, rules.md §6.4), one entry per stat — Молитва
      // changes four. Damage stats (`damageDealt`, `melee`/`rangedDamageTaken`)
      // are read by the attack card, «до минимума 1» as `floorOne`; the
      // bearer's own stats (`attack`, `defense`, `speed`, `luck`) by its
      // prepareDerivedData, «до минимума N» as `floor`; `rangedAttack`
      // (Точность) by the attack card, for a ranged attack only.
      modifiers: new fields.ArrayField(new fields.SchemaField({
        stat: new fields.StringField({
          required: true, blank: true, initial: '',
          choices: [
            'damageDealt', 'meleeDamageTaken', 'rangedDamageTaken', 'attack', 'defense', 'speed', 'luck', 'rangedAttack',
            'spellImmunityLevel', 'rangedAttacks', 'noRangedAttacks', 'fireShield', 'counterAttacks',
          ],
        }),
        value: new fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 }),
        floorOne: new fields.BooleanField({ initial: false }),
        floor: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null }),
      })),
      // A hostile spell is resisted (Сопротивление магии, Помехи, Гном —
      // rules.md §11); `excludeUndead` — «не являющееся нежитью».
      hostile: new fields.BooleanField({ initial: false }),
      excludeUndead: new fields.BooleanField({ initial: false }),
      // Молитва: «До конца боя» instead of Сила Магии rounds.
      untilCombatEnd: new fields.BooleanField({ initial: false }),
      // A core status the effect carries — Полет: «fly», an icon only.
      status: new fields.StringField({ required: true, blank: true, initial: '', choices: ['fly', 'blind'] }),
      // Полет (rules.md §11): out of combat the cast is a text card with
      // the Mana spent, not a refusal.
      textOutOfCombat: new fields.BooleanField({ initial: false }),
      // Group А2, Слепота: the d6 the cast needs (4+ / 3+ / 2+); a mind
      // effect (Нежить, Голем, Элементаль, «Иммунитет к Магии Разума», «…к
      // Ослеплению» are immune); the target skips its next turn — not a
      // lasting spell, gone with that turn or any damage (rules.md §11).
      triggerThreshold: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null, min: 1, max: 6 }),
      mindEffect: new fields.BooleanField({ initial: false }),
      skipsTurn: new fields.BooleanField({ initial: false }),
      // Group В, `dispel`: «с выбранного дружественного существа» — only a
      // target on the caster's side (Без Навыка, Базовый).
      friendlyOnly: new fields.BooleanField({ initial: false }),
      // Group В, `resurrect`: the share of maximum Health it gives back (50%
      // or full); `untilCombatEnd` — «В конце битвы персонаж снова погибнет».
      healthFactor: new fields.NumberField({ required: true, nullable: false, initial: 1, min: 0, max: 1 }),
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

  /** A variant's single `modifier` from before stage 2's group А1 becomes `modifiers`. */
  static migrateData(source) {
    for (const variant of Object.values(source.variants ?? {})) {
      const effect = variant?.effect;
      if (effect && 'modifier' in effect) {
        if (!effect.modifiers && effect.modifier?.stat) effect.modifiers = [effect.modifier];
        delete effect.modifier;
      }
    }
    return super.migrateData(source);
  }
}
