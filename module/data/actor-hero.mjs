import HeroesGloryDataModel from "./base-model.mjs";
import { applyWoundPenalty } from "../helpers/wounds.mjs";
import { manaMultiplier } from "../helpers/mana.mjs";

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

    // Здоровье / ОЗ (§2.2). `value` is the current, hand-edited pool.
    // `base` is the race+class starting max (also hand-edited — nothing
    // in rules.md automates it). `max` is recomputed every
    // prepareDerivedData() pass from `base` minus the §5.9 Ранения
    // penalty — like `mana.max`, it exists as a schema field only so
    // Foundry's token resource-bar picker can target it, not because it
    // should ever be edited directly.
    schema.health = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
      base: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0 }),
    });

    schema.speed = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    schema.vision = new fields.StringField({
      required: true, blank: false, initial: "normal",
      choices: CONFIG.HEROES_GLORY.visionTypes,
    });

    schema.luck = new fields.NumberField({ ...requiredInteger, initial: 0, min: -3, max: 3 });
    schema.morale = new fields.NumberField({ ...requiredInteger, initial: 0 });

    // §5.9: Ранения. Each one permanently lowers max Health/Mana by 5
    // (see prepareDerivedData below) until removed — a new level removes
    // one, but level progression isn't automated yet (separate task), so
    // for now this is purely a manual +/- counter on the sheet.
    schema.wounds = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.level = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.experience = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // §4.3: specialization from level 10 (requires expert tier in a skill
    // or owning a spell). The book's full specialization list (p. 23)
    // isn't reproduced in rules.md, so this is free text rather than a
    // choices list.
    schema.specialization = new fields.StringField({ required: true, blank: true });

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

    // Cosmetic only — which of the 10 assets/ui/heroscr4_<color>.png
    // backgrounds the hero sheet renders over.
    schema.panelColor = new fields.StringField({
      required: true, blank: false, initial: "red", choices: CONFIG.HEROES_GLORY.panelColors,
    });

    // §6.1: spells cannot be cast without a Книга Магии. Волшебник/Алхимик
    // start with one; everyone else must buy one for 500 gold.
    schema.hasSpellbook = new fields.BooleanField({ initial: false });

    // Not present in rules.md — generic free-text notes field for the sheet.
    schema.biography = new fields.StringField({ required: true, blank: true });

    return schema;
  }

  prepareDerivedData() {
    // §5.9: Ранения subtract from each base *before* artifact modifiers
    // apply — those run as real Active Effects in the "final" phase,
    // after this method, per modifiers.mjs's DERIVED_STAT_PHASES (checked
    // against the local v14 source: Actor#prepareData runs
    // system.prepareDerivedData() — this method — then applyActiveEffects
    // ("final") only after that returns). Not clamped to `value` —
    // artifacts can still grant bonus Health/Mana beyond this computed
    // cap, so `max` is informational rather than a hard ceiling; only the
    // Ранения floor at 0 is enforced here.
    this.health.max = applyWoundPenalty(this.health.base, this.wounds);
    this.mana.max = applyWoundPenalty(this.knowledge * this.#getManaMultiplier(), this.wounds);
  }

  /**
   * §2.1 / §3: Мана = Знания × 10, or × 12/14/15 if the hero owns a
   * secondary-skill item "Интеллект" at base/advanced/expert tier. The
   * tier→multiplier mapping itself lives in helpers/mana.mjs (pure,
   * unit-tested) — this method only does the Foundry-dependent item
   * lookup that can't be pure.
   * @returns {number}
   */
  #getManaMultiplier() {
    const intellectSkill = this.parent?.items?.find(
      (i) => i.type === "skill" && i.system.skillKey === "intellect"
    );
    return manaMultiplier(intellectSkill?.system.tier ?? null);
  }

  /**
   * Exposes `speed` at the top level of roll data so the default
   * initiative formula `1d20 + @speed` (rules.md §5.1) resolves.
   */
  getRollData() {
    return { ...this };
  }
}
