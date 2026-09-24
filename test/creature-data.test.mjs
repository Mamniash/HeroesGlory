import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { FACTIONS, readFaction, creatureEntries, buildDescription, buildCreatureDocuments } from '../scripts/data/creature-compendium-data.mjs';
import { ROOT, coreVersion } from '../scripts/lib/pack-builder.mjs';
import { HEROES_GLORY } from '../module/helpers/config.mjs';

// Unit tests must not need Foundry installed: point the builder at a
// fixture Foundry manifest instead of the real install.
const fakeFoundry = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-foundry-'));
fs.writeFileSync(path.join(fakeFoundry, 'package.json'), JSON.stringify({ release: { generation: 14, build: 365 } }));
process.env.FOUNDRY_APP_PATH = fakeFoundry;

describe('pack builder core version', () => {
  test('uses Foundry\'s own release.version format, generation.build — no third part', () => {
    assert.equal(coreVersion(), '14.365');
  });
});

const assetPath = (src) => path.join(ROOT, src.replace('systems/heroes-glory/', ''));
const NUMERIC = ['attack', 'defense', 'damage', 'attacksCount', 'health', 'speed', 'level'];

for (const faction of FACTIONS) {
  const data = readFaction(faction);

  describe(`bestiary ${faction}: extracted data invariants (§9)`, () => {
    test('faction key is a real config faction', () => {
      assert.ok(faction in HEROES_GLORY.factions);
    });

    for (const entry of data.entries) {
      test(`${entry.heading}: damage row is floor(d/2), d, 2d of its first creature`, () => {
        const d = entry.creatures[0].damage;
        assert.deepEqual(entry.damageRow, [Math.floor(d / 2), d, d * 2]);
      });

      test(`${entry.heading}: epic table has 6 non-empty rows`, () => {
        assert.equal(entry.epicTable.length, 6);
        for (const row of entry.epicTable) assert.ok(typeof row === 'string' && row.trim().length > 0);
      });

      test(`${entry.heading}: lore present, pictogram (if any) has text and its image exists`, () => {
        assert.ok(entry.lore.length > 0);
        if (entry.pictogram) {
          assert.ok(entry.pictogram.text.length > 0);
          assert.ok(fs.existsSync(assetPath(entry.pictogram.img)), entry.pictogram.img);
        }
      });

      for (const c of entry.creatures) {
        test(`${c.name}: integer stats, balanced parentheses, portrait exists`, () => {
          for (const key of NUMERIC) assert.ok(Number.isInteger(c[key]) && c[key] >= 0, `${key}=${c[key]}`);
          for (const skill of c.specialSkills) {
            assert.equal(skill.split('(').length, skill.split(')').length, skill);
          }
          assert.ok(fs.existsSync(assetPath(c.img)), c.img);
        });
      }
    }

    test('creature names are unique', () => {
      const names = data.entries.flatMap((e) => e.creatures.map((c) => c.name));
      assert.equal(new Set(names).size, names.length);
    });
  });
}

describe('creature compendium mapping', () => {
  test('health maps to value = max, epic table shared by the entry, faction set', () => {
    const data = readFaction('tower');
    const [first] = creatureEntries('tower', data);
    const c = data.entries[0].creatures[0];
    assert.deepEqual(first.system.health, { value: c.health, max: c.health });
    assert.deepEqual(first.system.epicTable, data.entries[0].epicTable);
    assert.equal(first.system.faction, 'tower');
  });

  test('description: pictogram and magic first, then a rule, then lore', () => {
    const entry = {
      pictogram: { img: 'systems/heroes-glory/assets/bestiary/x.png', text: 'фигура' },
      lore: ['<p>Лор.</p>'],
    };
    const html = buildDescription(entry, { specialSkills: ['Летает', 'Атакует Магией (Стрела 6d6, 3 заряда)'] });
    assert.equal(html, [
      '<p><strong>Куда попал:</strong> фигура</p>',
      '<p><img src="systems/heroes-glory/assets/bestiary/x.png" alt="фигура"></p>',
      '<p>Атакует Магией (Стрела 6d6, 3 заряда)</p>',
      '<hr>',
      '<p>Лор.</p>',
    ].join('\n'));
  });

  test('description without anything unmodelled is just the lore', () => {
    assert.equal(buildDescription({ pictogram: null, lore: ['<p>Лор.</p>'] }, { specialSkills: ['Летает'] }), '<p>Лор.</p>');
  });

  test('one actor document per creature, stable unique ids', () => {
    const docs = buildCreatureDocuments();
    const total = FACTIONS.reduce((n, f) => n + readFaction(f).entries.reduce((m, e) => m + e.creatures.length, 0), 0);
    assert.equal(docs.length, total);
    assert.equal(new Set(docs.map((d) => d._id)).size, docs.length);
    assert.deepEqual(buildCreatureDocuments().map((d) => d._id), docs.map((d) => d._id));
    for (const d of docs) {
      assert.ok(d._key.startsWith('!actors!'));
      assert.equal(d._stats.coreVersion, '14.365');
    }
  });
});

describe('creature abilities journal (book pp. 113-116)', async () => {
  const { readAbilities, abilityPages, buildCreatureAbilityDocuments } = await import('../scripts/data/creature-abilities-compendium-data.mjs');

  test('55 abilities, unique names, non-empty text', () => {
    const a = readAbilities();
    assert.equal(a.length, 55);
    assert.equal(new Set(a.map((x) => x.name)).size, 55);
    for (const x of a) assert.ok(x.text.trim().length > 0, x.name);
  });

  test('one journal, one page per ability, pages alphabetical', () => {
    const [doc] = buildCreatureAbilityDocuments();
    assert.equal(doc.pages.length, 55);
    const names = doc.pages.map((p) => p.name);
    assert.deepEqual(names, [...names].sort((x, y) => x.localeCompare(y, 'ru')));
  });

  test('page text is HTML-escaped', () => {
    assert.deepEqual(abilityPages([{ name: 'X', text: 'a < b' }]), [{ name: 'X', content: '<p>a &lt; b</p>' }]);
  });
});
