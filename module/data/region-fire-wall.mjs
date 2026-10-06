import { burnFireWall } from "../helpers/roll-actions.mjs";

/**
 * §6.4, group Г: the region behavior of a Стена Огня (p. 59): «Если существо
 * наступит на них или начнет свой ход в Стене Огня, оно получит урон огнем».
 * Core sends region events to every client; the active GM rolls the damage
 * and posts the card for the confirm (burnFireWall). A teleport — core's
 * `displace` movement — isn't stepping in (rules.md §11).
 */
export default class HeroesGloryFireWallBehavior extends foundry.data.regionBehaviors.RegionBehaviorType {

  /** @override */
  static defineSchema() {
    return {};
  }

  /**
   * A token moved into the wall.
   * @param {object} event   RegionTokenMoveInEvent
   * @this {HeroesGloryFireWallBehavior}
   */
  static async #onTokenMoveIn(event) {
    if (!game.user.isActiveGM) return;
    if (event.data.movement?.passed?.waypoints?.at(-1)?.action === "displace") return;
    await burnFireWall(this.region, event.data.token, "enter");
  }

  /**
   * A token's turn started in the wall.
   * @param {object} event   RegionTokenTurnStartEvent
   * @this {HeroesGloryFireWallBehavior}
   */
  static async #onTokenTurnStart(event) {
    if (!game.user.isActiveGM) return;
    await burnFireWall(this.region, event.data.token, "turnStart");
  }

  /** @override */
  static events = {
    [CONST.REGION_EVENTS.TOKEN_MOVE_IN]: this.#onTokenMoveIn,
    [CONST.REGION_EVENTS.TOKEN_TURN_START]: this.#onTokenTurnStart,
  };
}
