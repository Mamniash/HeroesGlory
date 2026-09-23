import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { HEROES_GLORY } from '../module/helpers/config.mjs';
import { CLASS_STATS, statsForClass, classDiff, concreteClassKey } from '../module/helpers/class-stats.mjs';

const ru = JSON.parse(readFileSync(new URL('../lang/ru.json', import.meta.url)));
const resolve = (key) => key.split('.').reduce((o, k) => o?.[k], ru);

describe('CLASS_STATS — §2.6 starting primary skills + base secondary skill per class', () => {
  test('all 20 rows are present', () => {
    assert.equal(Object.keys(CLASS_STATS).length, 20);
  });

  const expected = {
    knight: { attack: 2, defense: 2, magicPower: 1, knowledge: 1, secondarySkillKey: 'leadership' },
    cleric: { attack: 1, defense: 0, magicPower: 2, knowledge: 2, secondarySkillKey: 'healing' },
    ranger: { attack: 1, defense: 3, magicPower: 1, knowledge: 1, secondarySkillKey: 'archery' },
    druid: { attack: 0, defense: 2, magicPower: 1, knowledge: 2, secondarySkillKey: 'mysticism' },
    alchemist: { attack: 1, defense: 1, magicPower: 2, knowledge: 2, secondarySkillKey: 'wisdom' },
    mage: { attack: 0, defense: 0, magicPower: 2, knowledge: 3, secondarySkillKey: 'intellect' },
    beastmaster: { attack: 0, defense: 4, magicPower: 1, knowledge: 1, secondarySkillKey: 'armor' },
    witch: { attack: 0, defense: 1, magicPower: 2, knowledge: 2, secondarySkillKey: 'earthMagic' },
    lord: { attack: 2, defense: 2, magicPower: 1, knowledge: 1, secondarySkillKey: 'diplomacy' },
    warlock: { attack: 0, defense: 0, magicPower: 3, knowledge: 2, secondarySkillKey: 'sorcery' },
    possessed: { attack: 2, defense: 2, magicPower: 1, knowledge: 1, secondarySkillKey: 'tactics' },
    heretic: { attack: 1, defense: 1, magicPower: 2, knowledge: 1, secondarySkillKey: 'fireMagic' },
    deathKnight: { attack: 1, defense: 2, magicPower: 2, knowledge: 1, secondarySkillKey: 'necromancy' },
    necromancer: { attack: 1, defense: 0, magicPower: 2, knowledge: 2, secondarySkillKey: 'necromancy' },
    barbarian: { attack: 4, defense: 0, magicPower: 1, knowledge: 1, secondarySkillKey: 'assault' },
    battlemage: { attack: 2, defense: 1, magicPower: 1, knowledge: 1, secondarySkillKey: 'assault' },
    wanderer: { attack: 3, defense: 1, magicPower: 1, knowledge: 1, secondarySkillKey: 'pathfinding' },
    elementalist: { attack: 0, defense: 0, magicPower: 3, knowledge: 3, secondarySkillKey: 'airMagic' },
    captain: { attack: 3, defense: 0, magicPower: 2, knowledge: 1, secondarySkillKey: 'luck' },
    navigator: { attack: 2, defense: 0, magicPower: 1, knowledge: 2, secondarySkillKey: 'waterMagic' },
  };

  for (const [classKey, row] of Object.entries(expected)) {
    test(`${classKey}`, () => {
      assert.deepEqual(statsForClass(classKey), row);
    });
  }

  test('unknown class key resolves to null', () => {
    assert.equal(statsForClass('not-a-class'), null);
  });
});

describe('classDiff — pure before/after diff', () => {
  test('no changes → empty diff', () => {
    const stats = { attack: 2, defense: 2, magicPower: 1, knowledge: 1 };
    assert.deepEqual(classDiff(stats, stats), {});
  });

  test('only changed stats are included', () => {
    const current = { attack: 0, defense: 0, magicPower: 1, knowledge: 3 };
    const target = CLASS_STATS.knight;
    assert.deepEqual(classDiff(current, target), {
      attack: { before: 0, after: 2 },
      defense: { before: 0, after: 2 },
      knowledge: { before: 3, after: 1 },
    });
  });
});

describe('config.mjs classByFactionAndType — faction → concrete class integrity', () => {
  // Verified directly against config.mjs's own inline comments and
  // lang/ru.json's localized labels — catches a faction/class swapped
  // pair, which a plain set-equality check would miss.
  const EXPECTED = {
    castle: ['Замок', 'Рыцарь', 'Клерик'],
    stronghold: ['Оплот', 'Следопыт', 'Друид'],
    tower: ['Башня', 'Алхимик', 'Маг'],
    fortress: ['Крепость', 'Зверолов', 'Ведьма'],
    dungeon: ['Темница', 'Лорд', 'Чернокнижник'],
    inferno: ['Инферно', 'Одержимый', 'Еретик'],
    necropolis: ['Некрополис', 'Рыцарь Смерти', 'Некромант'],
    citadel: ['Цитадель', 'Варвар', 'Боевой маг'],
    nexus: ['Сопряжение', 'Странник', 'Элементалист'],
    haven: ['Причал', 'Капитан', 'Навигатор'],
  };

  for (const [factionKey, [factionLabel, warriorLabel, mageLabel]] of Object.entries(EXPECTED)) {
    test(`${factionKey} → ${factionLabel}`, () => {
      assert.equal(resolve(HEROES_GLORY.factions[factionKey]), factionLabel);
      const byType = HEROES_GLORY.classByFactionAndType[factionKey];
      assert.equal(resolve(HEROES_GLORY.classes[byType.warrior]), warriorLabel);
      assert.equal(resolve(HEROES_GLORY.classes[byType.mage]), mageLabel);
    });
  }

  test('every HEROES_GLORY.classes key appears in classByFactionAndType exactly once', () => {
    const usedKeys = Object.values(HEROES_GLORY.classByFactionAndType)
      .flatMap((byType) => [byType.warrior, byType.mage]);
    assert.deepEqual([...usedKeys].sort(), Object.keys(HEROES_GLORY.classes).sort());
    assert.equal(usedKeys.length, new Set(usedKeys).size, 'no duplicate class keys');
  });

  test('every concrete class key has a CLASS_STATS row', () => {
    for (const classKey of Object.keys(HEROES_GLORY.classes)) {
      assert.ok(CLASS_STATS[classKey], `missing CLASS_STATS entry for "${classKey}"`);
    }
  });

  test('classTypeByLegacyClassKey is the exact inverse of classByFactionAndType', () => {
    for (const [classKey, type] of Object.entries(HEROES_GLORY.classTypeByLegacyClassKey)) {
      const found = Object.values(HEROES_GLORY.classByFactionAndType)
        .some((byType) => byType[type] === classKey);
      assert.ok(found, `${classKey} -> ${type} doesn't match any classByFactionAndType entry`);
    }
  });
});

describe('concreteClassKey — §2.5 (faction, classType) -> concrete class', () => {
  test('resolves every faction/classType pair', () => {
    for (const [faction, byType] of Object.entries(HEROES_GLORY.classByFactionAndType)) {
      assert.equal(concreteClassKey(faction, 'warrior'), byType.warrior);
      assert.equal(concreteClassKey(faction, 'mage'), byType.mage);
    }
  });

  test('empty faction -> null', () => {
    assert.equal(concreteClassKey('', 'warrior'), null);
    assert.equal(concreteClassKey(null, 'warrior'), null);
  });

  test('empty classType -> null', () => {
    assert.equal(concreteClassKey('castle', ''), null);
    assert.equal(concreteClassKey('castle', null), null);
  });

  test('both empty -> null', () => {
    assert.equal(concreteClassKey('', ''), null);
  });

  test('unknown faction -> null', () => {
    assert.equal(concreteClassKey('not-a-faction', 'warrior'), null);
  });
});
