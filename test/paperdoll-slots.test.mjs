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

describe('toggleArtifactSlot — artifact sheet mini-paperdoll', async () => {
  const { toggleArtifactSlot, paperdollSlotGroup, ARTIFACT_LOCKED_SLOTS } = await import('../module/helpers/paperdoll-slots.mjs');

  test('a plain slot toggles alone, result sorted', () => {
    assert.deepEqual(toggleArtifactSlot([5], 3), [3, 5]);
    assert.deepEqual(toggleArtifactSlot([3, 5], 3), [5]);
  });

  test('rings go on and off together, from either hand', () => {
    assert.deepEqual(toggleArtifactSlot([], 7), [2, 7]);
    assert.deepEqual(toggleArtifactSlot([2, 7], 2), []);
    // Only half the group on (hand-edited data): a click completes it.
    assert.deepEqual(toggleArtifactSlot([2], 2), [2, 7]);
  });

  test('«прочее» 11–15 is one group', () => {
    assert.deepEqual(toggleArtifactSlot([4], 13), [4, 11, 12, 13, 14, 15]);
    assert.deepEqual(toggleArtifactSlot([4, 11, 12, 13, 14, 15], 11), [4]);
    assert.deepEqual(paperdollSlotGroup(9), [9]);
  });

  test('book and reserve slots never change', () => {
    for (const slot of ARTIFACT_LOCKED_SLOTS) assert.deepEqual(toggleArtifactSlot([9], slot), [9]);
  });
});
