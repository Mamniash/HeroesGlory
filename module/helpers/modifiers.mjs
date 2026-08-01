/**
 * Pure logic for artifact stat modifiers (rules.md §8.2). No `game`/`ui`/
 * `ActiveEffect`/Foundry-global references — testable with plain
 * `node --test`. The actual application to actors happens through a real
 * embedded ActiveEffect (built from {@link buildEffectChanges} and synced
 * in module/documents/item.mjs), not through anything in this file — these
 * functions exist so that data shape and math can be verified without a
 * live Foundry environment.
 */

/**
 * Stats whose value is computed by our own prepareDerivedData() rather
 * than stored directly, so a modifier on them must apply in the ActiveEffect
 * "final" phase (after prepareDerivedData) instead of the default "initial"
 * phase (before it) — otherwise our own computed assignment would
 * overwrite the bonus. See actor-hero.mjs: `mana.max` is the only such
 * field right now.
 * @type {Record<string, "initial"|"final">}
 */
const DERIVED_STAT_PHASES = {
  'mana.max': 'final',
};

/**
 * Which ActiveEffect application phase a modifier on `stat` must use.
 * @param {string} stat
 * @returns {"initial"|"final"}
 */
export function phaseForStat(stat) {
  return DERIVED_STAT_PHASES[stat] ?? 'initial';
}

/**
 * Translate an artifact's `system.modifiers` list into the `EffectChangeData`
 * shape a v14 ActiveEffect's `system.changes` expects: `{key, type, value,
 * phase}`. `type` here is the same string as our own `mode` field — both
 * use CONST.ACTIVE_EFFECT_CHANGE_TYPES' names ("add", "multiply", ...)
 * directly, so no translation table is needed for that part.
 * @param {Array<{stat: string, mode: string, value: number}>} modifiers
 * @returns {Array<{key: string, type: string, value: number, phase: string}>}
 */
export function buildEffectChanges(modifiers) {
  return modifiers.map((modifier) => ({
    key: `system.${modifier.stat}`,
    type: modifier.mode,
    value: modifier.value,
    phase: phaseForStat(modifier.stat),
  }));
}

/**
 * Order in which Foundry applies same-key changes of different modes,
 * derived from CONST.ACTIVE_EFFECT_CHANGE_TYPES' default priorities
 * (multiply: 10, add/subtract: 20, downgrade: 30, upgrade: 40, override: 50).
 * @type {string[]}
 */
const MODE_ORDER = ['multiply', 'add', 'subtract', 'downgrade', 'upgrade', 'override'];

/**
 * Apply a list of modifiers to a base value, mirroring how Foundry's
 * ActiveEffect change application combines multiple changes targeting the
 * same field (in ascending priority order, by mode). Used to unit-test
 * that a given modifier list produces the expected total without needing
 * a live Foundry instance to actually run the real ActiveEffect pipeline.
 * @param {number} baseValue
 * @param {Array<{mode: string, value: number}>} modifiers
 * @returns {number}
 */
export function applyModifiers(baseValue, modifiers) {
  const ordered = [...modifiers].sort((a, b) => MODE_ORDER.indexOf(a.mode) - MODE_ORDER.indexOf(b.mode));
  return ordered.reduce((value, modifier) => {
    switch (modifier.mode) {
      case 'add': return value + modifier.value;
      case 'subtract': return value - modifier.value;
      case 'multiply': return value * modifier.value;
      case 'downgrade': return Math.min(value, modifier.value);
      case 'upgrade': return Math.max(value, modifier.value);
      case 'override': return modifier.value;
      default: throw new RangeError(`applyModifiers: unknown mode "${modifier.mode}"`);
    }
  }, baseValue);
}

/**
 * Sum only the modifiers targeting one specific stat — a convenience for
 * previewing "what will this artifact do to Attack" without pulling in
 * unrelated stats from the same modifiers list.
 * @param {number} baseValue
 * @param {Array<{stat: string, mode: string, value: number}>} modifiers
 * @param {string} stat
 * @returns {number}
 */
export function applyModifiersForStat(baseValue, modifiers, stat) {
  return applyModifiers(baseValue, modifiers.filter((m) => m.stat === stat));
}
