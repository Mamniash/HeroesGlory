/**
 * The book's own Russian name for `skillKey`, read out of an already-
 * parsed lang/ru.json object — pure and Foundry-free (no `game.i18n`, no
 * `fetch`) so the lookup itself is unit-testable. `game.i18n.localize`
 * would resolve against whichever language THIS CLIENT happens to have
 * active — which is exactly how the original bug happened (an English
 * client's fallback grant created an item literally named "Armor" that
 * every other client, Russian or not, then saw from then on). Reading
 * lang/ru.json directly sidesteps `game.i18n` entirely, so the name is
 * the same canonical Russian text regardless of who triggers the grant.
 * `configKey` is CONFIG.HEROES_GLORY.secondarySkills[skillKey] (e.g.
 * `"HEROES_GLORY.SecondarySkill.Armor"`); `skillKey` itself is the
 * last-resort fallback if that path doesn't resolve to a string (unknown
 * key, or `ruStrings` itself failed to load) — still legible to a GM
 * reading the notification/console warning, if not book-accurate.
 * @param {object} ruStrings
 * @param {string|undefined} configKey
 * @param {string} skillKey
 * @returns {string}
 */
export function canonicalSkillNameFromRuStrings(ruStrings, configKey, skillKey) {
  if (!configKey) return skillKey;
  const value = configKey.split('.').reduce((obj, key) => obj?.[key], ruStrings);
  return typeof value === 'string' ? value : skillKey;
}

// lang/ru.json's own content never changes at runtime — fetched (and
// parsed) at most once per client session, not once per fallback grant.
let cachedRuStringsPromise = null;

/**
 * Every code path that hands a hero a secondary skill goes through here, so
 * the item is copied from the `heroes-glory.skills` compendium (with its
 * authored per-tier effect text) instead of being built from a bare
 * {skillKey, tier} — which left the tooltip empty.
 * @param {Actor} actor
 * @param {string} skillKey   A CONFIG.HEROES_GLORY.secondarySkills key.
 * @param {string} [tier='base']
 * @returns {Promise<Item[]>}
 */
export async function grantSecondarySkill(actor, skillKey, tier = 'base') {
  const pack = game.packs.get('heroes-glory.skills');
  const index = await pack?.getIndex({ fields: ['system.skillKey'] });
  const entry = index?.find((e) => e.system?.skillKey === skillKey);

  let data;
  if (entry) {
    data = (await pack.getDocument(entry._id)).toObject();
    delete data._id;
    data.system.tier = tier;
  } else {
    // Compendium missing/out of sync — still grant a working skill rather
    // than dropping it, but this is now a loud failure, not a silent one:
    // a console warning for whoever reads logs, AND an on-screen
    // notification for the GM actually at the keyboard right now (empty
    // tooltips are easy to miss; this isn't).
    cachedRuStringsPromise ??= fetch('systems/heroes-glory/lang/ru.json').then((r) => r.json());
    const name = canonicalSkillNameFromRuStrings(
      await cachedRuStringsPromise, CONFIG.HEROES_GLORY.secondarySkills[skillKey], skillKey,
    );
    console.warn(`heroes-glory | skill "${skillKey}" not found in heroes-glory.skills; granting "${name}" without effect text`);
    ui.notifications?.warn(game.i18n.format('HEROES_GLORY.Hero.SkillGrantFallbackWarning', { skill: name }));
    data = { name, type: 'skill', system: { skillKey, tier } };
  }
  return actor.createEmbeddedDocuments('Item', [data]);
}
