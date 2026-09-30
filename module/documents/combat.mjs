import { compareTurnOrder } from '../helpers/rolls.mjs';

const FLAG_SCOPE = 'heroes-glory';

/**
 * The Скорость a combatant's initiative roll used (§5.1): the roll data's
 * `speed` plus `tactics` (0 for a creature or a surprised hero).
 * @param {Combatant} combatant
 * @returns {number}
 */
function rolledSpeed(combatant) {
  const data = combatant.actor?.getRollData?.() ?? {};
  return (Number(data.speed) || 0) + (Number(data.tactics) || 0);
}

/**
 * §5.1 (p. 24): ties in initiative go to the higher Скорость, then to a
 * coin drawn once per combatant (compareTurnOrder).
 */
export class HeroesGloryCombat extends Combat {
  /**
   * Core passes this to `Array#sort` unbound — no `this` here.
   * @override
   */
  _sortCombatants(a, b) {
    return compareTurnOrder(
      { initiative: a.initiative, speed: rolledSpeed(a), coin: a.getFlag(FLAG_SCOPE, 'coin') ?? null, id: a.id },
      { initiative: b.initiative, speed: rolledSpeed(b), coin: b.getFlag(FLAG_SCOPE, 'coin') ?? null, id: b.id },
    );
  }
}

/**
 * `preCreateCombatant`: the coin for a tie at equal Скорость, drawn once
 * when the combatant joins — the order between two such combatants stays
 * the same for the whole battle.
 * @param {Combatant} combatant
 */
export function drawCombatantCoin(combatant) {
  if (combatant.getFlag(FLAG_SCOPE, 'coin') !== undefined) return;
  combatant.updateSource({ [`flags.${FLAG_SCOPE}.coin`]: Math.random() });
}
