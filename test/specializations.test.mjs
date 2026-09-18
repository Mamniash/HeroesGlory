import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPECIALIZATION_SKILLS, SPECIALIZATION_SPELLS, specializationEffectTextKey, specializationModifiers,
  hasArmorSpecialization, specializationManaDiscount, availableSpecializations,
} from '../module/helpers/specializations.mjs';

describe('specializationEffectTextKey — §4.3 p.23 lookup', () => {
  test('resolves every one of the 7 skill-based specializations', () => {
    for (const key of SPECIALIZATION_SKILLS) {
      assert.ok(specializationEffectTextKey('skill', key), `${key} should resolve to a loc key`);
    }
  });

  test('resolves every one of the 5 spell-based specializations', () => {
    for (const key of SPECIALIZATION_SPELLS) {
      assert.ok(specializationEffectTextKey('spell', key), `${key} should resolve to a loc key`);
    }
  });

  test('unknown/blank type or key resolves to null', () => {
    assert.equal(specializationEffectTextKey('', ''), null);
    assert.equal(specializationEffectTextKey('skill', 'not-a-skill'), null);
    assert.equal(specializationEffectTextKey('spell', 'Не заклинание'), null);
  });
});

describe('specializationModifiers — §4.3 the one numeric specialization', () => {
  test('Интеллект: +50 mana.max', () => {
    assert.deepEqual(specializationModifiers('skill', 'intellect'), [
      { stat: 'mana.max', mode: 'add', value: 50 },
    ]);
  });

  test('every other skill/spell specialization has no modifier', () => {
    for (const key of SPECIALIZATION_SKILLS) {
      if (key === 'intellect') continue;
      assert.deepEqual(specializationModifiers('skill', key), []);
    }
    for (const key of SPECIALIZATION_SPELLS) {
      assert.deepEqual(specializationModifiers('spell', key), []);
    }
  });

  test('blank/unknown specialization has no modifier', () => {
    assert.deepEqual(specializationModifiers('', ''), []);
  });
});

describe('hasArmorSpecialization — §4.3 Доспехи gate', () => {
  test('true only for the armor skill specialization', () => {
    assert.equal(hasArmorSpecialization({ type: 'skill', key: 'armor' }), true);
  });

  test('false for every other specialization, null, and undefined', () => {
    assert.equal(hasArmorSpecialization({ type: 'skill', key: 'assault' }), false);
    assert.equal(hasArmorSpecialization({ type: 'spell', key: 'Ускорение' }), false);
    assert.equal(hasArmorSpecialization({ type: '', key: '' }), false);
    assert.equal(hasArmorSpecialization(null), false);
    assert.equal(hasArmorSpecialization(undefined), false);
  });
});

describe('specializationManaDiscount — §4.3 Воскрешение -4 Маны', () => {
  test('4 only when the Воскрешение specialization casts Воскрешение itself', () => {
    assert.equal(specializationManaDiscount({ type: 'spell', key: 'Воскрешение' }, 'Воскрешение'), 4);
  });

  test('0 when casting a different spell despite owning the specialization', () => {
    assert.equal(specializationManaDiscount({ type: 'spell', key: 'Воскрешение' }, 'Ускорение'), 0);
  });

  test('0 for any other specialization, and for none at all', () => {
    assert.equal(specializationManaDiscount({ type: 'skill', key: 'intellect' }, 'Воскрешение'), 0);
    assert.equal(specializationManaDiscount(null, 'Воскрешение'), 0);
  });
});

describe('availableSpecializations — §4.3 what a hero currently qualifies for', () => {
  test('no owned skills/spells at all: empty', () => {
    assert.deepEqual(availableSpecializations([], []), []);
  });

  test('a base/advanced-tier skill does not qualify — Expert only', () => {
    assert.deepEqual(availableSpecializations([{ skillKey: 'assault', tier: 'advanced' }], []), []);
  });

  test('an Expert-tier skill among the 7 qualifies', () => {
    assert.deepEqual(availableSpecializations([{ skillKey: 'intellect', tier: 'expert' }], []), [
      { type: 'skill', key: 'intellect' },
    ]);
  });

  test('an Expert-tier skill NOT among the 7 does not qualify', () => {
    assert.deepEqual(availableSpecializations([{ skillKey: 'luck', tier: 'expert' }], []), []);
  });

  test('an owned spell among the 5 qualifies', () => {
    assert.deepEqual(availableSpecializations([], ['Ускорение']), [{ type: 'spell', key: 'Ускорение' }]);
  });

  test('an owned spell NOT among the 5 does not qualify', () => {
    assert.deepEqual(availableSpecializations([], ['Волшебная Стрела']), []);
  });

  test('skills and spells combine, skills first', () => {
    const result = availableSpecializations(
      [{ skillKey: 'armor', tier: 'expert' }, { skillKey: 'intellect', tier: 'expert' }],
      ['Клон'],
    );
    assert.deepEqual(result, [
      { type: 'skill', key: 'armor' },
      { type: 'skill', key: 'intellect' },
      { type: 'spell', key: 'Клон' },
    ]);
  });
});
