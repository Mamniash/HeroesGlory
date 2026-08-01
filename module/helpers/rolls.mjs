/**
 * Pure interpretation logic for Heroes & Glory dice rolls (docs/rules.md
 * §5.3, §5.4, §6.3, §7). Every export here is a plain function of its
 * arguments — no `game`, `ui`, `ChatMessage`, `Roll`, or any other Foundry
 * global — so this file can be unit-tested with plain `node --test`.
 * Rolling the actual dice and posting to chat lives in roll-actions.mjs.
 */

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
