#!/usr/bin/env node
/**
 * build-packs.mjs — the one script that builds every system compendium
 * pack. Each pack's actual book data lives in its own scripts/data/*.mjs
 * module (transcribed from OKP_Heroes_Glory_v2_1.pdf); the build
 * mechanics (atomic write, skip-if-unchanged, id generation, LevelDB
 * compilation) are shared from scripts/lib/pack-builder.mjs so adding a
 * pack here never means copying that logic again.
 *
 * Usage:
 *   node scripts/build-packs.mjs            # build every registered pack
 *   node scripts/build-packs.mjs weapons     # build just this one
 *   node scripts/build-packs.mjs weapons skills
 * (or: npm run build:packs [-- <names...>])
 *
 * packs/ itself (both packs/_source/<name>/*.json and the compiled
 * packs/<name>/ LevelDB) is gitignored, not committed — it's this
 * script's own output, reproducible from scripts/data/*.mjs, and Foundry
 * rewrites LevelDB's own CURRENT/MANIFEST/*.log housekeeping files just
 * by having a pack open, which kept the working tree dirty for no real
 * content change. Run this only with Foundry fully closed (it holds
 * packs/<name>/LOCK while running) — `npm install && npm run build:packs`
 * regenerates all five packs from a fresh clone.
 */

import { buildPack } from './lib/pack-builder.mjs';
import { buildWeaponDocuments } from './data/weapon-compendium-data.mjs';
import { buildSkillDocuments } from './data/skill-compendium-data.mjs';
import { buildArtifactDocuments } from './data/artifact-compendium-data.mjs';
import { buildSpellDocuments } from './data/spell-compendium-data.mjs';
import { buildPriceListDocuments } from './data/price-list-compendium-data.mjs';
import { buildCreatureDocuments } from './data/creature-compendium-data.mjs';
import { buildCreatureAbilityDocuments } from './data/creature-abilities-compendium-data.mjs';

/** @type {Record<string, () => object[]>} */
const PACKS = {
  weapons: buildWeaponDocuments,
  skills: buildSkillDocuments,
  artifacts: buildArtifactDocuments,
  spells: buildSpellDocuments,
  'price-list': buildPriceListDocuments,
  creatures: buildCreatureDocuments,
  'creature-abilities': buildCreatureAbilityDocuments,
};

async function main() {
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(PACKS);

  const unknown = names.filter((name) => !(name in PACKS));
  if (unknown.length) {
    throw new Error(`Unknown pack(s): ${unknown.join(', ')}. Known: ${Object.keys(PACKS).join(', ')}`);
  }

  let failures = 0;
  for (const name of names) {
    try {
      await buildPack({ packName: name, documents: PACKS[name]() });
    } catch (err) {
      failures += 1;
      console.error(`[${name}] Сборка не удалась:`);
      console.error(err);
    }
  }

  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
