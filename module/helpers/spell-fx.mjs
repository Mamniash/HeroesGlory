/**
 * Spell animations (rules.md §11): HOMM3's own combat-spell sprites
 * (assets/spell-fx, scripts/extract_spell_fx.py) played on the canvas when
 * the GM confirms a spell card — on every client, over the tokens it can
 * see, unless the client's «Анимации заклинаний» setting is off. A hidden
 * token takes no part: a step that starts or ends at one is skipped.
 */

const FX_ROOT = 'systems/heroes-glory/assets/spell-fx';

/**
 * Each animation's frames and how it is drawn. `width` / `height` — the
 * DEF canvas in pixels; `size` — how many grid cells its width covers.
 * Keep the keys in step with scripts/extract_spell_fx.py.
 */
export const SPELL_FX = {
  'magic-arrow': { frames: 14, width: 123, height: 47, size: 1.2, fps: 20 },
  'magic-arrow-hit': { frames: 14, width: 133, height: 116, size: 1.2, fps: 15 },
  lightning: { frames: 1, width: 106, height: 494, size: 0.9 },
  'lightning-alt': { frames: 1, width: 106, height: 494, size: 0.9 },
  fireball: { frames: 19, width: 119, height: 151, size: 3, fps: 15 },
};

/** How fast a projectile flies, in grid cells a second; never quicker than MIN_FLIGHT_MS. */
const PROJECTILE_CELLS_PER_SECOND = 14;
const MIN_FLIGHT_MS = 250;
/** One bolt of a lightning, shown for this long; the next hop of a chain after HOP_MS. */
const BOLT_MS = 450;
const HOP_MS = 180;

/**
 * What to play for a confirmed spell card — in steps, each with its start
 * in ms. An end is `'caster'`, a token (`{token: uuid}`) or a cell
 * (`{cell: {i, j}}`); the client resolves them and drops what it can't see.
 * A target the GM excluded takes no part. Spells without an animation — [].
 * @param {object} flags   the card's
 * @returns {Array<{type: 'projectile'|'bolt'|'burst', fx: string, from?: object, to?: object, at?: object, delay: number}>}
 */
export function spellFxPlan(flags) {
  const targets = (flags?.targets ?? []).filter((target) => !target.excluded && target.tokenUuid);
  const token = (target) => ({ token: target.tokenUuid });
  switch (flags?.spellName) {
    case 'Волшебная Стрела': {
      if (!targets.length) return [];
      return [
        { type: 'projectile', fx: 'magic-arrow', from: 'caster', to: token(targets[0]), delay: 0, then: { type: 'burst', fx: 'magic-arrow-hit' } },
      ];
    }
    case 'Молния':
      return targets.length ? [{ type: 'bolt', fx: 'lightning', from: 'caster', to: token(targets[0]), delay: 0 }] : [];
    case 'Цепная Молния': {
      if (!targets.length) return [];
      const [first, ...rest] = targets;
      const steps = [{ type: 'bolt', fx: 'lightning', from: 'caster', to: token(first), delay: 0 }];
      // The specialization's picked targets — each its own hop from the
      // first; the chain — hop by hop from the first, in its order.
      for (const target of rest.filter((t) => t.chosen)) {
        steps.push({ type: 'bolt', fx: 'lightning-alt', from: token(first), to: token(target), delay: HOP_MS });
      }
      let from = first;
      rest.filter((t) => !t.chosen).forEach((target, index) => {
        steps.push({ type: 'bolt', fx: index % 2 ? 'lightning' : 'lightning-alt', from: token(from), to: token(target), delay: HOP_MS * (index + 1) });
        from = target;
      });
      return steps;
    }
    case 'Огненный Шар':
      return flags.area?.center ? [{ type: 'burst', fx: 'fireball', at: { cell: { i: flags.area.center.i, j: flags.area.center.j } }, delay: 0 }] : [];
    default:
      return [];
  }
}

/**
 * A sprite stretched from one point to another: where it starts, its turn
 * and length. `angle` 0 points right; a vertical sprite turns by −90°.
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @returns {{x: number, y: number, angle: number, length: number}}
 */
export function segmentBetween(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return { x: from.x, y: from.y, angle: Math.atan2(dy, dx), length: Math.hypot(dx, dy) };
}

/**
 * How long a projectile flies between two points.
 * @param {number} length   in pixels
 * @param {number} cell     the grid's cell, in pixels
 * @returns {number}   ms
 */
export function flightMs(length, cell) {
  return Math.max(MIN_FLIGHT_MS, (length / cell / PROJECTILE_CELLS_PER_SECOND) * 1000);
}

/* -------------------------------------------- */
/*  Runtime (Foundry)                           */
/* -------------------------------------------- */

/** The client setting's key. */
export const SPELL_FX_SETTING = 'spellAnimations';

/** Registers «Анимации заклинаний» — each client its own. */
export function registerSpellFxSetting() {
  game.settings.register('heroes-glory', SPELL_FX_SETTING, {
    name: 'HEROES_GLORY.Settings.SpellAnimations.Name',
    hint: 'HEROES_GLORY.Settings.SpellAnimations.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true,
  });
}

/** @type {Map<string, PIXI.Texture[]>} */
const textures = new Map();

/**
 * @param {string} key
 * @returns {Promise<PIXI.Texture[]>}
 */
async function fxTextures(key) {
  if (!textures.has(key)) {
    const { frames } = SPELL_FX[key];
    const list = await Promise.all(Array.from({ length: frames }, (_, index) => foundry.canvas.loadTexture(`${FX_ROOT}/${key}/${String(index).padStart(3, '0')}.png`)));
    textures.set(key, list);
  }
  return textures.get(key);
}

/**
 * The GM confirmed a spell card: play it here, if this client wants it.
 * Called on every client (the `updateChatMessage` hook, heroes-glory.mjs).
 * @param {object} flags   the card's spell flags
 */
export async function playSpellFx(flags) {
  if (!canvas?.ready || !game.settings.get('heroes-glory', SPELL_FX_SETTING)) return;
  const plan = spellFxPlan(flags);
  if (!plan.length) return;
  const casterPoint = casterCenter(flags);
  const resolve = (end) => {
    if (end === 'caster') return casterPoint;
    if (end?.token) return visibleTokenCenter(end.token);
    if (end?.cell) return canvas.grid.getCenterPoint(end.cell);
    return null;
  };
  await Promise.all(plan.map(async (step) => {
    if (step.delay) await wait(step.delay);
    if (step.type === 'burst') {
      const at = resolve(step.at);
      if (at) await playBurst(step.fx, at);
      return;
    }
    const from = resolve(step.from);
    const to = resolve(step.to);
    if (!from || !to) return;
    if (step.type === 'bolt') await playBolt(step.fx, from, to);
    if (step.type === 'projectile') {
      await playProjectile(step.fx, from, to);
      if (step.then) await playBurst(step.then.fx, to);
    }
  }));
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The centre of a token this client can see on the scene on screen, else
 * null — a hidden one never (rules.md §11), not even for the GM.
 * @param {string} uuid
 * @returns {{x: number, y: number}|null}
 */
function visibleTokenCenter(uuid) {
  const doc = fromUuidSync(uuid);
  const token = doc?.parent === canvas.scene ? doc.object : null;
  if (!token || doc.hidden || !token.visible) return null;
  return token.center;
}

/**
 * The caster's token on the scene on screen, if seen.
 * @param {object} flags
 * @returns {{x: number, y: number}|null}
 */
function casterCenter(flags) {
  const found = flags.actorUuid ? fromUuidSync(flags.actorUuid) : null;
  const actor = found?.documentName === 'Token' ? found.actor : found;
  if (!actor) return null;
  const doc = actor.token ?? actor.getActiveTokens(false, true).find((t) => t.parent === canvas.scene);
  return doc ? visibleTokenCenter(doc.uuid) : null;
}

/**
 * A container over the tokens, removed when done.
 * @returns {PIXI.Container}
 */
function fxLayer() {
  const container = new PIXI.Container();
  canvas.interface.addChild(container);
  return container;
}

/**
 * Plays a sprite's frames once, at its own fps; `onFrame` may move it.
 * @param {PIXI.Sprite} sprite
 * @param {PIXI.Texture[]} frames
 * @param {number} fps
 * @param {number} [durationMs]   at least this long (a projectile's flight)
 * @param {(progress: number) => void} [onFrame]
 * @returns {Promise<void>}
 */
function animate(sprite, frames, fps, durationMs = 0, onFrame = null) {
  const total = Math.max(durationMs, (frames.length / fps) * 1000);
  return new Promise((resolve) => {
    let elapsed = 0;
    const tick = () => {
      elapsed += canvas.app.ticker.deltaMS;
      const progress = Math.min(1, elapsed / total);
      sprite.texture = frames[Math.floor((elapsed / 1000) * fps) % frames.length];
      onFrame?.(progress);
      if (progress >= 1) {
        canvas.app.ticker.remove(tick);
        resolve();
      }
    };
    canvas.app.ticker.add(tick);
  });
}

/**
 * A burst in place (the arrow's hit, the fireball), its width `size` cells.
 * @param {string} key
 * @param {{x: number, y: number}} at
 */
async function playBurst(key, at) {
  const def = SPELL_FX[key];
  const frames = await fxTextures(key);
  const layer = fxLayer();
  const sprite = new PIXI.Sprite(frames[0]);
  sprite.anchor.set(0.5);
  sprite.position.set(at.x, at.y);
  sprite.scale.set((def.size * canvas.grid.size) / def.width);
  layer.addChild(sprite);
  await animate(sprite, frames, def.fps);
  layer.destroy({ children: true });
}

/**
 * A projectile from one point to another, turned along its way.
 * @param {string} key
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 */
async function playProjectile(key, from, to) {
  const def = SPELL_FX[key];
  const frames = await fxTextures(key);
  const segment = segmentBetween(from, to);
  const layer = fxLayer();
  const sprite = new PIXI.Sprite(frames[0]);
  sprite.anchor.set(0.5);
  sprite.rotation = segment.angle;
  sprite.scale.set((def.size * canvas.grid.size) / def.width);
  layer.addChild(sprite);
  await animate(sprite, frames, def.fps, flightMs(segment.length, canvas.grid.size), (progress) => {
    sprite.position.set(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
  });
  layer.destroy({ children: true });
}

/**
 * A lightning bolt stretched from one point to another: flashes in, flickers
 * between the two drawings, fades.
 * @param {string} key
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 */
async function playBolt(key, from, to) {
  const def = SPELL_FX[key];
  const [main] = await fxTextures(key);
  const [other] = await fxTextures(key === 'lightning' ? 'lightning-alt' : 'lightning');
  const segment = segmentBetween(from, to);
  const layer = fxLayer();
  const sprite = new PIXI.Sprite(main);
  sprite.anchor.set(0.5, 0);
  sprite.position.set(segment.x, segment.y);
  // The drawing runs top to bottom: turn it from «down» to the way.
  sprite.rotation = segment.angle - Math.PI / 2;
  sprite.scale.set((def.size * canvas.grid.size) / def.width, segment.length / def.height);
  sprite.blendMode = PIXI.BLEND_MODES.ADD;
  layer.addChild(sprite);
  await animate(sprite, [main, other], 16, BOLT_MS, (progress) => {
    sprite.alpha = progress < 0.15 ? progress / 0.15 : 1 - Math.max(0, (progress - 0.6) / 0.4);
  });
  layer.destroy({ children: true });
}
