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

    // §5.5/§8.2: meaningful for two of the 6 artifact types, each in its
    // own way — null for the other 4. Enchanted ARMOR: gates epic-hit
    // mitigation (§5.5's 5-level table) — level 4-5 read live by
    // roll-actions.mjs's rollAttack (resolveArmorItemMultiplier/
    // resolveDestroyedArmor, rolls.mjs) to halve incoming damage and flag
    // destruction; levels 1-3 (suppressing "Куда попал" itself) not
    // automated yet — separate task. The book's own "Зачарованные
    // доспехи" table (стр. 47) gives all 11 entries a level. Enchanted
    // SHIELDS: feeds a synthesized +level Defense bonus (§5.5: "+1-5 в
    // зависимости от уровня щита") — but unlike armor, the book's own
    // "Зачарованные щиты" table (стр. 48) has no level column at all for
    // any of its 10 entries (checked directly against the page images),
    // so this stays null there until a GM sets one by hand on a specific
    // handed-out item (module/documents/item.mjs's #effectiveModifiers
    // reads it live, no compendium value to fall back on).
    schema.level = new fields.NumberField({
      required: false, nullable: true, integer: true, initial: null, min: 1, max: 5,
    });

    // §8.2, "Зачарованное оружие" (стр. 46): the one artifact type that
    // doubles as a real weapon — same three fields as item-weapon.mjs,
    // blank/false/empty for the other 5 artifact types where they mean
    // nothing. `damage`'s max mirrors item-weapon.mjs's own (book maximum
    // is 60, "Гладиус титана" — same ceiling, same headroom rationale).
    //
    // An equipped enchanted weapon IS attackable like a real weapon:
    // templates/actor/actor-hero-sheet.hbs emits the `data-action="rollAttack"`
    // trigger for `artifactType === "enchantedWeapon"` the same as for
    // `item.type === "weapon"`, at both the paperdoll slot and the backpack
    // slot (commit 4c07a21). `#onRollAttack` (base-actor-sheet.mjs) has no
    // type gate at all — it just looks the item up by id — and `rollAttack`
    // itself (roll-actions.mjs) only ever reads `weapon.system.damage/
    // weaponType/epicTable`, which this schema provides.
    schema.weaponType = new fields.StringField({
      required: true, blank: true, initial: "", choices: CONFIG.HEROES_GLORY.weaponTypes,
    });
    schema.damage = new fields.NumberField({
      required: false, nullable: true, integer: true, initial: null, min: 2, max: 100,
    });
    schema.twoHanded = new fields.BooleanField({ initial: false });
    // §8.1's epic table is per weapon CATEGORY (rules.md, item-weapon.mjs's
    // own comment) — the book's enchanted-weapon table (стр. 46) has no
    // epic-table column at all for any of its 11 entries, unlike the base
    // weapon tables. Left blank for every enchanted weapon regardless of
    // its own `weaponType`, matching how a `ranged` base weapon's epicTable
    // is blank — EXCEPT roll-actions.mjs's `null`-for-ranged override is
    // keyed specifically off `weaponType === "ranged"`, not off "the array
    // is blank"; a blank array on a non-ranged enchanted weapon (e.g.
    // Дробящее/Рубящее/Колющее) would still read as `hasEpicTable: true`
    // with empty row text, rather than skipping the epic-cascade UI the way
    // ranged does. This IS observable today (rollAttack is callable on an
    // artifact — see the comment above) but untouched for now: any fix here
    // is epic-cascade behavior, out of scope for this comment cleanup.
    schema.epicTable = new fields.ArrayField(
      new fields.StringField({ blank: true }), { initial: () => Array(6).fill("") }
    );

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
