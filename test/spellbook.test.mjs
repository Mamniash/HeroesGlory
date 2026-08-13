import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { compareSpellsForBook } from '../module/helpers/spellbook.mjs';

describe('compareSpellsForBook — §6.3 spellbook grid order', () => {
  test('sorts by level ascending first', () => {
    const low = { level: 1, school: 'fire', name: 'Ярость' };
    const high = { level: 2, school: 'earth', name: 'Аура' };
    assert.ok(compareSpellsForBook(low, high) < 0);
    assert.ok(compareSpellsForBook(high, low) > 0);
  });

  test('level tie breaks by school key order (earth, air, water, fire, universal)', () => {
    const earth = { level: 1, school: 'earth', name: 'Зов' };
    const fire = { level: 1, school: 'fire', name: 'Атом' };
    assert.ok(compareSpellsForBook(earth, fire) < 0);

    const universal = { level: 1, school: 'universal', name: 'Аура' };
    assert.ok(compareSpellsForBook(fire, universal) < 0);
  });

  test('level+school tie breaks by name (localeCompare)', () => {
    const a = { level: 1, school: 'water', name: 'Аура' };
    const b = { level: 1, school: 'water', name: 'Буря' };
    assert.ok(compareSpellsForBook(a, b) < 0);
    assert.ok(compareSpellsForBook(b, a) > 0);
  });

  test('stable: sorting swapped-order equal-key pairs yields the same relative order', () => {
    const a = { level: 3, school: 'air', name: 'Аура' };
    const b = { level: 3, school: 'air', name: 'Буря' };
    assert.deepEqual([b, a].sort(compareSpellsForBook), [a, b]);
    assert.deepEqual([a, b].sort(compareSpellsForBook), [a, b]);
  });

  test('an unrecognized school (not a valid choices value in practice) sorts before all declared schools', () => {
    const unknown = { level: 1, school: 'nonsense', name: 'Х' };
    const earth = { level: 1, school: 'earth', name: 'А' };
    // indexOf returns -1 for unknown schools, which sorts before index 0 (earth).
    assert.ok(compareSpellsForBook(unknown, earth) < 0);
  });
});
