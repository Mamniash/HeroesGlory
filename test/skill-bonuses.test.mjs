import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  highestSkillTier,
  tacticsSpeedBonus,
  pathfindingSpeedBonus,
  luckSkillBase,
  leadershipMoraleBase,
  raceMoraleBonus,
  clampLuck,
  resolveLuckTotal,
} from '../module/helpers/skill-bonuses.mjs';
import { spendLuck, maxSpellLevel, canCastSpellLevel, wisdomTierForSpellLevel } from '../module/helpers/rolls.mjs';

describe('highestSkillTier', () => {
  test('not owned → null', () => {
    assert.equal(highestSkillTier([{ skillKey: 'luck', tier: 'expert' }], 'tactics'), null);
  });
  test('duplicates → the highest tier', () => {
    const owned = [{ skillKey: 'luck', tier: 'base' }, { skillKey: 'luck', tier: 'advanced' }];
    assert.equal(highestSkillTier(owned, 'luck'), 'advanced');
  });
});

describe('Тактика — p. 36, first-round Скорость', () => {
  test('none/base/advanced/expert → 0/3/5/7', () => {
    assert.deepEqual([null, 'base', 'advanced', 'expert'].map(tacticsSpeedBonus), [0, 3, 5, 7]);
  });
});

describe('Поиск пути — p. 37, expert only', () => {
  test('none/base/advanced/expert → 0/0/0/1', () => {
    assert.deepEqual([null, 'base', 'advanced', 'expert'].map(pathfindingSpeedBonus), [0, 0, 0, 1]);
  });
});

describe('Удача / Лидерство — p. 37 base values', () => {
  test('Удача none/base/advanced/expert → 0/1/2/3', () => {
    assert.deepEqual([null, 'base', 'advanced', 'expert'].map(luckSkillBase), [0, 1, 2, 3]);
  });
  test('Лидерство none/base/advanced/expert → 0/1/2/3', () => {
    assert.deepEqual([null, 'base', 'advanced', 'expert'].map(leadershipMoraleBase), [0, 1, 2, 3]);
  });
  test('Минотавр +1 (p. 12), others 0 — Лидерство base gives 2 for a Минотавр', () => {
    assert.equal(raceMoraleBonus('minotaur'), 1);
    assert.equal(raceMoraleBonus('human'), 0);
    assert.equal(leadershipMoraleBase('base') + raceMoraleBonus('minotaur'), 2);
  });
});

describe('resolveLuckTotal / clampLuck — ±3 (p. 16)', () => {
  test('within range → unclamped sum', () => {
    assert.deepEqual(resolveLuckTotal({ skill: 2, manual: -1, effects: 1 }), { raw: 2, total: 2, clamped: false });
  });
  test('expert Удача + artifact +1 → 3, clamped', () => {
    assert.deepEqual(resolveLuckTotal({ skill: 3, manual: 0, effects: 1 }), { raw: 4, total: 3, clamped: true });
  });
  test('below −3 → −3', () => {
    assert.equal(clampLuck(-5), -3);
  });
});

describe('spendLuck — total moves one step toward 0', () => {
  const total = (parts) => resolveLuckTotal(parts).total;

  test('expert Удача + artifact +1: three spends give 2, 1, 0', () => {
    let parts = { skill: 3, manual: 0, effects: 1 };
    const seen = [];
    for (let i = 0; i < 3; i++) {
      parts = { ...parts, manual: spendLuck(parts) };
      seen.push(total(parts));
    }
    assert.deepEqual(seen, [2, 1, 0]);
  });

  test('artifact +1 without the skill: one spend reaches 0', () => {
    const parts = { skill: 0, manual: 0, effects: 1 };
    const manual = spendLuck(parts);
    assert.equal(manual, -1);
    assert.equal(total({ ...parts, manual }), 0);
  });

  test('negative total steps up toward 0', () => {
    const parts = { skill: 0, manual: -2, effects: 0 };
    assert.equal(total({ ...parts, manual: spendLuck(parts) }), -1);
  });

  test('zero total spends nothing', () => {
    assert.equal(spendLuck({ skill: 1, manual: -1, effects: 0 }), -1);
  });
});

describe('Мудрость — p. 38, spell level gate', () => {
  test('none/base/advanced/expert → 2/3/4/5', () => {
    assert.deepEqual([null, 'base', 'advanced', 'expert'].map(maxSpellLevel), [2, 3, 4, 5]);
  });
  test('without Мудрость: 1–2 castable, 3 not', () => {
    assert.equal(canCastSpellLevel({ spellLevel: 2, wisdomTier: null }), true);
    assert.equal(canCastSpellLevel({ spellLevel: 3, wisdomTier: null }), false);
  });
  test('advanced: 4 castable, 5 not', () => {
    assert.equal(canCastSpellLevel({ spellLevel: 4, wisdomTier: 'advanced' }), true);
    assert.equal(canCastSpellLevel({ spellLevel: 5, wisdomTier: 'advanced' }), false);
  });
  test('required tier: levels 1–5 → none/none/base/advanced/expert', () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(wisdomTierForSpellLevel), [null, null, 'base', 'advanced', 'expert']);
  });
  test('race-granted spell is exempt', () => {
    assert.equal(canCastSpellLevel({ spellLevel: 5, wisdomTier: null, raceGranted: true }), true);
  });
});
