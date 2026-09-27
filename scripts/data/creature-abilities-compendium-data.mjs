/**
 * «Способности существ» (book pp. 113-116) -> one JournalEntry of the
 * «База знаний» compendium (knowledge-base-compendium-data.mjs), one page
 * per ability.
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
import { CREATURE_ABILITIES_ENTRY } from '../../module/helpers/knowledge-base.mjs';

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

/**
 * @param {number} index   Position in the «База знаний» pack.
 * @returns {object}
 */
export function buildCreatureAbilityDocument(index) {
  return buildJournalDocument({ name: CREATURE_ABILITIES_ENTRY, pages: abilityPages(readAbilities()), index });
}
