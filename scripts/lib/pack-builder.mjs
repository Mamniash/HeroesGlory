/**
 * pack-builder.mjs — shared machinery for every system compendium
 * (weapons, secondary skills, and the artifacts/spells packs still to
 * come). One pack-specific script per compendium supplies the document
 * list; this module turns that into `packs/_source/<name>/*.json` +
 * `packs/<name>/` (LevelDB), the same way for all of them.
 *
 * Two properties every pack build needs, found while building the
 * weapons pack and folded in here so no future pack script has to
 * rediscover them:
 *
 * 1. Atomic write. Source JSON and the compiled LevelDB are written to a
 *    scratch directory first and only swapped into place (via rename)
 *    once BOTH steps — writing every source file and `compilePack`
 *    succeeding — are done. Rationale: `compilePack` can fail after
 *    source files already exist on disk (e.g. Foundry has the target
 *    LevelDB locked — confirmed live, see project memory) — if the
 *    real `packs/_source/<name>` were overwritten before that failure,
 *    source and compiled pack would silently disagree. Building in a
 *    scratch dir means a failure never touches the committed pair.
 *
 * 2. Skip when nothing changed. `ClassicLevel`/LevelDB always renumbers
 *    its internal files (MANIFEST/.ldb/.log) on every OPEN, not just on
 *    write — confirmed twice live: once through Foundry itself merely
 *    having a pack open, and again through an earlier version of this
 *    script's own "is anything different?" check, which opened the
 *    compiled LevelDB read-only-in-intent but not in fact (this binding
 *    has no read-only open mode — checked, it isn't exposed at the JS
 *    layer) to compare it against the freshly generated documents. That
 *    open alone left the same renumbering behind even when the check
 *    concluded "unchanged" and touched nothing else. So the compiled
 *    pack is never opened just to decide whether to rebuild: each
 *    pack's source directory carries a `_checksum.txt` (sha256 of its
 *    documents, written atomically alongside the JSON files) — a change
 *    check is a plain file read, no LevelDB engine involved, so a
 *    skipped rebuild now leaves truly zero diff, not just a small one.
 */

import { compilePack } from '@foundryvtt/foundryvtt-cli';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const SYSTEM_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8'));
export const SYSTEM_ID = SYSTEM_JSON.id;
export const SYSTEM_VERSION = SYSTEM_JSON.version;
// The locally installed Foundry (see CLAUDE.md) — 14.365.0. Not the same
// thing as compatibility.verified in system.json ("14", rounded for the
// manifest).
export const CORE_VERSION = '14.365.0';

const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Deterministic 16-character id in `foundry.utils.randomID()`'s own
 * alphabet — a sha1 of `seed` sliced into alphabet indices. Not
 * cryptography, just a stable "entry name -> id" mapping so rebuilding
 * without a data change doesn't reshuffle ids.
 * @param {string} seed
 * @returns {string}
 */
export function stableId(seed) {
  const hash = createHash('sha1').update(seed).digest();
  let id = '';
  for (let i = 0; i < 16; i++) {
    id += ID_ALPHABET[hash[i] % ID_ALPHABET.length];
  }
  return id;
}

/**
 * Filename in the spirit of what foundryvtt-cli itself generates when
 * unpacking (lib/package.mjs#getSafeFilename): everything but letters,
 * digits and Cyrillic becomes "_".
 * @param {string} name
 * @returns {string}
 */
export function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9А-я]/g, '_');
}

/**
 * Builds one compendium Item document with all the boilerplate
 * (id/_key/_stats/ownership/flags/sort) a pack-specific script
 * shouldn't have to repeat.
 * @param {object} params
 * @param {string} params.name        Document name.
 * @param {string} params.type        Item subtype (e.g. "weapon", "skill").
 * @param {object} params.system      The type's data-model payload.
 * @param {string} params.img         Path to the item's icon.
 * @param {number} params.index       Position in the pack — drives `sort`.
 * @param {string} [params.seed]      Id seed; defaults to `name` (matches
 *   every pack built before this refactor — changing it would reshuffle
 *   already-committed ids for no reason).
 * @returns {object}
 */
export function buildItemDocument({ name, type, system, img, index, seed }) {
  const id = stableId(seed ?? name);
  return {
    _id: id,
    name,
    type,
    img,
    system,
    effects: [],
    folder: null,
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

/**
 * Shared `_stats` boilerplate for both `buildItemDocument` and
 * `buildJournalDocument`/its pages — pulled out once both existed so a
 * future third document kind doesn't have to copy the same six fields a
 * third time.
 * @returns {object}
 */
function buildStats() {
  return {
    compendiumSource: null,
    duplicateSource: null,
    coreVersion: CORE_VERSION,
    systemId: SYSTEM_ID,
    systemVersion: SYSTEM_VERSION,
    createdTime: null,
    modifiedTime: null,
    lastModifiedBy: null,
  };
}

/**
 * Builds one compendium JournalEntry document — a reference document (a
 * GM-facing "book to read", not a game object with a `type`/`system`) — so
 * unlike `buildItemDocument` above, this takes `pages` instead of
 * `type`/`system`. `_key` uses the `journal` sublevel (BaseJournalEntry's
 * own `metadata.collection`, foundry.mjs), not `items`.
 *
 * Each embedded page ALSO needs its own `_key` — found the hard way
 * (LEVEL_INVALID_KEY from ClassicLevel, "Key cannot be null or undefined"):
 * `compilePack` stores a JournalEntry's pages as SEPARATE LevelDB entries,
 * not nested inline — `@foundryvtt/foundryvtt-cli`'s own `applyHierarchy`
 * walks every entry in `HIERARCHY.journal.pages` and calls the same
 * `batch.put(doc._key, ...)` on each one it finds, exactly like the parent
 * document, using the compound key format its `extractClassicLevel` (the
 * reverse direction) builds via `keyJoin`: `!<parentCollection>.
 * <embeddedCollectionName>!<parentId>.<childId>` — `!journal.pages!` here,
 * not a bare `!pages!`. No other pack this project has built needed this
 * (weapons/skills/artifacts/spells are all flat Item docs, no embedded
 * collection), so nothing else in this file had to deal with it before.
 * @param {object} params
 * @param {string} params.name                  Document name.
 * @param {Array<{name: string, content: string}>} params.pages
 *   One entry per JournalEntryPage — `content` is HTML (JOURNAL_ENTRY_
 *   PAGE_FORMATS.HTML = 1, the schema default), not Markdown.
 * @param {number} params.index                 Position in the pack — drives `sort`.
 * @param {string} [params.seed]                Id seed; defaults to `name`.
 * @returns {object}
 */
export function buildJournalDocument({ name, pages, index, seed }) {
  const id = stableId(seed ?? name);
  return {
    _id: id,
    name,
    pages: pages.map((page, pageIndex) => {
      const pageId = stableId(`${seed ?? name}::page::${page.name}`);
      return {
        _id: pageId,
        name: page.name,
        type: 'text',
        title: { show: true, level: 1 },
        text: { content: page.content, format: 1 },
        sort: (pageIndex + 1) * 10000,
        ownership: { default: -1 }, // INHERIT — matches the schema's own initial; the parent's `ownership` (below) is what actually gates access.
        flags: {},
        _stats: buildStats(),
        _key: `!journal.pages!${id}.${pageId}`,
      };
    }),
    folder: null,
    sort: (index + 1) * 10000,
    ownership: { default: 0 },
    flags: {},
    _stats: buildStats(),
    _key: `!journal!${id}`,
  };
}

function assertNoDuplicates(documents) {
  const seenIds = new Set();
  const seenFilenames = new Set();
  for (const doc of documents) {
    if (seenIds.has(doc._id)) {
      throw new Error(`Duplicate id ${doc._id} for "${doc.name}" — stableId() collision, adjust the seed.`);
    }
    seenIds.add(doc._id);

    const filename = `${safeFilename(doc.name)}_${doc._id}.json`;
    if (seenFilenames.has(filename)) {
      throw new Error(`Duplicate compendium filename: ${filename}`);
    }
    seenFilenames.add(filename);
  }
}

const CHECKSUM_FILENAME = '_checksum.txt';

function writeSourceFiles(dir, documents, checksum) {
  fs.mkdirSync(dir, { recursive: true });
  for (const doc of documents) {
    const filename = `${safeFilename(doc.name)}_${doc._id}.json`;
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(doc, null, 2) + '\n');
  }
  // Written into the same scratch dir that gets renamed into place, so
  // this is never out of sync with the documents it describes — see
  // `buildPack`'s atomic promotion.
  fs.writeFileSync(path.join(dir, CHECKSUM_FILENAME), checksum + '\n');
}

/**
 * Sha256 of the exact bytes `writeSourceFiles` would produce for these
 * documents (name-sorted so the hash doesn't depend on array order,
 * even though in practice callers always pass them in `sort` order
 * already). Pure function of the *data*, not of anything already on
 * disk — comparing against it never requires opening the compiled pack.
 * @param {object[]} documents
 * @returns {string} hex digest
 */
function fingerprint(documents) {
  const serialized = [...documents]
    .sort((a, b) => a._id.localeCompare(b._id))
    .map((doc) => JSON.stringify(doc))
    .join('\n');
  return createHash('sha256').update(serialized).digest('hex');
}

/**
 * @param {string} sourceDir
 * @returns {string|null} the stored checksum, or `null` if there isn't
 *   one yet (first build) or the compiled pack is missing despite it
 *   (someone deleted `packs/<name>` by hand) — either way, "must build".
 */
function readStoredChecksum(sourceDir, destDir) {
  if (!fs.existsSync(destDir)) return null;
  const file = path.join(sourceDir, CHECKSUM_FILENAME);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').trim();
}

/**
 * Builds a compendium pack: writes `packs/_source/<packName>/*.json` and
 * compiles `packs/<packName>/` (LevelDB), atomically, skipping the write
 * entirely if the generated documents already match what's compiled.
 * @param {object} params
 * @param {string} params.packName             e.g. "weapons", "skills".
 * @param {object[]} params.documents          From `buildItemDocument`.
 * @returns {Promise<{skipped: boolean, count: number}>}
 */
export async function buildPack({ packName, documents }) {
  assertNoDuplicates(documents);

  const sourceDir = path.join(ROOT, 'packs', '_source', packName);
  const destDir = path.join(ROOT, 'packs', packName);

  const checksum = fingerprint(documents);
  if (readStoredChecksum(sourceDir, destDir) === checksum) {
    console.log(`[${packName}] Без изменений — пересборка пропущена (${documents.length} записей).`);
    return { skipped: true, count: documents.length };
  }

  // packs/ itself is gitignored (build output, not source — see
  // build-packs.mjs's own header) and so doesn't exist yet in a fresh
  // clone — neither does packs/_source/ even once packs/ exists, since
  // that's a further nesting level. mkdtempSync needs the former as its
  // parent directory, renameSync(scratchSource, sourceDir) below needs
  // the latter as ITS parent (rename never creates intermediate dirs),
  // so both are created up front rather than one at a time as each step
  // turns out to need it.
  fs.mkdirSync(path.join(ROOT, 'packs', '_source'), { recursive: true });

  // Stage everything in a scratch directory on the same volume as the
  // repo (so the final promotion below is a same-filesystem rename, not
  // a copy) before touching the real source/dest paths.
  const scratchRoot = fs.mkdtempSync(path.join(ROOT, 'packs', `.build-${packName}-`));
  try {
    const scratchSource = path.join(scratchRoot, 'source');
    const scratchDest = path.join(scratchRoot, 'dest');
    writeSourceFiles(scratchSource, documents, checksum);
    await compilePack(scratchSource, scratchDest, { log: true });

    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.renameSync(scratchSource, sourceDir);
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.renameSync(scratchDest, destDir);
  } finally {
    fs.rmSync(scratchRoot, { recursive: true, force: true });
  }

  console.log(`[${packName}] Собрано ${documents.length} записей в packs/${packName}`);
  return { skipped: false, count: documents.length };
}
