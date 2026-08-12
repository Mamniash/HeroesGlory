import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { MANA_BASE_MULTIPLIER, manaMultiplier } from '../module/helpers/mana.mjs';

describe('manaMultiplier — §2.1/§3 Мана = Знания × multiplier', () => {
  test('no Интеллект skill owned → base ×10', () => {
    assert.equal(manaMultiplier(null), 10);
    assert.equal(manaMultiplier(null), MANA_BASE_MULTIPLIER);
  });

  test('base tier → ×12', () => {
    assert.equal(manaMultiplier('base'), 12);
  });

  test('advanced tier → ×14', () => {
    assert.equal(manaMultiplier('advanced'), 14);
  });

  test('expert tier → ×15', () => {
    assert.equal(manaMultiplier('expert'), 15);
  });
});
