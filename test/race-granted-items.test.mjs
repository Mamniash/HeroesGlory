import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { raceGrantedItems } from '../module/helpers/race-granted-items.mjs';

describe('raceGrantedItems — §2.3 p.12 Элементаль/Воздух and Джинн item grants', () => {
  test('Элементаль/Воздух grants exactly the "Полет" spell', () => {
    assert.deepEqual(raceGrantedItems('elemental', 'air', { hasSpellbook: false }), [
      { itemType: 'spell', spellName: 'Полет' },
    ]);
    // hasSpellbook is irrelevant to Элементаль — same grant either way.
    assert.deepEqual(raceGrantedItems('elemental', 'air', { hasSpellbook: true }), [
      { itemType: 'spell', spellName: 'Полет' },
    ]);
  });

  test('Элементаль/Огонь-Земля-Вода grant nothing', () => {
    for (const subchoice of ['fire', 'earth', 'water']) {
      assert.deepEqual(raceGrantedItems('elemental', subchoice, { hasSpellbook: false }), []);
    }
  });

  test('Джинн without a Книга Магии gets "Волшебная Стрела" AND the book', () => {
    assert.deepEqual(raceGrantedItems('djinn', null, { hasSpellbook: false }), [
      { itemType: 'spell', spellName: 'Волшебная Стрела' },
      { itemType: 'spellbook' },
    ]);
  });

  test('Джинн who already has a Книга Магии gets "Молния" only — no duplicate book', () => {
    assert.deepEqual(raceGrantedItems('djinn', null, { hasSpellbook: true }), [
      { itemType: 'spell', spellName: 'Молния' },
    ]);
  });

  test('every other race/subchoice grants nothing', () => {
    for (const race of ['human', 'gnome', 'elf', 'goblin', 'vampire', 'gnoll', 'demon', 'minotaur', 'troglodyte', 'saurian']) {
      assert.deepEqual(raceGrantedItems(race, null, { hasSpellbook: false }), []);
      assert.deepEqual(raceGrantedItems(race, null, { hasSpellbook: true }), []);
    }
  });

  test('an unknown race/subchoice combination grants nothing', () => {
    assert.deepEqual(raceGrantedItems('not-a-race', 'air', { hasSpellbook: false }), []);
    assert.deepEqual(raceGrantedItems('elemental', 'not-a-subchoice', { hasSpellbook: false }), []);
  });
});

describe('raceGrantedItemsAtPick — Джинн moved to the creation window', async () => {
  const { raceGrantedItemsAtPick } = await import('../module/helpers/race-granted-items.mjs');
  test('Джинн gets nothing at the race pick', () => {
    assert.deepEqual(raceGrantedItemsAtPick('djinn', null, { hasSpellbook: false }), []);
  });
  test('Элементаль Воздуха still gets «Полет» at the pick', () => {
    assert.deepEqual(raceGrantedItemsAtPick('elemental', 'air', { hasSpellbook: false }), [{ itemType: 'spell', spellName: 'Полет' }]);
  });
});
