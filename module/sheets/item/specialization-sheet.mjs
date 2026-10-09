import { HeroesGloryFramedItemSheet } from './framed-item-sheet.mjs';
import {
  specializationLabelKeys, specializationLabel, isManualSpecialization, specializationSheetNotes,
} from '../../helpers/specializations.mjs';
import { specializationMissingLine, castNote } from '../../apps/specialization-window.mjs';

/**
 * §4.3 p. 23: a specialization's sheet, in the hero's style. The header picks
 * one of the 12 (name and image follow it, documents/item.mjs); the body is
 * the book text, then what the code decides by the key: the requirement,
 * «Применяет Ведущий вручную», the page — and, on a hero, whether the
 * condition is met, which of two items counts and «Сотворить пока нельзя»
 * (specializationSheetNotes). On a hero only the GM edits it (players open
 * it read-only).
 */
export class HeroesGlorySpecializationSheet extends HeroesGloryFramedItemSheet {
  static PARTS = {
    sheet: { template: 'systems/heroes-glory/templates/item/item-specialization-sheet.hbs' },
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const i18n = game.i18n;
    const spec = this.item.system.spec;
    context.headerSelect = {
      name: 'system.key',
      choices: specializationLabelKeys(),
      value: this.item.system.key,
      placeholder: i18n.localize('HEROES_GLORY.SpecializationUi.KeyPlaceholder'),
    };
    if (!spec) {
      context.notSpecialization = i18n.localize('HEROES_GLORY.SpecializationUi.NotOneOfTwelve');
      return context;
    }
    const label = specializationLabel(spec, (k) => i18n.localize(k));
    context.requirement = spec.type === 'skill'
      ? i18n.format('HEROES_GLORY.SpecializationUi.RequirementSkill', { skill: label })
      : i18n.format('HEROES_GLORY.SpecializationUi.RequirementSpell', { spell: spec.key });
    context.manual = isManualSpecialization(spec.type, spec.key);
    const hero = this.item.actor?.type === 'hero' ? this.item.actor : null;
    if (hero) {
      const missing = specializationMissingLine(spec, hero);
      context.status = missing
        ? { ok: false, warning: i18n.localize('HEROES_GLORY.SpecializationUi.NoLongerMet'), text: missing }
        : { ok: true, text: i18n.localize('HEROES_GLORY.SpecializationUi.StatusMet') };
    }
    const notes = specializationSheetNotes({
      onHero: !!hero,
      itemId: this.item.id,
      countingItemId: hero?.system.specializationItemId ?? null,
      count: hero?.system.specializationCount ?? 0,
      castNote: hero ? castNote(hero, spec) : null,
    });
    if (notes.notCounted) context.notCounted = i18n.localize('HEROES_GLORY.SpecializationUi.NotCounted');
    if (notes.duplicate) context.duplicate = i18n.localize('HEROES_GLORY.SpecializationUi.Duplicate');
    context.castNote = notes.castNote;
    return context;
  }
}
