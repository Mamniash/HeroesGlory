import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildKnowledgeBaseDocuments } from '../scripts/data/knowledge-base-compendium-data.mjs';
import { stableId } from '../scripts/lib/pack-builder.mjs';
import {
  KNOWLEDGE_BASE_PACK, KNOWLEDGE_BASE_PACK_NAME, CREATURE_ABILITIES_ENTRY, PRICE_LIST_ENTRY,
} from '../module/helpers/knowledge-base.mjs';
import { resolveTagAbilities } from '../module/helpers/creature-abilities.mjs';
import { FACTIONS, readFaction } from '../scripts/data/creature-compendium-data.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SYSTEM = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8'));

describe('«База знаний» — one compendium, reference journals as entries', () => {
  const docs = buildKnowledgeBaseDocuments();

  test('declared once in system.json, visible to players, old one-entry packs gone', () => {
    const pack = SYSTEM.packs.filter((p) => p.name === KNOWLEDGE_BASE_PACK_NAME);
    assert.equal(pack.length, 1);
    assert.equal(pack[0].type, 'JournalEntry');
    assert.equal(pack[0].path, `packs/${KNOWLEDGE_BASE_PACK_NAME}`);
    assert.equal(pack[0].ownership.PLAYER, 'OBSERVER');
    assert.equal(`${SYSTEM.id}.${KNOWLEDGE_BASE_PACK_NAME}`, KNOWLEDGE_BASE_PACK);
    assert.deepEqual(SYSTEM.packs.filter((p) => ['creature-abilities', 'price-list'].includes(p.name)), []);
  });

  test('two entries, in order: Способности существ, Справочник цен', () => {
    assert.deepEqual(docs.map((d) => d.name), [CREATURE_ABILITIES_ENTRY, PRICE_LIST_ENTRY]);
    assert.deepEqual(docs.map((d) => d.sort), [10000, 20000]);
  });

  test('entry and page ids are the ones the old compendiums had (seeded by name)', () => {
    for (const doc of docs) {
      assert.equal(doc._id, stableId(doc.name));
      for (const page of doc.pages) assert.equal(page._id, stableId(`${doc.name}::page::${page.name}`));
    }
  });

  test('every creature tag with an article links to a page that exists in the built entry', () => {
    const abilities = docs.find((d) => d.name === CREATURE_ABILITIES_ENTRY);
    const pageNames = abilities.pages.map((p) => p.name);
    const tags = [...new Set(FACTIONS.flatMap((f) => readFaction(f).entries
      .flatMap((e) => e.creatures.flatMap((c) => c.specialSkills))))];
    let links = 0;
    for (const tag of tags) {
      for (const name of resolveTagAbilities(tag, pageNames)) {
        assert.ok(pageNames.includes(name), `${tag} → ${name}`);
        links += 1;
      }
    }
    assert.ok(links > 0);
  });
});
