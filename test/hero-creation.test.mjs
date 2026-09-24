import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveStartingSecondarySkill, artifactTypeForDie, pickArtifactRow, ARTIFACT_TABLE_ROWS,
  ARTIFACT_TYPE_BY_D6, startingWeaponSpecs, startingSpellbookGrant, isValidSpellChoice,
} from '../module/helpers/hero-creation.mjs';
import { WEAPON_EPIC_TABLES, MELEE_WEAPON_CATEGORIES } from '../module/helpers/weapon-epic-tables.mjs';
import { raceGrantedItems } from '../module/helpers/race-granted-items.mjs';
import { HEROES_GLORY } from '../module/helpers/config.mjs';

// The artifact builder stamps coreVersion from an installed Foundry — point
// it at a fixture manifest, same as creature-data.test.mjs.
const fakeFoundry = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-foundry-'));
fs.writeFileSync(path.join(fakeFoundry, 'package.json'), JSON.stringify({ release: { generation: 14, build: 365 } }));
process.env.FOUNDRY_APP_PATH = fakeFoundry;

describe('resolveStartingSecondarySkill — p. 16 random second skill', () => {
  test('a different skill is added as new', () => {
    assert.deepEqual(resolveStartingSecondarySkill({ die: 1, faction: 'castle', baseSkillKey: 'leadership' }),
      { skillKey: 'assault', upgradesBase: false });
  });

  test('rolling the base skill raises it instead of adding a duplicate', () => {
    assert.deepEqual(resolveStartingSecondarySkill({ die: 6, faction: 'castle', baseSkillKey: 'leadership' }),
      { skillKey: 'leadership', upgradesBase: true });
  });

  test('row 20: Некромантия for Некрополис, Лечение for the rest', () => {
    assert.equal(resolveStartingSecondarySkill({ die: 20, faction: 'necropolis', baseSkillKey: 'assault' }).skillKey, 'necromancy');
    assert.equal(resolveStartingSecondarySkill({ die: 20, faction: 'castle', baseSkillKey: 'assault' }).skillKey, 'healing');
  });

  test('row 20 matching the base skill (Некромант, Клирик) raises it', () => {
    assert.equal(resolveStartingSecondarySkill({ die: 20, faction: 'necropolis', baseSkillKey: 'necromancy' }).upgradesBase, true);
    assert.equal(resolveStartingSecondarySkill({ die: 20, faction: 'castle', baseSkillKey: 'healing' }).upgradesBase, true);
  });
});

describe('starting artifact — p. 18, d6 type then 2d6 row', () => {
  test('d6 follows the book list order', () => {
    assert.equal(artifactTypeForDie(1), 'enchantedWeapon');
    assert.equal(artifactTypeForDie(6), 'magicItem');
    assert.throws(() => artifactTypeForDie(7), RangeError);
  });

  test('12 on a 2–11 table is rerolled', () => {
    assert.deepEqual(pickArtifactRow([12, 12, 7], 10), { row: 7, rerolls: 2 });
    assert.deepEqual(pickArtifactRow([12], 10), null);
  });

  test('12 on the enchanted-weapon table (2–12) stands', () => {
    assert.deepEqual(pickArtifactRow([12], ARTIFACT_TABLE_ROWS.enchantedWeapon), { row: 12, rerolls: 0 });
  });

  test('row counts match the compendium\'s book entries', async () => {
    const { buildArtifactDocuments } = await import('../scripts/data/artifact-compendium-data.mjs');
    const rows = {};
    for (const doc of buildArtifactDocuments()) {
      const row = doc.flags['heroes-glory']?.tableRow;
      if (row) (rows[doc.system.artifactType] ??= []).push(row);
    }
    for (const type of ARTIFACT_TYPE_BY_D6) {
      const expected = Array.from({ length: ARTIFACT_TABLE_ROWS[type] }, (_, i) => i + 2);
      assert.deepEqual(rows[type], expected, type);
    }
  });
});

describe('startingWeaponSpecs — p. 17 damage by class', () => {
  test('warrior 5, wizard 3', () => {
    assert.deepEqual(startingWeaponSpecs({ classType: 'warrior', archer: false }), [{ ranged: false, damage: 5 }]);
    assert.deepEqual(startingWeaponSpecs({ classType: 'mage', archer: false }), [{ ranged: false, damage: 3 }]);
  });

  test('a shooter gets two weapons: ranged 5 and melee 3, whatever the class', () => {
    for (const classType of ['warrior', 'mage']) {
      assert.deepEqual(startingWeaponSpecs({ classType, archer: true }),
        [{ ranged: true, damage: 5 }, { ranged: false, damage: 3 }]);
    }
  });

  test('every melee category has its 6-row epic table', () => {
    for (const key of Object.keys(MELEE_WEAPON_CATEGORIES)) {
      assert.equal(WEAPON_EPIC_TABLES[key].length, 6);
      assert.ok(WEAPON_EPIC_TABLES[key].every((row) => row.length > 0), key);
    }
  });
});

describe('startingSpellbookGrant — p. 17 Книга Магии', () => {
  test('wizard: book and two spells; rolled Мудрость adds nothing', () => {
    assert.deepEqual(startingSpellbookGrant({ classKey: 'mage', classType: 'mage', rolledSkillKey: 'assault' }), { book: true, spellChoices: 2 });
    assert.deepEqual(startingSpellbookGrant({ classKey: 'mage', classType: 'mage', rolledSkillKey: 'wisdom' }), { book: true, spellChoices: 2 });
  });

  test('Алхимик: book and one spell, rolled Мудрость adds nothing', () => {
    assert.deepEqual(startingSpellbookGrant({ classKey: 'alchemist', classType: 'warrior', rolledSkillKey: 'assault' }), { book: true, spellChoices: 1 });
    assert.deepEqual(startingSpellbookGrant({ classKey: 'alchemist', classType: 'warrior', rolledSkillKey: 'wisdom' }), { book: true, spellChoices: 1 });
  });

  test('another warrior: book and one spell only on a rolled Мудрость', () => {
    assert.deepEqual(startingSpellbookGrant({ classKey: 'knight', classType: 'warrior', rolledSkillKey: 'wisdom' }), { book: true, spellChoices: 1 });
    assert.deepEqual(startingSpellbookGrant({ classKey: 'knight', classType: 'warrior', rolledSkillKey: 'assault' }), { book: false, spellChoices: 0 });
  });

  test('Джинн-маг: book from the class, so the race gives Молния and no second book', () => {
    const { book } = startingSpellbookGrant({ classKey: 'mage', classType: 'mage', rolledSkillKey: 'assault' });
    assert.deepEqual(raceGrantedItems('djinn', null, { hasSpellbook: book }), [{ itemType: 'spell', spellName: 'Молния' }]);
  });

  test('spell choice: exact count, distinct, only offered spells', () => {
    const offered = ['Щит', 'Ускорение', 'Волшебная Стрела'];
    assert.equal(isValidSpellChoice(['Щит', 'Ускорение'], 2, offered), true);
    assert.equal(isValidSpellChoice(['Щит'], 2, offered), false);
    assert.equal(isValidSpellChoice(['Щит', 'Щит'], 2, offered), false);
    assert.equal(isValidSpellChoice(['Молния'], 1, offered), false);
  });

  test('class keys used here exist in config', () => {
    assert.equal(HEROES_GLORY.classByFactionAndType.tower.warrior, 'alchemist');
    assert.equal(HEROES_GLORY.classByFactionAndType.tower.mage, 'mage');
    assert.ok('wisdom' in HEROES_GLORY.secondarySkills);
  });
});
