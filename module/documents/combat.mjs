import { compareTurnOrder, tieBreakSpeed, rolledSpeedToRecord } from '../helpers/rolls.mjs';

const FLAG_SCOPE = 'heroes-glory';

/** Combatant flag: the Скорость its initiative roll used (§5.1). */
const ROLLED_SPEED_FLAG = 'rolledSpeed';

/**
 * The Скорость an initiative roll uses now (§5.1): the roll data's `speed`
 * plus `tactics` (0 for a creature or a surprised hero).
 * @param {Combatant} combatant
 * @returns {number}
 */
function currentRollSpeed(combatant) {
  const data = combatant.actor?.getRollData?.() ?? {};
  return (Number(data.speed) || 0) + (Number(data.tactics) || 0);
}

/**
 * The Скорость a tie compares: the one recorded at the roll (tieBreakSpeed).
 * @param {Combatant} combatant
 * @returns {number}
 */
function tieSpeed(combatant) {
  return tieBreakSpeed(combatant.getFlag(FLAG_SCOPE, ROLLED_SPEED_FLAG), currentRollSpeed(combatant));
}

/**
 * Скорость taken at an initiative roll, by combatant id, until the roll's
 * update records it (recordRolledSpeed) — core's update carries no mark of
 * a roll of its own.
 * @type {Map<string, number>}
 */
const pendingRolledSpeeds = new Map();

/**
 * §5.1 (p. 24): ties in initiative go to the higher Скорость — the one the
 * roll used — then to a coin drawn once per combatant (compareTurnOrder).
 */
export class HeroesGloryCombat extends Combat {
  /**
   * Core passes this to `Array#sort` unbound — no `this` here.
   * @override
   */
  _sortCombatants(a, b) {
    return compareTurnOrder(
      { initiative: a.initiative, speed: tieSpeed(a), coin: a.getFlag(FLAG_SCOPE, 'coin') ?? null, id: a.id },
      { initiative: b.initiative, speed: tieSpeed(b), coin: b.getFlag(FLAG_SCOPE, 'coin') ?? null, id: b.id },
    );
  }

  /**
   * Takes each combatant's Скорость as its initiative is rolled — every roll
   * (one combatant, all, NPCs) comes through here.
   * @override
   */
  async rollInitiative(ids, options = {}) {
    for (const id of typeof ids === 'string' ? [ids] : ids) {
      const combatant = this.combatants.get(id);
      if (combatant) pendingRolledSpeeds.set(id, currentRollSpeed(combatant));
    }
    try {
      return await super.rollInitiative(ids, options);
    } finally {
      for (const id of typeof ids === 'string' ? [ids] : ids) pendingRolledSpeeds.delete(id);
    }
  }
}

/**
 * `preUpdateCombatant`: a rolled initiative records the Скорость the roll
 * used (rolledSpeedToRecord); a value typed into the tracker or the Эльф's
 * reroll keeps it. A spell changing Скорость later doesn't reorder a tie
 * (p. 24: «в том же порядке»).
 * @param {Combatant} combatant
 * @param {object} changes
 */
export function recordRolledSpeed(combatant, changes) {
  const speed = rolledSpeedToRecord({
    changes,
    rolled: pendingRolledSpeeds.get(combatant.id),
    recorded: combatant.getFlag(FLAG_SCOPE, ROLLED_SPEED_FLAG),
    current: currentRollSpeed(combatant),
  });
  if (speed !== undefined) foundry.utils.setProperty(changes, `flags.${FLAG_SCOPE}.${ROLLED_SPEED_FLAG}`, speed);
}

/**
 * `preCreateCombatant`: the coin for a tie at equal Скорость, drawn once
 * when the combatant joins — the order between two such combatants stays
 * the same for the whole battle. A combatant that joins with its initiative
 * already set records its Скорость too.
 * @param {Combatant} combatant
 */
export function drawCombatantCoin(combatant) {
  if (Number.isFinite(combatant.initiative) && combatant.getFlag(FLAG_SCOPE, ROLLED_SPEED_FLAG) === undefined) {
    combatant.updateSource({ [`flags.${FLAG_SCOPE}.${ROLLED_SPEED_FLAG}`]: currentRollSpeed(combatant) });
  }
  if (combatant.getFlag(FLAG_SCOPE, 'coin') !== undefined) return;
  combatant.updateSource({ [`flags.${FLAG_SCOPE}.coin`]: Math.random() });
}
