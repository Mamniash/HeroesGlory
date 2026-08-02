import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  WOUND_MAX_PENALTY,
  applyWoundPenalty,
  resolveMaxWithWounds,
  isMaxDepleted,
} from '../module/helpers/wounds.mjs';

describe('applyWoundPenalty — §5.9 -5 to max Health/Mana per Ранение', () => {
  test('no wounds leaves the base untouched', () => {
    assert.equal(applyWoundPenalty(30, 0), 30);
  });

  test('subtracts 5 per wound', () => {
    assert.equal(applyWoundPenalty(30, 1), 25);
    assert.equal(applyWoundPenalty(30, 3), 15);
  });

  test('floors at 0 rather than going negative', () => {
    assert.equal(applyWoundPenalty(10, 3), 0); // 10 - 15 -> -5, floored
    assert.equal(applyWoundPenalty(10, 2), 0); // exactly 0
  });

  test('the penalty constant is 5, per the book', () => {
    assert.equal(WOUND_MAX_PENALTY, 5);
  });
});

describe('resolveMaxWithWounds — §5.9/§8.2 the combined wounds + artifact-modifier pipeline', () => {
  test('base value alone, no wounds, no modifiers', () => {
    assert.equal(resolveMaxWithWounds({ base: 30, wounds: 0, modifiers: [], stat: 'health.max' }), 30);
  });

  test('wounds alone', () => {
    assert.equal(resolveMaxWithWounds({ base: 30, wounds: 2, modifiers: [], stat: 'health.max' }), 20);
  });

  test('an artifact bonus applies on top of the wound-reduced value', () => {
    const modifiers = [{ stat: 'health.max', mode: 'add', value: 10 }];
    assert.equal(resolveMaxWithWounds({ base: 30, wounds: 2, modifiers, stat: 'health.max' }), 30); // 30-10+10
  });

  test('only modifiers targeting the requested stat count', () => {
    const modifiers = [{ stat: 'mana.max', mode: 'add', value: 100 }];
    assert.equal(resolveMaxWithWounds({ base: 30, wounds: 1, modifiers, stat: 'health.max' }), 25);
  });

  test('wounds can floor it at 0 even with an artifact bonus present for a different stat', () => {
    const modifiers = [{ stat: 'mana.max', mode: 'add', value: 100 }];
    assert.equal(resolveMaxWithWounds({ base: 10, wounds: 5, modifiers, stat: 'health.max' }), 0);
  });

  test('a large enough "subtract" modifier can floor the result at 0 too', () => {
    const modifiers = [{ stat: 'health.max', mode: 'subtract', value: 999 }];
    assert.equal(resolveMaxWithWounds({ base: 30, wounds: 0, modifiers, stat: 'health.max' }), 0);
  });

  test('works the same for mana.max', () => {
    const modifiers = [{ stat: 'mana.max', mode: 'add', value: 20 }];
    assert.equal(resolveMaxWithWounds({ base: 100, wounds: 4, modifiers, stat: 'mana.max' }), 100);
  });
});

describe('isMaxDepleted — §5.9 "максимум опустился до 0 — персонаж умер навсегда"', () => {
  test('true at exactly 0', () => {
    assert.equal(isMaxDepleted(0), true);
  });

  test('false for any positive max', () => {
    assert.equal(isMaxDepleted(1), false);
    assert.equal(isMaxDepleted(30), false);
  });
});
