import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  phaseForStat,
  buildEffectChanges,
  applyModifiers,
  applyModifiersForStat,
} from '../module/helpers/modifiers.mjs';

describe('phaseForStat — §8.2/§10 phase routing', () => {
  test('mana.max needs the "final" phase (computed in prepareDerivedData)', () => {
    assert.equal(phaseForStat('mana.max'), 'final');
  });

  test('everything else defaults to "initial"', () => {
    for (const stat of ['attack', 'defense', 'magicPower', 'knowledge', 'speed', 'luck', 'morale', 'health.max']) {
      assert.equal(phaseForStat(stat), 'initial');
    }
  });
});

describe('buildEffectChanges — translation to EffectChangeData', () => {
  test('maps stat/mode/value to key/type/value/phase', () => {
    const changes = buildEffectChanges([{ stat: 'attack', mode: 'add', value: 4 }]);
    assert.deepEqual(changes, [{ key: 'system.attack', type: 'add', value: 4, phase: 'initial' }]);
  });

  test('routes a mana.max modifier to the final phase', () => {
    const changes = buildEffectChanges([{ stat: 'mana.max', mode: 'add', value: 20 }]);
    assert.equal(changes[0].phase, 'final');
    assert.equal(changes[0].key, 'system.mana.max');
  });

  test('preserves order and handles multiple entries', () => {
    const changes = buildEffectChanges([
      { stat: 'attack', mode: 'add', value: 4 },
      { stat: 'defense', mode: 'add', value: 2 },
    ]);
    assert.equal(changes.length, 2);
    assert.equal(changes[0].key, 'system.attack');
    assert.equal(changes[1].key, 'system.defense');
  });

  test('empty list in, empty list out', () => {
    assert.deepEqual(buildEffectChanges([]), []);
  });
});

describe('applyModifiers — summation matching Foundry\'s ActiveEffect change types', () => {
  test('a single "+4 к Атаке" modifier (the book\'s own example)', () => {
    assert.equal(applyModifiers(3, [{ mode: 'add', value: 4 }]), 7);
  });

  test('§5.5 shield: level 3 gives +3 Защита', () => {
    assert.equal(applyModifiers(10, [{ mode: 'add', value: 3 }]), 13);
  });

  test('sums multiple add modifiers on the same stat', () => {
    assert.equal(applyModifiers(5, [{ mode: 'add', value: 2 }, { mode: 'add', value: 3 }]), 10);
  });

  test('subtract lowers the value', () => {
    assert.equal(applyModifiers(10, [{ mode: 'subtract', value: 4 }]), 6);
  });

  test('multiply scales the base value', () => {
    assert.equal(applyModifiers(4, [{ mode: 'multiply', value: 3 }]), 12);
  });

  test('downgrade keeps the lower of base and value', () => {
    assert.equal(applyModifiers(10, [{ mode: 'downgrade', value: 6 }]), 6);
    assert.equal(applyModifiers(3, [{ mode: 'downgrade', value: 6 }]), 3);
  });

  test('upgrade keeps the higher of base and value', () => {
    assert.equal(applyModifiers(3, [{ mode: 'upgrade', value: 6 }]), 6);
    assert.equal(applyModifiers(10, [{ mode: 'upgrade', value: 6 }]), 10);
  });

  test('override replaces the value outright', () => {
    assert.equal(applyModifiers(3, [{ mode: 'override', value: 99 }]), 99);
  });

  test('applies in priority order regardless of input order: multiply before add', () => {
    // (2 base * 3) + 1 = 7, not (2 + 1) * 3 = 9
    const inOrder = applyModifiers(2, [{ mode: 'multiply', value: 3 }, { mode: 'add', value: 1 }]);
    const reversed = applyModifiers(2, [{ mode: 'add', value: 1 }, { mode: 'multiply', value: 3 }]);
    assert.equal(inOrder, 7);
    assert.equal(reversed, 7);
  });

  test('override applied last wins over an earlier add', () => {
    assert.equal(applyModifiers(2, [{ mode: 'add', value: 100 }, { mode: 'override', value: 5 }]), 5);
  });

  test('no modifiers leaves the base value untouched', () => {
    assert.equal(applyModifiers(8, []), 8);
  });

  test('rejects an unknown mode', () => {
    assert.throws(() => applyModifiers(1, [{ mode: 'bogus', value: 1 }]), RangeError);
  });
});

describe('applyModifiersForStat — filters to one stat before summing', () => {
  test('ignores modifiers on other stats', () => {
    const modifiers = [
      { stat: 'attack', mode: 'add', value: 4 },
      { stat: 'defense', mode: 'add', value: 10 },
    ];
    assert.equal(applyModifiersForStat(3, modifiers, 'attack'), 7);
    assert.equal(applyModifiersForStat(3, modifiers, 'defense'), 13);
  });

  test('a stat with no modifiers returns the base value', () => {
    const modifiers = [{ stat: 'attack', mode: 'add', value: 4 }];
    assert.equal(applyModifiersForStat(5, modifiers, 'speed'), 5);
  });
});
