import { springQuicksand } from "../helpers/roll-actions.mjs";

/**
 * §6.4, group Г: the region behavior of one Зыбучий Песок trap (p. 53):
 * «Существо, попавшее в ловушку, немедленно заканчивает ход.» The moving
 * user's own client stops the token there, as core's pause-game behavior
 * does; the active GM reveals the trap and posts the line (springQuicksand).
 * Everyone springs it, the caster too; a teleport — core's `displace` — isn't
 * stepping in (rules.md §11).
 */
export default class HeroesGloryQuicksandBehavior extends foundry.data.regionBehaviors.RegionBehaviorType {

  /** @override */
  static defineSchema() {
    return {};
  }

  /**
   * A token moved into the trap.
   * @param {object} event   RegionTokenMoveInEvent
   * @this {HeroesGloryQuicksandBehavior}
   */
  static async #onTokenMoveIn(event) {
    if (event.data.movement?.passed?.waypoints?.at(-1)?.action === "displace") return;
    if (event.user.isSelf) event.data.token.stopMovement();
    if (!game.user.isActiveGM) return;
    await springQuicksand(this.region, event.data.token);
  }

  /** @override */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: this.#onTokenMoveIn,
  };
}
