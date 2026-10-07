import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  spellFxPlan, spellSfxPlan, fxTargets, segmentBetween, flightMs, fxScale, fieldScale, fieldSeen,
  FX_BY_SPELL, FIELD_FX, SFX_BY_SPELL,
} from '../module/helpers/spell-fx.mjs';
import { buildSpellDocuments } from '../scripts/data/spell-compendium-data.mjs';

const manifest = JSON.parse(readFileSync('assets/spell-fx/manifest.json', 'utf8'));

describe('spellFxPlan — what plays on the GM\'s confirm', () => {
  test('Волшебная Стрела: flight from the caster, then the burst', () => {
    assert.deepEqual(spellFxPlan({ spellName: 'Волшебная Стрела', targets: [{ tokenUuid: 'T1' }] }), [
      { type: 'projectile', fx: 'magic-arrow', from: 'caster', to: { token: 'T1' }, delay: 0, then: { fx: 'magic-arrow-hit', alpha: 1 } },
    ]);
  });
  test('Молния: one bolt from the caster, the strike flash on the target', () => {
    assert.deepEqual(spellFxPlan({ spellName: 'Молния', targets: [{ tokenUuid: 'T1' }] }), [
      { type: 'bolt', fx: 'lightning', from: 'caster', to: { token: 'T1' }, delay: 0, then: { fx: 'lightning-alt', alpha: 1 } },
    ]);
  });
  test('Цепная Молния: caster → first, picked ones from the first, the chain hop by hop', () => {
    const plan = spellFxPlan({ spellName: 'Цепная Молния', targets: [
      { tokenUuid: 'A' }, { tokenUuid: 'P', chosen: true }, { tokenUuid: 'B' }, { tokenUuid: 'C' },
    ] });
    assert.deepEqual(plan.map((s) => [s.from, s.to, s.delay]), [
      ['caster', { token: 'A' }, 0],
      [{ token: 'A' }, { token: 'P' }, 180],
      [{ token: 'A' }, { token: 'B' }, 180],
      [{ token: 'B' }, { token: 'C' }, 360],
    ]);
  });
  test('area: the burst on the centre, as wide as the pattern', () => {
    assert.deepEqual(spellFxPlan({ spellName: 'Огненный Шар', area: { center: { i: 4, j: 7 }, pattern: '3x3' } }),
      [{ type: 'burst', fx: 'fireball', at: { cell: { i: 4, j: 7 } }, size: 3, delay: 0 }]);
    assert.equal(spellFxPlan({ spellName: 'Инферно', area: { center: { i: 4, j: 7 }, pattern: '5x5' } })[0].size, 5);
  });
  test('an effect plays on each target it took; Молитва stands on the token, half see-through', () => {
    const plan = spellFxPlan({ spellName: 'Молитва', effectKind: 'modifier', targets: [{ tokenUuid: 'A' }, { tokenUuid: 'B' }] });
    assert.deepEqual(plan, [
      { type: 'burst', fx: 'prayer', at: { token: 'A' }, alpha: 0.5, anchor: 'bottom', delay: 0 },
      { type: 'burst', fx: 'prayer', at: { token: 'B' }, alpha: 0.5, anchor: 'bottom', delay: 0 },
    ]);
  });
  test('excluded targets take no part; a field spell plays nothing on the confirm (its region shows it)', () => {
    assert.deepEqual(spellFxPlan({ spellName: 'Молния', targets: [{ tokenUuid: 'T1', excluded: true }] }), []);
    assert.deepEqual(spellFxPlan({ spellName: 'Стена Огня', effectKind: 'field' }), []);
  });
  test('Жажда Крови: a red flash on each target it took', () => {
    assert.deepEqual(spellFxPlan({ spellName: 'Жажда Крови', effectKind: 'modifier', targets: [{ tokenUuid: 'A' }] }),
      [{ type: 'tint', color: 0xff2a2a, at: { token: 'A' }, delay: 0 }]);
  });
  test('Телепорт: a burst where it left, then where it landed', () => {
    const plan = spellFxPlan({ spellName: 'Телепорт', effectKind: 'teleport', targets: [{ tokenUuid: 'A', origin: { x: 100, y: 200 } }] });
    assert.deepEqual(plan, [
      { type: 'burst', fx: 'teleport', at: { topLeft: { x: 100, y: 200 }, token: 'A' }, delay: 0 },
      { type: 'burst', fx: 'teleport', at: { token: 'A' }, delay: 450 },
    ]);
  });
  test('Призыв Элементаля: its element sprite where it appears, by the token size', () => {
    const plan = spellFxPlan({ spellName: 'Призыв Элементаля', effectKind: 'summon', targets: [],
      summon: { element: 'water', destination: { x: 400, y: 300 }, width: 2, height: 2 } });
    assert.deepEqual(plan, [{ type: 'burst', fx: 'summon-water', at: { topLeft: { x: 400, y: 300 }, width: 2, height: 2 }, delay: 0 }]);
  });
  test('Клон: a burst in each destination', () => {
    const plan = spellFxPlan({ spellName: 'Клон', effectKind: 'clone', targets: [],
      clone: { width: 1, height: 1, destinations: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } });
    assert.equal(plan.length, 2);
    assert.equal(plan[1].fx, 'clone');
  });
  test('the expert Развеивание on a cell — a burst on that cell', () => {
    assert.deepEqual(spellFxPlan({ spellName: 'Развеивание Магии', effectKind: 'dispel', targets: [], dispelCell: { cell: { i: 3, j: 4 } } }),
      [{ type: 'burst', fx: 'dispel', at: { cell: { i: 3, j: 4 } }, delay: 0 }]);
  });
});

describe('fxTargets — who the animation plays on', () => {
  test('an effect resisted or immune — not there', () => {
    const flags = { effectKind: 'modifier', targets: [
      { tokenUuid: 'A' }, { tokenUuid: 'B', immunity: 'all' }, { tokenUuid: 'C', resistThreshold: 5, resistDie: 6 },
    ] };
    assert.deepEqual(fxTargets(flags).map((t) => t.tokenUuid), ['A']);
  });
  test('a damage spell strikes an immune target too', () => {
    const flags = { total: 10, targets: [{ tokenUuid: 'A', immunity: 'element' }, { tokenUuid: 'B', excluded: true }] };
    assert.deepEqual(fxTargets(flags).map((t) => t.tokenUuid), ['A']);
  });
});

describe('every spell of the book has an animation and a sound', () => {
  test('all 41', () => {
    const names = buildSpellDocuments().map((doc) => doc.name);
    assert.equal(names.length, 41);
    for (const name of names) {
      assert.ok(FX_BY_SPELL[name], `animation: ${name}`);
      assert.ok(SFX_BY_SPELL[name], `sound: ${name}`);
    }
  });
  test('every sound is extracted', () => {
    for (const sound of Object.values(SFX_BY_SPELL).flat()) {
      assert.ok(existsSync(`assets/spell-sfx/${sound}.ogg`), sound);
    }
  });
  test('every sprite is extracted, every frame on disk', () => {
    const appear = (fx) => (typeof fx.appear === 'object' ? Object.values(fx.appear) : [fx.appear]);
    const keys = [
      ...Object.values(FX_BY_SPELL).flatMap((fx) => [fx.projectile, fx.hit, fx.bolt, fx.chain, fx.area, fx.affect, fx.teleport, fx.cell, ...appear(fx)]),
      ...Object.values(FIELD_FX).flatMap((fx) => [fx.appear, fx.loop, fx.remove]),
    ].filter(Boolean);
    for (const key of keys) {
      assert.ok(manifest[key], key);
      for (let i = 0; i < manifest[key].frames; i++) {
        assert.ok(existsSync(`assets/spell-fx/${key}/${String(i).padStart(3, '0')}.png`), `${key} ${i}`);
      }
    }
  });
});

describe('segmentBetween, flightMs, fxScale', () => {
  test('a segment: start, angle, length', () => {
    const s = segmentBetween({ x: 0, y: 0 }, { x: 0, y: 100 });
    assert.equal(s.length, 100);
    assert.equal(s.angle, Math.PI / 2);
  });
  test('flight time by distance, never too quick', () => {
    assert.equal(flightMs(1400, 100), 1000);
    assert.equal(flightMs(10, 100), 250);
  });
  test('scale: an area as wide as its pattern; on a token by HOMM3 size and the token\'s cells', () => {
    assert.equal(fxScale({ width: 150 }, 100, { size: 3 }), 2);
    assert.equal(fxScale({ width: 150 }, 90, { tokenCells: 2 }), 2);
  });
});

describe('spellSfxPlan — the sounds of a confirmed card', () => {
  test('one sound; Телепорт — out, then in', () => {
    assert.deepEqual(spellSfxPlan({ spellName: 'Огненный Шар' }), [{ sound: 'SPONTCOMB', delay: 0 }]);
    assert.deepEqual(spellSfxPlan({ spellName: 'Телепорт' }), [{ sound: 'TELPTOUT', delay: 0 }, { sound: 'TELPTIN', delay: 450 }]);
  });
});

describe('field obstacles — who sees them, how big', () => {
  const V = { always: 2, observer: 1 };
  test('Силовое Поле, Стена Огня — all; a trap — the GM and its observers', () => {
    assert.equal(fieldSeen({ visibility: 2, isGM: false, isObserver: false, ...V }), true);
    assert.equal(fieldSeen({ visibility: 1, isGM: false, isObserver: false, ...V }), false);
    assert.equal(fieldSeen({ visibility: 1, isGM: false, isObserver: true, ...V }), true);
    assert.equal(fieldSeen({ visibility: 1, isGM: true, isObserver: false, ...V }), true);
  });
  test('as wide as the cell, no taller than 1.8 cells', () => {
    assert.equal(fieldScale({ width: 47, height: 41 }, 94), 2);
    assert.equal(fieldScale({ width: 44, height: 132 }, 110), 1.5);
  });
});
