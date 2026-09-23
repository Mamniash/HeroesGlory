/**
 * Pure interpretation logic for Heroes & Glory dice rolls (docs/rules.md
 * §5.3, §5.4, §6.3, §7). Every export here is a plain function of its
 * arguments — no `game`, `ui`, `ChatMessage`, `Roll`, or any other Foundry
 * global — so this file can be unit-tested with plain `node --test`.
 * Rolling the actual dice and posting to chat lives in roll-actions.mjs.
 */
import { SCHOOL_ORDER } from './spellbook.mjs';

/**
 * §5.3 hit table. Index 0 is unused so `HIT_TABLE[d6]` reads naturally.
 * @type {Array<{key: string, multiplier: number}|null>}
 */
export const HIT_TABLE = [
  null,
  { key: 'miss', multiplier: 0 },       // 1 — промах
  { key: 'miss', multiplier: 0 },       // 2 — промах
  { key: 'graze', multiplier: 0.5 },    // 3 — задел
  { key: 'hit', multiplier: 1 },        // 4 — попал
  { key: 'strongHit', multiplier: 2 },  // 5 — сильно попал
  { key: 'epic', multiplier: 2 },       // 6 — эпик-попадание
];

/**
 * §5.3: resolve the d6 hit-table result.
 * @param {number} d6   A die face, 1-6.
 * @returns {{die: number, key: string, multiplier: number, epic: boolean}}
 */
export function resolveHit(d6) {
  if (!Number.isInteger(d6) || d6 < 1 || d6 > 6) {
    throw new RangeError(`resolveHit: d6 must be an integer 1-6, got ${d6}`);
  }
  const entry = HIT_TABLE[d6];
  return { die: d6, key: entry.key, multiplier: entry.multiplier, epic: d6 === 6 };
}

/**
 * §5.3: resolve the defeat test. Success if `d20 > Защита(цели) − Атака(атакующего)`.
 * If the target's Защита is at most the attacker's Атака, the test is
 * automatic and no d20 is consulted. If `targetDefense` is missing (no
 * target selected), the test is unresolved rather than assumed either way.
 * @param {object} params
 * @param {number} params.attackerAttack
 * @param {number|null|undefined} params.targetDefense
 * @param {number|null} [params.die]   The d20 result, if one was rolled.
 * @returns {{known: boolean, auto: boolean, threshold: number|null, die: number|null, success: boolean|null}}
 */
export function resolveDefeat({ attackerAttack, targetDefense, die = null } = {}) {
  if (targetDefense === null || targetDefense === undefined) {
    return { known: false, auto: false, threshold: null, die: null, success: null };
  }
  const threshold = targetDefense - attackerAttack;
  const auto = targetDefense <= attackerAttack;
  if (auto) {
    return { known: true, auto: true, threshold, die: null, success: true };
  }
  if (!Number.isInteger(die) || die < 1 || die > 20) {
    throw new RangeError(`resolveDefeat: die must be an integer 1-20, got ${die}`);
  }
  return { known: true, auto: false, threshold, die, success: die > threshold };
}

/**
 * §5.3: `Урон = floor(базовый × множитель)`, 0 on a miss or a failed
 * defeat test, `null` if the defeat test couldn't be resolved (no target).
 * @param {object} params
 * @param {number} params.baseDamage
 * @param {{multiplier: number}} params.hit       Result of {@link resolveHit}.
 * @param {{known: boolean, success: boolean|null}} params.defeat  Result of {@link resolveDefeat}.
 * @returns {number|null}
 */
export function resolveDamage({ baseDamage, hit, defeat }) {
  if (hit.multiplier === 0) return 0;
  if (!defeat.known) return null;
  if (!defeat.success) return 0;
  return Math.floor(baseDamage * hit.multiplier);
}

/**
 * §5.3: the damage a hit *would* deal if the defeat test succeeds —
 * `floor(base × multiplier)` regardless of whether the defeat test has
 * actually been resolved. Used to show a caveated damage figure when no
 * target is selected: the d6 already fixes the multiplier, only the
 * defeat test's outcome is unknown.
 * @param {object} params
 * @param {number} params.baseDamage
 * @param {{multiplier: number}} params.hit   Result of {@link resolveHit}.
 * @returns {number}
 */
export function resolvePotentialDamage({ baseDamage, hit }) {
  if (hit.multiplier === 0) return 0;
  return Math.floor(baseDamage * hit.multiplier);
}

/**
 * §5.4: look up the epic-table row for a d6 roll. `table` is a weapon's or
 * creature's 6-entry epicTable array (index 0 = row "1"). Returns `null`
 * if there's no table at all (e.g. a ranged weapon — §5.4: "Стрелковые
 * атаки эпик-таблиц не имеют").
 * @param {number} d6
 * @param {string[]|null|undefined} table
 * @returns {string|null}
 */
export function resolveEpicTableRow(d6, table) {
  if (!Array.isArray(table) || table.length === 0) return null;
  if (!Number.isInteger(d6) || d6 < 1 || d6 > 6) {
    throw new RangeError(`resolveEpicTableRow: d6 must be an integer 1-6, got ${d6}`);
  }
  return table[d6 - 1] ?? '';
}

/**
 * §5.4/§8.1: whether `table` actually has anything in it — `false` for
 * `null`/`undefined` (no table at all, e.g. a ranged weapon) AND for an
 * array of blank strings (e.g. an enchanted-weapon artifact: the book's
 * "Зачарованное оружие" table has no epic-table column at all, but the
 * schema still keeps the same 6-string `epicTable` shape item-weapon.mjs
 * uses, defaulting to 6 blanks — see item-artifact.mjs's own comment).
 * Without this check, a present-but-blank array would still read as "has
 * an epic table" downstream and trigger the severity/"Куда попал"
 * cascade with empty flavor text on a 6, instead of skipping the whole
 * cascade the way a genuinely absent table does for a ranged weapon.
 * @param {string[]|null|undefined} table
 * @returns {boolean}
 */
export function epicTableHasContent(table) {
  return Array.isArray(table) && table.some((row) => typeof row === 'string' && row.trim() !== '');
}

/**
 * §5.4: which of the epic cascade's two independent d6 rolls should even
 * happen. The book ties only the flavor-text table roll to the weapon
 * having a table — "Для стрелковых атак эпик-таблицы не предусмотрены"
 * sits specifically in the "Таблица эпик-попаданий" paragraph (confirmed
 * against the p.34 flowchart, where "(кроме стрелкового)" labels only the
 * "Описание «как попал»" box, not the severity test or "Куда попал").
 * The severity re-roll and, if severe, the "Куда попал" location roll are
 * not gated by table presence at all — they happen on any epic hit,
 * ranged or melee, table or no table.
 * @param {{epic: boolean}} hit          Result of {@link resolveHit}.
 * @param {string[]|null} epicTable      Already resolved via {@link epicTableHasContent}
 *                                       (null if absent/blank).
 * @returns {{rollFlavor: boolean, rollSeverity: boolean}}
 */
export function planEpicCascade(hit, epicTable) {
  return {
    rollFlavor: !!(hit.epic && epicTable),
    rollSeverity: !!hit.epic,
  };
}

/**
 * §5.4/§5.7: whether the repeated d6 counts as "существенное повреждение".
 * Normally needs a 6; a legendary creature's epic triggers it on a 4+.
 * @param {number} d6
 * @param {object} [options]
 * @param {boolean} [options.legendary=false]
 * @returns {boolean}
 */
export function resolveEpicSeverity(d6, { legendary = false } = {}) {
  if (!Number.isInteger(d6) || d6 < 1 || d6 > 6) {
    throw new RangeError(`resolveEpicSeverity: d6 must be an integer 1-6, got ${d6}`);
  }
  return d6 >= (legendary ? 4 : 6);
}

/**
 * §5.4 "Куда попал" table (the simple 4-outcome version, not the detailed
 * left/right variant given as a parenthetical alternative).
 * @type {string[]}
 */
const HIT_LOCATIONS = ['leg', 'leg', 'arm', 'arm', 'torso', 'head'];

/**
 * §5.4: resolve which body part a severe epic hit lands on.
 * @param {number} d6
 * @returns {string}   One of "leg" | "arm" | "torso" | "head".
 */
export function resolveHitLocation(d6) {
  if (!Number.isInteger(d6) || d6 < 1 || d6 > 6) {
    throw new RangeError(`resolveHitLocation: d6 must be an integer 1-6, got ${d6}`);
  }
  return HIT_LOCATIONS[d6 - 1];
}

/**
 * §6.2/§6.3: maps a spell's school to the secondary-skill key that governs
 * mastery of it.
 * @type {Record<string, string>}
 */
export const SCHOOL_SKILL_KEYS = {
  earth: 'earthMagic',
  air: 'airMagic',
  water: 'waterMagic',
  fire: 'fireMagic',
};

/**
 * The four elemental schools a hero can actually train, in SCHOOL_ORDER's
 * own declared order — Универсальные excluded, since it's never itself a
 * governing school (see resolveUniversalSchool below).
 * @type {string[]}
 */
export const ELEMENTAL_SCHOOLS = SCHOOL_ORDER.filter((school) => school !== 'universal');

/**
 * §6.2/§11: which school an Универсальные spell draws its casting mastery
 * from. The book doesn't address this at all (checked directly against
 * the "Универсальные" table's own page and the page after — no
 * surrounding text, docs/rules.md §11); this is Сеня's own ruling: the
 * hero's single highest-tier elemental school. A tie between two or more
 * schools at the same max tier is deliberately NOT broken here — silently
 * picking one was explicitly rejected as its own silent error (a hero
 * with two Experts would always cast from the same school forever without
 * ever being told there was a choice). The caller must ask the player.
 *
 * `candidateSchools[0]` is always the first tied school in SCHOOL_ORDER —
 * usable as a non-binding PREVIEW (spellbook frame/tooltip) before that
 * ask happens, never as the actual cast resolution when candidateSchools
 * has more than one entry.
 * @param {Record<string, string|null|undefined>} schoolTiers   earth/air/water/fire -> tier ("base"|"advanced"|"expert") or null/undefined if unowned.
 * @returns {{candidateSchools: string[], tier: string|null}}
 *   Empty `candidateSchools` (`tier: null`) means no elemental school is
 *   owned at all. One entry means unambiguous. Two or more means a tie.
 */
export function resolveUniversalSchool(schoolTiers) {
  let bestIndex = -1;
  let candidateSchools = [];
  for (const school of ELEMENTAL_SCHOOLS) {
    const index = SKILL_TIER_ORDER.indexOf(schoolTiers[school]);
    if (index === -1) continue;
    if (index > bestIndex) {
      bestIndex = index;
      candidateSchools = [school];
    } else if (index === bestIndex) {
      candidateSchools.push(school);
    }
  }
  return { candidateSchools, tier: bestIndex === -1 ? null : SKILL_TIER_ORDER[bestIndex] };
}

/**
 * §6.3: which of a spell's four variants applies, based on the hero's
 * tier in the school's secondary skill (or no tier at all, if they don't
 * own that skill).
 * @param {string|null|undefined} skillTier   "base" | "advanced" | "expert" | nullish.
 * @returns {string}   One of "none" | "basic" | "advanced" | "expert".
 */
export function resolveSpellVariant(skillTier) {
  if (skillTier === 'expert') return 'expert';
  if (skillTier === 'advanced') return 'advanced';
  if (skillTier === 'base') return 'basic';
  return 'none';
}

/**
 * §6.3: whether the hero has enough Mana to cast a given variant.
 * @param {number} manaValue
 * @param {number} cost
 * @returns {boolean}
 */
export function canAffordSpell(manaValue, cost) {
  return manaValue >= cost;
}

/**
 * §7: non-combat check total.
 * @param {number} d20
 * @param {number} skillValue
 * @returns {{die: number, skillValue: number, total: number}}
 */
export function resolveAbilityCheck(d20, skillValue) {
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) {
    throw new RangeError(`resolveAbilityCheck: d20 must be an integer 1-20, got ${d20}`);
  }
  return { die: d20, skillValue, total: d20 + skillValue };
}

/**
 * §2.2: Удача moves one step toward 0 each time it's spent on a reroll,
 * whichever side of 0 it started on.
 * @param {number} luck
 * @returns {number}
 */
export function nextLuck(luck) {
  if (luck > 0) return luck - 1;
  if (luck < 0) return luck + 1;
  return 0;
}

/**
 * §2.2: who may spend an actor's Удача to reroll one of its dice.
 * Positive Удача is the player's own resource, spent by whoever owns the
 * actor. Negative Удача hands the *reroll* decision to the Рассказчик —
 * the rulebook's "Отрицательное значение даёт Рассказчику право
 * перебросить кубик игрока" — so only the GM may trigger it.
 * @param {object} params
 * @param {number} params.luck
 * @param {boolean} params.isOwner
 * @param {boolean} params.isGM
 * @returns {boolean}
 */
export function canRerollWithLuck({ luck, isOwner, isGM }) {
  if (luck === 0) return false;
  return luck > 0 ? isOwner : isGM;
}

/**
 * §5.8: attempts already spent against the cap set by |Боевой дух| — the
 * same limit applies whether Боевой дух is positive (extra-turn tests,
 * spent by the owner) or negative (skip-turn tests, spent by an opponent
 * or the Рассказчик).
 * @param {number} morale
 * @param {number} used
 * @returns {number}
 */
export function moraleAttemptsRemaining(morale, used) {
  return Math.max(0, Math.abs(morale) - used);
}

/**
 * §5.8: the d6 both morale tests share — 4+ is the outcome favourable to
 * the acted-upon hero (an extra turn when Боевой дух is positive, or
 * resisting a forced skipped turn when it's negative). Callers attach
 * their own meaning to `passed` for the two directions.
 * @param {number} d6
 * @returns {{die: number, passed: boolean}}
 */
export function resolveMoraleCheck(d6) {
  if (!Number.isInteger(d6) || d6 < 1 || d6 > 6) {
    throw new RangeError(`resolveMoraleCheck: d6 must be an integer 1-6, got ${d6}`);
  }
  return { die: d6, passed: d6 >= 4 };
}

/**
 * §5.6/§4.3: the damage multiplier a target's own combat state adds on
 * top of the d6 hit-table multiplier — prone doubles it, unconscious
 * triples it, the Доспехи specialization halves it. If a target somehow
 * carries both prone and unconscious, unconscious (the more severe
 * state, and the one that implies prone no longer matters —
 * "неподвижна") wins rather than the two compounding multiplicatively;
 * the book gives no rule for that overlap, so this is an explicit
 * interpretation call. Доспехи DOES compound with whichever of those
 * wins (×2×0.5 or ×3×0.5) — the book gives no rule for that combination
 * either, and unlike prone-vs-unconscious there's no "one implies the
 * other no longer applies" reading available here, so straight
 * multiplication is the least invented option.
 * @param {object} [state]
 * @param {boolean} [state.prone=false]
 * @param {boolean} [state.unconscious=false]
 * @param {boolean} [state.armorSpecialization=false]
 * @returns {number}   0.5, 1, 1.5, 2, or 3.
 */
export function resolveTargetStateMultiplier({ prone = false, unconscious = false, armorSpecialization = false } = {}) {
  const stateMultiplier = unconscious ? 3 : prone ? 2 : 1;
  return armorSpecialization ? stateMultiplier * 0.5 : stateMultiplier;
}

/**
 * §5.3/§5.6: fold a target's state multiplier ({@link resolveTargetStateMultiplier})
 * into a {@link resolveHit} result, producing the "effective hit" that
 * resolveDamage/resolvePotentialDamage actually use. Multiplicative, not
 * additive — a state multiplier of 1 (no prone/unconscious/Доспехи) is a
 * no-op, unlike an additive combination which would inflate every hit by
 * a flat +1.
 * @param {{multiplier: number}} hit   Result of {@link resolveHit}.
 * @param {number} stateMultiplier     Result of {@link resolveTargetStateMultiplier}.
 * @returns {object}   `hit` with `multiplier` replaced by the combined value.
 */
export function combineHitAndState(hit, stateMultiplier) {
  return { ...hit, multiplier: hit.multiplier * stateMultiplier };
}

/**
 * §5.9: "ОЗ ≤ 0 → недееспособен до конца боя."
 * @param {number} healthValue
 * @returns {boolean}
 */
export function isIncapacitated(healthValue) {
  return healthValue <= 0;
}

/**
 * §5.9: how much Health/Mana an incapacitated hero wakes up with,
 * whether they passed the post-battle check or were simply helped.
 * @type {number}
 */
export const POST_BATTLE_RECOVERY_HEALTH = 1;
export const POST_BATTLE_RECOVERY_MANA = 1;

/**
 * §5.9: the post-battle survival check for a hero left недееспособен
 * without help — d20, 10 or below dies, above recovers (with
 * {@link POST_BATTLE_RECOVERY_HEALTH}/{@link POST_BATTLE_RECOVERY_MANA}
 * an hour later).
 * @param {number} d20
 * @returns {{die: number, survived: boolean}}
 */
export function resolvePostBattleCheck(d20) {
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) {
    throw new RangeError(`resolvePostBattleCheck: d20 must be an integer 1-20, got ${d20}`);
  }
  return { die: d20, survived: d20 > 10 };
}

/**
 * §4.2/§6.1: resolve a d20 roll against an increasing, contiguous range
 * table (class-stats.mjs's `PRIMARY_SKILL_ROLL_RANGES`/`_FALLBACK`) —
 * which primary skill grows on level-up.
 * @param {number} d20
 * @param {Array<{max:number, key:string}>} ranges   Increasing by `max`,
 *   last entry's `max` must be 20.
 * @returns {string}
 */
export function resolvePrimarySkillRoll(d20, ranges) {
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) {
    throw new RangeError(`resolvePrimarySkillRoll: d20 must be an integer 1-20, got ${d20}`);
  }
  const row = ranges.find((r) => d20 <= r.max);
  return row.key;
}

/**
 * §3/§4.2 rules.md: the secondary-skill d20 table, in order — index 1-19
 * map straight to `CONFIG.HEROES_GLORY.secondarySkills` keys. Index 20 is
 * "Лечение / Некромантия", handled separately (see
 * {@link LEVEL_UP_SKILL_20_BY_FACTION}/{@link resolveSecondarySkillRoll})
 * since its outcome depends on faction, not a fixed key. Index 0 unused so
 * `SECONDARY_SKILL_ROLL_ORDER[d20]` reads naturally.
 * @type {(string|null)[]}
 */
export const SECONDARY_SKILL_ROLL_ORDER = [
  null,
  'assault', 'armor', 'archery', 'tactics', 'interference', 'leadership', 'luck', 'pathfinding',
  'airMagic', 'earthMagic', 'waterMagic', 'fireMagic', 'wisdom', 'intellect', 'mysticism', 'sorcery',
  'diplomacy', 'scouting', 'aptitude',
];

/**
 * §4.2/§6.2 rules.md: row 20 of the secondary-skill table ("Лечение /
 * Некромантия") — every faction resolves to Лечение except Некрополис,
 * which gets Некромантия. An explicit map over all 10 factions (rather
 * than a ternary singling out `necropolis`) so a future faction with a
 * different outcome is a one-line change here, not a logic change.
 * @type {Record<string, string>}
 */
export const LEVEL_UP_SKILL_20_BY_FACTION = {
  castle: 'healing',
  stronghold: 'healing',
  tower: 'healing',
  fortress: 'healing',
  dungeon: 'healing',
  inferno: 'healing',
  necropolis: 'necromancy',
  citadel: 'healing',
  nexus: 'healing',
  haven: 'healing',
};

/**
 * §6.2: resolve a d20 roll against the secondary-skill table. `faction` is
 * only consulted for a roll of 20 (empty/unknown faction falls back to
 * "healing", same as every faction but Некрополис).
 * @param {number} d20
 * @param {object} [params]
 * @param {string} [params.faction]
 * @returns {string}
 */
export function resolveSecondarySkillRoll(d20, { faction } = {}) {
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) {
    throw new RangeError(`resolveSecondarySkillRoll: d20 must be an integer 1-20, got ${d20}`);
  }
  if (d20 === 20) return LEVEL_UP_SKILL_20_BY_FACTION[faction] ?? 'healing';
  return SECONDARY_SKILL_ROLL_ORDER[d20];
}

/**
 * §3: secondary-skill tiers, base -> advanced -> expert, clamped at the
 * top (an already-expert skill has nothing further to gain).
 * @type {string[]}
 */
const SKILL_TIER_ORDER = ['base', 'advanced', 'expert'];

/**
 * @param {string} tier   "base" | "advanced" | "expert".
 * @returns {string}   The next tier up, or `tier` unchanged if already
 *   "expert" (or not a recognized tier).
 */
export function nextTier(tier) {
  const idx = SKILL_TIER_ORDER.indexOf(tier);
  if (idx === -1 || idx === SKILL_TIER_ORDER.length - 1) return tier;
  return SKILL_TIER_ORDER[idx + 1];
}

/**
 * §3 стр.39: Экспертная Обучаемость raises the secondary-skill slot cap
 * from the base 8 to 10. Pure — takes the owned skills as plain
 * `{skillKey, tier}` shapes (an actor's `items.filter(i => i.type ===
 * 'skill').map(i => i.system)`, not real Foundry Items) and the base cap
 * as a parameter, not read from `CONFIG.HEROES_GLORY` directly, so this
 * stays testable without Foundry — see this file's own header comment.
 * `10` is hardcoded here rather than threaded through as a second
 * parameter: it's exactly as fixed a rule number as the base 8 is (same
 * rules.md page), not a config a caller would ever want to vary —
 * matches how e.g. `resolveMoraleCheck`'s own "4+" threshold is written
 * directly in this file rather than passed in.
 *
 * Deliberately re-evaluated from the owned-skills list every time, not
 * cached anywhere: the cap can legitimately drop back to 8 if Экспертная
 * Обучаемость is lost (tier lowered, item deleted) while the hero still
 * owns 9-10 skills — every caller of this function already treats that
 * as "stop offering new ones", not "the old ones vanish", so there's
 * nothing to invalidate.
 * @param {Array<{skillKey: string, tier: string}>} ownedSkills
 * @param {number} baseCount   `CONFIG.HEROES_GLORY.secondarySkillSlotCount` (8).
 * @returns {number}
 */
export function secondarySkillSlotCount(ownedSkills, baseCount) {
  const hasExpertAptitude = ownedSkills.some((s) => s.skillKey === 'aptitude' && s.tier === 'expert');
  return hasExpertAptitude ? 10 : baseCount;
}
