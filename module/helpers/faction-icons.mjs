/**
 * Faction art and town themes from HOMM3 (docs/rules.md §2.7), one file per
 * `CONFIG.HEROES_GLORY.factions` key — built by scripts/build_faction_art.py
 * from the game files (Причал — HotA's Cove, by the hashes in that script):
 *  - town: the town portrait with a fort (ITPT.def, 58×64), xBRZ ×3 — the
 *    faction picker's list tiles;
 *  - backdrop: the creature window's background of the town (CRBKG*.bmp,
 *    100×130), xBRZ ×3 — the faction confirm screen's picture;
 *  - theme: the town's music (Mp3 folder of the game), MP3 96 kbit/s —
 *    played on the confirm screen (helpers/picker-theme.mjs).
 * Pure — no Foundry globals.
 */
const KNOWN_FACTIONS = new Set([
  'castle', 'stronghold', 'tower', 'fortress', 'dungeon',
  'inferno', 'necropolis', 'citadel', 'nexus', 'haven',
]);

const ROOT = 'systems/heroes-glory/assets';

/**
 * @param {string} factionKey
 * @returns {string|null}   null for an unknown faction key.
 */
export function factionTownPath(factionKey) {
  return KNOWN_FACTIONS.has(factionKey) ? `${ROOT}/factions/town/${factionKey}.png` : null;
}

/**
 * @param {string} factionKey
 * @returns {string|null}   null for an unknown faction key.
 */
export function factionBackdropPath(factionKey) {
  return KNOWN_FACTIONS.has(factionKey) ? `${ROOT}/factions/backdrop/${factionKey}.png` : null;
}

/**
 * @param {string} factionKey
 * @returns {string|null}   null for an unknown faction key.
 */
export function factionThemePath(factionKey) {
  return KNOWN_FACTIONS.has(factionKey) ? `${ROOT}/music/${factionKey}.mp3` : null;
}

/**
 * lang/ru.json's `FactionDescription.<Key>` loc key for a faction — the
 * only faction-level prose the rulebook has at all: the one-line
 * parenthetical from p. 14's faction list ("Замок (благородные люди)"),
 * turned into a full sentence. Checked the rest of the book for anything
 * longer — every later page with a faction's name as its own section
 * header (pp. 73, 77, 81, 85, 89, 93, 97, 101, 105, 109) opens straight
 * into that faction's first BESTIARY creature's own flavor text, not a
 * description of the faction itself. This is genuinely the most the book
 * says about a faction as such, not a placeholder standing in for
 * something better that exists elsewhere.
 * @param {string} factionKey
 * @returns {string|null}   null for an unknown faction key.
 */
export function factionDescriptionKey(factionKey) {
  if (!KNOWN_FACTIONS.has(factionKey)) return null;
  const suffix = factionKey[0].toUpperCase() + factionKey.slice(1);
  return `HEROES_GLORY.FactionDescription.${suffix}`;
}
