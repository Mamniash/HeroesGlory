import HeroesGloryDataModel from "./base-model.mjs";
import { applyWoundPenalty } from "../helpers/wounds.mjs";
import { manaMultiplier } from "../helpers/mana.mjs";
import { halveBase, initiativeRollParts } from "../helpers/rolls.mjs";
import {
  highestSkillTier, tacticsSpeedBonus, pathfindingSpeedBonus,
  luckSkillBase, leadershipMoraleBase, raceMoraleBonus, resolveLuckTotal,
} from "../helpers/skill-bonuses.mjs";
import { actorSpellModifiers, applySpellStatModifiers } from "../helpers/spell-effects.mjs";
import { effectsDeltaForKey } from "../helpers/modifiers.mjs";
import { pickSpecialization } from "../helpers/specializations.mjs";

/**
 * Heroes already warned about a specialization item with no valid key —
 * `prepareDerivedData` runs on every change, the console gets it once per
 * hero and key.
 * @type {Set<string>}
 */
const warnedUnresolvedSpecializations = new Set();

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

    // Race base only — the hand-edited part. Expert Поиск пути and effects
    // are added in prepareDerivedData(); Тактика never is (first round
    // only, it goes into initiative through getRollData's `tactics`).
    schema.speed = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    schema.vision = new fields.StringField({
      required: true, blank: false, initial: "normal",
      choices: CONFIG.HEROES_GLORY.visionTypes,
    });

    // §2.2/§3: both store only the GM's manual correction. The skill
    // (Удача / Лидерство) and race (Минотавр) parts are added in
    // prepareDerivedData(); Удача's TOTAL is clamped to ±3 there, so the
    // correction itself is unbounded — with expert Удача spent down to
    // −3 it has to reach −6. A reroll spends by moving this correction
    // (rolls.mjs's spendLuck); the post-combat reset writes 0 here, which
    // brings Боевой дух back to its base.
    schema.luck = new fields.NumberField({ ...requiredInteger, initial: 0 });
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

    // §2–§8, book pp. 16–18: hero creation. Everything without a choice is
    // handed out at once when the level picker first raises a hero not
    // created yet (helpers/hero-creation-flow.mjs); this records what, so
    // «Сбросить создание» can take it back: the gold added, the base skill
    // the random roll raised to advanced (p. 16 coincidence rule), the
    // experience before creation, the level picked, and every level-up made
    // up to that level (helpers/hero-creation.mjs's resolveCreationRollback
    // reads this list). `complete` alone doesn't decide "created" — see
    // isHeroCreated. `artifactPending`: the random starting artifact (p. 18,
    // unique in the world) waits for the active GM to hand it out
    // (grantStartingArtifact) — a player's creation can't see the taken set
    // safely. A missing field reads as its initial, no migration.
    schema.creation = new fields.SchemaField({
      complete: new fields.BooleanField({ initial: false }),
      gold: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      upgradedSkillKey: new fields.StringField({ required: true, blank: true, initial: "" }),
      experienceBefore: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      targetLevel: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      levelUps: new fields.ArrayField(new fields.SchemaField({
        primarySkillKey: new fields.StringField({ required: true, blank: true, initial: "" }),
        healthAdded: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
        grantedItemId: new fields.StringField({ required: true, nullable: true, initial: null, blank: false }),
        upgradedItemId: new fields.StringField({ required: true, nullable: true, initial: null, blank: false }),
        upgradedFromTier: new fields.StringField({ required: true, nullable: true, initial: null, blank: false }),
      })),
      artifactPending: new fields.BooleanField({ initial: false }),
    });

    // §4.3 p.23: the specialization is an item now (item-specialization.mjs).
    // This is the old stored field, kept in the schema only so the world
    // migration (helpers/specialization-migration.mjs) can read it and then
    // delete it from the database — a deletion of a key outside the schema
    // never reaches the database, and writing `system` whole would run it
    // through the schema's cleaning (both checked live). In memory
    // prepareDerivedData puts the derived {type, key} over it, as it does for
    // `mana.max`; `_source` keeps what is stored, and nothing writes the
    // derived value back. Not required: once deleted it stays absent.
    schema.specialization = new fields.SchemaField({
      type: new fields.StringField({ required: true, blank: true, initial: "" }),
      key: new fields.StringField({ required: true, blank: true, initial: "" }),
    }, { required: false });

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
    this.#prepareSpecialization();
    this.#prepareUnrested();
    this.health.max = applyWoundPenalty(this.health.base, this.wounds);
    this.mana.max = applyWoundPenalty(this.knowledge * this.#getManaMultiplier(), this.wounds);
    // §6.4, group А1: lasting spells on Атака / Защита (after «Без отдыха»
    // and artifacts), Скорость and Удача (in #prepareSkillDerivedStats).
    // `spellParts` (not a schema field) — each stat's change, for tooltips.
    const spellModifiers = actorSpellModifiers(this.parent?.effects ?? []);
    this.spellParts = {
      attack: this.#applySpells("attack", spellModifiers),
      defense: this.#applySpells("defense", spellModifiers),
    };
    this.#prepareSkillDerivedStats(spellModifiers);
  }

  /**
   * §4.3: `specialization` ({type, key}, or both blank) from the hero's
   * specialization item — the first by sort, then id, if somehow there are
   * two (pickSpecialization); `specializationCount` — how many there are,
   * for the sheet's warning. `specialization` overrides the old stored field
   * in memory only (`_source` keeps it); the other two are no schema
   * fields. An item whose key is
   * none of the 12 doesn't count, and says so in the console.
   */
  #prepareSpecialization() {
    const items = (this.parent?.items ?? []).filter((i) => i.type === "specialization")
      .map((i) => ({ id: i.id, sort: i.sort, key: i.system.key, name: i.name }));
    const picked = pickSpecialization(items);
    this.specialization = picked.spec ?? { type: "", key: "" };
    this.specializationItemId = picked.itemId;
    this.specializationCount = picked.count;
    if (!picked.spec) {
      for (const { id, key } of picked.unresolved) {
        const tag = `${this.parent?.name}:${id}:${key}`;
        if (warnedUnresolvedSpecializations.has(tag)) continue;
        warnedUnresolvedSpecializations.add(tag);
        console.warn(`heroes-glory | hero "${this.parent?.name}" has a specialization item with key "${key}", which is none of the 12 — the hero has no specialization`);
      }
    }
  }

  /**
   * One stat under the lasting spells on this hero (applySpellStatModifiers:
   * they add up, «до минимума N» keeps the value from going below N).
   * @param {"attack"|"defense"|"speed"} key
   * @param {object[]} spellModifiers   actorSpellModifiers' result
   * @returns {number}   the change
   */
  #applySpells(key, spellModifiers) {
    const { value, delta } = applySpellStatModifiers(this[key], spellModifiers.filter((m) => m.stat === key));
    this[key] = value;
    return delta;
  }

  /**
   * §5.10 (p. 33): «Без отдыха» — "Базовые характристики… снижаются вдвое":
   * each primary skill's stored base is halved (rounded down) and whatever
   * "initial"-phase effects added is kept on top (§11). Runs first, so
   * Mana's max below already follows the halved Знания. `unrestedParts`
   * (not a schema field) feeds the sheet's tooltips; `null` when rested.
   */
  #prepareUnrested() {
    this.unrestedParts = null;
    const unrested = this.parent?.statuses?.has(CONFIG.HEROES_GLORY.statusEffects.unrested);
    if (!unrested) return;
    this.unrestedParts = {};
    for (const key of ["attack", "defense", "magicPower", "knowledge"]) {
      const base = this._source[key];
      const halved = halveBase(base);
      this[key] += halved - base;
      this.unrestedParts[key] = { base, halved };
    }
  }

  /**
   * §3: Скорость / Удача / Боевой дух from secondary skills and race. By
   * the time this runs, "initial"-phase Active Effects (artifacts, the
   * leg wound) have already been applied on top of `_source`, so the
   * difference between the two is the effects part. The `*Parts` objects
   * are not schema fields — they exist only for the sheet's tooltips and
   * for spending Удача.
   */
  /** Active effects of equipped artifacts (rules.md §8.2). */
  #artifactEffects() {
    const actor = this.parent;
    if (!actor?.allApplicableEffects) return [];
    return [...actor.allApplicableEffects()]
      .filter((e) => e.active && e.flags?.["heroes-glory"]?.artifactModifiers);
  }

  #prepareSkillDerivedStats(spellModifiers = []) {
    const source = this._source;
    const owned = (this.parent?.items ?? [])
      .filter((i) => i.type === "skill")
      .map((i) => ({ skillKey: i.system.skillKey, tier: i.system.tier }));
    const tier = (key) => highestSkillTier(owned, key);

    const pathfinding = pathfindingSpeedBonus(tier("pathfinding"));
    this.tactics = tacticsSpeedBonus(tier("tactics"));
    // Effects split for the tooltip: equipped artifacts' modifiers
    // (documents/item.mjs's flagged effect) apart from the rest (рана в ногу).
    const effectsTotal = this.speed - source.speed;
    const artifacts = effectsDeltaForKey(this.#artifactEffects(), "system.speed");
    this.speedParts = {
      base: source.speed,
      pathfinding,
      artifacts,
      effects: effectsTotal - artifacts,
      tactics: this.tactics,
    };
    this.speed += pathfinding;
    this.speedParts.spells = this.#applySpells("speed", spellModifiers);
    this.spellParts.speed = this.speedParts.spells;
    this.speedParts.total = this.speed;
    this.speedParts.firstRound = this.speed + this.tactics;

    // Удача / Неудача (pp. 55, 60): a part of the sum before the ±3 clamp,
    // which gives «до максимума в 3» / «до минимума в -3» by itself.
    // `luckSpells` — each spell's own value, spent first (spendLuckWithSpells).
    this.luckSpells = spellModifiers.filter((m) => m.stat === "luck")
      .map((m) => ({ effectId: m.effectId, value: m.value }));
    const spells = this.luckSpells.reduce((sum, m) => sum + m.value, 0);
    const luckParts = { skill: luckSkillBase(tier("luck")), manual: source.luck, effects: this.luck - source.luck, spells };
    const luckTotal = resolveLuckTotal({ ...luckParts, effects: luckParts.effects + spells });
    this.luckParts = { ...luckParts, ...luckTotal };
    this.spellParts.luck = spells;
    this.luck = luckTotal.total;

    this.moraleParts = {
      skill: leadershipMoraleBase(tier("leadership")),
      race: raceMoraleBonus(this.race),
      manual: source.morale,
      effects: this.morale - source.morale,
    };
    this.morale += this.moraleParts.skill + this.moraleParts.race;
    this.moraleParts.total = this.morale;
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
   * Exposes `speed`, `tactics` and `initiativeBonus` at the top level of
   * roll data so the initiative formula `1d20 + @speed + @tactics +
   * @initiativeBonus` (rules.md §5.1, §3 Тактика) resolves: Минотавр +2
   * (p. 12), «не обнаружил врага» −10 and no Тактика (p. 25).
   */
  getRollData() {
    const surprised = !!this.parent?.statuses?.has(CONFIG.HEROES_GLORY.statusEffects.surprised);
    return { ...this, ...initiativeRollParts({ race: this.race, tactics: this.tactics, surprised }) };
  }
}
