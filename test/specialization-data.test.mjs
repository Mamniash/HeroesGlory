import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSpecializationDocuments, SPECIALIZATION_TEXTS } from '../scripts/data/specialization-compendium-data.mjs';
import {
  SPECIALIZATION_SKILLS, SPECIALIZATION_SPELLS, SPECIALIZATION_SPELL_ICON_FRAMES, specializationLabelKeys,
} from '../module/helpers/specializations.mjs';
import { specializationIconPath } from '../module/helpers/skill-icons.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lang = JSON.parse(fs.readFileSync(path.join(ROOT, 'lang', 'ru.json'), 'utf8'));
const docs = buildSpecializationDocuments();

describe('compendium «Специализации» (§4.3, p. 23)', () => {
  test('12 entries, book order: the 7 skills, then the 5 spells', () => {
    assert.deepEqual(docs.map((d) => d.system.key), [...SPECIALIZATION_SKILLS, ...SPECIALIZATION_SPELLS]);
    for (const d of docs) assert.equal(d.type, 'specialization');
  });

  test('names: a skill\'s from lang/ (its secondary skill), a spell\'s — the key', () => {
    const byKey = Object.fromEntries(docs.map((d) => [d.system.key, d.name]));
    assert.equal(byKey.assault, lang.HEROES_GLORY.SecondarySkill.Assault);
    assert.equal(byKey.intellect, 'Интеллект');
    assert.equal(byKey['Клон'], 'Клон');
  });

  test('every entry has its book text, and lang/ has no copy of it any more', () => {
    for (const d of docs) assert.equal(d.system.description, SPECIALIZATION_TEXTS[d.system.key]);
    for (const d of docs) assert.ok(d.system.description.length > 20, d.system.key);
    assert.equal(lang.HEROES_GLORY.Specialization, undefined);
    assert.equal(Object.keys(SPECIALIZATION_TEXTS).length, 12);
  });

  test('two book typos fixed (header of the data module)', () => {
    assert.match(SPECIALIZATION_TEXTS.intellect, /^Ваше максимальное/);
    assert.match(SPECIALIZATION_TEXTS['Цепная Молния'], /а не половину/);
  });

  test('image — the icon by key, and the file is there', () => {
    for (const d of docs) {
      const spec = { type: SPECIALIZATION_SKILLS.includes(d.system.key) ? 'skill' : 'spell', key: d.system.key };
      assert.equal(d.img, specializationIconPath(spec, SPECIALIZATION_SPELL_ICON_FRAMES, { large: true }));
      assert.ok(fs.existsSync(path.join(ROOT, d.img.replace('systems/heroes-glory/', ''))), d.img);
    }
  });

  test('ids by key, stable across builds', () => {
    assert.deepEqual(buildSpecializationDocuments().map((d) => d._id), docs.map((d) => d._id));
    assert.equal(new Set(docs.map((d) => d._id)).size, 12);
  });

  test('the item\'s key choices are exactly the 12', () => {
    assert.deepEqual(Object.keys(specializationLabelKeys()), docs.map((d) => d.system.key));
  });
});
