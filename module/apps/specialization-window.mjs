import { HeroesGloryDialog } from './dialog.mjs';
import { spellLevelGate, wisdomRequiredKey } from '../helpers/roll-actions.mjs';
import { canCastWithoutSpellbook } from '../helpers/rolls.mjs';
import { RACE_GRANTED_ITEM_FLAG } from '../helpers/race-granted-items.mjs';
import { specializationIconPath, specializationPlaceholderIconPath } from '../helpers/skill-icons.mjs';
import {
  SPECIALIZATION_SPELL_ICON_FRAMES, specializationList, isSpecialization,
  isManualSpecialization, specializationEffectTextKey, specializationRequirement, specializationShortage,
  specializationSpellName,
} from '../helpers/specializations.mjs';

/**
 * §4.3 p. 23: the hero sheet's Специализация — the cell's text and hints and
 * the window that lists all 12 (rules.md §4.3). The conditions themselves are
 * pure (helpers/specializations.mjs); this only reads the actor and words them.
 */

/**
 * What the conditions read off a hero.
 * @param {Actor} actor
 * @returns {{level: number, ownedSkills: Array<{skillKey: string, tier: string}>, ownedSpellNames: string[]}}
 */
export function specializationHero(actor) {
  return {
    level: actor.system.level,
    ownedSkills: actor.items.filter((i) => i.type === 'skill').map((i) => ({ skillKey: i.system.skillKey, tier: i.system.tier })),
    ownedSpellNames: actor.items.filter((i) => i.type === 'spell').map((i) => specializationSpellName(i)),
  };
}

/**
 * Name, icons and book text of one specialization — from the fixed list, never
 * from the hero's copy of a spell, so the cell never empties (rules.md §11).
 * @param {{type: string, key: string}} spec
 * @returns {{label: string, icon: string|null, iconLarge: string|null, effectTextKey: string|null, manual: boolean}}
 */
export function specializationView(spec) {
  const label = spec.type === 'skill'
    ? game.i18n.localize(CONFIG.HEROES_GLORY.secondarySkills[spec.key] ?? spec.key)
    : spec.key;
  return {
    label,
    icon: specializationIconPath(spec, SPECIALIZATION_SPELL_ICON_FRAMES),
    iconLarge: specializationIconPath(spec, SPECIALIZATION_SPELL_ICON_FRAMES, { large: true }),
    effectTextKey: specializationEffectTextKey(spec.type, spec.key),
    manual: isManualSpecialization(spec.type, spec.key),
  };
}

/**
 * «Не хватает: …» for one specialization, or null when its condition is met.
 * @param {{type: string, key: string}} spec
 * @param {object} hero   `specializationHero`
 * @returns {string|null}
 */
function missingLine(spec, hero) {
  const i18n = game.i18n;
  const req = specializationRequirement(spec, hero);
  if (req.met) return null;
  const parts = [];
  if (req.missingLevel) parts.push(i18n.format('HEROES_GLORY.SpecializationUi.PartLevel', { level: hero.level }));
  if (req.missingSkill) {
    parts.push(req.ownedTier
      ? i18n.format('HEROES_GLORY.SpecializationUi.PartSkillTier', { tier: i18n.localize(`HEROES_GLORY.SkillTierFem.${req.ownedTier}`) })
      : i18n.format('HEROES_GLORY.SpecializationUi.PartSkillNone', { skill: specializationView(spec).label }));
  }
  if (req.missingSpell) parts.push(i18n.format('HEROES_GLORY.SpecializationUi.PartSpell', { spell: spec.key }));
  return i18n.format('HEROES_GLORY.SpecializationUi.Missing', { parts: parts.join(', ') });
}

/**
 * «Сотворить пока нельзя: нужна …» for an owned spell the hero can't cast yet
 * (Книга Магии, Мудрость — rules.md §11); null otherwise.
 * @param {Actor} actor
 * @param {{type: string, key: string}} spec
 * @returns {string|null}
 */
function castNote(actor, spec) {
  if (spec.type !== 'spell') return null;
  const spell = actor.items.find((i) => i.type === 'spell' && specializationSpellName(i) === spec.key);
  if (!spell) return null;
  const i18n = game.i18n;
  const needs = [];
  const hasSpellbook = actor.items.some((i) => i.type === 'spellbook');
  if (!canCastWithoutSpellbook({ hasSpellbook, raceGranted: !!spell.getFlag(...RACE_GRANTED_ITEM_FLAG) })) {
    needs.push(i18n.localize('HEROES_GLORY.SpecializationUi.NeedsSpellbook'));
  }
  const gate = spellLevelGate(actor, spell);
  if (!gate.allowed) needs.push(i18n.localize(wisdomRequiredKey(gate.requiredTier)));
  return needs.length
    ? i18n.format('HEROES_GLORY.SpecializationUi.CannotCastYet', { needs: needs.join(i18n.localize('HEROES_GLORY.SpecializationUi.NeedsJoin')) })
    : null;
}

/**
 * Who may pick and whether one can be taken — the cell's state.
 *  - `chosen`: the hero's specialization, if any (one of the 12);
 *  - `anyMet`: some specialization's condition is met;
 *  - `canPick`: this user may open the window to choose — the GM in edit
 *    mode always, bypassing the conditions (rules.md §11); the owner once,
 *    while none is chosen and one can be taken.
 * @param {Actor} actor
 * @param {boolean} gmEditing   the GM, edit mode on
 * @returns {{chosen: {type: string, key: string}|null, anyMet: boolean, canPick: boolean, hero: object}}
 */
export function specializationState(actor, gmEditing) {
  const { type, key } = actor.system.specialization;
  const chosen = isSpecialization(type, key) ? { type, key } : null;
  const hero = specializationHero(actor);
  const anyMet = specializationShortage(hero) === null;
  const canPick = gmEditing || (actor.isOwner && !chosen && anyMet);
  return { chosen, anyMet, canPick, hero };
}

/**
 * The cell's tooltip while none is chosen (pinned by a click, as Скорость's
 * and Зрение's): the title, the book's rule, then «Не хватает: …» or how
 * many can be taken. The template adds the «Все специализации» button.
 * @param {object} state   `specializationState`
 * @returns {{title: string, rule: string, page: string, lines: string[]}}
 */
export function specializationCellHint(state) {
  const i18n = game.i18n;
  const lines = [];
  if (state.anyMet) {
    const count = specializationList().filter((spec) => specializationRequirement(spec, state.hero).met).length;
    lines.push(i18n.format('HEROES_GLORY.SpecializationUi.HintAvailable', { count }));
  } else {
    const shortage = specializationShortage(state.hero);
    const label = (key) => i18n.localize(CONFIG.HEROES_GLORY.secondarySkills[key]);
    lines.push(i18n.localize('HEROES_GLORY.SpecializationUi.MissingTitle'));
    if (shortage.level !== null) lines.push(`— ${i18n.format('HEROES_GLORY.SpecializationUi.MissingLevel', { level: shortage.level })}`);
    if (shortage.skills) {
      const all = specializationList().filter((s) => s.type === 'skill').map((s) => label(s.key)).join(', ');
      lines.push(`— ${i18n.format('HEROES_GLORY.SpecializationUi.MissingSkillAny', { skills: all })}`);
      if (shortage.skills.length) {
        const owned = shortage.skills.map((s) => i18n.format('HEROES_GLORY.SpecializationUi.SkillTierPair', {
          skill: label(s.key), tier: i18n.localize(`HEROES_GLORY.SkillTierFem.${s.tier}`),
        })).join(', ');
        lines.push(i18n.format('HEROES_GLORY.SpecializationUi.MissingSkillOwned', { skills: owned }));
      }
    }
    if (shortage.spells) {
      const all = specializationList().filter((s) => s.type === 'spell').map((s) => s.key).join(', ');
      lines.push(`— ${i18n.format('HEROES_GLORY.SpecializationUi.MissingSpellAny', { spells: all })}`);
    }
  }
  return {
    title: i18n.localize(state.anyMet ? 'HEROES_GLORY.SpecializationUi.HintNotChosen' : 'HEROES_GLORY.SpecializationUi.HintUnavailable'),
    rule: i18n.localize('HEROES_GLORY.SpecializationUi.BookRule'),
    page: i18n.localize('HEROES_GLORY.SpecializationUi.PageRef'),
    lines,
  };
}

/**
 * The chosen specialization's full description, for the cell's tooltip:
 * book text, «Применяет Ведущий вручную», the page, and the warning when its
 * condition isn't met (any more, or never was — assigned by the GM).
 * @param {Actor} actor
 * @param {object} state   `specializationState`, with `chosen`
 * @returns {{label: string, iconLarge: string|null, effectTextKey: string|null, manual: boolean, warning: string|null, missing: string|null}}
 */
export function chosenSpecializationDetails(actor, state) {
  const view = specializationView(state.chosen);
  const missing = missingLine(state.chosen, state.hero);
  return {
    ...view,
    title: game.i18n.format('HEROES_GLORY.SpecializationUi.TooltipTitle', { name: view.label }),
    warning: missing ? game.i18n.localize('HEROES_GLORY.SpecializationUi.NoLongerMet') : null,
    missing,
    castNote: castNote(actor, state.chosen),
  };
}

/**
 * One option's cell and detail panel.
 * @param {Actor} actor
 * @param {{type: string, key: string}} spec
 * @param {object} state
 * @param {boolean} select   the window lets this user choose
 * @returns {{cell: string, detail: string}}
 */
function optionMarkup(actor, spec, state, select) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const id = `${spec.type}:${spec.key}`;
  const view = specializationView(spec);
  const missing = missingLine(spec, state.hero);
  const current = state.chosen?.type === spec.type && state.chosen?.key === spec.key;
  // The GM in edit mode may assign any (rules.md §11); the owner only a met one.
  const selectable = select && !current && (!missing || state.gmEditing);
  const classes = ['hg-spec__cell'];
  if (missing) classes.push('hg-spec__cell--unavailable');
  if (current) classes.push('hg-spec__cell--current');
  const cell = `<button type="button" class="${classes.join(' ')}" data-spec="${esc(id)}" data-selectable="${selectable}" aria-pressed="false">
      <span class="hg-spec__frame"><img class="hg-spec__img" src="${esc(view.icon ?? '')}" alt=""></span>
      <span class="hg-spec__name">${esc(view.label)}</span>
    </button>`;

  const requirement = spec.type === 'skill'
    ? i18n.format('HEROES_GLORY.SpecializationUi.RequirementSkill', { skill: view.label })
    : i18n.format('HEROES_GLORY.SpecializationUi.RequirementSpell', { spell: spec.key });
  const lines = [];
  if (view.effectTextKey) lines.push(`<p class="hg-spec__text">${esc(i18n.localize(view.effectTextKey))}</p>`);
  if (view.manual) lines.push(`<p class="hg-spec__manual">${esc(i18n.localize('HEROES_GLORY.SpecializationUi.Manual'))}</p>`);
  lines.push(`<p class="hg-spec__page">${esc(i18n.localize('HEROES_GLORY.SpecializationUi.PageRef'))}</p>`);
  lines.push(`<p class="hg-spec__req">${esc(requirement)}</p>`);
  if (current && missing) lines.push(`<p class="hg-spec__warn">${esc(i18n.localize('HEROES_GLORY.SpecializationUi.NoLongerMet'))}</p>`);
  lines.push(missing
    ? `<p class="hg-spec__missing">${esc(missing)}</p>`
    : `<p class="hg-spec__met">${esc(i18n.localize('HEROES_GLORY.SpecializationUi.StatusMet'))}</p>`);
  if (missing && selectable) lines.push(`<p class="hg-spec__warn">${esc(i18n.localize('HEROES_GLORY.SpecializationUi.GmOverride'))}</p>`);
  const cast = castNote(actor, spec);
  if (cast) lines.push(`<p class="hg-spec__warn">${esc(cast)}</p>`);
  const title = current ? `${view.label} (${i18n.localize('HEROES_GLORY.SpecializationUi.Current')})` : view.label;
  const detail = `<div class="hg-spec__detail" data-spec-detail="${esc(id)}" hidden>
      <span class="hg-spec__detail-frame"><img class="hg-spec__img" src="${esc(view.iconLarge ?? '')}" alt=""></span>
      <p class="hg-tooltip__title">${esc(title)}</p>
      ${lines.join('')}
    </div>`;
  return { cell, detail };
}

/**
 * §4.3 p. 23: the window with all 12 — two groups as in the book, the
 * picked one's details on the right. Unavailable ones are grey, with the
 * reason, never hidden. `select` — choosing (OK writes it); otherwise view
 * only (no OK). Resolves to the chosen `{type, key}` or null.
 * @param {Actor} actor
 * @param {object} options
 * @param {boolean} options.select
 * @param {boolean} options.gmEditing
 * @returns {Promise<{type: string, key: string}|null>}
 */
export async function openSpecializationWindow(actor, { select, gmEditing }) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const state = { ...specializationState(actor, gmEditing), gmEditing };
  const options = specializationList().map((spec) => ({ spec, ...optionMarkup(actor, spec, state, select) }));
  const group = (type, titleKey) => `<div class="hg-spec__group">
      <p class="hg-confirm__block-title">${esc(i18n.localize(titleKey))}</p>
      <div class="hg-spec__grid">${options.filter((o) => o.spec.type === type).map((o) => o.cell).join('')}</div>
    </div>`;

  const content = document.createElement('div');
  content.innerHTML = `<div class="hg-spec">
      <p class="hg-spec__rule">${esc(i18n.localize('HEROES_GLORY.SpecializationUi.BookRule'))}
        <span class="hg-spec__page">(${esc(i18n.localize('HEROES_GLORY.SpecializationUi.PageRef'))})</span></p>
      <div class="hg-spec__body">
        <div class="hg-spec__list">
          ${group('skill', 'HEROES_GLORY.SpecializationUi.GroupSkills')}
          ${group('spell', 'HEROES_GLORY.SpecializationUi.GroupSpells')}
        </div>
        <div class="hg-spec__details">
          <div class="hg-spec__detail" data-spec-detail="">
            <span class="hg-spec__detail-frame"><img class="hg-spec__img" src="${esc(specializationPlaceholderIconPath(state.anyMet))}" alt=""></span>
            <p>${esc(i18n.localize('HEROES_GLORY.SpecializationUi.Prompt'))}</p>
          </div>
          ${options.map((o) => o.detail).join('')}
        </div>
      </div>
      <input type="hidden" name="specialization" value="">
      ${select ? `<p class="hg-spec__notice">${esc(i18n.localize('HEROES_GLORY.SpecializationUi.OnlyGmChanges'))}</p>` : ''}
    </div>`;

  // Clicking a cell only shows it; OK lights up for a selectable one.
  const render = (event, dialog) => {
    const root = dialog.element;
    const ok = root.querySelector('button[data-action="ok"]');
    const input = root.querySelector('input[name="specialization"]');
    const show = (id) => {
      root.querySelectorAll('.hg-spec__cell').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.spec === id)));
      root.querySelectorAll('.hg-spec__detail').forEach((d) => { d.hidden = d.dataset.specDetail !== id; });
    };
    root.querySelectorAll('.hg-spec__cell').forEach((cell) => cell.addEventListener('click', () => {
      show(cell.dataset.spec);
      const selectable = cell.dataset.selectable === 'true';
      input.value = selectable ? cell.dataset.spec : '';
      if (ok) ok.disabled = !selectable;
    }));
    // The chosen one opens on its own page; nothing is preselected for OK.
    if (state.chosen) show(`${state.chosen.type}:${state.chosen.key}`);
  };

  const buttons = select
    ? [
      { action: 'ok', label: 'HEROES_GLORY.SpecializationUi.Ok', disabled: true, callback: (ev, button) => button.form.elements.specialization.value },
      { action: 'cancel', label: 'HEROES_GLORY.Rest.Cancel', default: true },
    ]
    : [{ action: 'cancel', label: 'HEROES_GLORY.SpecializationUi.Close', default: true }];

  const value = await HeroesGloryDialog.wait({
    hgColor: HeroesGloryDialog.actorColor(actor),
    window: { title: 'HEROES_GLORY.SpecializationUi.Title' },
    content,
    buttons,
    render,
    rejectClose: false,
  });
  if (!select || typeof value !== 'string' || !value) return null;
  const [type, ...rest] = value.split(':');
  const key = rest.join(':');
  return isSpecialization(type, key) ? { type, key } : null;
}

