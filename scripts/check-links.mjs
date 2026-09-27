#!/usr/bin/env node
/**
 * check-links.mjs — finds every link into this system's compendiums
 * («Compendium.heroes-glory.<pack>.<Type>.<id>[.<Embedded>.<id>]») stored
 * in the built packs and, optionally, in a world's data, and reports each
 * one that leads nowhere: an undeclared pack, a missing document, a
 * missing page.
 *
 * Usage (Foundry fully closed — it holds each LevelDB's LOCK while open):
 *   node scripts/check-links.mjs                       # every built pack
 *   node scripts/check-links.mjs <world folder> ...     # + worlds/<id>/data/*
 *   (or: npm run check:links [-- <world folder>...])
 *
 * Exit code 1 if any link is broken. Links the creature sheet builds at
 * render time (ability tags) are not stored anywhere; they are covered by
 * test/knowledge-base.test.mjs and a live check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ClassicLevel } from 'classic-level';
import { ROOT } from './lib/pack-builder.mjs';

const SYSTEM = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8'));
const LINK = new RegExp(
  `Compendium\\.${SYSTEM.id}\\.([\\w-]+)\\.(\\w+)\\.([A-Za-z0-9]{16})(?:\\.(\\w+)\\.([A-Za-z0-9]{16}))?`, 'g',
);

/**
 * Every key/value of a LevelDB, values as raw JSON text.
 * @param {string} dir
 * @returns {Promise<Map<string, string>>}
 */
async function readDb(dir) {
  const db = new ClassicLevel(dir, { valueEncoding: 'utf8' });
  const entries = new Map();
  try {
    for await (const [key, value] of db.iterator()) entries.set(key, value);
  } finally {
    await db.close();
  }
  return entries;
}

async function main() {
  // Built packs: which documents (and embedded documents) exist.
  const packs = new Map();
  const sources = [];
  for (const pack of SYSTEM.packs) {
    const dir = path.join(ROOT, pack.path);
    if (!fs.existsSync(dir)) {
      console.error(`Пак «${pack.name}» не собран: ${pack.path}`);
      process.exitCode = 1;
      continue;
    }
    const entries = await readDb(dir);
    const ids = new Set();
    for (const key of entries.keys()) {
      // "!items!<id>" or "!journal.pages!<parentId>.<childId>"
      const [, , tail] = key.split('!');
      for (const id of tail.split('.')) ids.add(id);
    }
    packs.set(pack.name, ids);
    sources.push({ label: `pack ${pack.name}`, entries });
  }

  // Worlds given on the command line: every LevelDB under <world>/data.
  for (const world of process.argv.slice(2)) {
    const dataDir = path.join(world, 'data');
    for (const name of fs.readdirSync(dataDir)) {
      const dir = path.join(dataDir, name);
      if (fs.statSync(dir).isDirectory()) sources.push({ label: `world ${path.basename(world)}/${name}`, entries: await readDb(dir) });
    }
  }

  let found = 0;
  let broken = 0;
  for (const { label, entries } of sources) {
    for (const [key, value] of entries) {
      for (const match of value.matchAll(LINK)) {
        found += 1;
        const [link, packName, , docId, , childId] = match;
        const ids = packs.get(packName);
        const problem = !ids ? 'нет такого компендиума'
          : !ids.has(docId) ? 'нет документа'
            : (childId && !ids.has(childId)) ? 'нет страницы/вложенного документа'
              : null;
        if (problem) {
          broken += 1;
          console.error(`${label} ${key}: ${link} — ${problem}`);
        }
      }
    }
  }

  console.log(`Ссылок найдено: ${found}, битых: ${broken}. Источников проверено: ${sources.length}.`);
  if (broken > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
