/**
 * Damage and healing numbers over a token: on any change of Health a «−N» /
 * «+N» rises above it and fades (core's scrolling text). Its colour tells
 * where it came from — Сеня's palette: fire orange, lightning and air
 * purple, ice and water light blue, earth brown, a spell without an
 * element pink, a weapon white, healing green.
 */

/** @type {Record<string, number>} */
export const HEALTH_POPUP_COLORS = {
  fire: 0xff8c1a,
  air: 0xb36bff,
  water: 0x6ec8ff,
  earth: 0xa0703c,
  magic: 0xff7ad9,
  weapon: 0xffffff,
  heal: 0x5ce65c,
};

/**
 * The colour kind of a spell's damage: by the effect's own element first
 * (Молния, Цепная Молния — lightning; Ледяная Молния — ice), else by the
 * school it was cast from; Универсальные and nothing at all — `magic`.
 * @param {{element?: string|null, school?: string|null}} spell
 * @returns {'fire'|'air'|'water'|'earth'|'magic'}
 */
export function spellDamageKind({ element = null, school = null } = {}) {
  const byElement = { fire: 'fire', lightning: 'air', ice: 'water' }[element];
  if (byElement) return byElement;
  return ['fire', 'air', 'water', 'earth'].includes(school) ? school : 'magic';
}

/**
 * What rises over the token for a change of Health: a gain is always
 * healing; a loss takes the colour of its source, a loss with no source
 * (the GM's own edit) is white like a weapon.
 * @param {number} delta   new Health − old
 * @param {string|null} [kind]   a HEALTH_POPUP_COLORS key
 * @returns {{text: string, fill: number}|null}   null — nothing changed
 */
export function healthPopup(delta, kind = null) {
  if (!delta) return null;
  if (delta > 0) return { text: `+${delta}`, fill: HEALTH_POPUP_COLORS.heal };
  return { text: `−${-delta}`, fill: HEALTH_POPUP_COLORS[kind] ?? HEALTH_POPUP_COLORS.weapon };
}

/**
 * Show it over every token of the actor this client can see — not over a
 * hidden one, not even for the GM. Runs on each client by itself.
 * @param {Actor} actor
 * @param {number} delta
 * @param {string|null} [kind]
 */
export function showHealthPopup(actor, delta, kind = null) {
  const popup = healthPopup(delta, kind);
  if (!popup || !canvas?.ready) return;
  for (const token of actor.getActiveTokens(true)) {
    if (!token.visible || token.document.hidden || token.document.isSecret) continue;
    canvas.interface.createScrollingText(token.center, popup.text, {
      anchor: CONST.TEXT_ANCHOR_POINTS.CENTER,
      direction: CONST.TEXT_ANCHOR_POINTS.TOP,
      distance: 2 * token.h,
      fontSize: 36,
      fill: popup.fill,
      stroke: 0x000000,
      strokeThickness: 5,
      jitter: 0.25,
    });
  }
}
