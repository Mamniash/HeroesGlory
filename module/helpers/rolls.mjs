/**
 * Pure interpretation logic for Heroes & Glory dice rolls (docs/rules.md
 * §5.3, §5.4, §6.3, §7). Every export here is a plain function of its
 * arguments — no `game`, `ui`, `ChatMessage`, `Roll`, or any other Foundry
 * global — so this file can be unit-tested with plain `node --test`.
 * Rolling the actual dice and posting to chat lives in roll-actions.mjs.
 */
import { SCHOOL_ORDER } from './spellbook.mjs';
import { resolveLuckTotal } from './skill-bonuses.mjs';

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

/** §9/§11: the special-skill tag the book gives every shooting creature (p. 115). */
export const CREATURE_ARCHER_TAG = 'Стрелок';

/**
 * §9/§11: whether a creature can choose between melee and ranged attacks —
 * only one tagged exactly «Стрелок». Creatures that shoot without the tag
 * are left melee-only: the book gave them just the melee epic table.
 * @param {string[]|null|undefined} specialSkills
 * @returns {boolean}
 */
export function isCreatureArcher(specialSkills) {
  return (specialSkills ?? []).some((skill) => typeof skill === 'string' && skill.trim() === CREATURE_ARCHER_TAG);
}

/**
 * §5.4/§11: which epic table an attack uses; `null` means no flavor row
 * (the severity roll and «Куда попал» still happen — planEpicCascade).
 * A ranged weapon has none; neither does a creature's ranged attack,
 * which only an archer can make (its table is labelled «Атаки в ближнем
 * бою»). A blank table (enchanted-weapon artifact) counts as none.
 * @param {object} args
 * @param {{weaponType: string, epicTable: string[]|null}|null} [args.weapon]  weapon.system, or null for a creature's own attack
 * @param {string[]|null} [args.creatureEpicTable]
 * @param {string[]|null} [args.creatureSpecialSkills]
 * @param {boolean} [args.ranged]  creature ranged attack requested
 * @returns {string[]|null}
 */
export function resolveAttackEpicTable({ weapon = null, creatureEpicTable = null, creatureSpecialSkills = null, ranged = false }) {
  const raw = weapon
    ? (weapon.weaponType === 'ranged' ? null : weapon.epicTable)
    : (ranged && isCreatureArcher(creatureSpecialSkills) ? null : creatureEpicTable);
  return epicTableHasContent(raw) ? raw : null;
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
 * §2.2: the new stored manual correction after spending one Удача on a
 * hero whose total is skill + manual + effects, clamped to ±3. Only the
 * manual part is stored, so it must move by whatever brings the TOTAL
 * one step toward 0 — subtracting 1 from the manual part alone would do
 * nothing while the raw sum sits above the clamp (skill 3 + artifact +1).
 * A zero total spends nothing.
 * @param {{skill: number, manual: number, effects: number}} parts
 * @returns {number}
 */
export function spendLuck({ skill, manual, effects }) {
  const { total } = resolveLuckTotal({ skill, manual, effects });
  if (total === 0) return manual;
  return nextLuck(total) - skill - effects;
}

/**
 * Мудрость, p. 38: "Позволяет использовать заклинания 3-го уровня" / 4 /
 * 5 — without it, levels 1–2 (rules.md §11).
 * @param {'base'|'advanced'|'expert'|null} wisdomTier
 * @returns {number}
 */
export function maxSpellLevel(wisdomTier) {
  switch (wisdomTier) {
    case 'base': return 3;
    case 'advanced': return 4;
    case 'expert': return 5;
    default: return 2;
  }
}

/**
 * §6.1/§11: whether a hero may cast a spell of this level. Race-granted
 * spells (Элементаль Воздуха's «Полет», p. 12) are exempt.
 * @param {object} params
 * @param {number} params.spellLevel
 * @param {'base'|'advanced'|'expert'|null} params.wisdomTier
 * @param {boolean} [params.raceGranted]
 * @returns {boolean}
 */
export function canCastSpellLevel({ spellLevel, wisdomTier, raceGranted = false }) {
  return raceGranted || spellLevel <= maxSpellLevel(wisdomTier);
}

/**
 * §6.1 (p. 32: "Для сотворения заклинаний необходимо прежде всего иметь
 * Книгу заклинаний"): without a Книга Магии only race-granted spells
 * cast — Элементаль Воздуха's «Полет», p. 12: "Даже если у вас нет Книги
 * Магии, вы все равно можете его использовать".
 * @param {object} params
 * @param {boolean} params.hasSpellbook
 * @param {boolean} [params.raceGranted]
 * @returns {boolean}
 */
export function canCastWithoutSpellbook({ hasSpellbook, raceGranted = false }) {
  return hasSpellbook || raceGranted;
}

/**
 * The lowest Мудрость tier that unlocks a spell level — `null` for levels
 * 1–2, which need none. For the "requires Мудрость (…)" message.
 * @param {number} spellLevel
 * @returns {'base'|'advanced'|'expert'|null}
 */
export function wisdomTierForSpellLevel(spellLevel) {
  if (spellLevel >= 5) return 'expert';
  if (spellLevel === 4) return 'advanced';
  if (spellLevel === 3) return 'base';
  return null;
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
 * §5.3/§5.6/§5.5: fold a target's state multiplier
 * ({@link resolveTargetStateMultiplier}) and equipped-armor-item multiplier
 * ({@link resolveArmorItemMultiplier}) into a {@link resolveHit} result,
 * producing the "effective hit" that resolveDamage/resolvePotentialDamage
 * actually use. Multiplicative, not additive — a multiplier of 1 (no
 * prone/unconscious/Доспехи-специализация/доспех 4-5 уровня) is a no-op,
 * unlike an additive combination which would inflate every hit by a flat
 * amount. `armorItemMultiplier` defaults to 1 so every existing call site
 * (and test) that only ever combined hit+state keeps working unchanged.
 * @param {{multiplier: number}} hit   Result of {@link resolveHit}.
 * @param {number} stateMultiplier     Result of {@link resolveTargetStateMultiplier}.
 * @param {number} [armorItemMultiplier=1]   Result of {@link resolveArmorItemMultiplier}.
 * @returns {object}   `hit` with `multiplier` replaced by the combined value.
 */
export function combineHitAndState(hit, stateMultiplier, armorItemMultiplier = 1) {
  return { ...hit, multiplier: hit.multiplier * stateMultiplier * armorItemMultiplier };
}

/**
 * §5.5 (уровни 4-5, docs/rules.md §11): "любой урон снижается вдвое" —
 * принятое решение применяет это БЕЗ привязки к защищённой части тела ни
 * для уровня 5 (буквально по книге — там и нет такой оговорки), ни для
 * уровня 4 (сознательное отступление от буквального «по защищённой части
 * тела»: при строгом чтении условие требует «Куда попал», которая
 * бросается только на существенном эпик-попадании — 1 случай из ~36 — что
 * явно не похоже на замысел книги, раз уровень 5 описан как усиление
 * того же эффекта, а не как что-то принципиально другое. Решение принято
 * осознанно, не додумано мной — не баг).
 *
 * Применяется РОВНО ОДИН РАЗ, даже если у цели одновременно надето
 * несколько предметов брони 4-5 уровня (шлем + нагрудник + поножи не
 * компаундятся в 0.25 и меньше) — `.some(...)`, не суммирование.
 * @param {Array<{level: number}>} equippedArmor   Every equipped
 *   enchanted-armor item on the target with a known level (nullish levels
 *   already filtered out by the caller).
 * @returns {number}   0.5 if any equipped piece is level 4 or 5, else 1.
 */
export function resolveArmorItemMultiplier(equippedArmor) {
  return equippedArmor.some((item) => item.level >= 4) ? 0.5 : 1;
}

/**
 * §5.4/§5.5: which "Куда попал" location maps to which paperdoll slot —
 * the same assumption already accepted for targetSlots curation
 * (docs/rules.md §11: голова↔slot_3, торс↔slot_5, нога↔slot_9, not a
 * book fact, an explicit project decision). Deliberately has no `arm`
 * key — no armor entry (book or "Доспех (N уровень)") has ever been
 * curated onto a forearm slot (2/7), because the book has no armor for
 * arms at all. That absence, not a special-cased exclusion, is what
 * makes "рука" never protectable below: resolveArmorZoneProtection just
 * finds no slot to look up.
 * @type {Record<string, number>}
 */
const LOCATION_TO_SLOT = { leg: 9, torso: 5, head: 3 };

/**
 * §5.5 (уровни 1-3): which equipped level-1-3 armor piece, if any,
 * actually covers a "Куда попал" location — the single source both
 * rollAttack and rerollAttackDie's hit-reroll branch read (via
 * applyLocationConsequence, roll-actions.mjs) so neither can diverge.
 * Only ever returns a level 1-3 piece — level 4-5's own mitigation
 * (resolveArmorItemMultiplier) doesn't care about zone at all, so a
 * level 4-5 piece occupying the matching slot is irrelevant here.
 * @param {string|null} location   A resolveHitLocation result, or null
 *   (not epic, not severe, or reroll hasn't happened yet).
 * @param {Array<{name:string, level:number, targetSlots:number[]}>} equippedArmor
 * @returns {{name:string, level:number, targetSlots:number[]}|null}
 */
export function resolveArmorZoneProtection(location, equippedArmor) {
  const slot = LOCATION_TO_SLOT[location];
  if (slot == null) return null;
  return equippedArmor.find((item) => item.level >= 1 && item.level <= 3 && (item.targetSlots ?? []).includes(slot)) ?? null;
}

/**
 * §5.5 (уровни 1-3): the damage multiplier a zone-matching protector
 * contributes — 0 for level 3 ("урон... полностью снимается"), 0.5 for
 * level 2 ("снижает урон эпика вдвое"), 1 for level 1 (explicitly
 * excludes урон — "кроме урона") or no protector at all.
 * @param {{level:number}|null} protectingItem   Result of {@link resolveArmorZoneProtection}.
 * @returns {number}
 */
export function resolveArmorZoneMultiplier(protectingItem) {
  if (!protectingItem) return 1;
  if (protectingItem.level === 3) return 0;
  if (protectingItem.level === 2) return 0.5;
  return 1; // level 1
}

/**
 * §5.5: which equipped armor breaks on an epic hit — two different
 * conditions for two different reasons (docs/rules.md §11), not one
 * rule loosely applied to both:
 * - level 4: unconditional — "Доспех при этом разрушается" isn't
 *   qualified by zone for THIS level's own damage mitigation either
 *   (Подход 2's deliberate departure from "по защищённой части тела"),
 *   so its destruction stays consistent with that same departure.
 * - levels 1-3: "Доспех ПРИ ЭТОМ разрушается" — "при этом" ties
 *   destruction to the mitigation actually firing this specific hit, so
 *   only the ONE piece resolveArmorZoneProtection found (if any) breaks
 *   — a doспех on the leg does not break from a hit to the head it
 *   never protected.
 * Level 5 never breaks (§5.5's own text says so explicitly) — never
 * appears in either branch. Returns the items themselves (not deleted),
 * so the caller can only report this in chat — the item is never
 * touched (docs/rules.md §11).
 * @param {boolean} epic   Result of {@link resolveHit}'s `.epic`.
 * @param {Array<{name:string, level:number}>} equippedArmor   Same shape as {@link resolveArmorItemMultiplier}.
 * @param {{name:string, level:number}|null} protectingItem   Result of {@link resolveArmorZoneProtection}.
 * @returns {Array<{name:string, level:number}>}   The subset that breaks — empty if not epic or none qualify.
 */
export function resolveDestroyedArmor(epic, equippedArmor, protectingItem) {
  if (!epic) return [];
  const unconditional = equippedArmor.filter((item) => item.level === 4);
  const zoneProtected = protectingItem && protectingItem.level >= 1 && protectingItem.level <= 3 ? [protectingItem] : [];
  return [...unconditional, ...zoneProtected];
}

/**
 * §5.4/§5.5/§5.6/§task: which mechanical consequence a severe epic hit's
 * "Куда попал" result should cause on the target — the pure decision half
 * of what used to be `applyLocationConsequence` (roll-actions.mjs), split
 * out so the GM-confirm step (which now owns the actual Foundry mutation)
 * has nothing left to decide, only to execute. A zone-matching level 1-3
 * armor piece (`protectingItem`, {@link resolveArmorZoneProtection})
 * suppresses the consequence entirely, same as before — "кроме урона",
 * handled separately by {@link resolveArmorZoneMultiplier}. No `'arm'`
 * case: a hit to the arm never had a mechanical effect (chat-text-only,
 * "роняет предмет" — never touched inventory), so it falls through to
 * `'none'` same as an unprotected arm always did.
 * @param {string|null} location   A resolveHitLocation result, or null.
 * @param {{name:string, level:number}|null} protectingItem   Result of
 *   {@link resolveArmorZoneProtection}.
 * @returns {{type: 'none'|'prone'|'unconscious'|'legEffect'}}
 */
export function resolveLocationConsequenceType(location, protectingItem) {
  if (protectingItem) return { type: 'none' };
  if (location === 'torso') return { type: 'prone' };
  if (location === 'head') return { type: 'unconscious' };
  if (location === 'leg') return { type: 'legEffect' };
  return { type: 'none' };
}

/**
 * §5.3/§5.4/§5.5/§5.6/§task: everything about an attack's outcome,
 * resolved once from the frozen `reroll` flag snapshot a chat message
 * carries — the single source both the card's display (buildAttackContext,
 * roll-actions.mjs) and the GM-confirm step's actual application
 * (confirmAttackOutcome, same file) read, so what the GM sees on the card
 * and what gets applied to the target on confirm can never diverge. Pure
 * — no Foundry calls, independently testable, unlike the two callers
 * above which are Foundry-facing and only verified live.
 * @param {object} flags   Same shape rollAttack/rerollAttackDie persist.
 * @returns {{
 *   hit: {die:number, key:string, multiplier:number, epic:boolean},
 *   defeat: {known:boolean, auto:boolean, threshold:number|null, die:number|null, success:boolean|null},
 *   damage: number|null, damageKnown: boolean, potentialDamage: number,
 *   armorItemMultiplier: number, armorZoneMultiplier: number,
 *   protectingItem: {name:string, level:number}|null,
 *   destroyedArmor: Array<{name:string, level:number}>,
 *   consequence: {type: 'none'|'prone'|'unconscious'|'legEffect'},
 * }}
 */
export function resolveAttackResolution(flags) {
  const hit = resolveHit(flags.hitDie);
  const defeat = resolveDefeat({
    attackerAttack: flags.attackerAttack,
    targetDefense: flags.targetDefense,
    die: flags.defeatDie,
  });
  const equippedArmor = flags.equippedArmor ?? [];
  const armorItemMultiplier = resolveArmorItemMultiplier(equippedArmor);
  const protectingItem = resolveArmorZoneProtection(flags.location, equippedArmor);
  const armorZoneMultiplier = resolveArmorZoneMultiplier(protectingItem);
  const effectiveHit = combineHitAndState(hit, flags.stateMultiplier, armorItemMultiplier * armorZoneMultiplier);
  const damage = resolveDamage({ baseDamage: flags.baseDamage, hit: effectiveHit, defeat });
  const potentialDamage = resolvePotentialDamage({ baseDamage: flags.baseDamage, hit: effectiveHit });
  const destroyedArmor = resolveDestroyedArmor(hit.epic, equippedArmor, protectingItem);
  const consequence = resolveLocationConsequenceType(flags.location, protectingItem);
  return {
    hit, defeat, damage, damageKnown: damage !== null, potentialDamage,
    armorItemMultiplier, armorZoneMultiplier, protectingItem, destroyedArmor, consequence,
  };
}

/**
 * §task: whether an attack card's proposed outcome may still be applied —
 * `false` once already confirmed (the double-apply guard: checked first
 * in confirmAttackOutcome, before any Foundry mutation), and `false` when
 * there was never a real target to apply anything to in the first place
 * (no confirm button renders at all in that case — see buildAttackContext
 * reading this same function for its own `canConfirm` field).
 * @param {object|null|undefined} flags
 * @returns {boolean}
 */
export function canConfirmAttack(flags) {
  return !!flags && flags.kind === 'attack' && !flags.confirmed && flags.targetActorId != null;
}

/**
 * Which of the three headline outcomes an attack card leads with: a miss,
 * a hit whose defeat test failed (so 0 damage despite the hit), or a hit
 * that lands (or whose defeat test is still unknown — no target).
 * @param {{key: string}} hit        Result of {@link resolveHit}.
 * @param {{known: boolean, success: boolean|null}} defeat   Result of {@link resolveDefeat}.
 * @returns {'miss'|'defeatFailed'|'hit'}
 */
export function resolveAttackHeadlineOutcome(hit, defeat) {
  if (hit.key === 'miss') return 'miss';
  if (defeat.known && !defeat.success) return 'defeatFailed';
  return 'hit';
}

/**
 * The chat visibility an attack card is posted with, from the user's own
 * chat-bar mode (`core.messageMode`). Every mode passes through unchanged
 * except `self`: a self-only attack card would hide it from the GM, who
 * must see it to confirm the damage — so it's raised to `ownersAndGm`
 * (the attacker's owners plus every GM), which the caller turns into an
 * explicit whisper list.
 * @param {string} mode   A `CONFIG.ChatMessage.modes` key.
 * @returns {string}      The same key, or `'ownersAndGm'`.
 */
export function resolveAttackMessageMode(mode) {
  return mode === 'self' ? 'ownersAndGm' : mode;
}

/**
 * Whisper recipients for a message that belongs to one actor's player and
 * the GM — every owner of the actor plus every GM (a GM does NOT see a
 * whisper they aren't listed on: ChatMessage#visible has no GM exception).
 * @param {Array<{id: string, isGM: boolean, isOwner: boolean}>} users
 *   `isOwner` = the user's OWNER permission on the actor.
 * @returns {string[]}
 */
export function ownersAndGmRecipients(users) {
  return users.filter((u) => u.isGM || u.isOwner).map((u) => u.id);
}

/**
 * Whether `card` was rolled while another attack against the same target
 * was still awaiting the GM's confirm — i.e. both proposals were computed
 * from the same, not-yet-changed target state. Stays true after that
 * earlier card gets confirmed later (its `confirmedAt` is then after this
 * card's `timestamp`), since this card's numbers are still stale. A card
 * confirmed before this build of the feature has no `confirmedAt` at all —
 * treated as confirmed long ago, not as a pending one.
 * @param {{id: string, targetActorId: string|null, timestamp: number}} card
 * @param {Array<{id: string, targetActorId: string|null, timestamp: number, confirmed?: boolean, confirmedAt?: number|null}>} others
 *   Every attack card the viewing client knows about (may include `card`).
 * @returns {boolean}
 */
export function hadUnconfirmedAttackBefore(card, others) {
  if (!card.targetActorId) return false;
  return others.some((other) => other.id !== card.id
    && other.targetActorId === card.targetActorId
    && other.timestamp < card.timestamp
    && (!other.confirmed || (other.confirmedAt != null && other.confirmedAt > card.timestamp)));
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
