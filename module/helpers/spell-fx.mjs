import { resolveModifierSpellResolution, resolveSupportSpellResolution } from './spell-effects.mjs';

/**
 * Spell animations (rules.md §11): HOMM3's own combat-spell sprites
 * (assets/spell-fx, scripts/extract_spell_fx.py) played on the canvas when
 * the GM confirms a spell card — on every client, over the tokens it can
 * see, unless the client's «Анимации заклинаний» setting is off. A hidden
 * token takes no part: a step that starts or ends at one is skipped.
 */

const FX_ROOT = 'systems/heroes-glory/assets/spell-fx';

/**
 * Which sprites each spell plays, as HOMM3 draws it (VCMI's
 * config/spells/*.json «animation» blocks):
 * - `projectile` flies from the caster to each target, then `hit` there;
 * - `bolt` is stretched from the caster to the target (`chain` — on, hop by
 *   hop), then `hit` flashes there;
 * - `area` bursts on the centre of the chosen cells, its width the pattern;
 * - `affect` plays on each target the spell took.
 * `alpha` — drawn half see-through, as HOMM3 does; `anchor: 'bottom'` — the
 * sprite stands on the token's bottom edge (a pillar, the sand of Замедление).
 */
export const FX_BY_SPELL = {
  'Волшебная Стрела': { projectile: 'magic-arrow', hit: 'magic-arrow-hit' },
  'Ледяная Молния': { projectile: 'ice-bolt', hit: 'ice-bolt-hit', alpha: 0.5 },
  'Разрушительный Луч': { projectile: 'disrupting-ray', hit: 'disrupting-ray-hit', alpha: 0.5 },
  'Молния': { bolt: 'lightning', hit: 'lightning-alt' },
  'Цепная Молния': { chain: 'chain-lightning', hit: 'chain-lightning-alt' },
  'Огненный Шар': { area: 'fireball' },
  'Инферно': { area: 'inferno' },
  'Метеоритный Дождь': { area: 'meteor-shower' },
  'Кольцо Холода': { area: 'frost-ring' },
  'Взрыв': { affect: 'implosion' },
  'Волна Смерти': { affect: 'death-ripple' },
  'Уничтожить Нежить': { affect: 'destroy-undead', alpha: 0.5 },
  'Армагеддон': { affect: 'armageddon' },
  'Щит': { affect: 'shield' },
  'Воздушный Щит': { affect: 'air-shield' },
  'Огненный Щит': { affect: 'fire-shield' },
  'Антимагия': { affect: 'anti-magic' },
  'Благословение': { affect: 'bless' },
  'Проклятие': { affect: 'curse' },
  'Точность': { affect: 'precision' },
  'Слабость': { affect: 'weakness' },
  'Каменная Кожа': { affect: 'stone-skin' },
  'Молитва': { affect: 'prayer', alpha: 0.5, anchor: 'bottom' },
  'Удача': { affect: 'fortune' },
  'Неудача': { affect: 'misfortune' },
  'Ускорение': { affect: 'haste' },
  'Замедление': { affect: 'slow', anchor: 'bottom' },
  'Ответный Удар': { affect: 'counterstrike' },
  'Забывчивость': { affect: 'forgetfulness' },
  'Слепота': { affect: 'blind' },
  'Развеивание Магии': { affect: 'dispel' },
  'Лечение': { affect: 'cure' },
  'Воскрешение': { affect: 'resurrection', alpha: 0.5 },
};

/**
 * Spells HOMM3 has no cast animation for — they play nothing. Жажда Крови is
 * a red tint there, not a sprite; Полет is not a battle spell in HOMM3; the
 * rest are obstacles, a move or a new creature.
 */
export const SPELLS_WITHOUT_FX = [
  'Жажда Крови', 'Полет', 'Телепорт', 'Силовое Поле', 'Стена Огня', 'Зыбучий Песок', 'Клон', 'Призыв Элементаля',
];

/** One grid cell holds this many pixels of a HOMM3 sprite (a creature is ~90 px wide there). */
const HOMM_PX_PER_CELL = 90;
/** How fast a projectile flies, in grid cells a second; never quicker than MIN_FLIGHT_MS. */
const PROJECTILE_CELLS_PER_SECOND = 14;
const MIN_FLIGHT_MS = 250;
/** A bolt shows for BOLT_MS; the next hop of a chain starts HOP_MS later. */
const BOLT_MS = 400;
const HOP_MS = 180;
/** HOMM3 plays its sprites at about this rate. */
const FPS = 15;

/**
 * The targets a confirmed card's spell took: a damage spell — every one the
 * GM didn't exclude (an immune one is still struck); an effect — only where
 * it was applied (not resisted, not immune).
 * @param {object} flags   the card's
 * @returns {object[]}
 */
export function fxTargets(flags) {
  const targets = flags?.targets ?? [];
  let outcomes = null;
  if (flags?.effectKind === 'modifier') outcomes = resolveModifierSpellResolution(flags);
  else if (['heal', 'dispel', 'resurrect'].includes(flags?.effectKind)) outcomes = resolveSupportSpellResolution(flags);
  return targets.filter((target, index) => target.tokenUuid && !target.excluded
    && (!outcomes || outcomes[index]?.outcome === 'applied'));
}

/**
 * What to play for a confirmed spell card — in steps, each with its start
 * in ms. An end is `'caster'`, a token (`{token: uuid}`) or a cell
 * (`{cell: {i, j}}`); the client resolves them and drops what it can't see.
 * Spells without an animation — [].
 * @param {object} flags   the card's
 * @returns {Array<object>}
 */
export function spellFxPlan(flags) {
  const fx = FX_BY_SPELL[flags?.spellName];
  if (!fx) return [];
  const targets = fxTargets(flags);
  const token = (target) => ({ token: target.tokenUuid });
  const hit = (key) => (key ? { fx: key, alpha: fx.alpha ?? 1 } : null);
  if (fx.area) {
    if (!flags.area?.center) return [];
    const size = flags.area.pattern === '5x5' ? 5 : 3;
    return [{ type: 'burst', fx: fx.area, at: { cell: { i: flags.area.center.i, j: flags.area.center.j } }, size, delay: 0 }];
  }
  if (fx.affect) {
    return targets.map((target) => ({
      type: 'burst', fx: fx.affect, at: token(target), alpha: fx.alpha ?? 1, anchor: fx.anchor ?? 'center', delay: 0,
    }));
  }
  if (fx.projectile) {
    return targets.map((target) => ({ type: 'projectile', fx: fx.projectile, from: 'caster', to: token(target), delay: 0, then: hit(fx.hit) }));
  }
  if (fx.bolt) {
    return targets.slice(0, 1).map((target) => ({ type: 'bolt', fx: fx.bolt, from: 'caster', to: token(target), delay: 0, then: hit(fx.hit) }));
  }
  if (fx.chain) {
    if (!targets.length) return [];
    const [first, ...rest] = targets;
    const bolt = (from, to, delay) => ({ type: 'bolt', fx: fx.chain, from, to, delay, then: hit(fx.hit) });
    const steps = [bolt('caster', token(first), 0)];
    // The specialization's picked targets — each its own hop from the
    // first; the chain — hop by hop from the first, in its order.
    for (const target of rest.filter((t) => t.chosen)) steps.push(bolt(token(first), token(target), HOP_MS));
    let from = first;
    rest.filter((t) => !t.chosen).forEach((target, index) => {
      steps.push(bolt(token(from), token(target), HOP_MS * (index + 1)));
      from = target;
    });
    return steps;
  }
  return [];
}

/**
 * A sprite stretched from one point to another: where it starts, its turn
 * and length. `angle` 0 points right.
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

/**
 * A sprite's scale on the scene: an area burst as wide as its pattern; one
 * on a token — HOMM3's size to a cell, times the token's width in cells.
 * @param {{width: number}} frame   the DEF's canvas, from the manifest
 * @param {number} cell   the grid's cell, in pixels
 * @param {{size?: number, tokenCells?: number}} [options]
 * @returns {number}
 */
export function fxScale(frame, cell, { size = null, tokenCells = 1 } = {}) {
  if (size) return (size * cell) / frame.width;
  return (cell * tokenCells) / HOMM_PX_PER_CELL;
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

/** @type {Promise<Record<string, {frames: number, width: number, height: number}>>|null} */
let manifest = null;
/** @type {Map<string, PIXI.Texture[]>} */
const textures = new Map();

/**
 * One animation's frames and its canvas size.
 * @param {string} key
 * @returns {Promise<{frames: PIXI.Texture[], width: number, height: number}>}
 */
async function fxSprite(key) {
  manifest ??= foundry.utils.fetchJsonWithTimeout(`${FX_ROOT}/manifest.json`);
  const def = (await manifest)[key];
  if (!textures.has(key)) {
    textures.set(key, await Promise.all(Array.from({ length: def.frames },
      (_, index) => foundry.canvas.loadTexture(`${FX_ROOT}/${key}/${String(index).padStart(3, '0')}.png`))));
  }
  return { frames: textures.get(key), width: def.width, height: def.height };
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
  const caster = casterToken(flags);
  const resolve = (end) => {
    if (end === 'caster') return caster;
    if (end?.token) return visibleToken(end.token);
    if (end?.cell) return { center: canvas.grid.getCenterPoint(end.cell), cells: 1 };
    return null;
  };
  await Promise.all(plan.map(async (step) => {
    if (step.delay) await wait(step.delay);
    if (step.type === 'burst') {
      const at = resolve(step.at);
      if (at) await playBurst(step.fx, at, step);
      return;
    }
    const from = resolve(step.from);
    const to = resolve(step.to);
    if (!from || !to) return;
    if (step.type === 'bolt') await playBolt(step.fx, from.center, to.center);
    if (step.type === 'projectile') await playProjectile(step.fx, from.center, to.center);
    if (step.then) await playBurst(step.then.fx, to, step.then);
  })).catch((error) => console.warn('heroes-glory | spell animation failed', error));
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A token this client can see on the scene on screen — its centre, bottom
 * and width in cells; else null. A hidden one never (rules.md §11), not
 * even for the GM.
 * @param {string} uuid
 * @returns {{center: {x: number, y: number}, bottom: number, cells: number}|null}
 */
function visibleToken(uuid) {
  const doc = fromUuidSync(uuid);
  const token = doc?.parent === canvas.scene ? doc.object : null;
  if (!token || doc.hidden || !token.visible) return null;
  return { center: token.center, bottom: token.y + token.h, cells: doc.width };
}

/**
 * The caster's token on the scene on screen, if seen.
 * @param {object} flags
 * @returns {ReturnType<typeof visibleToken>}
 */
function casterToken(flags) {
  const found = flags.actorUuid ? fromUuidSync(flags.actorUuid) : null;
  const actor = found?.documentName === 'Token' ? found.actor : found;
  if (!actor) return null;
  const doc = actor.token ?? actor.getActiveTokens(false, true).find((t) => t.parent === canvas.scene);
  return doc ? visibleToken(doc.uuid) : null;
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
 * Plays a sprite's frames once at HOMM3's rate; `onFrame` may move it.
 * @param {PIXI.Sprite} sprite
 * @param {PIXI.Texture[]} frames
 * @param {number} [durationMs]   at least this long (a projectile's flight)
 * @param {(progress: number) => void} [onFrame]
 * @returns {Promise<void>}
 */
function animate(sprite, frames, durationMs = 0, onFrame = null) {
  const total = Math.max(durationMs, (frames.length / FPS) * 1000);
  return new Promise((resolve) => {
    let elapsed = 0;
    const tick = () => {
      elapsed += canvas.app.ticker.deltaMS;
      const progress = Math.min(1, elapsed / total);
      sprite.texture = frames[Math.floor((elapsed / 1000) * FPS) % frames.length];
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
 * A burst in place: on a token (by its size) or on an area's centre.
 * @param {string} key
 * @param {{center: {x: number, y: number}, bottom?: number, cells: number}} at
 * @param {{size?: number, alpha?: number, anchor?: string}} options
 */
async function playBurst(key, at, { size = null, alpha = 1, anchor = 'center' } = {}) {
  const sprite = await fxSprite(key);
  const layer = fxLayer();
  const view = new PIXI.Sprite(sprite.frames[0]);
  const bottom = anchor === 'bottom' && at.bottom !== undefined;
  view.anchor.set(0.5, bottom ? 1 : 0.5);
  view.position.set(at.center.x, bottom ? at.bottom : at.center.y);
  view.scale.set(fxScale(sprite, canvas.grid.size, { size, tokenCells: at.cells }));
  view.alpha = alpha;
  layer.addChild(view);
  await animate(view, sprite.frames);
  layer.destroy({ children: true });
}

/**
 * A projectile from one point to another, turned along its way.
 * @param {string} key
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 */
async function playProjectile(key, from, to) {
  const sprite = await fxSprite(key);
  const segment = segmentBetween(from, to);
  const layer = fxLayer();
  const view = new PIXI.Sprite(sprite.frames[0]);
  view.anchor.set(0.5);
  view.rotation = segment.angle;
  view.scale.set(fxScale(sprite, canvas.grid.size));
  layer.addChild(view);
  await animate(view, sprite.frames, flightMs(segment.length, canvas.grid.size), (progress) => {
    view.position.set(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress);
  });
  layer.destroy({ children: true });
}

/**
 * A lightning bolt stretched from one point to another: flashes in, fades.
 * @param {string} key
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 */
async function playBolt(key, from, to) {
  const sprite = await fxSprite(key);
  const segment = segmentBetween(from, to);
  const layer = fxLayer();
  const view = new PIXI.Sprite(sprite.frames[0]);
  view.anchor.set(0.5, 0);
  view.position.set(segment.x, segment.y);
  // The drawing runs top to bottom: turn it from «down» to the way.
  view.rotation = segment.angle - Math.PI / 2;
  view.scale.set((0.9 * canvas.grid.size) / sprite.width, segment.length / sprite.height);
  view.blendMode = PIXI.BLEND_MODES.ADD;
  layer.addChild(view);
  await animate(view, sprite.frames, BOLT_MS, (progress) => {
    view.alpha = progress < 0.15 ? progress / 0.15 : 1 - Math.max(0, (progress - 0.6) / 0.4);
  });
  layer.destroy({ children: true });
}
