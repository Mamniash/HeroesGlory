import { applyModifiersForStat } from './modifiers.mjs';

/**
 * §5.9: each Ранение (wound) permanently lowers a hero's max Health and
 * max Mana by this many points.
 * @type {number}
 */
export const WOUND_MAX_PENALTY = 5;

/**
 * §5.9: a stat's base value after the Ранения penalty, floored at 0 —
 * "Если максимум опустился до 0 — персонаж умер навсегда" needs a real
 * floor to detect, not an unclamped negative number. This is exactly
 * what actor-hero.mjs's prepareDerivedData() calls for `health.max` and
 * `mana.max`, run *before* Active Effects' "final" phase (see
 * modifiers.mjs — that's why an artifact modifier on either field has to
 * use that phase, same reasoning as the existing `mana.max` case).
 * @param {number} base
 * @param {number} wounds
 * @returns {number}
 */
export function applyWoundPenalty(base, wounds) {
  return Math.max(0, base - wounds * WOUND_MAX_PENALTY);
}

/**
 * §5.9/§8.2: the full max-Health/max-Mana pipeline in one pure, testable
 * place — Ранения subtract from the base first, then artifact modifiers
 * apply on top, matching the actor's real data-prep order exactly
 * (prepareDerivedData, then the ActiveEffect "final" phase). Not called
 * from runtime code: like modifiers.mjs's own applyModifiers, the actual
 * modifier half runs through real Foundry Active Effects, not this
 * function — this exists to exercise the combined interaction (wounds
 * plus a modifier landing on or past 0) without a live Foundry instance.
 * @param {object} params
 * @param {number} params.base
 * @param {number} params.wounds
 * @param {Array<{stat: string, mode: string, value: number}>} params.modifiers
 * @param {string} params.stat   'health.max' | 'mana.max'
 * @returns {number}
 */
export function resolveMaxWithWounds({ base, wounds, modifiers, stat }) {
  const afterWounds = applyWoundPenalty(base, wounds);
  return Math.max(0, applyModifiersForStat(afterWounds, modifiers, stat));
}

/**
 * §5.9: "Если максимум опустился до 0 — персонаж умер навсегда."
 * @param {number} max
 * @returns {boolean}
 */
export function isMaxDepleted(max) {
  return max <= 0;
}
