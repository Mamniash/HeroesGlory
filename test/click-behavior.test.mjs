import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { elementClicks } from '../module/helpers/click-behavior.mjs';

const player = { editMode: false, isGM: false };
const gm = { editMode: false, isGM: true };
const gmEditing = { editMode: true, isGM: true };

describe('elementClicks — paperdoll and backpack items', () => {
  const weaponEquipped = { hasSheet: true, hasAction: true };
  const noAction = { hasSheet: true, hasAction: false };
  const book = { hasSheet: true, isSpellbook: true };

  test('an equipped weapon: the left attacks, the right opens the sheet — read-only for a player', () => {
    assert.deepEqual(elementClicks(weaponEquipped, player), { left: 'action', right: 'sheet', readOnly: true });
  });

  test('the GM gets the sheet editable', () => {
    assert.deepEqual(elementClicks(weaponEquipped, gm), { left: 'action', right: 'sheet', readOnly: false });
  });

  test('an artifact or a weapon in the backpack (no action): both buttons open the sheet', () => {
    assert.deepEqual(elementClicks(noAction, player), { left: 'sheet', right: 'sheet', readOnly: true });
  });

  test('the GM in edit mode: the left opens the sheet even for a weapon', () => {
    assert.deepEqual(elementClicks(weaponEquipped, gmEditing), { left: 'sheet', right: 'sheet', readOnly: false });
  });

  test('Книга Магии: both buttons open the spread, in and out of edit mode', () => {
    for (const viewer of [player, gm, gmEditing]) {
      assert.deepEqual(elementClicks(book, viewer), { left: 'spellbook', right: 'spellbook', readOnly: !viewer.isGM });
    }
  });

  test('edit mode counts only for the GM', () => {
    assert.equal(elementClicks(weaponEquipped, { editMode: true, isGM: false }).left, 'action');
  });
});

describe('elementClicks — elements without a sheet', () => {
  test('the empty book slot with race spells: the left opens them, no tooltip', () => {
    assert.deepEqual(elementClicks({ hasAction: true }, player), { left: 'action', right: 'none', readOnly: true });
  });

  test('a tooltip only when it explains more than the name', () => {
    assert.equal(elementClicks({ hasExplanation: true }, player).right, 'tooltip');
    assert.equal(elementClicks({}, player).right, 'none');
    assert.equal(elementClicks({}, player).left, 'none');
  });
});

describe('elementClicks — the chosen specialization', () => {
  const spec = { hasSheet: true, hasEditAction: true };

  test('outside edit mode: both buttons open the sheet', () => {
    assert.deepEqual(elementClicks(spec, player), { left: 'sheet', right: 'sheet', readOnly: true });
    assert.deepEqual(elementClicks(spec, gm), { left: 'sheet', right: 'sheet', readOnly: false });
  });

  test('the GM in edit mode: the left opens the choice window, the right the sheet', () => {
    assert.deepEqual(elementClicks(spec, gmEditing), { left: 'action', right: 'sheet', readOnly: false });
  });
});

describe('elementClicks — level-up choices', () => {
  test('a skill to raise or to learn: the left chooses, the right opens its sheet', () => {
    assert.deepEqual(elementClicks({ hasSheet: true, hasAction: true }, player), { left: 'action', right: 'sheet', readOnly: true });
  });

  test('the placeholder (no skill yet): the left opens the list, the right nothing', () => {
    assert.deepEqual(elementClicks({ hasSheet: false, hasAction: true }, player), { left: 'action', right: 'none', readOnly: true });
  });
});
