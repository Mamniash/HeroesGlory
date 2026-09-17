#!/usr/bin/env node
/**
 * build-weapon-pack.mjs — собирает компендиум системы «Оружие» из
 * scripts/data/weapon-compendium-data.mjs (переписано с книги, см. комментарий
 * там) в packs/_source/weapons/*.json (читаемый источник, коммитится) и
 * packs/weapons/ (скомпилированная LevelDB, тоже коммитится — именно её
 * читает Foundry в рантайме, см. system.json → packs).
 *
 * Идентификаторы предметов детерминированы (sha1 от имени), поэтому
 * повторная сборка без изменений в данных не меняет ни _id, ни файлы —
 * результат воспроизводим, а не «новый набор случайных id каждый раз».
 *
 * Запуск: node scripts/build-weapon-pack.mjs   (или npm run build:packs)
 */

import { compilePack } from '@foundryvtt/foundryvtt-cli';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getWeaponEntries } from './data/weapon-compendium-data.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SYSTEM_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8'));

const SYSTEM_ID = SYSTEM_JSON.id;
const SYSTEM_VERSION = SYSTEM_JSON.version;
// Локально установленный Foundry (см. CLAUDE.md) — 14.365.0. Не то же самое,
// что compatibility.verified в system.json ("14", округлённо для манифеста).
const CORE_VERSION = '14.365.0';

const PACK_NAME = 'weapons';
const SOURCE_DIR = path.join(ROOT, 'packs', '_source', PACK_NAME);
const DEST_DIR = path.join(ROOT, 'packs', PACK_NAME);

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Детерминированный 16-символьный id в алфавите foundry.utils.randomID() —
 * sha1 seed'а нарезается на индексы алфавита. Не криптография, просто
 * стабильный маппинг "имя предмета" -> "id", чтобы пересборка не тасовала
 * идентификаторы заново.
 * @param {string} seed
 * @returns {string}
 */
function stableId(seed) {
  const hash = createHash('sha1').update(seed).digest();
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += ID_ALPHABET[hash[i] % ID_ALPHABET.length];
  }
  return id;
}

/**
 * Имя файла в духе того, что генерирует сама foundryvtt-cli при распаковке
 * (lib/package.mjs#getSafeFilename): не-буквенно-цифровые символы, кроме
 * кириллицы, заменяются на "_".
 * @param {string} name
 * @returns {string}
 */
function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9А-я]/g, '_');
}

function buildWeaponDocument(entry, index) {
  const id = stableId(entry.name);
  return {
    _id: id,
    name: entry.name,
    type: 'weapon',
    // Своего арта под конкретное оружие в проекте пока нет (assets/ не
    // содержит weapon-иконок) — общая иконка ядра Foundry, как и для
    // прочих мест системы без выделенного арта (ср. icons/svg/aura.svg
    // в module/documents/actor.mjs).
    img: 'icons/svg/sword.svg',
    system: {
      weaponType: entry.type,
      damage: entry.damage,
      source: entry.source,
      twoHanded: entry.twoHanded,
      equipped: false,
      paperdollSlot: null,
      epicTable: entry.epicTable,
    },
    effects: [],
    folder: null,
    // Порядок записей внизу компендиума — по книге: категория за
    // категорией (Древковое → Клинковое → Рубящее → Дробящее → Стрелковое),
    // внутри категории — как в таблице.
    sort: (index + 1) * 10000,
    ownership: { default: 0 },
    flags: {},
    _stats: {
      compendiumSource: null,
      duplicateSource: null,
      coreVersion: CORE_VERSION,
      systemId: SYSTEM_ID,
      systemVersion: SYSTEM_VERSION,
      createdTime: null,
      modifiedTime: null,
      lastModifiedBy: null,
    },
    _key: `!items!${id}`,
  };
}

function writeSourceFiles(documents) {
  fs.rmSync(SOURCE_DIR, { recursive: true, force: true });
  fs.mkdirSync(SOURCE_DIR, { recursive: true });

  const seenFilenames = new Set();
  for (const doc of documents) {
    let filename = `${safeFilename(doc.name)}_${doc._id}.json`;
    if (seenFilenames.has(filename)) {
      throw new Error(`Duplicate compendium filename: ${filename}`);
    }
    seenFilenames.add(filename);
    fs.writeFileSync(path.join(SOURCE_DIR, filename), JSON.stringify(doc, null, 2) + '\n');
  }
}

async function main() {
  const entries = getWeaponEntries();
  const documents = entries.map(buildWeaponDocument, entries);

  const seenIds = new Set();
  for (const doc of documents) {
    if (seenIds.has(doc._id)) {
      throw new Error(`Duplicate id ${doc._id} for "${doc.name}" — stableId() collision, adjust the seed.`);
    }
    seenIds.add(doc._id);
  }

  writeSourceFiles(documents);
  await compilePack(SOURCE_DIR, DEST_DIR, { log: true });

  console.log(`\nСобрано ${documents.length} записей в ${path.relative(ROOT, DEST_DIR)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
