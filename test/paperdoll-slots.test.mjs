import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { paperdollSlotAccepts, paperdollValidSlots } from '../module/helpers/paperdoll-slots.mjs';

describe('paperdollSlotAccepts — §8.1/§8.2 slot-type validation', () => {
  test('melee weapon (non-ranged weaponType) only fits slot 1', () => {
    const meleeWeapon = { type: 'weapon', system: { weaponType: 'slashing' } };
    assert.equal(paperdollSlotAccepts(meleeWeapon, 1), true);
    assert.equal(paperdollSlotAccepts(meleeWeapon, 16), false);
    assert.equal(paperdollSlotAccepts(meleeWeapon, 5), false);
  });

  test('ranged weapon only fits slot 16', () => {
    const rangedWeapon = { type: 'weapon', system: { weaponType: 'ranged' } };
    assert.equal(paperdollSlotAccepts(rangedWeapon, 16), true);
    assert.equal(paperdollSlotAccepts(rangedWeapon, 1), false);
  });

  test('spellbook only fits slot 10', () => {
    const spellbook = { type: 'spellbook', system: {} };
    assert.equal(paperdollSlotAccepts(spellbook, 10), true);
    assert.equal(paperdollSlotAccepts(spellbook, 11), false);
  });

  test('artifact fits exactly its curated targetSlots', () => {
    const ring = { type: 'artifact', system: { targetSlots: [2, 7] } };
    assert.equal(paperdollSlotAccepts(ring, 2), true);
    assert.equal(paperdollSlotAccepts(ring, 7), true);
    assert.equal(paperdollSlotAccepts(ring, 3), false);
  });

  test('artifact with no curated targetSlots fits nowhere', () => {
    const uncurated = { type: 'artifact', system: { targetSlots: [] } };
    for (let slot = 1; slot <= 19; slot++) assert.equal(paperdollSlotAccepts(uncurated, slot), false);
  });

  test('artifact missing targetSlots entirely (not just empty) fits nowhere, not throws', () => {
    const legacy = { type: 'artifact', system: {} };
    assert.equal(paperdollSlotAccepts(legacy, 5), false);
  });

  test('a non-equipable item type fits nowhere', () => {
    const spell = { type: 'spell', system: {} };
    assert.equal(paperdollSlotAccepts(spell, 1), false);
  });
});

describe('paperdollValidSlots — the drag-start highlight set', () => {
  test('melee weapon highlights only slot 1', () => {
    const meleeWeapon = { type: 'weapon', system: { weaponType: 'piercing' } };
    assert.deepEqual(paperdollValidSlots(meleeWeapon), [1]);
  });

  test('a dual-forearm ring artifact highlights both its slots', () => {
    const ring = { type: 'artifact', system: { targetSlots: [7, 2] } };
    assert.deepEqual(paperdollValidSlots(ring), [2, 7]);
  });

  test('an uncurated artifact highlights nothing', () => {
    const uncurated = { type: 'artifact', system: { targetSlots: [] } };
    assert.deepEqual(paperdollValidSlots(uncurated), []);
  });
});
