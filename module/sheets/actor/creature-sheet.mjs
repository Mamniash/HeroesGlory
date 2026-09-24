import { HeroesGloryActorSheet } from './base-actor-sheet.mjs';
import { isCreatureArcher, moraleAttemptsRemaining, moraleCheckVariant } from '../../helpers/rolls.mjs';
import { resolveTagAbilities } from '../../helpers/creature-abilities.mjs';

const ABILITIES_PACK = 'heroes-glory.creature-abilities';
let abilityPagesPromise = null;

/**
 * §9: the «Способности существ» journal's pages by name, loaded once per
 * session. A failed load is not cached, so the next render retries.
 * @returns {Promise<Map<string, JournalEntryPage>>}
 */
function abilityPages() {
  abilityPagesPromise ??= (async () => {
    const pack = game.packs.get(ABILITIES_PACK);
    if (!pack) return new Map();
    const [journal] = await pack.getDocuments();
    return new Map((journal?.pages ?? []).map((page) => [page.name, page]));
  })().catch((err) => {
    console.error(err);
    abilityPagesPromise = null;
    return new Map();
  });
  return abilityPagesPromise;
}

export class HeroesGloryCreatureSheet extends HeroesGloryActorSheet {
  static PARTS = {
    header: { template: 'systems/heroes-glory/templates/actor/parts/actor-creature-header.hbs' },
    body: { template: 'systems/heroes-glory/templates/actor/actor-creature-sheet.hbs', scrollable: [''] },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;

    // §5.3 hit-table multipliers, display-only — no roll automation here.
    context.damageWeak = Math.floor(system.damage * 0.5);
    context.damageStrong = Math.floor(system.damage * 2);
    // §11: a «Стрелок» gets separate melee and ranged attack rows.
    context.isArcher = isCreatureArcher(system.specialSkills);
    // §9: each tag links to its page(s) in the abilities journal; a tag
    // the book has no article for stays plain text.
    const pages = await abilityPages();
    const pageNames = [...pages.keys()];
    context.specialSkillRows = system.specialSkills.map((tag) => ({
      tag,
      links: resolveTagAbilities(tag, pageNames).map((name) => pages.get(name).toAnchor().outerHTML),
    }));
    // §5.8: the Боевой дух test row — shown only while this user may roll
    // one (extra turn — owner; skip turn — GM).
    const moraleUsed = this.actor.getFlag('heroes-glory', 'moraleUsed') ?? 0;
    const moraleVariant = moraleCheckVariant({
      morale: system.morale, used: moraleUsed, isOwner: this.actor.isOwner, isGM: game.user.isGM,
    });
    context.moraleCheck = moraleVariant && {
      negative: moraleVariant === 'negative',
      threshold: system.moraleThreshold ?? 4,
      remaining: moraleAttemptsRemaining(system.morale, moraleUsed),
      total: Math.abs(system.morale),
    };
    context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      system.description, { relativeTo: this.actor },
    );

    return context;
  }
}
