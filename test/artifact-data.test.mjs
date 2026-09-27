import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildArtifactDocuments } from '../scripts/data/artifact-compendium-data.mjs';
import { ARTIFACT_LOCKED_SLOTS, PAPERDOLL_SLOT_GROUPS } from '../module/helpers/paperdoll-slots.mjs';

const docs = buildArtifactDocuments();
const byName = Object.fromEntries(docs.map((d) => [d.name, d.system]));

describe('artifact compendium — slots (§11 «Куда надевается артефакт»)', () => {
  test('71 entries; every non-weapon artifact has at least one slot', () => {
    assert.equal(docs.length, 71);
    for (const d of docs) {
      if (d.system.artifactType === 'enchantedWeapon') continue;
      assert.ok(d.system.targetSlots.length > 0, d.name);
    }
  });

  test('no artifact lists the book slot or a reserve slot', () => {
    for (const d of docs) for (const s of d.system.targetSlots) assert.ok(!ARTIFACT_LOCKED_SLOTS.includes(s), `${d.name}: ${s}`);
  });

  test('ring and «прочее» groups are always whole', () => {
    for (const d of docs) {
      for (const group of PAPERDOLL_SLOT_GROUPS) {
        const n = group.filter((s) => d.system.targetSlots.includes(s)).length;
        assert.ok(n === 0 || n === group.length, d.name);
      }
    }
  });

  test('all necklaces and Амулет Маны: neck and «прочее» (стр. 18, «несколько амулетов»)', () => {
    for (const d of docs.filter((x) => x.system.artifactType === 'necklace')) assert.deepEqual(d.system.targetSlots, [4, 11, 12, 13, 14, 15], d.name);
    assert.deepEqual(byName['Амулет Маны'].targetSlots, [4, 11, 12, 13, 14, 15]);
  });

  test('spot checks from the ruling table', () => {
    assert.deepEqual(byName['Сапоги-скороходы'].targetSlots, [9]);
    assert.deepEqual(byName['Шляпа волшебника'].targetSlots, [3]);
    assert.deepEqual(byName['Магические доспехи'].targetSlots, [5]);
    assert.deepEqual(byName['Мантия вампира'].targetSlots, [8]);
    assert.deepEqual(byName['Кольцо подавления'].targetSlots, [2, 7]);
    assert.deepEqual(byName['Знак отваги'].targetSlots, [11, 12, 13, 14, 15]);
  });
});

describe('artifact compendium — modifiers', () => {
  test('only «прибавить», no zero values', () => {
    for (const d of docs) {
      for (const m of d.system.modifiers) {
        assert.equal(m.mode, 'add', d.name);
        assert.notEqual(m.value, 0, d.name);
      }
    }
  });

  test('former «вычесть» entries carry a negative value', () => {
    assert.deepEqual(byName['Гладиус титана'].modifiers, [{ stat: 'attack', mode: 'add', value: 2 }, { stat: 'defense', mode: 'add', value: -3 }]);
    assert.deepEqual(byName['Щит короля гномов'].modifiers.find((m) => m.stat === 'speed'), { stat: 'speed', mode: 'add', value: -1 });
  });
});
