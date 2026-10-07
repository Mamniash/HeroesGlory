import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  spellFxPlan, fxTargets, segmentBetween, flightMs, fxScale, FX_BY_SPELL, SPELLS_WITHOUT_FX,
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
  test('excluded targets take no part; spells without a sprite play nothing', () => {
    assert.deepEqual(spellFxPlan({ spellName: 'Молния', targets: [{ tokenUuid: 'T1', excluded: true }] }), []);
    assert.deepEqual(spellFxPlan({ spellName: 'Телепорт', targets: [{ tokenUuid: 'T1' }] }), []);
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

describe('every spell of the book is either animated or listed without a sprite', () => {
  test('all 41', () => {
    const names = buildSpellDocuments().map((doc) => doc.name);
    assert.equal(names.length, 41);
    for (const name of names) {
      assert.ok(FX_BY_SPELL[name] || SPELLS_WITHOUT_FX.includes(name), name);
    }
  });
  test('every sprite is extracted, every frame on disk', () => {
    const keys = Object.values(FX_BY_SPELL).flatMap((fx) => [fx.projectile, fx.hit, fx.bolt, fx.chain, fx.area, fx.affect]).filter(Boolean);
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
