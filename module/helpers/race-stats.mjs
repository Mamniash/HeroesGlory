/**
 * §2.3: starting Health/Vision/Speed/"урон без оружия" per race. Pure data
 * + pure diff helper — no game/actor references — for the race-change
 * recompute confirmation on the hero sheet (module/sheets/actor/hero-sheet.mjs).
 *
 * demon/djinn/elemental/minotaur were verified directly against book pages
 * 11-12 (page images, not PDF text extraction) — docs/rules.md §11 — and
 * matched the pre-existing values exactly, no corrections needed.
 *
 * `unarmedDamage: null` means "this race uses the book's own default of 1"
 * (§8.1: "без оружия урон = 1, если не сказано иного") — NOT "leave
 * whatever's currently on the sheet". raceDiff below normalizes `null` to
 * 1 before comparing, so a stale override from a previous race (e.g.
 * Vampire's 5) never survives a race change forever.
 * @type {Record<string, {health:number, vision:string, speed:number, unarmedDamage:number|null}>}
 */
export const RACE_STATS = {
  human: { health: 30, vision: 'normal', speed: 6, unarmedDamage: null },
  gnome: { health: 35, vision: 'darkvision', speed: 5, unarmedDamage: null },
  elf: { health: 30, vision: 'nightvision', speed: 8, unarmedDamage: null },
  goblin: { health: 28, vision: 'darkvision', speed: 6, unarmedDamage: null },
  vampire: { health: 30, vision: 'darkvision', speed: 6, unarmedDamage: 5 },
  gnoll: { health: 30, vision: 'normal', speed: 6, unarmedDamage: null },
  demon: { health: 30, vision: 'darkvision', speed: 6, unarmedDamage: null },
  djinn: { health: 30, vision: 'normal', speed: 6, unarmedDamage: 5 },
  elemental: { health: 30, vision: 'normal', speed: 6, unarmedDamage: 5 },
  minotaur: { health: 35, vision: 'darkvision', speed: 5, unarmedDamage: 5 },
  troglodyte: { health: 28, vision: 'blindsense', speed: 6, unarmedDamage: null },
  saurian: { health: 30, vision: 'normal', speed: 6, unarmedDamage: null },
};

/**
 * Localization keys for each race's "особенность" (rules.md pp. 8-13) —
 * shown inert in the recompute-confirm dialog, never auto-applied (these
 * are one-time character-creation bonuses / passive rules, not stat
 * recompute targets). Full text lives in lang/ru.json's HEROES_GLORY.RaceFeature.
 * @type {Record<string, string>}
 */
export const RACE_FEATURE_NOTES = {
  human: 'HEROES_GLORY.RaceFeature.Human',           // переброс одного броска повышения навыка при левел-апе
  gnome: 'HEROES_GLORY.RaceFeature.Gnome',            // цель заклинания: 1d6, на "6" — заклинание не подействовало
  elf: 'HEROES_GLORY.RaceFeature.Elf',                // переброс броска Инициативы
  goblin: 'HEROES_GLORY.RaceFeature.Goblin',          // +1 к кубику в тесте на критическое попадание от Эпика
  vampire: 'HEROES_GLORY.RaceFeature.Vampire',        // лечение на урон оружием живому в ближнем бою, макс. 5
  gnoll: 'HEROES_GLORY.RaceFeature.Gnoll',            // +1 к Защите + перемещение по дикой местности без штрафов
  demon: 'HEROES_GLORY.RaceFeature.Demon',            // Демонология: призыв существа из трупа ценой 5 урона себе
  djinn: 'HEROES_GLORY.RaceFeature.Djinn',            // +1 к Знаниям + стартовое заклинание с Книгой Магии
                                                       // (TODO: как и Elemental.air below, needs a spell compendium
                                                       // before "Волшебная Стрела"/"Молния" can actually be granted)
  elemental: 'HEROES_GLORY.RaceFeature.Elemental',    // выбор стихии — у каждой свой бонус
  minotaur: 'HEROES_GLORY.RaceFeature.Minotaur',      // выбор +1 Атака/+1 СМ, +2 к инициативе, Боевой дух = 1
  troglodyte: 'HEROES_GLORY.RaceFeature.Troglodyte',  // слеповидение + иммунитет к Ослеплению/Гипнозу/Окаменению
  saurian: 'HEROES_GLORY.RaceFeature.Saurian',        // навык "Лечение" на старте + бонус к дальнобойному оружию
};

/**
 * §2.3 pp. 12: the two races whose "особенность" is itself a player pick
 * at character creation (checked against all 12 RACE_FEATURE_NOTES texts —
 * Джинн's own fork is conditional on existing state, not a player choice,
 * so it's not a third entry here). One shared shape for both, so the
 * hero-sheet picker flow (`#onPickRace`/`#pickRaceSubchoice`) and the
 * confirm-dialog bonus preview never branch on *which* race this is.
 *
 * `modifiers` uses the exact same {stat, mode, value} shape as an
 * artifact's `system.modifiers` (helpers/modifiers.mjs) — applied the same
 * way, through `buildEffectChanges` into a real ActiveEffect (see
 * documents/actor.mjs's `#syncRaceSubchoiceEffect`), not written directly
 * into a base field. That's a deliberate departure from how the OTHER
 * racial numbers (Health/Speed/Vision/урон без оружия, RACE_STATS above)
 * are applied: those fields are only ever touched by a race change, so a
 * direct field write survives fine. Attack/Defense/MagicPower are not —
 * `#confirmClassEffectiveChange` (hero-sheet.mjs) unconditionally
 * overwrites them from CLASS_STATS on every class change — so a flat bonus
 * baked into the base field the same way would silently vanish the next
 * time the hero's class changes. An ActiveEffect applies on top of
 * whatever the base currently is and survives that overwrite.
 *
 * `earth`/`attack`/`magicPower` carry real modifiers; `fire`/`water` carry
 * none — both are pure-rules-text bonuses (halved fire damage, breathing
 * underwater) with no number to automate, per rules.md §11/AGENTS.md
 * ("ничего не додумывать"). `air` also carries none *yet* — the "Полёт"
 * spell it should grant needs an actual item-spell entry (school Air,
 * level 5, 4 mana-cost/effect variants — rules.md p. 56) that doesn't
 * exist anywhere in this project (no compendium, no spell has ever been
 * entered as data — confirmed by search before this table was written).
 * Wiring it up is a follow-up once a spell compendium exists — Джинн's own
 * fork (§11) grants "Волшебная Стрела"/"Молния" the exact same way and
 * hits the exact same blocker, so both should land together. Until then,
 * `air`'s bonus is text-only (RACE_FEATURE_NOTES.elemental), same as
 * `fire`/`water`.
 * @type {Record<string, {options: Record<string, {labelKey: string, modifiers: Array<{stat: string, mode: string, value: number}>}>}>}
 */
export const RACE_SUBCHOICES = {
  elemental: {
    options: {
      fire: { labelKey: 'HEROES_GLORY.RaceSubchoiceOption.ElementalFire', modifiers: [] },
      earth: {
        labelKey: 'HEROES_GLORY.RaceSubchoiceOption.ElementalEarth',
        modifiers: [
          { stat: 'health.max', mode: 'add', value: 5 },
          { stat: 'defense', mode: 'add', value: 1 },
        ],
      },
      water: { labelKey: 'HEROES_GLORY.RaceSubchoiceOption.ElementalWater', modifiers: [] },
      // TODO: grant "Полёт" once a spell compendium exists — see this
      // table's own header comment.
      air: { labelKey: 'HEROES_GLORY.RaceSubchoiceOption.ElementalAir', modifiers: [] },
    },
  },
  minotaur: {
    options: {
      attack: {
        labelKey: 'HEROES_GLORY.RaceSubchoiceOption.MinotaurAttack',
        modifiers: [{ stat: 'attack', mode: 'add', value: 1 }],
      },
      magicPower: {
        labelKey: 'HEROES_GLORY.RaceSubchoiceOption.MinotaurMagicPower',
        modifiers: [{ stat: 'magicPower', mode: 'add', value: 1 }],
      },
    },
  },
};

/**
 * @param {string} raceKey
 * @returns {Record<string, {labelKey: string, modifiers: Array<{stat: string, mode: string, value: number}>}>|null}
 *   null for a race with no subchoice (the common case — 10 of 12 races).
 */
export function subchoiceOptionsFor(raceKey) {
  return RACE_SUBCHOICES[raceKey]?.options ?? null;
}

/**
 * @param {string} raceKey
 * @param {string} subchoiceKey
 * @returns {Array<{stat: string, mode: string, value: number}>}   Always an
 *   array, empty when raceKey/subchoiceKey don't resolve to anything (no
 *   subchoice race, unknown key, or a text-only option like Fire/Water) —
 *   callers (documents/actor.mjs's effect sync) treat empty the same as
 *   "no bonus", never null-check.
 */
export function subchoiceModifiersFor(raceKey, subchoiceKey) {
  return RACE_SUBCHOICES[raceKey]?.options?.[subchoiceKey]?.modifiers ?? [];
}

/**
 * @param {string} raceKey
 * @returns {object|null}
 */
export function statsForRace(raceKey) {
  return RACE_STATS[raceKey] ?? null;
}

/**
 * Race illustration for the race-change confirm dialog — one full-body
 * portrait per race, extracted from `docs/OKP_Heroes_Glory_v2_1.pdf`
 * (pp. 8-13, same source as this file's own stats and rules.md §2.3).
 * Each race's own page has two character images (a sharp full-body pose
 * and a smaller, lower-placed "ghost" bust duplicate the book itself uses
 * as a background flourish) plus two blank title-scroll graphics reused
 * across pages — the full-body one was picked by hand for each race,
 * cross-checked against the rendered page, not by a generic largest-image
 * rule (an aspect-ratio heuristic mis-picked the reused blank scroll for
 * three races on a first pass — verified visually afterward, not trusted
 * blind). WebP, not this project's usual PNG: at a resolution with real
 * headroom for `--hg-pixel-scale`'s ×3 ceiling, these painterly/gradient-
 * heavy illustrations came out ~3× smaller as WebP for the same visual
 * quality (measured: PNG total exceeded the project's own budget at any
 * resolution offering scale headroom; WebP stayed comfortably under it).
 * @param {string} raceKey
 * @returns {string|null}   null for an unknown race key.
 */
export function raceIconPath(raceKey) {
  if (!(raceKey in RACE_STATS)) return null;
  return `systems/heroes-glory/assets/races/${raceKey}.webp`;
}

/**
 * lang/ru.json's `RaceDescription.<Key>`/`RaceStartingWeapon.<Key>` loc
 * keys for a race — the rulebook's own paragraph about the race and its
 * paragraph about starting weapon (same source pages as
 * RACE_FEATURE_NOTES, docs/OKP_Heroes_Glory_v2_1.pdf pp. 8-13), shown in
 * the recompute-confirm dialog between the stat diff and the feature note
 * (rules.md §4, hero-sheet.mjs's `#confirmRaceChange`/
 * `#buildRecomputeDialogContent`). Every `RACE_STATS` key just capitalizes
 * to its loc-key suffix (`human` -> `Human`) — no separate lookup map
 * needed here, unlike `RACE_FEATURE_NOTES` (added earlier, before this
 * convention existed).
 * @param {string} raceKey
 * @returns {{descriptionKey: string, weaponKey: string}|null}   null for an unknown race key.
 */
export function raceTextKeysFor(raceKey) {
  if (!(raceKey in RACE_STATS)) return null;
  const suffix = raceKey[0].toUpperCase() + raceKey.slice(1);
  return {
    descriptionKey: `HEROES_GLORY.RaceDescription.${suffix}`,
    weaponKey: `HEROES_GLORY.RaceStartingWeapon.${suffix}`,
  };
}

/**
 * Pure before/after diff. `current` is a plain {healthBase, speed, vision,
 * unarmedDamage} object, not an Actor — callers must pass base
 * (`_source.system`) values, not effective ones.
 * @param {{healthBase:number, speed:number, vision:string, unarmedDamage:number}} current
 * @param {string} raceKey
 * @returns {Record<string, {before:*, after:*}>|null}   null if raceKey is unknown.
 */
export function raceDiff(current, raceKey) {
  const target = statsForRace(raceKey);
  if (!target) return null;
  const diff = {};
  if (current.healthBase !== target.health) diff.healthBase = { before: current.healthBase, after: target.health };
  if (current.speed !== target.speed) diff.speed = { before: current.speed, after: target.speed };
  if (current.vision !== target.vision) diff.vision = { before: current.vision, after: target.vision };
  const targetUnarmed = target.unarmedDamage ?? 1;
  if (current.unarmedDamage !== targetUnarmed) {
    diff.unarmedDamage = { before: current.unarmedDamage, after: targetUnarmed };
  }
  return diff;
}
