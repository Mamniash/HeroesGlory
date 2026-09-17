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

    // §5.5/§8.2: only enchanted armor carries a level (1-5) — null for the
    // other 5 artifact types. Enchanted SHIELDS were assumed to carry one
    // too (rules.md previously said so), but the book's own "Зачарованные
    // щиты" table (стр. 48) has no level column or per-item level at all —
    // checked directly against the page images, not carried over from the
    // doc. Fixed in rules.md; left null here for every shield artifact.
    schema.level = new fields.NumberField({
      required: false, nullable: true, integer: true, initial: null, min: 1, max: 5,
    });

    // §8.2, "Зачарованное оружие" (стр. 46): the one artifact type that
    // doubles as a real weapon — same three fields as item-weapon.mjs,
    // blank/false/empty for the other 5 artifact types where they mean
    // nothing. `damage`'s max mirrors item-weapon.mjs's own (book maximum
    // is 60, "Гладиус титана" — same ceiling, same headroom rationale).
    //
    // Populating these fields does NOT make an equipped enchanted weapon
    // attackable like a real weapon yet: templates/actor/actor-hero-sheet.hbs
    // only emits the `data-action="rollAttack"` trigger for
    // `item.type === "weapon"` (paperdoll slot ~line 396, backpack slot
    // ~line 416) — an artifact in the weapon slot currently falls through
    // to "open the item sheet in edit mode, no-op otherwise", same as any
    // other non-weapon paperdoll occupant. `rollAttack` itself (roll-actions.mjs)
    // has no such gate — it only ever reads `weapon.system.damage/weaponType/
    // epicTable`, so it would work unmodified if handed an artifact — the
    // block is purely at the two template call sites. Left as-is on purpose;
    // wiring that up is a separate task.
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
    // with empty row text once something actually calls rollAttack() on it,
    // rather than skipping the epic-cascade UI the way ranged does. Not
    // observable today (nothing calls rollAttack on an artifact — see the
    // comment above), but worth knowing before wiring up that follow-up task.
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
