/**
 * «База знаний» — one JournalEntry compendium holding the system's
 * reference journals, one entry each. Names live here so the pack build
 * (scripts/data/knowledge-base-compendium-data.mjs), the creature sheet's
 * ability links and the tests all read the same strings.
 *
 * Entry and page ids are seeded from these names (pack-builder.mjs's
 * stableId), so they are the ids the entries had in their old one-entry
 * compendiums — only the pack part of a UUID changed.
 */
export const KNOWLEDGE_BASE_PACK_NAME = 'knowledge-base';
export const KNOWLEDGE_BASE_PACK = `heroes-glory.${KNOWLEDGE_BASE_PACK_NAME}`;

/** §9: «Способности существ» (book pp. 113–116), one page per ability. */
export const CREATURE_ABILITIES_ENTRY = 'Способности существ';

/** «Справочник цен» — the price tables. */
export const PRICE_LIST_ENTRY = 'Справочник цен';
