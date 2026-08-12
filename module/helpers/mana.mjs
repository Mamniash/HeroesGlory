/**
 * §2.1/§3: Мана = Знания × 10, or × 12/14/15 with an owned "Интеллект"
 * secondary-skill item at base/advanced/expert tier. Pure tier→multiplier
 * mapping, split out of the DataModel's own item lookup (which can't be
 * pure — it needs `this.parent.items`) so both `actor-hero.mjs`'s
 * `prepareDerivedData()` and the hero sheet's tooltip context can share
 * one tested source of truth for the numbers themselves.
 */

/** §2.1: base Мана multiplier absent any Интеллект skill. */
export const MANA_BASE_MULTIPLIER = 10;

/**
 * @param {'base'|'advanced'|'expert'|null} intellectTier   `null` if the
 *   hero doesn't own an Интеллект secondary-skill item.
 * @returns {number}
 */
export function manaMultiplier(intellectTier) {
  switch (intellectTier) {
    case 'advanced': return 14;
    case 'expert': return 15;
    case 'base': return 12;
    default: return MANA_BASE_MULTIPLIER;
  }
}
