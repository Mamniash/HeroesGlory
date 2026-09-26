/**
 * §5.3 (p. 30): "-1 к тесту на попадание, если цель находится на соседней
 * клетке" — whether two tokens stand on adjacent cells, measured with the
 * scene grid's own adjacency test (diagonals count unless the grid forbids
 * them, rules.md §11). Every cell a token occupies is checked, so a
 * «Большое существо» (4 cells, p. 113) is adjacent from any of its cells.
 * Foundry-dependent, unlike rolls.mjs: the decision what the result means
 * lives there (resolveHitModifiers).
 */

/**
 * @param {TokenDocument|null|undefined} a
 * @param {TokenDocument|null|undefined} b
 * @returns {boolean|null}   `null` when it can't be measured: a token
 *   missing, the two on different scenes, or a gridless scene.
 */
export function tokensAdjacent(a, b) {
  if (!a || !b || a.parent !== b.parent) return null;
  const grid = a.parent?.grid;
  if (!grid || grid.isGridless) return null;
  const cellsA = a.getOccupiedGridSpaceOffsets();
  const cellsB = b.getOccupiedGridSpaceOffsets();
  return cellsA.some((ca) => cellsB.some((cb) => grid.testAdjacency(ca, cb)));
}

/**
 * The attacker's token on the same scene as its target: a synthetic
 * (unlinked) token actor carries its own token; a linked actor is looked
 * up among its active tokens on that scene.
 * @param {Actor} actor
 * @param {TokenDocument|null|undefined} targetToken
 * @returns {TokenDocument|null}
 */
export function attackerTokenFor(actor, targetToken) {
  if (!targetToken) return null;
  if (actor.token) return actor.token.parent === targetToken.parent ? actor.token : null;
  return actor.getActiveTokens(false, true).find((token) => token.parent === targetToken.parent) ?? null;
}

/**
 * §6.4 (p. 32, «Дальность … 24 клетки»; Цепная Молния's «ближайших»): the
 * distance between two tokens in grid cells, measured by the scene grid's
 * own path rules (its diagonal setting included), from the nearest cells of
 * each — a «Большое существо» (4 cells, p. 113) is as close as its nearest
 * cell.
 * @param {TokenDocument|null|undefined} a
 * @param {TokenDocument|null|undefined} b
 * @returns {number|null}   `null` when it can't be measured: a token
 *   missing, the two on different scenes, or a gridless scene.
 */
export function tokenDistanceCells(a, b) {
  if (!a || !b || a.parent !== b.parent) return null;
  const grid = a.parent?.grid;
  if (!grid || grid.isGridless) return null;
  let best = Infinity;
  for (const ca of a.getOccupiedGridSpaceOffsets()) {
    for (const cb of b.getOccupiedGridSpaceOffsets()) {
      best = Math.min(best, grid.measurePath([ca, cb]).spaces);
    }
  }
  return Number.isFinite(best) ? best : null;
}
