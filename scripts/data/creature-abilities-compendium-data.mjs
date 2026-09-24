/**
 * «Способности существ» (book pp. 113-116) -> one JournalEntry in the
 * `creature-abilities` compendium, one page per ability.
 *
 * One page per ability, not grouped: the journal sheet's page list and its
 * search box filter by page name, so at the table the GM types the tag from
 * a creature sheet («Регенерация») and lands on exactly that text. Pages are
 * sorted alphabetically (the book's own order is only roughly alphabetical).
 *
 * The text itself comes from scripts/extract_creature_abilities.py ->
 * scripts/data/bestiary/abilities.json (reviewed against the page images);
 * book typos fixed there are listed in docs/rules.md §11.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildJournalDocument, ROOT } from '../lib/pack-builder.mjs';

/** @returns {Array<{name: string, page: number, text: string}>} */
export function readAbilities() {
  const file = path.join(ROOT, 'scripts', 'data', 'bestiary', 'abilities.json');
  return JSON.parse(fs.readFileSync(file, 'utf8')).abilities;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @param {Array<{name: string, text: string}>} abilities
 * @returns {Array<{name: string, content: string}>}   Alphabetical.
 */
export function abilityPages(abilities) {
  return [...abilities]
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map(({ name, text }) => ({ name, content: `<p>${escapeHtml(text)}</p>` }));
}

export function buildCreatureAbilityDocuments() {
  return [buildJournalDocument({ name: 'Способности существ', pages: abilityPages(readAbilities()), index: 0 })];
}
