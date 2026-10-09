import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  resolveStartingSecondarySkill, artifactTypeForDie, pickArtifactRow, ARTIFACT_TABLE_ROWS,
  ARTIFACT_TYPE_BY_D6, startingWeaponSpecs, startingSpellbookGrant, isValidSpellChoice,
  isHeroCreated, missingIdentityFields, IDENTITY_FIELDS, pickFreeSlot, resolveCreationRollback,
  isCreationLevelUp, creationResetExperience, artifactKey, takenStartingArtifactKeys,
  pickUniqueArtifact, createSerialQueue, STARTING_ARTIFACT_KEYS,
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

describe('unique starting artifact — §11, по просьбе Сени', () => {
  const artifact = (artifactType, row, extra = {}) => ({
    name: 'Артефакт', type: 'artifact', system: { artifactType },
    flags: row === undefined ? {} : { 'heroes-glory': { tableRow: row, ...extra } },
  });
  const all61 = () => new Set(STARTING_ARTIFACT_KEYS);

  test('artifactKey: type and table row', () => {
    assert.equal(artifactKey(artifact('necklace', 7)), 'necklace:7');
  });

  test('artifactKey: no table row — no key (unbranded armour, a weapon)', () => {
    assert.equal(artifactKey(artifact('enchantedArmor')), null);
    assert.equal(artifactKey({ type: 'weapon', system: { damage: 5 }, flags: {} }), null);
  });

  test('artifactKey: renaming keeps the key', () => {
    assert.equal(artifactKey({ ...artifact('magicItem', 3), name: 'Мой клевер' }), 'magicItem:3');
  });

  test('takenStartingArtifactKeys: every hero, creation grant or not', () => {
    const actors = [
      { type: 'hero', items: [artifact('necklace', 7, { creationGrant: 'artifact' }), artifact('enchantedArmor')] },
      { type: 'hero', items: [artifact('enchantedWeapon', 12)] },
      { type: 'creature', items: [artifact('magicItem', 2)] },
      { type: 'hero', items: [{ type: 'weapon', system: {}, flags: {} }] },
    ];
    assert.deepEqual([...takenStartingArtifactKeys(actors)].sort(), ['enchantedWeapon:12', 'necklace:7']);
  });

  test('pickUniqueArtifact: a free artifact — no rerolls', () => {
    assert.deepEqual(pickUniqueArtifact([{ typeDie: 4, rowTotals: [7] }], new Set()),
      { artifactType: 'necklace', typeDie: 4, row: 7, rowRerolls: 0, takenRerolls: 0, unique: true });
  });

  test('pickUniqueArtifact: a taken one rerolls both d6 and 2d6', () => {
    const pick = pickUniqueArtifact([{ typeDie: 4, rowTotals: [7] }, { typeDie: 1, rowTotals: [7] }], new Set(['necklace:7']));
    assert.deepEqual(pick, { artifactType: 'enchantedWeapon', typeDie: 1, row: 7, rowRerolls: 0, takenRerolls: 1, unique: true });
  });

  test('pickUniqueArtifact: 12 on a 2–11 table is still rerolled inside the attempt', () => {
    const pick = pickUniqueArtifact([{ typeDie: 2, rowTotals: [12, 12, 5] }], new Set());
    assert.equal(pick.row, 5);
    assert.equal(pick.rowRerolls, 2);
    assert.equal(pick.unique, true);
  });

  test('pickUniqueArtifact: all 61 taken — the fallback is the first roll as it fell', () => {
    const pick = pickUniqueArtifact([{ typeDie: 3, rowTotals: [9] }], all61());
    assert.deepEqual(pick, { artifactType: 'enchantedShield', typeDie: 3, row: 9, rowRerolls: 0, takenRerolls: 0, unique: false });
  });

  test('pickUniqueArtifact: attempts run out — the fallback', () => {
    const taken = new Set(['necklace:7', 'magicItem:8']);
    const pick = pickUniqueArtifact([{ typeDie: 4, rowTotals: [7] }, { typeDie: 6, rowTotals: [8] }], taken);
    assert.equal(pick.unique, false);
    assert.equal(pick.artifactType, 'necklace');
    assert.equal(pick.row, 7);
  });

  test('pickUniqueArtifact: no row yet — null', () => {
    assert.equal(pickUniqueArtifact([{ typeDie: 2, rowTotals: [12] }], new Set()), null);
  });

  test('the compendium has exactly the 61 table entries, keys unique', async () => {
    const { buildArtifactDocuments } = await import('../scripts/data/artifact-compendium-data.mjs');
    const keys = buildArtifactDocuments().map(artifactKey).filter(Boolean);
    assert.equal(keys.length, 61);
    assert.equal(new Set(keys).size, 61);
    assert.deepEqual([...keys].sort(), [...STARTING_ARTIFACT_KEYS].sort());
  });

  test('queue: two grants in a row with one artifact free — no duplicate', async () => {
    const enqueue = createSerialQueue();
    const free = 'magicItem:11';
    const taken = new Set(STARTING_ARTIFACT_KEYS.filter((key) => key !== free));
    const heroes = [{ type: 'hero', items: [] }, { type: 'hero', items: [] }];
    const allActors = [...heroes, { type: 'hero', items: [...taken].map((k) => {
      const [type, row] = k.split(':');
      return artifact(type, Number(row));
    }) }];
    const grant = (hero) => enqueue(async () => {
      const pick = pickUniqueArtifact([{ typeDie: 6, rowTotals: [11] }], takenStartingArtifactKeys(allActors));
      await new Promise((resolve) => setTimeout(resolve, 5)); // the item creation round trip
      hero.items.push(artifact(pick.artifactType, pick.row));
      return pick;
    });
    const [first, second] = await Promise.all(heroes.map(grant));
    assert.equal(first.unique, true);
    assert.equal(second.unique, false);
  });

  test('queue: a failed task does not stop the next', async () => {
    const enqueue = createSerialQueue();
    await assert.rejects(enqueue(async () => { throw new Error('boom'); }));
    assert.equal(await enqueue(async () => 42), 42);
  });

  test('the new card lines exist in lang/ru.json', () => {
    const ru = JSON.parse(fs.readFileSync(new URL('../lang/ru.json', import.meta.url), 'utf8'));
    for (const key of ['ArtifactTakenRerolls', 'ArtifactNoneUnique', 'ArtifactPending', 'ArtifactChatTitle']) {
      assert.equal(typeof ru.HEROES_GLORY.Creation[key], 'string', key);
    }
  });
});

describe('startingWeaponSpecs — p. 17 damage by class', () => {
  const shape = (specs) => specs.map(({ ranged, damage }) => ({ ranged, damage }));

  test('warrior 5, wizard 3', () => {
    assert.deepEqual(shape(startingWeaponSpecs({ classType: 'warrior', archer: false })), [{ ranged: false, damage: 5 }]);
    assert.deepEqual(shape(startingWeaponSpecs({ classType: 'mage', archer: false })), [{ ranged: false, damage: 3 }]);
  });

  test('a shooter gets two weapons: ranged 5 and melee 3, whatever the class', () => {
    for (const classType of ['warrior', 'mage']) {
      assert.deepEqual(shape(startingWeaponSpecs({ classType, archer: true })),
        [{ ranged: true, damage: 5 }, { ranged: false, damage: 3 }]);
    }
  });

  test('ready-made: melee is a blade (Колющий/рубящий, Клинковое), ranged is ranged', () => {
    const [ranged, melee] = startingWeaponSpecs({ classType: 'warrior', archer: true });
    assert.equal(ranged.weaponType, 'ranged');
    assert.equal(ranged.category, 'ranged');
    assert.equal(melee.weaponType, 'piercingSlashing');
    assert.equal(melee.category, 'blade');
    assert.ok(melee.weaponType in HEROES_GLORY.weaponTypes);
  });

  test('each weapon has its own name key, by class or by role for a shooter', () => {
    assert.equal(startingWeaponSpecs({ classType: 'warrior', archer: false })[0].nameKey, 'HEROES_GLORY.Creation.WeaponWarriorName');
    assert.equal(startingWeaponSpecs({ classType: 'mage', archer: false })[0].nameKey, 'HEROES_GLORY.Creation.WeaponMageName');
    assert.deepEqual(startingWeaponSpecs({ classType: 'mage', archer: true }).map((s) => s.nameKey),
      ['HEROES_GLORY.Creation.WeaponRangedName', 'HEROES_GLORY.Creation.WeaponMeleeName']);
  });

  test('the name keys exist in lang/ru.json', () => {
    const ru = JSON.parse(fs.readFileSync(new URL('../lang/ru.json', import.meta.url), 'utf8'));
    const keys = new Set(['warrior', 'mage'].flatMap((classType) => [true, false]
      .flatMap((archer) => startingWeaponSpecs({ classType, archer }).map((s) => s.nameKey))));
    for (const key of keys) {
      const value = key.split('.').reduce((obj, part) => obj?.[part], ru);
      assert.equal(typeof value, 'string', key);
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

describe('isHeroCreated — level 0 is "not created"', () => {
  const hero = (over) => ({ level: 0, creation: { complete: false }, ...over });

  test('a new level-0 hero is not created', () => {
    assert.equal(isHeroCreated(hero()), false);
  });

  test('a completed creation counts, at any level — also at 0 with the level-ups still banked', () => {
    assert.equal(isHeroCreated(hero({ creation: { complete: true } })), true);
    assert.equal(isHeroCreated(hero({ level: 3, creation: { complete: true } })), true);
  });

  test('above level 0 without a completed creation: counts as created (older heroes)', () => {
    assert.equal(isHeroCreated(hero({ level: 2 })), true);
  });
});

describe('isCreationLevelUp — level-ups up to the level picked at creation', () => {
  test('up to the picked level: creation', () => {
    assert.equal(isCreationLevelUp({ complete: true, targetLevel: 3 }, 1), true);
    assert.equal(isCreationLevelUp({ complete: true, targetLevel: 3 }, 3), true);
  });

  test('past it: ordinary, earned in play', () => {
    assert.equal(isCreationLevelUp({ complete: true, targetLevel: 3 }, 4), false);
  });

  test('no creation (older heroes, or not created yet): never', () => {
    assert.equal(isCreationLevelUp({ complete: false, targetLevel: 0 }, 1), false);
    assert.equal(isCreationLevelUp({ complete: true, targetLevel: 0 }, 1), false);
  });
});

describe('creationResetExperience — experience after «Сбросить создание»', () => {
  test('nothing earned in play: back to the experience before creation', () => {
    assert.equal(creationResetExperience({ experienceBefore: 0, experience: 150, targetThreshold: 150 }), 0);
  });

  test('experience earned past the picked level stays', () => {
    assert.equal(creationResetExperience({ experienceBefore: 0, experience: 170, targetThreshold: 150 }), 20);
  });

  test('never below the experience before creation', () => {
    assert.equal(creationResetExperience({ experienceBefore: 5, experience: 100, targetThreshold: 150 }), 5);
  });
});

describe('missingIdentityFields — what to pick before creation', () => {
  test('all three missing, in sheet order', () => {
    assert.deepEqual(missingIdentityFields({ race: '', faction: '', classType: '' }), ['race', 'faction', 'classType']);
  });

  test('only the blank ones', () => {
    assert.deepEqual(missingIdentityFields({ race: 'human', faction: '', classType: 'mage' }), ['faction']);
    assert.deepEqual(missingIdentityFields({ race: 'human', faction: 'castle', classType: 'mage' }), []);
  });

  test('each field has a label in lang/ru.json', () => {
    const ru = JSON.parse(fs.readFileSync(new URL('../lang/ru.json', import.meta.url), 'utf8'));
    for (const field of IDENTITY_FIELDS) {
      assert.equal(typeof ru.HEROES_GLORY.Creation.MissingField[field], 'string', field);
    }
  });
});

describe('pickFreeSlot — equip granted items where possible', () => {
  test('first free valid slot', () => {
    assert.equal(pickFreeSlot([2, 7], []), 2);
    assert.equal(pickFreeSlot([2, 7], [2]), 7);
  });

  test('none free (or none valid) → backpack', () => {
    assert.equal(pickFreeSlot([6], [6]), null);
    assert.equal(pickFreeSlot([], []), null);
  });
});

describe('resolveCreationRollback — undo the level-ups made inside creation', () => {
  const up = (over) => ({ primarySkillKey: 'attack', healthAdded: 0, grantedItemId: null, upgradedItemId: null, upgradedFromTier: null, ...over });

  test('nothing recorded, nothing to undo', () => {
    assert.deepEqual(resolveCreationRollback([]), { primaryDeltas: {}, healthDelta: 0, deleteItemIds: [], tierRestores: [] });
  });

  test('primary skills are subtracted per level-up, Защита also takes its +5 ОЗ back', () => {
    const result = resolveCreationRollback([
      up({ primarySkillKey: 'attack' }),
      up({ primarySkillKey: 'defense', healthAdded: 5 }),
      up({ primarySkillKey: 'attack' }),
    ]);
    assert.deepEqual(result.primaryDeltas, { attack: -2, defense: -1 });
    assert.equal(result.healthDelta, -5);
  });

  test('a skill a level-up granted is deleted', () => {
    assert.deepEqual(resolveCreationRollback([up({ grantedItemId: 'a' }), up({ grantedItemId: 'b' })]).deleteItemIds, ['a', 'b']);
  });

  test('a raised skill goes back to the tier before its first raise', () => {
    const result = resolveCreationRollback([
      up({ upgradedItemId: 'base', upgradedFromTier: 'base' }),
      up({ upgradedItemId: 'base', upgradedFromTier: 'advanced' }),
    ]);
    assert.deepEqual(result.tierRestores, [{ itemId: 'base', tier: 'base' }]);
  });

  test('a skill granted and then raised inside creation is only deleted', () => {
    const result = resolveCreationRollback([
      up({ grantedItemId: 'new' }),
      up({ upgradedItemId: 'new', upgradedFromTier: 'base' }),
    ]);
    assert.deepEqual(result.deleteItemIds, ['new']);
    assert.deepEqual(result.tierRestores, []);
  });
});
