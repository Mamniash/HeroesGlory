/**
 * §2.3 p. 12: the two race features that grant a starting item once
 * applied, rather than (or in addition to) a numeric bonus — Элементаль/
 * Воздух's "Полет" spell, and Джинн's spell-plus-maybe-Книга-Магии.
 * Sourced from `heroes-glory.spells` by name (module/sheets/actor/
 * hero-sheet.mjs's `#syncRaceGrantedItems` does the actual create/delete),
 * not invented here — this is deliberately a plain data-shaped function,
 * not a spell/item definition of its own.
 *
 * Kept out of race-stats.mjs's RACE_SUBCHOICES `modifiers` shape: Джинн
 * isn't even a subchoice race (its grant depends on `hasSpellbook`, a
 * runtime actor fact, not a player pick), so it has no table row to live
 * on there. `hasSpellbook` is threaded in as a parameter — same reason
 * `secondarySkillSlotCount` (rolls.mjs) takes its config value as a
 * parameter rather than reading `CONFIG.HEROES_GLORY` itself — so this
 * stays pure and testable without Foundry.
 *
 * Джинн's own book text is explicit that the Книга Магии is part of the
 * grant, not just the spell ("Если у вас нет Книги Магии на старте, вы её
 * получаете, вместе с заклинанием «Волшебная Стрела»") — confirmed
 * against docs/OKP_Heroes_Glory_v2_1.pdf p. 12 before wiring this up, not
 * assumed from the shorter paraphrase in lang/ru.json's
 * HEROES_GLORY.RaceFeature.Djinn.
 * @param {string} raceKey
 * @param {string|null} subchoiceKey
 * @param {{hasSpellbook: boolean}} params   Whether the actor already owns
 *   a `spellbook`-type item, evaluated by the caller BEFORE any of this
 *   function's own grants are applied (a Джинн who doesn't have one yet
 *   gets both the spell AND the book; the two calls in a row this would
 *   otherwise take are collapsed into this single param instead of
 *   letting a caller accidentally re-check after granting the book and
 *   get "Молния" for what should be "Волшебная Стрела").
 * @returns {Array<{itemType: 'spell', spellName: string}|{itemType: 'spellbook'}>}
 *   Empty for every race/subchoice with no item grant (10 of 12 races,
 *   plus Элементаль's other 3 stikhii).
 */
export function raceGrantedItems(raceKey, subchoiceKey, { hasSpellbook }) {
  if (raceKey === 'elemental' && subchoiceKey === 'air') {
    return [{ itemType: 'spell', spellName: 'Полет' }];
  }
  if (raceKey === 'djinn') {
    const items = [{ itemType: 'spell', spellName: hasSpellbook ? 'Молния' : 'Волшебная Стрела' }];
    if (!hasSpellbook) items.push({ itemType: 'spellbook' });
    return items;
  }
  return [];
}

/**
 * Races whose grant is decided in the hero-creation window rather than at
 * the race pick: Джинн's spell depends on whether the hero STARTS with a
 * Книга Магии, which the class (or a rolled Мудрость) decides — known only
 * once creation runs (apps/hero-creation-app.mjs).
 */
export const CREATION_TIME_RACE_GRANTS = new Set(['djinn']);

/**
 * The grant applied right at the race pick (hero-sheet.mjs's
 * #syncRaceGrantedItems) — everything except the creation-time races.
 * @param {string} raceKey
 * @param {string|null} subchoiceKey
 * @param {{hasSpellbook: boolean}} params
 * @returns {ReturnType<typeof raceGrantedItems>}
 */
export function raceGrantedItemsAtPick(raceKey, subchoiceKey, params) {
  return CREATION_TIME_RACE_GRANTS.has(raceKey) ? [] : raceGrantedItems(raceKey, subchoiceKey, params);
}

/**
 * §2.3: the flag namespace/key marking a spell or spellbook item this
 * system auto-granted from a race/subchoice feature (Элементаль/Воздух's
 * "Полет", Джинн's spell ± Книга Магии) — see hero-sheet.mjs's #syncRaceGrantedItems.
 * Stores `{race, subchoice}` (subchoice `null` for a non-subchoice race
 * like Джинн) so a later race/subchoice change can tell exactly which of
 * its OWN grants are now stale, without ever touching an item a player
 * obtained some other way (manually added, learned, looted — none of
 * those carry this flag).
 *
 * Also read by roll-actions.mjs's castSpell: a race-granted spell is
 * exempt from the Мудрость level gate (rules.md §11).
 */
export const RACE_GRANTED_ITEM_FLAG = ['heroes-glory', 'raceGrantedItem'];
