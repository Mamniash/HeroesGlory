import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPECIALIZATION_SKILLS, SPECIALIZATION_SPELLS, specializationModifiers,
  hasArmorSpecialization, specializationManaDiscount, chainLightningSpecialization,
  hasteSpecializationBonus, resurrectionSpecialization, fireWallSpecialization, cloneSpecialization,
  SPECIALIZATION_SPELL_ICON_FRAMES, specializationList, isSpecialization, isManualSpecialization,
  specializationRequirement, specializationShortage, specializationSpellName,
  specializationTypeOf, specializationFromKey, specializationLabel, specializationLabelKeys, pickSpecialization,
  specializationCreateRefusal, specializationDropDecision, legacySpecializationPlan, specializationHero,
  specializationSheetNotes,
} from '../module/helpers/specializations.mjs';
import { specializationIconPath, specializationPlaceholderIconPath } from '../module/helpers/skill-icons.mjs';

describe('specializationTypeOf / specializationFromKey / names — the key says the group', () => {
  test('skill keys, spell names, anything else', () => {
    assert.equal(specializationTypeOf('armor'), 'skill');
    assert.equal(specializationTypeOf('Клон'), 'spell');
    assert.equal(specializationTypeOf('luck'), null);
    assert.equal(specializationTypeOf(''), null);
    assert.deepEqual(specializationFromKey('Стена Огня'), { type: 'spell', key: 'Стена Огня' });
    assert.equal(specializationFromKey('Молния'), null);
  });
  test('label: a skill\'s through its lang key, a spell\'s is the key', () => {
    const localize = (k) => `<${k}>`;
    assert.equal(specializationLabel({ type: 'skill', key: 'sorcery' }, localize), '<HEROES_GLORY.SecondarySkill.Sorcery>');
    assert.equal(specializationLabel({ type: 'spell', key: 'Ускорение' }, localize), 'Ускорение');
    assert.equal(specializationLabelKeys().intellect, 'HEROES_GLORY.SecondarySkill.Intellect');
    assert.equal(specializationLabelKeys()['Клон'], 'Клон');
  });
});

describe('pickSpecialization — one per hero; two: the first by sort, then id', () => {
  test('none', () => {
    assert.deepEqual(pickSpecialization([]), { spec: null, itemId: null, count: 0, unresolved: [] });
  });
  test('one', () => {
    const r = pickSpecialization([{ id: 'a', sort: 0, key: 'Клон' }]);
    assert.deepEqual(r.spec, { type: 'spell', key: 'Клон' });
    assert.equal(r.itemId, 'a');
    assert.equal(r.count, 1);
  });
  test('two: lower sort wins, equal sort — lower id', () => {
    assert.equal(pickSpecialization([{ id: 'b', sort: 200, key: 'armor' }, { id: 'a', sort: 100, key: 'Клон' }]).itemId, 'a');
    const tie = pickSpecialization([{ id: 'zz', sort: 0, key: 'armor' }, { id: 'aa', sort: 0, key: 'Клон' }]);
    assert.equal(tie.itemId, 'aa');
    assert.equal(tie.count, 2);
  });
  test('a key not among the 12 never counts and is reported', () => {
    const r = pickSpecialization([{ id: 'a', sort: 0, key: '' }, { id: 'b', sort: 1, key: 'armor' }]);
    assert.deepEqual(r.spec, { type: 'skill', key: 'armor' });
    assert.deepEqual(r.unresolved, [{ id: 'a', key: '' }]);
    assert.equal(pickSpecialization([{ id: 'a', sort: 0, key: 'Молния' }]).spec, null);
  });
});

describe('specializationCreateRefusal — the rules for every creation', () => {
  const base = { parentType: 'hero', isGM: false, existingCount: 0, valid: true, met: true };
  test('a world or compendium item: always', () => {
    assert.equal(specializationCreateRefusal({ ...base, parentType: null, valid: false }), null);
  });
  test('only a hero', () => {
    assert.equal(specializationCreateRefusal({ ...base, parentType: 'creature' }), 'notHero');
  });
  test('never a second one — the GM too', () => {
    assert.equal(specializationCreateRefusal({ ...base, existingCount: 1 }), 'already');
    assert.equal(specializationCreateRefusal({ ...base, existingCount: 1, isGM: true }), 'already');
  });
  test('one of the 12', () => {
    assert.equal(specializationCreateRefusal({ ...base, valid: false, isGM: true }), 'invalid');
  });
  test('a player: the condition met; the GM: any', () => {
    assert.equal(specializationCreateRefusal({ ...base, met: false }), 'unmet');
    assert.equal(specializationCreateRefusal({ ...base, met: false, isGM: true }), null);
    assert.equal(specializationCreateRefusal(base), null);
  });
});

describe('specializationDropDecision — a drop on the hero sheet', () => {
  const base = { isGM: false, existingKey: null, existingCount: 0, key: 'armor', met: true };
  test('a player, none yet, met: confirm', () => {
    assert.deepEqual(specializationDropDecision(base), { action: 'confirm', replace: false, unmet: false });
  });
  test('a player: not met, already one, not one of the 12 — refused', () => {
    assert.deepEqual(specializationDropDecision({ ...base, met: false }), { action: 'refuse', reason: 'unmet' });
    assert.deepEqual(specializationDropDecision({ ...base, existingKey: 'Клон', existingCount: 1 }), { action: 'refuse', reason: 'already' });
    assert.deepEqual(specializationDropDecision({ ...base, key: 'luck' }), { action: 'refuse', reason: 'invalid' });
  });
  test('the GM: confirm, replacing, with the unmet warning', () => {
    assert.deepEqual(specializationDropDecision({ ...base, isGM: true, existingKey: 'Клон', existingCount: 1, met: false }),
      { action: 'confirm', replace: true, unmet: true });
    assert.deepEqual(specializationDropDecision({ ...base, isGM: true }), { action: 'confirm', replace: false, unmet: false });
  });
  test('the GM, the very one already there: nothing', () => {
    assert.deepEqual(specializationDropDecision({ ...base, isGM: true, existingKey: 'armor', existingCount: 1 }), { action: 'refuse', reason: 'same' });
  });
  test('the GM, two on the hero and the same one dropped: a replace that leaves one', () => {
    assert.deepEqual(specializationDropDecision({ ...base, isGM: true, existingKey: 'armor', existingCount: 2 }),
      { action: 'confirm', replace: true, unmet: false });
  });
});

describe('legacySpecializationPlan — the old field to an item', () => {
  test('a filled old field, no item, not migrated: create it', () => {
    assert.deepEqual(legacySpecializationPlan({ legacy: { type: 'spell', key: 'Клон' }, migrated: false, itemCount: 0 }), { create: 'Клон' });
  });
  test('migrated, an item there already, blank, or not one of the 12: nothing', () => {
    const legacy = { type: 'spell', key: 'Клон' };
    assert.deepEqual(legacySpecializationPlan({ legacy, migrated: true, itemCount: 0 }), { create: null });
    assert.deepEqual(legacySpecializationPlan({ legacy, migrated: false, itemCount: 1 }), { create: null });
    assert.deepEqual(legacySpecializationPlan({ legacy: { type: '', key: '' }, migrated: false, itemCount: 0 }), { create: null });
    assert.deepEqual(legacySpecializationPlan({ legacy: { type: 'skill', key: 'Клон' }, migrated: false, itemCount: 0 }), { create: null });
    assert.deepEqual(legacySpecializationPlan({ legacy: null, migrated: false, itemCount: 0 }), { create: null });
  });
});

describe('specializationHero — what the conditions read off an actor', () => {
  test('level, skills, spells by name', () => {
    const actor = {
      system: { level: 10 },
      items: [
        { type: 'skill', system: { skillKey: 'armor', tier: 'expert' } },
        { type: 'spell', name: 'Клон', _stats: { compendiumSource: null } },
        { type: 'specialization', system: { key: 'armor' } },
      ],
    };
    assert.deepEqual(specializationHero(actor, { lookup: undefined }), {
      level: 10, ownedSkills: [{ skillKey: 'armor', tier: 'expert' }], ownedSpellNames: ['Клон'],
    });
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

describe('specializationSheetNotes — the hero-only notes on the sheet (§4.3)', () => {
  const none = { notCounted: false, duplicate: false, castNote: null };

  test('off a hero (the compendium entry): nothing, whatever is passed', () => {
    assert.deepEqual(specializationSheetNotes({ onHero: false, itemId: 'a', countingItemId: 'b', count: 2, castNote: 'x' }), none);
  });

  test('one specialization on the hero, castable: nothing', () => {
    assert.deepEqual(specializationSheetNotes({ onHero: true, itemId: 'a', countingItemId: 'a', count: 1 }), none);
  });

  test('two on the hero: the counting one says «действует эта», the other «эта не действует»', () => {
    assert.deepEqual(specializationSheetNotes({ onHero: true, itemId: 'a', countingItemId: 'a', count: 2 }),
      { notCounted: false, duplicate: true, castNote: null });
    assert.deepEqual(specializationSheetNotes({ onHero: true, itemId: 'b', countingItemId: 'a', count: 2 }),
      { notCounted: true, duplicate: false, castNote: null });
  });

  test('«Сотворить пока нельзя» shows on the hero when there is one', () => {
    assert.equal(specializationSheetNotes({ onHero: true, itemId: 'a', countingItemId: 'a', count: 1, castNote: 'Сотворить пока нельзя: нужна Книга Магии' }).castNote,
      'Сотворить пока нельзя: нужна Книга Магии');
    assert.equal(specializationSheetNotes({ onHero: true, itemId: 'a', countingItemId: 'a', count: 1, castNote: null }).castNote, null);
  });
});
