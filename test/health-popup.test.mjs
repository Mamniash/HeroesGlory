import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { healthPopup, spellDamageKind, HEALTH_POPUP_COLORS } from '../module/helpers/health-popup.mjs';

describe('healthPopup — the number over the token', () => {
  test('nothing changed — nothing rises', () => {
    assert.equal(healthPopup(0, 'fire'), null);
  });
  test('a loss is «−N» in its source\'s colour', () => {
    assert.deepEqual(healthPopup(-7, 'fire'), { text: '−7', fill: HEALTH_POPUP_COLORS.fire });
    assert.deepEqual(healthPopup(-3, 'weapon'), { text: '−3', fill: HEALTH_POPUP_COLORS.weapon });
  });
  test('a loss without a source (the GM\'s own edit) is white', () => {
    assert.equal(healthPopup(-2).fill, HEALTH_POPUP_COLORS.weapon);
  });
  test('a gain is always green «+N»', () => {
    assert.deepEqual(healthPopup(5, 'fire'), { text: '+5', fill: HEALTH_POPUP_COLORS.heal });
  });
});

describe('spellDamageKind — a spell\'s colour', () => {
  test('by the effect\'s element first', () => {
    assert.equal(spellDamageKind({ element: 'lightning', school: 'air' }), 'air');
    assert.equal(spellDamageKind({ element: 'ice', school: 'water' }), 'water');
    assert.equal(spellDamageKind({ element: 'fire', school: 'universal' }), 'fire');
  });
  test('else by the school', () => {
    assert.equal(spellDamageKind({ element: null, school: 'earth' }), 'earth');
    assert.equal(spellDamageKind({ element: '', school: 'fire' }), 'fire');
  });
  test('Универсальные or nothing — a spell without an element, pink', () => {
    assert.equal(spellDamageKind({ element: null, school: 'universal' }), 'magic');
    assert.equal(spellDamageKind({}), 'magic');
  });
});
