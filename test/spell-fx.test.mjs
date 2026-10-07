import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spellFxPlan, segmentBetween, flightMs, SPELL_FX } from '../module/helpers/spell-fx.mjs';
import { existsSync } from 'node:fs';

describe('spellFxPlan — what plays on the GM\'s confirm', () => {
  test('Волшебная Стрела: flight from the caster, then the burst', () => {
    const plan = spellFxPlan({ spellName: 'Волшебная Стрела', targets: [{ tokenUuid: 'T1' }] });
    assert.deepEqual(plan, [{ type: 'projectile', fx: 'magic-arrow', from: 'caster', to: { token: 'T1' }, delay: 0, then: { type: 'burst', fx: 'magic-arrow-hit' } }]);
  });
  test('Молния: one bolt from the caster', () => {
    assert.deepEqual(spellFxPlan({ spellName: 'Молния', targets: [{ tokenUuid: 'T1' }] }),
      [{ type: 'bolt', fx: 'lightning', from: 'caster', to: { token: 'T1' }, delay: 0 }]);
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
  test('Огненный Шар: the burst on the area centre', () => {
    assert.deepEqual(spellFxPlan({ spellName: 'Огненный Шар', area: { center: { i: 4, j: 7 } } }),
      [{ type: 'burst', fx: 'fireball', at: { cell: { i: 4, j: 7 } }, delay: 0 }]);
  });
  test('excluded targets take no part; other spells play nothing', () => {
    assert.deepEqual(spellFxPlan({ spellName: 'Молния', targets: [{ tokenUuid: 'T1', excluded: true }] }), []);
    assert.deepEqual(spellFxPlan({ spellName: 'Щит', targets: [{ tokenUuid: 'T1' }] }), []);
  });
});

describe('segmentBetween, flightMs', () => {
  test('a segment: start, angle, length', () => {
    const s = segmentBetween({ x: 0, y: 0 }, { x: 0, y: 100 });
    assert.equal(s.length, 100);
    assert.equal(s.angle, Math.PI / 2);
  });
  test('flight time by distance, never too quick', () => {
    assert.equal(flightMs(1400, 100), 1000);
    assert.equal(flightMs(10, 100), 250);
  });
});

describe('SPELL_FX — every frame is on disk', () => {
  test('frames exist', () => {
    for (const [key, def] of Object.entries(SPELL_FX)) {
      for (let i = 0; i < def.frames; i++) {
        assert.ok(existsSync(`assets/spell-fx/${key}/${String(i).padStart(3, '0')}.png`), `${key} ${i}`);
      }
    }
  });
});
