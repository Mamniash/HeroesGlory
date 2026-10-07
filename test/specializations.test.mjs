import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPECIALIZATION_SKILLS, SPECIALIZATION_SPELLS, specializationEffectTextKey, specializationModifiers,
  hasArmorSpecialization, specializationManaDiscount, chainLightningSpecialization,
  hasteSpecializationBonus, resurrectionSpecialization, fireWallSpecialization, cloneSpecialization,
  SPECIALIZATION_SPELL_ICON_FRAMES, specializationList, isSpecialization, isManualSpecialization,
  specializationRequirement, specializationShortage, specializationSpellName,
} from '../module/helpers/specializations.mjs';
import { specializationIconPath, specializationPlaceholderIconPath } from '../module/helpers/skill-icons.mjs';

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

describe('chainLightningSpecialization — p. 23 (rules.md §11)', () => {
  const spec = { type: 'spell', key: 'Цепная Молния' };
  test('on Цепная Молния: +1d6, full damage for the extras, two picked targets', () => {
    assert.deepEqual(chainLightningSpecialization(spec, 'Цепная Молния'), { active: true, bonusDice: 1, extraFactor: 1, chosenTargets: 2 });
  });
  test('another spell, or another specialization: nothing', () => {
    assert.equal(chainLightningSpecialization(spec, 'Молния').active, false);
    assert.equal(chainLightningSpecialization({ type: 'skill', key: 'sorcery' }, 'Цепная Молния').active, false);
    assert.equal(chainLightningSpecialization(null, 'Цепная Молния').active, false);
  });
});

describe('hasteSpecializationBonus — p. 23, «Ускоренные персонажи получают еще +3 к Скорости»', () => {
  test('the specialization, casting Ускорение', () => {
    assert.equal(hasteSpecializationBonus({ type: 'spell', key: 'Ускорение' }, 'Ускорение'), 3);
  });
  test('another spell, another specialization, none', () => {
    assert.equal(hasteSpecializationBonus({ type: 'spell', key: 'Ускорение' }, 'Молитва'), 0);
    assert.equal(hasteSpecializationBonus({ type: 'spell', key: 'Клон' }, 'Ускорение'), 0);
    assert.equal(hasteSpecializationBonus(null, 'Ускорение'), 0);
  });
});

describe('resurrectionSpecialization — p. 23, «Воскрешенный персонаж не получает ранение»', () => {
  test('the specialization, casting Воскрешение', () => {
    assert.equal(resurrectionSpecialization({ type: 'spell', key: 'Воскрешение' }, 'Воскрешение'), true);
  });
  test('otherwise not', () => {
    assert.equal(resurrectionSpecialization({ type: 'spell', key: 'Воскрешение' }, 'Лечение'), false);
    assert.equal(resurrectionSpecialization(null, 'Воскрешение'), false);
  });
});

describe('fireWallSpecialization — p. 23, «Урон увеличен на 5d6, добавляет одну дополнительную клетку»', () => {
  test('the specialization, casting Стена Огня', () => {
    assert.deepEqual(fireWallSpecialization({ type: 'spell', key: 'Стена Огня' }, 'Стена Огня'), { active: true, bonusDice: 5, extraCells: 1 });
  });
  test('otherwise nothing', () => {
    assert.deepEqual(fireWallSpecialization({ type: 'spell', key: 'Стена Огня' }, 'Инферно'), { active: false, bonusDice: 0, extraCells: 0 });
    assert.deepEqual(fireWallSpecialization(null, 'Стена Огня'), { active: false, bonusDice: 0, extraCells: 0 });
  });
});

describe('cloneSpecialization — p. 23, «двух клонов вместо одного, если потратите вдвое больше Маны»', () => {
  test('the specialization, casting Клон', () => {
    assert.deepEqual(cloneSpecialization({ type: 'spell', key: 'Клон' }, 'Клон'), { active: true, clones: 2, manaFactor: 2 });
  });
  test('otherwise one clone at the usual price', () => {
    assert.deepEqual(cloneSpecialization({ type: 'spell', key: 'Клон' }, 'Телепорт'), { active: false, clones: 1, manaFactor: 1 });
    assert.deepEqual(cloneSpecialization(null, 'Клон'), { active: false, clones: 1, manaFactor: 1 });
  });
});

describe('specializationList — all 12 of p. 23, skills first', () => {
  test('7 skills then 5 spells, in the book order', () => {
    const list = specializationList();
    assert.equal(list.length, 12);
    assert.deepEqual(list.slice(0, 7).map((s) => s.key), SPECIALIZATION_SKILLS);
    assert.deepEqual(list.slice(7).map((s) => s.key), SPECIALIZATION_SPELLS);
  });
  test('isSpecialization: one of the 12 only', () => {
    assert.equal(isSpecialization('skill', 'armor'), true);
    assert.equal(isSpecialization('spell', 'Клон'), true);
    assert.equal(isSpecialization('skill', 'luck'), false);
    assert.equal(isSpecialization('spell', 'Молния'), false);
    assert.equal(isSpecialization('', ''), false);
  });
  test('only Некромантия and Лечение are applied by hand', () => {
    const manual = specializationList().filter((s) => isManualSpecialization(s.type, s.key)).map((s) => s.key);
    assert.deepEqual(manual, ['necromancy', 'healing']);
  });
  test('every one has an icon: Expert skill icon or the spell icon', () => {
    for (const spec of specializationList()) assert.ok(specializationIconPath(spec, SPECIALIZATION_SPELL_ICON_FRAMES), spec.key);
    assert.equal(specializationIconPath({ type: 'spell', key: 'Клон' }, SPECIALIZATION_SPELL_ICON_FRAMES), 'systems/heroes-glory/assets/spells/spells_g00_f065.png');
    assert.equal(specializationIconPath({ type: 'skill', key: 'armor' }, SPECIALIZATION_SPELL_ICON_FRAMES, { large: true }), 'systems/heroes-glory/assets/secsk82/secsk82_g00_f074.png');
    assert.equal(specializationIconPath({ type: 'spell', key: 'Молния' }, SPECIALIZATION_SPELL_ICON_FRAMES), null);
  });
  test('placeholder: padlock / laurel crown', () => {
    assert.equal(specializationPlaceholderIconPath(false), 'systems/heroes-glory/assets/game-icons/lorc-padlock.svg');
    assert.equal(specializationPlaceholderIconPath(true), 'systems/heroes-glory/assets/game-icons/lorc-laurel-crown.svg');
  });
});

describe('specializationRequirement — level 10 and Expert / the spell (p. 23)', () => {
  const hero = (level, ownedSkills = [], ownedSpellNames = []) => ({ level, ownedSkills, ownedSpellNames });
  test('level 10 and Expert: met', () => {
    assert.equal(specializationRequirement({ type: 'skill', key: 'armor' }, hero(10, [{ skillKey: 'armor', tier: 'expert' }])).met, true);
  });
  test('level 9: missing the level even with Expert', () => {
    const r = specializationRequirement({ type: 'skill', key: 'armor' }, hero(9, [{ skillKey: 'armor', tier: 'expert' }]));
    assert.equal(r.met, false);
    assert.equal(r.missingLevel, true);
    assert.equal(r.missingSkill, false);
  });
  test('Advanced: missing the skill, the owned tier reported', () => {
    const r = specializationRequirement({ type: 'skill', key: 'armor' }, hero(12, [{ skillKey: 'armor', tier: 'base' }, { skillKey: 'armor', tier: 'advanced' }]));
    assert.equal(r.missingSkill, true);
    assert.equal(r.ownedTier, 'advanced');
  });
  test('the spell owned: met; not owned: missing', () => {
    assert.equal(specializationRequirement({ type: 'spell', key: 'Клон' }, hero(10, [], ['Клон'])).met, true);
    assert.equal(specializationRequirement({ type: 'spell', key: 'Клон' }, hero(10, [], ['Ускорение'])).missingSpell, true);
  });
});

describe('specializationShortage — the cell hint «Не хватает: …»', () => {
  test('one can be taken: null', () => {
    assert.equal(specializationShortage({ level: 10, ownedSkills: [], ownedSpellNames: ['Ускорение'] }), null);
  });
  test('level 7, nothing qualifies: the level, the closest skills, the spells', () => {
    assert.deepEqual(specializationShortage({
      level: 7,
      ownedSkills: [{ skillKey: 'armor', tier: 'base' }, { skillKey: 'assault', tier: 'advanced' }, { skillKey: 'luck', tier: 'expert' }],
      ownedSpellNames: ['Молния'],
    }), { level: 7, skills: [{ key: 'assault', tier: 'advanced' }, { key: 'armor', tier: 'base' }], spells: true });
  });
  test('level 7 with an Expert skill of the 7: only the level', () => {
    assert.deepEqual(specializationShortage({ level: 7, ownedSkills: [{ skillKey: 'intellect', tier: 'expert' }], ownedSpellNames: [] }),
      { level: 7, skills: null, spells: false });
  });
  test('level 10, nothing qualifies: no level line', () => {
    assert.deepEqual(specializationShortage({ level: 10, ownedSkills: [], ownedSpellNames: [] }), { level: null, skills: [], spells: true });
  });
});

describe('specializationSpellName — by compendium origin, the name as fallback', () => {
  const lookup = (uuid) => (uuid === 'Compendium.heroes-glory.spells.Item.abc' ? { name: 'Клон' } : null);
  test('a renamed copy from the spell compendium counts under the entry name', () => {
    assert.equal(specializationSpellName({ name: 'Двойник', _stats: { compendiumSource: 'Compendium.heroes-glory.spells.Item.abc' } }, { lookup }), 'Клон');
  });
  test('no source, another compendium, or an unresolved one: its own name', () => {
    assert.equal(specializationSpellName({ name: 'Клон', _stats: { compendiumSource: null } }, { lookup }), 'Клон');
    assert.equal(specializationSpellName({ name: 'Клон', _stats: { compendiumSource: 'Compendium.world.x.Item.abc' } }, { lookup }), 'Клон');
    assert.equal(specializationSpellName({ name: 'Клон', _stats: { compendiumSource: 'Compendium.heroes-glory.spells.Item.zzz' } }, { lookup }), 'Клон');
    assert.equal(specializationSpellName({ name: 'Клон' }, { lookup: undefined }), 'Клон');
  });
});
