/**
 * «База знаний» (module/helpers/knowledge-base.mjs) — the reference
 * journals as entries of one compendium, in this order. A new reference
 * journal is a new entry here, not a new compendium.
 */
import { buildCreatureAbilityDocument } from './creature-abilities-compendium-data.mjs';
import { buildPriceListDocument } from './price-list-compendium-data.mjs';

const ENTRIES = [buildCreatureAbilityDocument, buildPriceListDocument];

export function buildKnowledgeBaseDocuments() {
  return ENTRIES.map((build, index) => build(index));
}
