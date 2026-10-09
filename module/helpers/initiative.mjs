/**
 * §5.1 (p. 9), Эльф: «При броске Инициативы эльф может перебросить кубик.
 * Примените новый результат броска, каким бы он ни был.» — a button on core's
 * initiative card for a hero elf, to its owner and the GM: the d20 is rolled
 * again, every other term stays, the combatant's initiative follows.
 */
import { canElfReroll, elfRerolledInitiative } from './rolls.mjs';

const FLAG_SCOPE = 'heroes-glory';

/**
 * The combatant an initiative card was rolled for — by the card's token (or
 * actor), in whichever combat holds it; a combat whose combatant still has
 * this roll's total first.
 * @param {ChatMessage} message
 * @returns {{combat: Combat, combatant: Combatant}|null}
 */
function initiativeCardCombatant(message) {
  const { token: tokenId, actor: actorId } = message.speaker ?? {};
  const total = message.rolls[0]?.total;
  let fallback = null;
  for (const combat of game.combats) {
    const combatant = combat.combatants.find((c) => (tokenId ? c.tokenId === tokenId : c.actorId === actorId));
    if (!combatant) continue;
    if (combatant.initiative === total) return { combat, combatant };
    fallback ??= { combat, combatant };
  }
  return fallback;
}

/**
 * Whether this viewer may reroll this card's d20 now (canElfReroll).
 * @param {ChatMessage} message
 * @param {{combat: Combat, combatant: Combatant}} found
 * @returns {boolean}
 */
function elfRerollAllowed(message, { combat, combatant }) {
  const actor = combatant.actor;
  return canElfReroll({
    race: actor?.type === 'hero' ? actor.system.race : '',
    rerolled: !!message.getFlag(FLAG_SCOPE, 'elfRerolled'),
    current: combatant.initiative === message.rolls[0]?.total,
    round: combat.round,
    joinedRound: combatant.getFlag(FLAG_SCOPE, 'joinedRound') ?? null,
    isOwner: !!actor?.isOwner,
    isGM: game.user.isGM,
  });
}

/**
 * `renderChatMessageHTML`: the Эльф reroll button on an initiative card,
 * with the rule as a line above it (no hover hint).
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function decorateInitiativeCard(message, html) {
  if (!message.getFlag('core', 'initiativeRoll') || !message.rolls[0]) return;
  const found = initiativeCardCombatant(message);
  if (!found || !elfRerollAllowed(message, found)) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'heroes-glory-chat-card__confirm-btn';
  button.textContent = game.i18n.localize('HEROES_GLORY.Roll.ElfReroll');
  button.addEventListener('click', async () => {
    button.disabled = true;
    await rerollElfInitiative(message);
  });
  const hint = document.createElement('p');
  hint.className = 'heroes-glory-chat-card__line heroes-glory-chat-card__line--muted';
  hint.textContent = game.i18n.localize('HEROES_GLORY.Roll.ElfRerollHint');
  (html.querySelector('.message-content') ?? html).append(hint, button);
}

/**
 * Rolls the elf's d20 again: the combatant's initiative becomes the old total
 * with the new die, the card is marked, and a line in the chat says what
 * changed — to the same viewers as the card.
 * @param {ChatMessage} message
 * @returns {Promise<void>}
 */
async function rerollElfInitiative(message) {
  const found = initiativeCardCombatant(message);
  if (!found || !elfRerollAllowed(message, found)) return;
  const { combat, combatant } = found;
  const oldRoll = message.rolls[0];
  const oldDie = oldRoll.dice[0]?.total;
  if (oldDie === undefined) return;
  const die = new Roll('1d20');
  await die.evaluate();
  const newTotal = elfRerolledInitiative(oldRoll.total, oldDie, die.total);
  await combat.setInitiative(combatant.id, newTotal);
  if (message.isOwner) await message.setFlag(FLAG_SCOPE, 'elfRerolled', true);
  await ChatMessage.create({
    speaker: message.speaker,
    content: `<p>${foundry.utils.escapeHTML(game.i18n.format('HEROES_GLORY.Roll.ElfRerollLine', {
      name: combatant.name, oldDie, newDie: die.total, oldTotal: oldRoll.total, newTotal,
    }))}</p>`,
    rolls: [die],
    whisper: message.whisper,
    blind: message.blind,
  });
}
