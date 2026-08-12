import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { experienceForLevel, experienceToNextLevel } from '../module/helpers/experience.mjs';

describe('experienceForLevel — §4.1 cumulative XP table', () => {
  test('table values for early levels', () => {
    assert.equal(experienceForLevel(1), 15);
    assert.equal(experienceForLevel(2), 45);
    assert.equal(experienceForLevel(3), 150);
  });

  test('table value for level 20', () => {
    assert.equal(experienceForLevel(20), 4000);
  });

  test('beyond 20: +500 per level', () => {
    assert.equal(experienceForLevel(21), 4500);
    assert.equal(experienceForLevel(22), 5000);
  });

  test('level 0 resolves to the unused table slot (0)', () => {
    assert.equal(experienceForLevel(0), 0);
  });
});

describe('experienceToNextLevel — sheet tooltip lookup', () => {
  test('fresh level-0 hero needs the level-1 threshold', () => {
    assert.equal(experienceToNextLevel(0, 0), 15);
  });

  test('partway to the next level', () => {
    assert.equal(experienceToNextLevel(1, 30), 15); // 45 - 30
  });

  test('exercises the +500-beyond-20 branch at the 20→21 boundary', () => {
    assert.equal(experienceToNextLevel(20, 4000), 500); // 4500 - 4000
  });

  test('already past the next threshold floors at 0, not negative', () => {
    assert.equal(experienceToNextLevel(1, 999), 0);
  });
});
