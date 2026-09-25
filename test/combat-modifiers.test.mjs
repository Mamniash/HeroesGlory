import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHit,
  resolveHitModifiers,
  resolveContestedDefeat,
  attackSeriesCount,
  resolveNextAttack,
  resolveAttackResolution,
} from '../module/helpers/rolls.mjs';

describe('resolveHit with a modifier — §11 table read at the modified total', () => {
  test('natural 6 at −2 reads as 4: a hit, no epic', () => {
    const hit = resolveHit(6, -2);
    assert.equal(hit.total, 4);
    assert.equal(hit.key, 'hit');
    assert.equal(hit.epic, false);
  });
  test('legendary 5 + 1 = 6: an epic', () => {
    const hit = resolveHit(5, 1);
    assert.equal(hit.key, 'epic');
    assert.equal(hit.epic, true);
  });
  test('below 1 is still a miss, above 6 still an epic', () => {
    assert.equal(resolveHit(1, -2).key, 'miss');
    assert.equal(resolveHit(6, 1).epic, true);
  });
  test('3 at −1 = 2: a miss', () => {
    assert.equal(resolveHit(3, -1).key, 'miss');
  });
  test('no modifier — unchanged', () => {
    assert.deepEqual(resolveHit(4), { die: 4, modifier: 0, total: 4, key: 'hit', multiplier: 1, epic: false });
  });
});

describe('resolveHitModifiers — pp. 27, 30, 31', () => {
  test('target in «Защита»: −2', () => {
    assert.deepEqual(resolveHitModifiers({ targetDefending: true }), { modifiers: [{ key: 'defending', value: -2 }], total: -2 });
  });
  test('shot at an adjacent target: −1', () => {
    assert.equal(resolveHitModifiers({ ranged: true, adjacent: true }).total, -1);
  });
  test('melee at an adjacent target: nothing', () => {
    assert.equal(resolveHitModifiers({ ranged: false, adjacent: true }).total, 0);
  });
  test('shot at a non-adjacent or unmeasured target: nothing', () => {
    assert.equal(resolveHitModifiers({ ranged: true, adjacent: false }).total, 0);
    assert.equal(resolveHitModifiers({ ranged: true, adjacent: null }).total, 0);
  });
  test('advanced Стрельба lifts the adjacent penalty', () => {
    assert.equal(resolveHitModifiers({ ranged: true, adjacent: true, ignoreAdjacentPenalty: true }).total, 0);
  });
  test('legendary attacker: +1; everything stacks', () => {
    const result = resolveHitModifiers({ targetDefending: true, ranged: true, adjacent: true, attackerLegendary: true });
    assert.deepEqual(result.modifiers.map((m) => m.key), ['defending', 'adjacentShot', 'legendary']);
    assert.equal(result.total, -2);
  });
});

describe('resolveContestedDefeat — p. 31', () => {
  test('attacker higher → damage', () => {
    const d = resolveContestedDefeat({ attackerAttack: 9, targetDefense: 15, attackerDie: 12, targetDie: 5 });
    assert.equal(d.attackerTotal, 21);
    assert.equal(d.targetTotal, 20);
    assert.equal(d.success, true);
  });
  test('a tie → no damage', () => {
    assert.equal(resolveContestedDefeat({ attackerAttack: 10, targetDefense: 10, attackerDie: 7, targetDie: 7 }).success, false);
  });
  test('no target → unknown', () => {
    assert.equal(resolveContestedDefeat({ attackerAttack: 10, targetDefense: null, attackerDie: 7, targetDie: 7 }).known, false);
  });
});

describe('attackSeriesCount — §11', () => {
  test('creature: statblock count, +1 for «Месть» while hurt', () => {
    assert.equal(attackSeriesCount({ creatureAttacks: 3 }), 3);
    assert.equal(attackSeriesCount({ creatureAttacks: 2, vengeanceHurt: true }), 3);
    assert.equal(attackSeriesCount({ creatureAttacks: 0 }), 1);
  });
  test('hero melee: +1 from advanced/expert Нападение, not base', () => {
    assert.equal(attackSeriesCount({ assaultTier: 'base' }), 1);
    assert.equal(attackSeriesCount({ assaultTier: 'advanced' }), 2);
    assert.equal(attackSeriesCount({ assaultTier: 'expert' }), 2);
  });
  test('hero ranged: +1 from any Стрельба; Нападение does not count', () => {
    assert.equal(attackSeriesCount({ ranged: true, assaultTier: 'expert' }), 1);
    assert.equal(attackSeriesCount({ ranged: true, archeryTier: 'base' }), 2);
  });
  test('specialization adds one more to its own kind', () => {
    assert.equal(attackSeriesCount({ assaultTier: 'expert', specializationSkill: 'assault' }), 3);
    assert.equal(attackSeriesCount({ ranged: true, archeryTier: 'expert', specializationSkill: 'archery' }), 3);
    assert.equal(attackSeriesCount({ ranged: true, specializationSkill: 'assault' }), 1);
  });
});

describe('resolveNextAttack — «Следующая атака»', () => {
  test('not before the GM confirms', () => {
    assert.equal(resolveNextAttack({ confirmed: false, index: 1, total: 3 }).show, false);
  });
  test('after confirm, while attacks remain', () => {
    assert.deepEqual(resolveNextAttack({ confirmed: true, index: 1, total: 3 }), { show: true, stoppedByTarget: false, next: 2 });
  });
  test('none after the last one, or without a series', () => {
    assert.equal(resolveNextAttack({ confirmed: true, index: 3, total: 3 }).show, false);
    assert.equal(resolveNextAttack({ confirmed: true, index: null, total: null }).show, false);
  });
  test('target out → no button, the card says why', () => {
    assert.deepEqual(resolveNextAttack({ confirmed: true, index: 1, total: 2, targetOut: true }), { show: false, stoppedByTarget: true, next: null });
  });
});

describe('resolveAttackResolution — modifiers and old cards', () => {
  const base = {
    hitDie: 6, defeatDie: 15, attackerAttack: 5, targetDefense: 10, baseDamage: 4,
    stateMultiplier: 1, equippedArmor: [], location: null,
  };
  test('a card without the new fields: no modifier, ordinary defeat test', () => {
    const r = resolveAttackResolution(base);
    assert.equal(r.hit.epic, true);
    assert.equal(r.defeat.threshold, 5);
    assert.equal(r.damage, 8);
  });
  test('hitModifier applies to the stored die', () => {
    const r = resolveAttackResolution({ ...base, hitModifier: -2 });
    assert.equal(r.hit.key, 'hit');
    assert.equal(r.damage, 4);
  });
  test('contested flag uses both d20', () => {
    const r = resolveAttackResolution({ ...base, contested: true, targetDefeatDie: 10 });
    assert.equal(r.defeat.contested, true);
    assert.equal(r.defeat.success, false); // 15 + 5 = 20 vs 10 + 10 = 20 — a tie
    assert.equal(r.damage, 0);
  });
});
