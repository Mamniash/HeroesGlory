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

/**
 * Step 4, «в поле зрения» (rules.md §11): whether the caster's token sees a
 * token — a line from the caster's centre to the centre of any cell the
 * target occupies, not blocked by sight walls (an open door lets it through;
 * darkness doesn't count). Same scene only.
 * @param {TokenDocument} from
 * @param {TokenDocument} to
 * @returns {boolean}
 */
export function tokenInSight(from, to) {
  if (!from || !to || from.parent !== to.parent) return false;
  const grid = from.parent.grid;
  const center = (doc) => ({ x: doc.x + (doc.width * grid.size) / 2, y: doc.y + (doc.height * grid.size) / 2 });
  const origin = center(from);
  const points = grid.isGridless ? [center(to)] : to.getOccupiedGridSpaceOffsets().map((offset) => grid.getCenterPoint(offset));
  const backend = CONFIG.Canvas.polygonBackends.sight;
  return points.some((point) => !backend.testCollision(origin, point, { type: 'sight', mode: 'any' }));
}

/**
 * Whether a token stands within the scene's own rectangle — one left beside
 * the map is not «в поле зрения» (rules.md §11).
 * @param {TokenDocument} doc
 * @returns {boolean}
 */
export function tokenInSceneRect(doc) {
  const rect = doc.parent?.dimensions?.sceneRect;
  if (!rect) return true;
  const size = doc.parent.grid.size;
  return rect.contains(doc.x + (doc.width * size) / 2, doc.y + (doc.height * size) / 2);
}
