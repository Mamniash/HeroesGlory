import { HeroesGloryDialog } from './dialog.mjs';
import { spellLevelGate, wisdomRequiredKey } from '../helpers/roll-actions.mjs';
import { canCastWithoutSpellbook } from '../helpers/rolls.mjs';
import { RACE_GRANTED_ITEM_FLAG } from '../helpers/race-granted-items.mjs';
import { specializationIconPath, specializationPlaceholderIconPath } from '../helpers/skill-icons.mjs';
import {
  SPECIALIZATIONS_PACK, SPECIALIZATION_SPELL_ICON_FRAMES, specializationList, specializationFromKey,
  isManualSpecialization, specializationLabel, specializationRequirement, specializationShortage,
  specializationHero, specializationDropDecision, specializationSpellName,
} from '../helpers/specializations.mjs';

/**
 * §4.3 p. 23: the hero sheet's Специализация — the cell's text and hints, the
 * window that lists all 12, and assigning one (the window, a drop on the
 * sheet; rules.md §4.3). The conditions themselves are pure
 * (helpers/specializations.mjs); this reads the actor and words them. The
 * hero's specialization is an item (module/data/item-specialization.mjs).
 */

/**
 * Name, icons and «применяет Ведущий» of one specialization — by its key
 * (helpers/specializations.mjs), never from an item, so the cell never empties
 * and a renamed item changes nothing.
 * @param {{type: string, key: string}} spec
 * @returns {{label: string, icon: string|null, iconLarge: string|null, manual: boolean}}
 */
export function specializationView(spec) {
  return {
    label: specializationLabel(spec, (k) => game.i18n.localize(k)),
    icon: specializationIconPath(spec, SPECIALIZATION_SPELL_ICON_FRAMES),
    iconLarge: specializationIconPath(spec, SPECIALIZATION_SPELL_ICON_FRAMES, { large: true }),
    manual: isManualSpecialization(spec.type, spec.key),
  };
}

/**
 * The book texts of the 12, by key — from the compendium «Специализации»'s
 * index (the text is asked for explicitly). A key missing there has none.
 * @returns {Promise<Map<string, string>>}
 */
async function compendiumTexts() {
  const pack = game.packs.get(SPECIALIZATIONS_PACK);
  if (!pack) return new Map();
  const index = await pack.getIndex({ fields: ['system.key', 'system.description'] });
  return new Map(index.filter((e) => e.system?.key).map((e) => [e.system.key, e.system.description ?? '']));
}

/**
 * «Не хватает: …» for one specialization on this hero, or null when met.
 * @param {{type: string, key: string}} spec
 * @param {Actor} actor
 * @returns {string|null}
 */
export function specializationMissingLine(spec, actor) {
  return missingLine(spec, specializationHero(actor));
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
  const chosen = specializationFromKey(actor.system.specialization?.key ?? '');
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
 * the book text of the hero's specialization item, «Применяет Ведущий
 * вручную», the page, the warning when its condition isn't met (any more, or
 * never was — assigned by the GM), and — should the hero have two — which
 * one counts.
 * @param {Actor} actor
 * @param {object} state   `specializationState`, with `chosen`
 * @returns {object}
 */
export function chosenSpecializationDetails(actor, state) {
  const i18n = game.i18n;
  const view = specializationView(state.chosen);
  const missing = missingLine(state.chosen, state.hero);
  const item = actor.items.get(actor.system.specializationItemId);
  return {
    ...view,
    itemId: item?.id ?? null,
    text: item?.system.description ?? '',
    title: i18n.format('HEROES_GLORY.SpecializationUi.TooltipTitle', { name: view.label }),
    warning: missing ? i18n.localize('HEROES_GLORY.SpecializationUi.NoLongerMet') : null,
    missing,
    castNote: castNote(actor, state.chosen),
    duplicate: actor.system.specializationCount > 1
      ? i18n.format('HEROES_GLORY.SpecializationUi.Duplicate', { count: actor.system.specializationCount, name: view.label })
      : null,
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
function optionMarkup(actor, spec, state, select, text) {
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
  if (text) lines.push(`<p class="hg-spec__text">${esc(text)}</p>`);
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
  const texts = await compendiumTexts();
  const options = specializationList().map((spec) => ({ spec, ...optionMarkup(actor, spec, state, select, texts.get(spec.key)) }));
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
  const spec = specializationFromKey(rest.join(':'));
  return spec?.type === type ? spec : null;
}

/**
 * The data of a new specialization item for one key: its compendium entry's
 * (with `_stats.compendiumSource`, as a drop from the compendium gives) — or,
 * if the compendium has none, built from the key without the book text, with
 * a console warning (as skill-grant.mjs does for a missing skill).
 * @param {string} key
 * @returns {Promise<object>}
 */
export async function specializationItemData(key) {
  const pack = game.packs.get(SPECIALIZATIONS_PACK);
  const index = pack ? await pack.getIndex({ fields: ['system.key'] }) : [];
  const entry = index.find((e) => e.system?.key === key);
  const doc = entry ? await pack.getDocument(entry._id) : null;
  if (doc) return game.items.fromCompendium(doc, { clearFolder: true });
  console.warn(`heroes-glory | specialization "${key}" not found in ${SPECIALIZATIONS_PACK}; assigned without its text`);
  const spec = specializationFromKey(key);
  return {
    name: specializationView(spec).label,
    type: 'specialization',
    img: specializationView(spec).iconLarge,
    system: { key, description: '' },
  };
}

/**
 * Give the hero this specialization (rules.md §4.3): the old one (if any) is
 * deleted first, then the new one created — no exception to «never two». If
 * creating fails after the delete, the GM is told.
 * @param {Actor} actor
 * @param {object} data   the new item's data (`specializationItemData`, or a dropped item's)
 * @returns {Promise<Item|null>}
 */
async function replaceSpecialization(actor, data) {
  const old = actor.items.filter((i) => i.type === 'specialization');
  const oldSpec = old.length ? specializationFromKey(actor.system.specialization?.key ?? '') : null;
  const oldName = oldSpec ? specializationView(oldSpec).label : old[0]?.name;
  if (old.length) await actor.deleteEmbeddedDocuments('Item', old.map((i) => i.id));
  let created = null;
  try {
    [created = null] = await actor.createEmbeddedDocuments('Item', [data], { keepId: !!data._id });
  } catch (err) {
    console.error(err);
  }
  if (!created && old.length) {
    ui.notifications.error(game.i18n.format('HEROES_GLORY.SpecializationUi.ReplaceFailed', { old: oldName, name: data.name }));
  }
  return created;
}

/**
 * The window's OK: give the hero the chosen one (the GM's choice replaces).
 * @param {Actor} actor
 * @param {{type: string, key: string}} spec
 * @returns {Promise<Item|null>}
 */
export async function assignSpecialization(actor, spec) {
  return replaceSpecialization(actor, await specializationItemData(spec.key));
}

/**
 * Remove the hero's specialization (the GM's «×» in edit mode).
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function clearSpecialization(actor) {
  const ids = actor.items.filter((i) => i.type === 'specialization').map((i) => i.id);
  if (ids.length) await actor.deleteEmbeddedDocuments('Item', ids);
}

/**
 * A specialization item dropped on the hero sheet (rules.md §4.3): refused
 * with a notification, or — after a confirmation — given to the hero. A
 * player: one of the 12, none on the hero yet, the condition met; the GM, in
 * any mode: any of the 12, replacing the one there (`specializationDropDecision`).
 * @param {Actor} actor
 * @param {Item} item   the dropped item
 * @returns {Promise<Item|null>}
 */
export async function dropSpecialization(actor, item) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const spec = specializationFromKey(item.system.key);
  const hero = specializationHero(actor);
  const current = specializationFromKey(actor.system.specialization?.key ?? '');
  const decision = specializationDropDecision({
    isGM: game.user.isGM,
    existingKey: current?.key ?? null,
    existingCount: actor.items.filter((i) => i.type === 'specialization').length,
    key: item.system.key,
    met: !!spec && specializationRequirement(spec, hero).met,
  });
  const name = spec ? specializationView(spec).label : item.name;
  if (decision.action === 'refuse') {
    if (decision.reason === 'unmet') {
      ui.notifications.warn(i18n.format('HEROES_GLORY.SpecializationUi.Refuse.unmetDrop', { name, missing: missingLine(spec, hero) }));
    } else if (decision.reason !== 'same') {
      ui.notifications.warn(i18n.format(`HEROES_GLORY.SpecializationUi.Refuse.${decision.reason === 'already' ? 'alreadyDrop' : decision.reason}`, { name }));
    }
    return null;
  }
  const lines = [esc(decision.replace && current
    ? i18n.format('HEROES_GLORY.SpecializationUi.ConfirmReplace', { old: specializationView(current).label, name })
    : i18n.format('HEROES_GLORY.SpecializationUi.ConfirmAssign', { name }))];
  if (decision.unmet) {
    lines.push(`<span class="hg-spec__warn">${esc(i18n.localize('HEROES_GLORY.SpecializationUi.NoLongerMet'))}</span>`);
    lines.push(`<span class="hg-spec__missing">${esc(missingLine(spec, hero) ?? '')}</span>`);
  }
  if (!game.user.isGM) lines.push(`<span class="hg-spec__notice">${esc(i18n.localize('HEROES_GLORY.SpecializationUi.OnlyGmChanges'))}</span>`);
  const confirmed = await HeroesGloryDialog.confirm({
    hgColor: HeroesGloryDialog.actorColor(actor),
    window: { title: i18n.localize('HEROES_GLORY.SpecializationUi.Title') },
    content: lines.map((line) => `<p>${line}</p>`).join(''),
    rejectClose: false,
  });
  if (!confirmed) return null;
  const data = item.inCompendium ? game.items.fromCompendium(item, { clearFolder: true, keepId: true }) : item.toObject();
  if (actor.items.has(data._id) || !item.inCompendium) delete data._id;
  return replaceSpecialization(actor, data);
}


