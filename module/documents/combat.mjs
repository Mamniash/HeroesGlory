import {
  compareTurnOrder, tieBreakSpeed, rolledSpeedToRecord, orderWithFollowers, initiativeRollParts, isLateJoin, joinerWaits,
  turnKeepingCombatant,
} from '../helpers/rolls.mjs';

const FLAG_SCOPE = 'heroes-glory';

/** Combatant flag: the Скорость its initiative roll used (§5.1). */
const ROLLED_SPEED_FLAG = 'rolledSpeed';

/** Combatant flag: the round a combatant joined a battle under way (§5.1, p. 25). */
const JOINED_FLAG = 'joinedRound';

/**
 * The roll data of a combatant's initiative (§5.1): the actor's, its
 * `tactics` and `initiativeBonus` by this combatant — Минотавр, «Не обнаружил
 * врага», and for one who joined a battle under way no Тактика, or out of an
 * ambush +10 and Тактика (initiativeRollParts, rules.md §11).
 * @param {Combatant} combatant
 * @returns {object}
 */
export function initiativeRollData(combatant) {
  const actor = combatant.actor;
  const data = actor?.getRollData?.() ?? {};
  if (!actor) return data;
  const { surprised, ambush } = CONFIG.HEROES_GLORY.statusEffects;
  const hero = actor.type === 'hero';
  return {
    ...data,
    ...initiativeRollParts({
      race: hero ? actor.system.race : '',
      tactics: hero ? (actor.system.tactics ?? 0) : 0,
      surprised: actor.statuses.has(surprised),
      lateJoin: Number.isFinite(combatant.getFlag(FLAG_SCOPE, JOINED_FLAG)),
      ambush: actor.statuses.has(ambush),
    }),
  };
}

/**
 * The Скорость an initiative roll uses now (§5.1): the roll data's `speed`
 * plus `tactics` — the same data the roll takes (initiativeRollData).
 * @param {Combatant} combatant
 * @returns {number}
 */
function currentRollSpeed(combatant) {
  const data = initiativeRollData(combatant);
  return (Number(data.speed) || 0) + (Number(data.tactics) || 0);
}

/**
 * §5.1: the initiative roll of a combatant takes its own roll data
 * (initiativeRollData) — a joiner's Тактика and ambush are the combatant's,
 * not the actor's.
 */
export class HeroesGloryCombatant extends Combatant {
  /** @override */
  getInitiativeRoll(formula) {
    formula = formula || this._getInitiativeFormula();
    return foundry.dice.Roll.create(formula, initiativeRollData(this));
  }
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
   * Group Д: a summoned elemental or a clone (the combatant's `follows`
   * flag) goes right after its caster (orderWithFollowers, rules.md §11).
   * @override
   */
  setupTurns() {
    const turns = super.setupTurns();
    const order = orderWithFollowers(turns.map((c) => ({ id: c.id, follows: c.getFlag(FLAG_SCOPE, 'follows') ?? null })));
    if (order.every((id, index) => id === turns[index].id)) return turns;
    const byId = new Map(turns.map((c) => [c.id, c]));
    const reordered = order.map((id) => byId.get(id));
    if (this.turn !== null) reordered.forEach((c, index) => { c.turnNumber = index; });
    this.current = this._getCurrentState(reordered[this.turn]);
    return this.turns = reordered;
  }

  /**
   * Takes each combatant's Скорость as its initiative is rolled — every roll
   * (one combatant, all, NPCs) comes through here. The turn stays with the
   * combatant whose turn it is (updateEmbeddedDocuments).
   * @override
   */
  async rollInitiative(ids, options = {}) {
    for (const id of typeof ids === 'string' ? [ids] : ids) {
      const combatant = this.combatants.get(id);
      if (combatant) pendingRolledSpeeds.set(id, currentRollSpeed(combatant));
    }
    this.#keepTurnId = this.combatant?.id ?? null;
    try {
      return await super.rollInitiative(ids, options);
    } finally {
      this.#keepTurnId = null;
      for (const id of typeof ids === 'string' ? [ids] : ids) pendingRolledSpeeds.delete(id);
    }
  }

  /**
   * The combatant whose turn it was when initiative was rolled.
   * @type {string|null}
   */
  #keepTurnId = null;

  /**
   * Core keeps the turn by its number when a roll reorders the battle — a
   * joiner rolling above the one whose turn it is would move the turn to
   * someone else. During a roll, the number that keeps it on the same
   * combatant in the new order goes with the update (core's `combatTurn`).
   * @override
   */
  async updateEmbeddedDocuments(embeddedName, updates = [], operation = {}) {
    if (embeddedName === 'Combatant' && this.#keepTurnId && operation.combatTurn === undefined) {
      operation = { ...operation, combatTurn: turnKeepingCombatant(this.#orderAfter(updates), this.#keepTurnId, this.turn) };
    }
    return super.updateEmbeddedDocuments(embeddedName, updates, operation);
  }

  /**
   * The turn order once `updates` set the initiatives — sorted the way
   * _sortCombatants and setupTurns do it.
   * @param {object[]} updates
   * @returns {string[]}
   */
  #orderAfter(updates) {
    const changed = new Map(updates.filter((u) => 'initiative' in u).map((u) => [u._id, u.initiative]));
    const entries = this.combatants.map((c) => ({
      id: c.id,
      initiative: changed.has(c.id) ? changed.get(c.id) : c.initiative,
      speed: pendingRolledSpeeds.get(c.id) ?? tieSpeed(c),
      coin: c.getFlag(FLAG_SCOPE, 'coin') ?? null,
      follows: c.getFlag(FLAG_SCOPE, 'follows') ?? null,
    }));
    return orderWithFollowers(entries.sort(compareTurnOrder));
  }

  /**
   * §5.1 (p. 25): one who joined a battle under way «появляются в начале
   * нового раунда» — in the round they joined, the turn passes them by
   * (joinerWaits, rules.md §11), as core passes the defeated by. The rest is
   * core's.
   * @override
   */
  async nextTurn() {
    if (this.round === 0) return this.nextRound();
    const waits = (c) => joinerWaits(c.getFlag(FLAG_SCOPE, JOINED_FLAG), this.round);
    const turn = this.turn ?? -1;
    if (!this.turns.slice(turn + 1).some(waits)) return super.nextTurn();
    const skips = (c) => (this.settings.skipDefeated && c.isDefeated) || waits(c);
    const next = this.turns.findIndex((c, index) => index > turn && !skips(c));
    if (next === -1) return this.nextRound();
    const advanceTime = this.getTimeDelta(this.round, this.turn, this.round, next);
    const updateData = { round: this.round, turn: next };
    const updateOptions = { direction: 1, worldTime: { delta: advanceTime } };
    Hooks.callAll('combatTurn', this, updateData, updateOptions);
    await this.update(updateData, updateOptions);
    return this;
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
 * `preCreateCombatant`: one added to a battle under way from round 2 on
 * (isLateJoin, p. 25) is marked with the round — no Тактика in its roll, its
 * turn passed by in this round. A summoned elemental or a clone isn't.
 * Runs before drawCombatantCoin, whose Скорость reads the mark.
 * @param {Combatant} combatant
 */
export function markLateJoiner(combatant) {
  const combat = combatant.parent;
  if (!combat || combatant.getFlag(FLAG_SCOPE, JOINED_FLAG) !== undefined) return;
  if (!isLateJoin({ started: combat.started, round: combat.round, summoned: !!combatant.getFlag(FLAG_SCOPE, 'summoned') })) return;
  combatant.updateSource({ [`flags.${FLAG_SCOPE}.${JOINED_FLAG}`]: combat.round });
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
