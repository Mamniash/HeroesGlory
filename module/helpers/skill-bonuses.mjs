/**
 * §3 rules.md: what a secondary skill (plus race, where the book ties it
 * in) contributes to a hero's Скорость / Удача / Боевой дух. Pure — no
 * Foundry globals — so `actor-hero.mjs`'s `prepareDerivedData()` and the
 * hero sheet's tooltip share one tested source of the numbers, the same
 * split as helpers/mana.mjs.
 *
 * The book phrases Удача/Лидерство as "Базовая удача равна N" / "Базовый
 * Боевой дух становится равен N" — it SETS a base that is otherwise 0 (1
 * for a Минотавр). Сеня's ruling (rules.md §11): stored as a sum —
 * skill + race + the GM's manual correction + effects.
 */

/** @typedef {'base'|'advanced'|'expert'|null} SkillTier */

const TIER_ORDER = ['base', 'advanced', 'expert'];

/** §2.2 p. 16: "от -3 до 3 ед." */
export const LUCK_MIN = -3;
export const LUCK_MAX = 3;

/**
 * The highest tier among owned skill items with a given key — `null` if
 * none is owned. A hero normally owns one item per key; taking the max
 * keeps a stray duplicate from lowering the result.
 * @param {Array<{skillKey: string, tier: string}>} ownedSkills
 * @param {string} skillKey
 * @returns {SkillTier}
 */
export function highestSkillTier(ownedSkills, skillKey) {
  let best = -1;
  for (const skill of ownedSkills) {
    if (skill.skillKey !== skillKey) continue;
    best = Math.max(best, TIER_ORDER.indexOf(skill.tier));
  }
  return best === -1 ? null : TIER_ORDER[best];
}

/**
 * Тактика, p. 36: "В первом раунде боя ваша Скорость увеличена на 3" /
 * 5 / 7. First round only — added to the initiative roll, never to the
 * sheet's Скорость (rules.md §11).
 * @param {SkillTier} tier
 * @returns {number}
 */
export function tacticsSpeedBonus(tier) {
  switch (tier) {
    case 'base': return 3;
    case 'advanced': return 5;
    case 'expert': return 7;
    default: return 0;
  }
}

/**
 * Поиск пути, p. 37, expert only: "Ваша Скорость навсегда увеличивается
 * на 1". Base/advanced change movement rules, not a number.
 * @param {SkillTier} tier
 * @returns {number}
 */
export function pathfindingSpeedBonus(tier) {
  return tier === 'expert' ? 1 : 0;
}

/**
 * Удача, p. 37: "Базовая удача равна 1" / 2 / 3.
 * @param {SkillTier} tier
 * @returns {number}
 */
export function luckSkillBase(tier) {
  switch (tier) {
    case 'base': return 1;
    case 'advanced': return 2;
    case 'expert': return 3;
    default: return 0;
  }
}

/**
 * Лидерство, p. 37: "Базовый Боевой дух становится равен 1 (2 для
 * Минотавров)" / 2 / 3. The Минотавр's +1 is {@link raceMoraleBonus}.
 * @param {SkillTier} tier
 * @returns {number}
 */
export function leadershipMoraleBase(tier) {
  switch (tier) {
    case 'base': return 1;
    case 'advanced': return 2;
    case 'expert': return 3;
    default: return 0;
  }
}

/**
 * Минотавр, p. 12: "Базовое значение Боевого духа = 1."
 * @param {string} raceKey
 * @returns {number}
 */
export function raceMoraleBonus(raceKey) {
  return raceKey === 'minotaur' ? 1 : 0;
}

/**
 * @param {number} value
 * @returns {number}
 */
export function clampLuck(value) {
  return Math.min(LUCK_MAX, Math.max(LUCK_MIN, value));
}

/**
 * Удача's parts and total. `effects` is whatever Active Effects (artifacts,
 * spells) already added on top of the stored manual correction.
 * @param {{skill: number, manual: number, effects: number}} parts
 * @returns {{raw: number, total: number, clamped: boolean}}
 */
export function resolveLuckTotal({ skill, manual, effects }) {
  const raw = skill + manual + effects;
  const total = clampLuck(raw);
  return { raw, total, clamped: total !== raw };
}
