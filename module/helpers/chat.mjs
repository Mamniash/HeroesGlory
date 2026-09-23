import { canRerollWithLuck, hadUnconfirmedAttackBefore } from './rolls.mjs';
import { rerollLuckDie, confirmAttackOutcome } from './roll-actions.mjs';

const FLAG_SCOPE = 'heroes-glory';

/**
 * Ids of messages whose details this client has expanded. In memory only:
 * `renderChatMessageHTML` re-fires whenever a message is re-rendered
 * (confirm, Удача reroll), and restoring from here keeps an expanded card
 * expanded across that. A page reload starts everything collapsed again,
 * same as core's own dice-breakdown toggles.
 * @type {Set<string>}
 */
const expandedMessages = new Set();

/**
 * Per-viewer wiring for this system's chat cards. `renderChatMessageHTML`
 * fires once per client as each message enters that client's chat log
 * (and again on every re-render), so everything that differs between
 * viewers is decided here rather than baked into the persisted HTML:
 *
 * - §2.2: "Reroll (Удача)" buttons — the owner sees them when Удача is
 *   positive, only the GM when it's negative, nobody when it's 0, and
 *   nobody once an attack card is confirmed.
 * - The confirm button is GM-only. `disabled` is set synchronously on
 *   click — protection against an impatient double-click on this client;
 *   the real double-apply guard is the `confirmed` flag confirmAttackOutcome
 *   checks.
 * - The "another attack on this target is still unconfirmed" warning is
 *   GM-only and computed from this client's own chat log, not stored at
 *   roll time: the rolling player's client may not have a whispered
 *   GM-only card at all, while every attack card in every mode includes
 *   the GM as a recipient.
 * - The details toggle (attack and spell cards only). Only the title
 *   carries it, so clicks on buttons inside the card never toggle.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function activateChatListeners(message, html) {
  const flags = message.getFlag(FLAG_SCOPE, 'reroll');
  const confirmed = !!flags?.confirmed;

  for (const button of html.querySelectorAll('[data-action="hg-reroll-luck"]')) {
    const actor = game.actors.get(button.dataset.actorId);
    const luck = actor?.system.luck ?? 0;
    const allowed = !confirmed && !!actor && canRerollWithLuck({ luck, isOwner: actor.isOwner, isGM: game.user.isGM });

    button.hidden = !allowed;
    if (!allowed) continue;

    button.addEventListener('click', () => rerollLuckDie(message, button.dataset.slot));
  }

  const confirmButton = html.querySelector('[data-action="hg-confirm-attack"]');
  if (confirmButton) {
    confirmButton.hidden = !game.user.isGM;
    if (game.user.isGM) {
      confirmButton.addEventListener('click', () => {
        confirmButton.disabled = true;
        confirmAttackOutcome(message);
      });
    }
  }

  // Set for every viewer: Foundry strips a `hidden` attribute from stored
  // message content, so the element arrives visible by default.
  const warning = html.querySelector('[data-hg-unconfirmed-warning]');
  if (warning) {
    warning.hidden = !(game.user.isGM && flags?.kind === 'attack'
      && hadUnconfirmedAttackBefore(attackCardSummary(message, flags), knownAttackCards()));
  }

  const toggle = html.querySelector('[data-action="hg-toggle-details"]');
  if (toggle) {
    const card = toggle.closest('.heroes-glory-chat-card');
    card.classList.toggle('is-expanded', expandedMessages.has(message.id));
    toggle.addEventListener('click', () => {
      const expanded = card.classList.toggle('is-expanded');
      if (expanded) expandedMessages.add(message.id);
      else expandedMessages.delete(message.id);
    });
  }
}

/**
 * @param {ChatMessage} message
 * @param {object} flags   The message's `reroll` flags (kind 'attack').
 * @returns {{id: string, targetActorId: string|null, timestamp: number, confirmed: boolean, confirmedAt: number|null}}
 */
function attackCardSummary(message, flags) {
  return {
    id: message.id,
    targetActorId: flags.targetActorId ?? null,
    timestamp: message.timestamp,
    confirmed: !!flags.confirmed,
    confirmedAt: flags.confirmedAt ?? null,
  };
}

/** @returns {ReturnType<typeof attackCardSummary>[]} Every attack card in this client's chat log. */
function knownAttackCards() {
  const cards = [];
  for (const message of game.messages) {
    const flags = message.getFlag(FLAG_SCOPE, 'reroll');
    if (flags?.kind === 'attack') cards.push(attackCardSummary(message, flags));
  }
  return cards;
}
