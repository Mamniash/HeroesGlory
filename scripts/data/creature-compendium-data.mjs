/**
 * Bestiary (docs/rules.md §9) -> the `creatures` compendium.
 *
 * The data itself is NOT typed here: scripts/extract_bestiary.py pulls
 * every statblock, damage row, epic table, pictogram and lore paragraph
 * out of OKP_Heroes_Glory_v2_1.pdf by page geometry and writes
 * scripts/data/bestiary/<faction>.json. That JSON is committed and
 * reviewed against the page images; this module only maps it onto the
 * creature data model. A faction is added by extracting it and listing
 * it in FACTIONS — nothing else here changes.
 *
 * BOOK DEFECTS fixed in transit are applied (and listed) by the
 * extraction script's own FACTIONS[...].fixes and recorded in
 * docs/rules.md §11 — not here.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildActorDocument, ROOT } from '../lib/pack-builder.mjs';

/** Factions extracted and accepted so far, in book order. */
export const FACTIONS = ['castle', 'stronghold', 'tower', 'inferno', 'necropolis', 'dungeon', 'citadel'];

/**
 * @param {string} faction
 * @returns {object}   The parsed scripts/data/bestiary/<faction>.json.
 */
export function readFaction(faction) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'bestiary', `${faction}.json`), 'utf8'));
}

const MAGIC_SKILL = /Магией|Магия \(|заряд/;

/**
 * The creature's `system.description`: first the book text the other
 * fields can't hold (the "Куда попал" pictogram — literal wording plus
 * the book's own crop — and any magic with charges), then the entry's
 * lore paragraphs.
 * @param {object} entry      One bestiary entry (shared by its creatures).
 * @param {object} creature
 * @returns {string}
 */
export function buildDescription(entry, creature) {
  const parts = [];
  if (entry.pictogram) {
    parts.push(`<p><strong>Куда попал:</strong> ${entry.pictogram.text}</p>`);
    parts.push(`<p><img src="${entry.pictogram.img}" alt="${entry.pictogram.text}"></p>`);
  }
  for (const skill of creature.specialSkills.filter((s) => MAGIC_SKILL.test(s))) {
    parts.push(`<p>${skill}</p>`);
  }
  if (parts.length) parts.push('<hr>');
  parts.push(...entry.lore);
  return parts.join('\n');
}

/**
 * @param {string} faction
 * @param {object} data   readFaction(faction)'s result.
 * @returns {Array<{name:string, system:object, img:string}>}
 */
export function creatureEntries(faction, data) {
  return data.entries.flatMap((entry) => entry.creatures.map((c) => ({
    name: c.name,
    img: c.img,
    system: {
      attack: c.attack,
      defense: c.defense,
      damage: c.damage,
      attacksCount: c.attacksCount,
      health: { value: c.health, max: c.health },
      speed: c.speed,
      specialSkills: c.specialSkills,
      level: c.level,
      faction,
      legendary: c.legendary,
      epicTable: entry.epicTable,
      description: buildDescription(entry, c),
    },
  })));
}

export function buildCreatureDocuments() {
  const all = FACTIONS.flatMap((faction) => creatureEntries(faction, readFaction(faction)));
  return all.map((entry, index) => buildActorDocument({
    name: entry.name,
    type: 'creature',
    img: entry.img,
    system: entry.system,
    index,
    seed: `creature:${entry.system.faction}:${entry.name}`,
  }));
}
