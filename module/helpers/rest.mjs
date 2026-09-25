/**
 * §5.10 (p. 33): a hero's rest — applied to the Actor and reported on a
 * chat card; what a rest changes is decided by rolls.mjs's resolveRest.
 * Also the GM's «Отдых всем героям» button in the Actors directory header.
 */
import { resolveRest } from './rolls.mjs';
import { ownersAndGmIds } from './roll-actions.mjs';

/**
 * Rest one hero: Health to max, Mana +10 (not above max), Удача back to its
 * base, «Без отдыха» lifted. Posts a card whispered to the hero's owners
 * and the GM, like the level-up rolls.
 * @param {Actor} actor   A hero.
 * @returns {Promise<ChatMessage|null>}
 */
export async function restHero(actor) {
  if (actor?.type !== 'hero') return null;
  const system = actor.system;
  const before = { health: system.health.value, mana: system.mana.value, luck: system.luck };
  const rest = resolveRest({
    manaValue: system.mana.value,
    manaMax: system.mana.max,
    healthValue: system.health.value,
    healthMax: system.health.max,
  });
  const unrestedId = CONFIG.HEROES_GLORY.statusEffects.unrested;
  const wasUnrested = actor.statuses.has(unrestedId);

  await actor.update({
    'system.health.value': rest.healthValue,
    'system.mana.value': rest.manaValue,
    'system.luck': rest.luckManual,
  });
  if (wasUnrested) await actor.toggleStatusEffect(unrestedId, { active: false });

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/rest.hbs',
    {
      actorName: actor.name,
      health: { before: before.health, after: actor.system.health.value, max: actor.system.health.max },
      mana: { before: before.mana, after: actor.system.mana.value, max: actor.system.mana.max },
      luck: { before: before.luck, after: actor.system.luck },
      wasUnrested,
    },
  );
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, whisper: ownersAndGmIds(actor) });
}

/**
 * Whether any player (not a GM) owns this actor.
 * @param {Actor} actor
 * @returns {boolean}
 */
function hasPlayerOwner(actor) {
  return game.users.some((user) => !user.isGM
    && actor.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
}

/**
 * The GM's «Отдых всем героям»: a confirmation listing every hero, those
 * with a player owner ticked; the ticked ones rest.
 * @returns {Promise<void>}
 */
export async function openMassRest() {
  if (!game.user.isGM) return;
  const heroes = game.actors.filter((a) => a.type === 'hero').sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const rows = heroes.map((actor) => `<div><label>
      <input type="checkbox" name="hero" value="${actor.id}" ${hasPlayerOwner(actor) ? 'checked' : ''}>
      ${foundry.utils.escapeHTML(actor.name)}
    </label></div>`).join('');
  const ids = await foundry.applications.api.DialogV2.wait({
    window: { title: 'HEROES_GLORY.Rest.MassTitle' },
    content: `<p>${game.i18n.localize('HEROES_GLORY.Rest.MassHint')}</p>${rows}`,
    buttons: [
      {
        action: 'rest',
        label: 'HEROES_GLORY.Rest.MassConfirm',
        default: true,
        callback: (event, button) => [...button.form.querySelectorAll('input[name="hero"]:checked')].map((input) => input.value),
      },
      { action: 'cancel', label: 'HEROES_GLORY.Rest.Cancel' },
    ],
    rejectClose: false,
  });
  if (!Array.isArray(ids)) return;
  for (const id of ids) await restHero(game.actors.get(id));
}

/**
 * Adds «Отдых всем героям» to the Actors directory header, GM only.
 * @param {ActorDirectory} app
 * @param {HTMLElement} html
 */
export function addMassRestButton(app, html) {
  if (!game.user.isGM) return;
  const actions = html.querySelector('.header-actions');
  if (!actions || actions.querySelector('.heroes-glory-mass-rest')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'heroes-glory-mass-rest';
  button.innerHTML = `<i class="fa-solid fa-bed" inert></i> <span>${game.i18n.localize('HEROES_GLORY.Rest.MassButton')}</span>`;
  button.addEventListener('click', () => openMassRest());
  actions.append(button);
}
