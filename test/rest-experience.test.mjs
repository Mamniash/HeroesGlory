import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  REST_MANA, resolveRest, halveBase, aptitudeBonusPerDie, experienceAward, isDefeatedForExperience,
} from '../module/helpers/rolls.mjs';

describe('resolveRest — p. 33', () => {
  test('Mana 5 below max → max, not above', () => {
    assert.equal(resolveRest({ manaValue: 25, manaMax: 30, healthValue: 10, healthMax: 30 }).manaValue, 30);
  });
  test('Mana 20 below max → +10', () => {
    assert.equal(resolveRest({ manaValue: 10, manaMax: 30, healthValue: 10, healthMax: 30 }).manaValue, 10 + REST_MANA);
  });
  test('Mana already above max stays', () => {
    assert.equal(resolveRest({ manaValue: 35, manaMax: 30, healthValue: 10, healthMax: 30 }).manaValue, 35);
  });
  test('Health → max; Удача correction → 0', () => {
    const r = resolveRest({ manaValue: 0, manaMax: 30, healthValue: 3, healthMax: 30 });
    assert.equal(r.healthValue, 30);
    assert.equal(r.luckManual, 0);
  });
});

describe('halveBase — p. 33, rounded down', () => {
  test('5 → 2, 4 → 2, 1 → 0, 0 → 0', () => {
    assert.deepEqual([5, 4, 1, 0].map(halveBase), [2, 2, 0, 0]);
  });
});

describe('aptitudeBonusPerDie — p. 39', () => {
  test('none/base/advanced/expert → 0/1/1/2', () => {
    assert.deepEqual([null, 'base', 'advanced', 'expert'].map(aptitudeBonusPerDie), [0, 1, 1, 2]);
  });
});

describe('experienceAward — p. 21', () => {
  const creatures = [
    { name: 'A', level: 2, dice: [3, 5] },
    { name: 'B', level: 0, dice: [] },
    { name: 'C', level: 1, dice: [6] },
  ];
  test('sum of Xd6 per creature; level 0 gives nothing', () => {
    assert.deepEqual(experienceAward({ creatures }), { diceCount: 3, diceTotal: 14, aptitudeBonus: 0, total: 14 });
  });
  test('expert Обучаемость: +2 per die, bonus dice included', () => {
    const r = experienceAward({ creatures, bonusDice: [4], aptitudeTier: 'expert' });
    assert.deepEqual(r, { diceCount: 4, diceTotal: 18, aptitudeBonus: 8, total: 26 });
  });
  test('only bonus dice (manual award)', () => {
    assert.equal(experienceAward({ bonusDice: [2], aptitudeTier: 'base' }).total, 3);
  });
});

describe('isDefeatedForExperience', () => {
  test('0 Health, incapacitated, defeated or unconscious → defeated', () => {
    assert.equal(isDefeatedForExperience({ healthValue: 0 }), true);
    assert.equal(isDefeatedForExperience({ healthValue: 5, incapacitated: true }), true);
    assert.equal(isDefeatedForExperience({ healthValue: 5, defeated: true }), true);
    assert.equal(isDefeatedForExperience({ healthValue: 5, unconscious: true }), true);
  });
  test('standing creature → not', () => {
    assert.equal(isDefeatedForExperience({ healthValue: 5 }), false);
  });
});
