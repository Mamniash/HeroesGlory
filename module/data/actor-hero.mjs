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

    // §4.2/§6: the level-up dice, persisted rather than held in memory —
    // the level-up window (module/apps/level-up-app.mjs) is a normal
    // closeable ApplicationV2 (close button, Escape, click elsewhere all
    // just close it), and without this the hero could exploit that to
    // reroll for a better outcome (close, reopen, repeat) until the
    // desired result comes up. `null` whenever no level-up is pending;
    // set once when the window first opens for a given targetLevel,
    // cleared back to `null` the moment it's applied. Re-validated (not
    // blindly trusted) on every open — see level-up-app.mjs's own
    // ensurePendingLevelUp.
    schema.pendingLevelUp = new fields.SchemaField({
      // The level this roll is FOR (system.level + 1 at roll time) — lets
      // a stale pending roll (banked from a previous, already-applied
      // level) be detected and discarded rather than reused for the wrong
      // level.
      targetLevel: new fields.NumberField({ ...requiredInteger, min: 1 }),
      primarySkillKey: new fields.StringField({ required: true, blank: false }),
      // §task (was upgradeCandidateItemIds, an array of 0-2): the owned
      // skill (§6.3, book p.16 — "raise ANY already-owned skill by one
      // tier") offered/pre-selected as the upgrade candidate, or null if
      // none is owned below Expert tier. A single field, not an array, now
      // that the level-up window's own picker (roll-actions.mjs's
      // eligibleUpgradeSkillItems) lets the player choose ANY eligible
      // skill directly — the old array's second slot only ever existed to
      // offer a consolation "pick between these two random candidates"
      // when no free skill slot made a real upgrade-vs-new choice possible
      // (§7's old mode 3); once any eligible skill is directly pickable,
      // that second random candidate has nothing left to do.
      upgradeCandidateItemId: new fields.StringField({ required: true, nullable: true, initial: null, blank: false }),
      // A CONFIG.HEROES_GLORY.secondarySkills key, or null if no free
      // slot / no un-owned skill was found (§6.2).
      newCandidateSkillKey: new fields.StringField({ required: true, nullable: true, initial: null, blank: false }),
    }, { required: true, nullable: true, initial: null });

    // §4.3 p.23: specialization from level 10 (requires Expert tier in a
    // skill, or owning a spell — helpers/specializations.mjs has the full
    // book list). A structured reference, not free text — this used to be
    // a plain StringField before the full list was transcribed; never
    // exposed through the UI (see hero-sheet.mjs's own history), so
    // repurposing it isn't a breaking change for anyone. `type`/`key` both
    // blank together means "none chosen"; `type` picks which of `key`'s
    // two independent namespaces applies (a secondarySkills key, or an
    // exact spell name — spells have no stable key elsewhere in this
    // project either, see race-granted-items.mjs's own comment on the
    // same asymmetry).
    schema.specialization = new fields.SchemaField({
      type: new fields.StringField({ required: true, blank: true, initial: "" }),
      key: new fields.StringField({ required: true, blank: true, initial: "" }),
    });

    schema.gold = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // §2.3-2.5
    schema.race = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.races,
    });
    schema.faction = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.factions,
    });
    // §2.5: race+faction+classType uniquely determine a concrete class —
    // the concrete class name itself is never stored, only derived at read
    // time from (faction, classType) via config.mjs's classByFactionAndType
    // — this makes an invalid combination (e.g. a Necromancer from Замок)
    // structurally impossible, and gives a clean fallback ("Воин"/
    // "Волшебник") for a hero without a faction yet. Replaces the old flat
    // `heroClass` field (20 concrete keys) — see migrateData below.
    schema.classType = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.classTypes,
    });

    // §2.3 p. 12: a handful of races have an internal fork the player picks
    // at creation (Элементаль's стихия, Минотавр's Атака/Сила Магии) — see
    // helpers/race-stats.mjs's RACE_SUBCHOICES for the current race's valid
    // keys. No `choices` here: a StringField's choices can't depend on a
    // sibling field's value (which race is even active), so — like
    // `classType`'s validity against `faction` — this is enforced by the
    // hero-sheet picker flow, not the schema. Blank whenever the current
    // race has no subchoice, or none has been picked yet.
    schema.raceSubchoice = new fields.StringField({ required: true, blank: true, initial: "" });

    // Cosmetic only — which of the 10 assets/ui/heroscr4_<color>.png
    // backgrounds the hero sheet renders over. "auto" resolves through the
    // hero's faction (helpers/panel-color.mjs) — any other value is a
    // manual GM override that a later faction change never silently undoes.
    schema.panelColor = new fields.StringField({
      required: true, blank: false, initial: "auto", choices: CONFIG.HEROES_GLORY.panelColors,
    });

    // §8.1: "без оружия урон = 1, если не сказано иного" — race-specific
    // override (Вампир/Джинн/Элементал/Минотавр — see helpers/race-stats.mjs),
    // every other race uses this default as-is.
    schema.unarmedDamage = new fields.NumberField({ ...requiredInteger, initial: 1, min: 0 });

    // Not present in rules.md — generic free-text notes field for the sheet.
    schema.biography = new fields.StringField({ required: true, blank: true });

    return schema;
  }

  /**
   * Legacy `heroClass` (20 concrete class keys) -> `classType`
   * ('warrior'|'mage'). Standard Foundry v14 mechanism for a field
   * rename/reshape — runs on every data-cleaning pass (construction,
   * update), so an actor "self-heals" the next time it's opened/saved,
   * without a separate one-time world-migration script. Deletes the
   * legacy key only once mapping actually succeeds — an unrecognized
   * value is left in `source` (harmless: it's outside the schema, so it
   * never reaches `this.system` and Foundry doesn't warn about it) so a
   * human can fix it manually instead of the data silently vanishing.
   * @override
   */
  static migrateData(source) {
    if (typeof source.heroClass === "string" && source.heroClass && !source.classType) {
      const mappedType = CONFIG.HEROES_GLORY.classTypeByLegacyClassKey[source.heroClass];
      if (mappedType) {
        source.classType = mappedType;
        delete source.heroClass;
      } else {
        console.warn(
          `HeroesGloryHero.migrateData: unrecognized legacy heroClass "${source.heroClass}" ` +
          `on actor ${source._id ?? "(unknown id)"} — leaving heroClass in source, classType ` +
          `left unset. Set this hero's class manually via the identity picker.`,
        );
      }
    }
    return super.migrateData(source);
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
