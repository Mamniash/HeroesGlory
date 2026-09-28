import { HeroesGloryFramedItemSheet } from './framed-item-sheet.mjs';
import { findSpellVariant, spellLevelGate, wisdomRequiredKey } from '../../helpers/roll-actions.mjs';

export class HeroesGlorySpellSheet extends HeroesGloryFramedItemSheet {
  static PARTS = {
    sheet: { template: 'systems/heroes-glory/templates/item/item-spell-sheet.hbs' },
  };

  /**
   * Opened from the hero's spellbook (`render({ force: true, hgFromBook:
   * true })`): the sheet then shows the variant in effect for that hero and
   * whether he lacks Мудрость. Set by the explicit opening, kept through
   * re-renders, cleared on close — opened any other way, it shows neither.
   * @type {boolean}
   */
  #fromBook = false;

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (options.force) this.#fromBook = !!options.hgFromBook;
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    this.#fromBook = false;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    // §6.3: the four mastery variants, each its own description and cost.
    // Only these two fields are on the sheet — `variants.*.effect` (§6.4)
    // is left out, and a form save only sends the fields it has, so the
    // effect stays as it is.
    const hero = this.#fromBook && this.item.actor?.type === 'hero' ? this.item.actor : null;
    // §6.3/§11: the hero's variant is the one his school tier gives — the
    // same resolution the cast uses; Мудрость gates the spell's level.
    const active = hero ? findSpellVariant(hero, this.item).variant : null;
    const gate = hero ? spellLevelGate(hero, this.item) : { allowed: true };
    context.wisdomLine = gate.allowed ? null : game.i18n.format('HEROES_GLORY.Spell.NeedsWisdom', {
      wisdom: game.i18n.localize(wisdomRequiredKey(gate.requiredTier)),
    });
    context.variantRows = [
      ['none', 'HEROES_GLORY.Spell.VariantNone'],
      ['basic', 'HEROES_GLORY.Spell.VariantBasic'],
      ['advanced', 'HEROES_GLORY.Spell.VariantAdvanced'],
      ['expert', 'HEROES_GLORY.Spell.VariantExpert'],
    ].map(([key, label]) => ({ key, label, active: key === active, ...this.item.system.variants[key] }));
    return context;
  }
}
