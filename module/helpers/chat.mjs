import { canRerollWithLuck } from './rolls.mjs';
import { rerollLuckDie } from './roll-actions.mjs';

/**
 * §2.2: a chat card's "Reroll (Удача)" buttons must show/hide differently
 * per viewer — the owner sees them when Удача is positive, only the GM
 * when it's negative, nobody when it's 0 — even though every client
 * renders the exact same stored HTML. `renderChatMessageHTML` fires once
 * per client as each message enters that client's chat log, so gating
 * visibility here (rather than baking it into the persisted content) is
 * what makes that per-viewer difference possible.
 * @param {ChatMessage} message
 * @param {HTMLElement} html
 */
export function activateChatListeners(message, html) {
  for (const button of html.querySelectorAll('[data-action="hg-reroll-luck"]')) {
    const actor = game.actors.get(button.dataset.actorId);
    const luck = actor?.system.luck ?? 0;
    const allowed = !!actor && canRerollWithLuck({ luck, isOwner: actor.isOwner, isGM: game.user.isGM });

    button.hidden = !allowed;
    if (!allowed) continue;

    button.addEventListener('click', () => rerollLuckDie(message, button.dataset.slot));
  }
}
