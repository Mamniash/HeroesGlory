import { resolveModifierSpellResolution, resolveSupportSpellResolution } from './spell-effects.mjs';

/**
 * Spell animations and sounds (rules.md §11): HOMM3's own combat-spell
 * sprites (assets/spell-fx, scripts/extract_spell_fx.py) and sounds
 * (assets/spell-sfx, scripts/extract_spell_sounds.py), played on the canvas
 * when the GM confirms a spell card — on every client, over the tokens it
 * can see, each switched by its own client setting («Анимации заклинаний»,
 * «Звуки заклинаний»). A hidden token takes no part: a step that starts or
 * ends at one is skipped, and a cast nobody here can see makes no sound.
 * A field spell's region shows its HOMM3 obstacle in its cells while it
 * stands (syncFieldFx).
 */

const FX_ROOT = 'systems/heroes-glory/assets/spell-fx';
const SFX_ROOT = 'systems/heroes-glory/assets/spell-sfx';

/**
 * Which sprites each spell plays, as HOMM3 draws it (VCMI's
 * config/spells/*.json «animation» blocks):
 * - `projectile` flies from the caster to each target, then `hit` there;
 * - `bolt` is stretched from the caster to the target (`chain` — on, hop by
 *   hop), then `hit` flashes there;
 * - `area` bursts on the centre of the chosen cells, its width the pattern;
 * - `affect` plays on each target the spell took;
 * - `tint` flashes the token in a colour (Жажда Крови — HOMM3's red glow);
 * - `teleport` bursts where the token left and where it lands;
 * - `appear` bursts where a token is made (Клон; Призыв Элементаля — by its
 *   element, `appear` keyed by element);
 * - `cell` — the expert Развеивание on a cell bursts there;
 * - `field` — the region shows its obstacle (syncFieldFx), nothing on confirm.
 * `alpha` — drawn half see-through, as HOMM3 does; `anchor: 'bottom'` — the
 * sprite stands on the token's bottom edge (a pillar, the sand of Замедление).
 * Spells HOMM3 gives no cast animation take the nearest sprite there
 * (rules.md §11).
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
  'Развеивание Магии': { affect: 'dispel', cell: 'dispel' },
  'Лечение': { affect: 'cure' },
  'Воскрешение': { affect: 'resurrection', alpha: 0.5 },
  'Жажда Крови': { tint: 0xff2a2a },
  'Полет': { affect: 'fly' },
  'Телепорт': { teleport: 'teleport' },
  'Клон': { appear: 'clone' },
  'Призыв Элементаля': { appear: { fire: 'summon-fire', water: 'summon-water', air: 'summon-air', earth: 'summon-earth' } },
  'Силовое Поле': { field: 'forceField' },
  'Стена Огня': { field: 'fireWall' },
  'Зыбучий Песок': { field: 'quicksand' },
};

/**
 * A field spell's obstacle in each cell while its region stands — HOMM3's
 * obstacle sprites (VCMI's obstacle blocks): it appears, loops, and goes.
 */
export const FIELD_FX = {
  forceField: { appear: 'force-field-appear', loop: 'force-field', remove: 'force-field-remove' },
  fireWall: { appear: 'fire-wall-appear', loop: 'fire-wall', remove: 'fire-wall-remove' },
  quicksand: { appear: 'quicksand-appear', loop: 'quicksand', remove: null },
};

/**
 * The HOMM3 sound of each spell (VCMI's «sounds» blocks; an obstacle — its
 * «appearSound»; Телепорт — out, then in). Every spell of the book has one.
 */
export const SFX_BY_SPELL = {
  'Волшебная Стрела': 'MAGICBLT', 'Ледяная Молния': 'ICERAY', 'Молния': 'LIGHTBLT', 'Взрыв': 'DECAY',
  'Цепная Молния': 'CHAINLTE', 'Кольцо Холода': 'FROSTING', 'Огненный Шар': 'SPONTCOMB', 'Инферно': 'FIREBLST',
  'Метеоритный Дождь': 'METEOR', 'Волна Смерти': 'DEATHRIP', 'Уничтожить Нежить': 'SACBRETH', 'Армагеддон': 'ARMGEDN',
  'Щит': 'SHIELD', 'Воздушный Щит': 'AIRSHELD', 'Огненный Щит': 'FIRESHLD', 'Антимагия': 'ANTIMAGK',
  'Благословение': 'BLESS', 'Проклятие': 'CURSE', 'Жажда Крови': 'BLOODLUS', 'Точность': 'PRECISON',
  'Слабость': 'WEAKNESS', 'Каменная Кожа': 'TUFFSKIN', 'Разрушительный Луч': 'DISRUPTR', 'Молитва': 'PRAYER',
  'Удача': 'FORTUNE', 'Неудача': 'MISFORT', 'Ускорение': 'TAILWIND', 'Замедление': 'MUCKMIRE',
  'Ответный Удар': 'CNTRSTRK', 'Забывчивость': 'FORGET', 'Слепота': 'BLIND', 'Полет': 'FLYSPELL',
  'Зыбучий Песок': 'QUIKSAND', 'Силовое Поле': 'FORCEFLD', 'Стена Огня': 'FIREWALL', 'Телепорт': ['TELPTOUT', 'TELPTIN'],
  'Клон': 'CLONE', 'Призыв Элементаля': 'SUMNELM', 'Развеивание Магии': 'DISPELL', 'Лечение': 'CURE',
  'Воскрешение': 'RESURECT',
};

/** One grid cell holds this many pixels of a HOMM3 sprite (a creature is ~90 px wide there). */
const HOMM_PX_PER_CELL = 90;
/** How fast a projectile flies, in grid cells a second; never quicker than MIN_FLIGHT_MS. */
const PROJECTILE_CELLS_PER_SECOND = 14;
const MIN_FLIGHT_MS = 250;
/** A bolt shows for BOLT_MS; the next hop of a chain starts HOP_MS later. */
const BOLT_MS = 400;
const HOP_MS = 180;
/** Телепорт: the landing burst starts this long after the leaving one. */
const TELEPORT_MS = 450;
/** Жажда Крови's red flash. */
const TINT_MS = 1200;
/** HOMM3 plays its sprites at about this rate. */
const FPS = 15;
/** Over the tokens (200) and the controls (1000), under the damage numbers (1100). */
const FX_Z_INDEX = 1050;
/** An obstacle stands no taller than this many cells. */
const FIELD_MAX_CELLS_TALL = 1.8;

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
  else if (['heal', 'dispel', 'resurrect', 'teleport'].includes(flags?.effectKind)) outcomes = resolveSupportSpellResolution(flags);
  return targets.filter((target, index) => target.tokenUuid && !target.excluded
    && (!outcomes || outcomes[index]?.outcome === 'applied'));
}

/**
 * What to play for a confirmed spell card — in steps, each with its start
 * in ms. An end is `'caster'`, a token (`{token: uuid}`), a cell
 * (`{cell: {i, j}}`) or a token-sized place by its top-left corner
 * (`{topLeft: {x, y}, width, height}` — `token` gives the size if known);
 * the client resolves them and drops what it can't see. A field spell plays
 * nothing here — its region shows the obstacle.
 * @param {object} flags   the card's
 * @returns {Array<object>}
 */
export function spellFxPlan(flags) {
  const fx = FX_BY_SPELL[flags?.spellName];
  if (!fx || fx.field) return [];
  const targets = fxTargets(flags);
  const token = (target) => ({ token: target.tokenUuid });
  const hit = (key) => (key ? { fx: key, alpha: fx.alpha ?? 1 } : null);
  if (fx.area) {
    if (!flags.area?.center) return [];
    const size = flags.area.pattern === '5x5' ? 5 : 3;
    return [{ type: 'burst', fx: fx.area, at: { cell: { i: flags.area.center.i, j: flags.area.center.j } }, size, delay: 0 }];
  }
  if (fx.cell && flags.dispelCell?.cell) {
    return [{ type: 'burst', fx: fx.cell, at: { cell: flags.dispelCell.cell }, delay: 0 }];
  }
  if (fx.tint) return targets.map((target) => ({ type: 'tint', color: fx.tint, at: token(target), delay: 0 }));
  if (fx.teleport) {
    return targets.flatMap((target) => [
      ...(target.origin ? [{ type: 'burst', fx: fx.teleport, at: { topLeft: target.origin, token: target.tokenUuid }, delay: 0 }] : []),
      { type: 'burst', fx: fx.teleport, at: { token: target.tokenUuid }, delay: target.origin ? TELEPORT_MS : 0 },
    ]);
  }
  if (fx.appear) {
    if (flags.clone) {
      const { width = 1, height = 1 } = flags.clone;
      return (flags.clone.destinations ?? []).map((d) => ({ type: 'burst', fx: fx.appear, at: { topLeft: d, width, height }, delay: 0 }));
    }
    if (flags.summon?.destination) {
      const key = typeof fx.appear === 'string' ? fx.appear : fx.appear[flags.summon.element];
      if (!key) return [];
      const { width = 1, height = 1 } = flags.summon;
      return [{ type: 'burst', fx: key, at: { topLeft: flags.summon.destination, width, height }, delay: 0 }];
    }
    return [];
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
 * The sounds of a confirmed card, each with its start in ms: the spell's own;
 * Телепорт — out at once, in when it lands.
 * @param {object} flags
 * @returns {Array<{sound: string, delay: number}>}
 */
export function spellSfxPlan(flags) {
  const sound = SFX_BY_SPELL[flags?.spellName];
  if (!sound) return [];
  if (Array.isArray(sound)) return sound.map((name, index) => ({ sound: name, delay: index * TELEPORT_MS }));
  return [{ sound, delay: 0 }];
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

/**
 * An obstacle's scale in its cell: as wide as the cell, but no taller than
 * FIELD_MAX_CELLS_TALL cells (HOMM3's fire stands three hexes high).
 * @param {{width: number, height: number}} frame
 * @param {number} cell
 * @returns {number}
 */
export function fieldScale(frame, cell) {
  return Math.min(cell / frame.width, (FIELD_MAX_CELLS_TALL * cell) / frame.height);
}

/**
 * Who sees a field spell's region (its obstacle, its sound): a trap of
 * Зыбучий Песок — the GM and its observers until it springs; the rest — all.
 * @param {{visibility: number, isGM: boolean, isObserver: boolean, always: number, observer: number}} args
 * @returns {boolean}
 */
export function fieldSeen({ visibility, isGM, isObserver, always, observer }) {
  if (visibility === always || isGM) return true;
  return visibility === observer && isObserver;
}

/* -------------------------------------------- */
/*  Runtime (Foundry)                           */
/* -------------------------------------------- */

/** The client settings' keys. */
export const SPELL_FX_SETTING = 'spellAnimations';
export const SPELL_SFX_SETTING = 'spellSounds';

/** Registers «Анимации заклинаний» and «Звуки заклинаний» — each client its own. */
export function registerSpellFxSetting() {
  game.settings.register('heroes-glory', SPELL_FX_SETTING, {
    name: 'HEROES_GLORY.Settings.SpellAnimations.Name',
    hint: 'HEROES_GLORY.Settings.SpellAnimations.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true,
    onChange: () => syncFieldFx(),
  });
  game.settings.register('heroes-glory', SPELL_SFX_SETTING, {
    name: 'HEROES_GLORY.Settings.SpellSounds.Name',
    hint: 'HEROES_GLORY.Settings.SpellSounds.Hint',
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
 * The GM confirmed a spell card: play it here — what this client wants and
 * can see. Called on every client (the `updateChatMessage` hook,
 * heroes-glory.mjs).
 * @param {object} flags   the card's spell flags
 */
export async function playSpellFx(flags) {
  if (!canvas?.ready) return;
  const animations = game.settings.get('heroes-glory', SPELL_FX_SETTING);
  const sounds = game.settings.get('heroes-glory', SPELL_SFX_SETTING);
  if (!animations && !sounds) return;
  const caster = casterToken(flags);
  const resolve = (end) => {
    if (end === 'caster') return caster;
    if (end?.topLeft) return placeAt(end);
    if (end?.token) return visibleToken(end.token);
    if (end?.cell) return { center: canvas.grid.getCenterPoint(end.cell), cells: 1 };
    return null;
  };
  // Resolved now: a step whose ends this client can't see is dropped.
  const steps = spellFxPlan(flags).map((step) => ({
    ...step,
    at: step.at ? resolve(step.at) : null,
    from: step.from ? resolve(step.from) : null,
    to: step.to ? resolve(step.to) : null,
  })).filter((step) => (step.at || (step.from && step.to)));
  // A cast this client sees anything of — or a field spell it sees — is heard.
  if (sounds && (steps.length || fieldSoundHeard(flags))) playSpellSfx(flags);
  if (!animations) return;
  await Promise.all(steps.map(async (step) => {
    if (step.delay) await wait(step.delay);
    if (step.type === 'tint') return playTint(step.at, step.color);
    if (step.type === 'burst') return playBurst(step.fx, step.at, step);
    if (step.type === 'bolt') await playBolt(step.fx, step.from.center, step.to.center);
    if (step.type === 'projectile') await playProjectile(step.fx, step.from.center, step.to.center);
    if (step.then) await playBurst(step.then.fx, step.to, step.then);
  })).catch((error) => console.warn('heroes-glory | spell animation failed', error));
}

/**
 * Is a field spell heard here: Силовое Поле, Стена Огня by all; a trap of
 * Зыбучий Песок only by those who see it — the GM and the caster's owners.
 * @param {object} flags
 * @returns {boolean}
 */
function fieldSoundHeard(flags) {
  const type = FX_BY_SPELL[flags?.spellName]?.field;
  if (!type) return false;
  if (type !== 'quicksand' || game.user.isGM) return true;
  const caster = flags.actorUuid ? fromUuidSync(flags.actorUuid) : null;
  return !!caster?.isOwner;
}

/**
 * Plays the card's HOMM3 sounds on the interface channel — the interface
 * volume of this client.
 * @param {object} flags
 */
async function playSpellSfx(flags) {
  for (const { sound, delay } of spellSfxPlan(flags)) {
    if (delay) await wait(delay);
    foundry.audio.AudioHelper.play({ src: `${SFX_ROOT}/${sound}.ogg`, channel: 'interface', volume: 1 }, false);
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A token this client can see on the scene on screen — its centre, bottom,
 * width in cells and object; else null. A hidden one never (rules.md §11),
 * not even for the GM.
 * @param {string} uuid
 * @returns {{center: {x: number, y: number}, bottom: number, cells: number, token: Token}|null}
 */
function visibleToken(uuid) {
  const doc = fromUuidSync(uuid);
  const token = doc?.parent === canvas.scene ? doc.object : null;
  if (!token || doc.hidden || !token.visible) return null;
  return { center: token.center, bottom: token.y + token.h, cells: doc.width, token };
}

/**
 * A token-sized place by its top-left corner (where a token left, where one
 * appears). With a token, only if this client sees that token.
 * @param {{topLeft: {x: number, y: number}, token?: string, width?: number, height?: number}} end
 * @returns {{center: {x: number, y: number}, cells: number}|null}
 */
function placeAt(end) {
  let width = end.width ?? 1;
  let height = end.height ?? 1;
  if (end.token) {
    const seen = visibleToken(end.token);
    if (!seen) return null;
    width = seen.token.document.width;
    height = seen.token.document.height;
  }
  const size = canvas.grid.size;
  return { center: { x: end.topLeft.x + (width * size) / 2, y: end.topLeft.y + (height * size) / 2 }, cells: width };
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
 * A container over the tokens — in the interface group, above the token
 * layer and its controls, under the damage numbers.
 * @returns {PIXI.Container}
 */
function fxLayer() {
  const container = new PIXI.Container();
  container.zIndex = FX_Z_INDEX;
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
      if (sprite.destroyed) {
        canvas.app.ticker.remove(tick);
        resolve();
        return;
      }
      elapsed += canvas.app.ticker.deltaMS;
      const progress = Math.min(1, elapsed / total);
      // A burst ends with its last frame; a long flight loops its frames.
      const frame = Math.floor((elapsed / 1000) * FPS);
      sprite.texture = frames[durationMs > 0 ? frame % frames.length : Math.min(frames.length - 1, frame)];
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

/**
 * Жажда Крови: the token flushes red and back — a copy of its image over it,
 * tinted, fading in and out (the token's own tint is never touched).
 * @param {{token: Token}} at
 * @param {number} color
 */
async function playTint(at, color) {
  const mesh = at.token.mesh;
  if (!mesh?.texture) return;
  const layer = fxLayer();
  const view = new PIXI.Sprite(mesh.texture);
  view.anchor.set(mesh.anchor.x, mesh.anchor.y);
  view.position.set(mesh.position.x, mesh.position.y);
  view.scale.set(mesh.scale.x, mesh.scale.y);
  view.rotation = mesh.rotation;
  view.tint = color;
  view.blendMode = PIXI.BLEND_MODES.ADD;
  layer.addChild(view);
  await animate(view, [mesh.texture], TINT_MS, (progress) => {
    view.alpha = 0.85 * Math.sin(Math.PI * progress);
  });
  layer.destroy({ children: false });
}

/* -------------------------------------------- */
/*  Field spells: obstacles in the cells        */
/* -------------------------------------------- */

/** @type {Map<string, PIXI.Container>} region id → its obstacles */
const fieldViews = new Map();

/**
 * Draws or removes the obstacles of the scene's field spell regions on this
 * client: each region that is seen here gets its HOMM3 obstacle in every
 * cell; a region gone plays its removal. Called on canvasReady and on any
 * region change (heroes-glory.mjs), and when the setting changes.
 */
export function syncFieldFx() {
  if (!canvas?.ready) return;
  const enabled = game.settings.get('heroes-glory', SPELL_FX_SETTING);
  const V = CONST.REGION_VISIBILITY;
  const wanted = new Map();
  for (const region of canvas.scene?.regions ?? []) {
    const field = region.getFlag('heroes-glory', 'fieldSpell');
    const fx = FIELD_FX[field?.type];
    if (!enabled || !fx) continue;
    const seen = fieldSeen({
      visibility: region.visibility,
      isGM: game.user.isGM,
      isObserver: region.testUserPermission(game.user, 'OBSERVER'),
      always: V.ALWAYS,
      observer: V.OBSERVER,
    });
    if (seen) wanted.set(region.id, { region, fx });
  }
  for (const [id, view] of fieldViews) {
    if (wanted.has(id)) continue;
    fieldViews.delete(id);
    removeField(view);
  }
  for (const [id, { region, fx }] of wanted) {
    if (fieldViews.has(id)) continue;
    const view = fxLayer();
    view.fx = fx;
    fieldViews.set(id, view);
    drawField(view, region, fx);
  }
}

/**
 * Forgets every drawn obstacle — the canvas is torn down.
 */
export function resetFieldFx() {
  fieldViews.clear();
}

/**
 * The cells of a region of grid shapes.
 * @param {RegionDocument} region
 * @returns {Array<{i: number, j: number}>}
 */
function regionCells(region) {
  return region.shapes.flatMap((shape) => shape.offsets ?? []);
}

/**
 * Appears, then loops, in each cell — standing on the cell's bottom edge.
 * @param {PIXI.Container} view
 * @param {RegionDocument} region
 * @param {{appear: string, loop: string}} fx
 */
async function drawField(view, region, fx) {
  const [appear, loop] = await Promise.all([fxSprite(fx.appear), fxSprite(fx.loop)]);
  if (view.destroyed) return;
  const size = canvas.grid.size;
  for (const cell of regionCells(region)) {
    const center = canvas.grid.getCenterPoint(cell);
    const sprite = new PIXI.AnimatedSprite(appear.frames);
    sprite.anchor.set(0.5, 1);
    sprite.position.set(center.x, center.y + size / 2);
    sprite.scale.set(fieldScale(loop, size));
    sprite.animationSpeed = FPS / 60;
    sprite.loop = false;
    sprite.onComplete = () => {
      sprite.textures = loop.frames;
      sprite.loop = true;
      sprite.play();
    };
    view.addChild(sprite);
    sprite.play();
  }
}

/**
 * The region is gone (or no longer seen): play the removal, then clear.
 * @param {PIXI.Container} view
 */
async function removeField(view) {
  if (view.destroyed) return;
  if (!view.fx.remove || !game.settings.get('heroes-glory', SPELL_FX_SETTING)) {
    view.destroy({ children: true });
    return;
  }
  const remove = await fxSprite(view.fx.remove);
  if (view.destroyed) return;
  const sprites = view.children.filter((child) => child instanceof PIXI.AnimatedSprite);
  await Promise.all(sprites.map((sprite) => new Promise((resolve) => {
    sprite.textures = remove.frames;
    sprite.loop = false;
    sprite.onComplete = resolve;
    sprite.gotoAndPlay(0);
  })));
  view.destroy({ children: true });
}
