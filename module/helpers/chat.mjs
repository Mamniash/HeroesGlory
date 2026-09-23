import { canRerollWithLuck } from './rolls.mjs';
import { rerollLuckDie, confirmAttackOutcome } from './roll-actions.mjs';

/**
 * §2.2/§task: a chat card's "Reroll (Удача)" buttons must show/hide
 * differently per viewer — the owner sees them when Удача is positive,
 * only the GM when it's negative, nobody when it's 0, and nobody at all
 * once the card is confirmed (§task: "Реролл после подтверждения
 * запрещаем") — even though every client renders the exact same stored
 * HTML. `renderChatMessageHTML` fires once per client as each message
 * enters that client's chat log, so gating visibility here (rather than
 * baking it into the persisted content) is what makes that per-viewer
 * difference possible.
 *
 * The confirm button (attack cards only — absent from the persisted HTML
 * entirely once buildAttackContext's `canConfirm` is false, see
 * templates/chat/attack-roll.hbs) is GM-only, same per-viewer-`hidden`
 * pattern. `button.disabled = true` fires synchronously on click, before
 * the async apply/re-render round-trip — cheap protection against an
 * impatient double-click on the same client; it is NOT what makes the
 * double-apply guard work (that's the `confirmed` flag confirmAttackOutcome
 * itself checks — see that function's own comment for what this doesn't
 * cover).
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function activateChatListeners(message, html) {
  const flags = message.getFlag('heroes-glory', 'reroll');
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
}
