/**
 * Faction art for the faction-change confirm dialog's right-hand column
 * (`hero-sheet.mjs`'s `#confirmClassEffectiveChange`, faction changes
 * only — see that method's own `isFactionChange` check) — same contract
 * as `race-stats.mjs`'s `raceIconPath`: one file per `CONFIG.HEROES_GLORY
 * .factions` key, swapping in later is just replacing the file at the
 * same path, no code change.
 *
 * Placeholder art, not final: `docs/OKP_Heroes_Glory_v2_1.pdf` has no
 * per-faction illustration anywhere (checked directly — the faction page,
 * p. 14, is a plain text list; every later page with a faction name as
 * its own section header has nothing but the book's reused decorative
 * banner-frame graphic and background texture, not per-faction art).
 * 8 of the 10 use a real HOMM3 asset instead of an invented graphic:
 * `CREST58.def` (`D:\HOMM3_Extracted\...\Data\h3sprite\CREST58.def`,
 * extracted with this project's own `scripts/def2png.py` — no new
 * extraction script written for this) turned out to be the game's 8
 * standard player-color banners (red/blue/tan/green/orange/purple/teal/
 * pink, confirmed by sampling each frame's dominant non-trim color, not
 * by eye alone), which happen to line up with 8 of this project's own
 * `CONFIG.HEROES_GLORY.panelColorByFaction` entries. The remaining two
 * panel colors (`necropolis`: black, `tower`: white) have no matching
 * banner frame in that set — those two files are a flat color fill
 * instead, not a generated question-mark/text placeholder (agreed with
 * the user: an empty color field reads honestly as "art goes here",
 * where a rendered "?" risks reading as a broken image, and the project
 * has no other UI using a plain system font, which a text-based
 * placeholder would have needed).
 * @param {string} factionKey
 * @returns {string|null}   null for an unknown faction key.
 */
const KNOWN_FACTIONS = new Set([
  'castle', 'stronghold', 'tower', 'fortress', 'dungeon',
  'inferno', 'necropolis', 'citadel', 'nexus', 'haven',
]);

export function factionIconPath(factionKey) {
  if (!KNOWN_FACTIONS.has(factionKey)) return null;
  return `systems/heroes-glory/assets/factions/${factionKey}.png`;
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
