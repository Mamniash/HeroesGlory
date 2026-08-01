import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHit,
  resolveDefeat,
  resolveDamage,
  resolvePotentialDamage,
  resolveEpicTableRow,
  resolveEpicSeverity,
  resolveHitLocation,
  resolveSpellVariant,
  canAffordSpell,
  resolveAbilityCheck,
} from '../module/helpers/rolls.mjs';

describe('resolveHit — §5.3 hit table', () => {
  const cases = [
    [1, 'miss', 0, false],
    [2, 'miss', 0, false],
    [3, 'graze', 0.5, false],
    [4, 'hit', 1, false],
    [5, 'strongHit', 2, false],
    [6, 'epic', 2, true],
  ];

  for (const [die, key, multiplier, epic] of cases) {
    test(`d6=${die} -> ${key} (x${multiplier}${epic ? ', epic' : ''})`, () => {
      const result = resolveHit(die);
      assert.equal(result.die, die);
      assert.equal(result.key, key);
      assert.equal(result.multiplier, multiplier);
      assert.equal(result.epic, epic);
    });
  }

  test('rejects out-of-range dice', () => {
    assert.throws(() => resolveHit(0), RangeError);
    assert.throws(() => resolveHit(7), RangeError);
    assert.throws(() => resolveHit(3.5), RangeError);
  });
});

describe('resolveDefeat — §5.3 defeat-test threshold', () => {
  test('normal case: success requires d20 > threshold', () => {
    // Защита 15, Атака 5 -> threshold = 10
    const fail = resolveDefeat({ attackerAttack: 5, targetDefense: 15, die: 10 });
    assert.equal(fail.known, true);
    assert.equal(fail.auto, false);
    assert.equal(fail.threshold, 10);
    assert.equal(fail.success, false, '10 is not > threshold 10');

    const success = resolveDefeat({ attackerAttack: 5, targetDefense: 15, die: 11 });
    assert.equal(success.success, true, '11 is > threshold 10');
  });

  test('auto-hit when Защита цели <= Атака атакующего (equal)', () => {
    const result = resolveDefeat({ attackerAttack: 10, targetDefense: 10, die: 1 });
    assert.equal(result.known, true);
    assert.equal(result.auto, true);
    assert.equal(result.threshold, 0);
    assert.equal(result.success, true);
    assert.equal(result.die, null, 'auto-hit does not consult the d20');
  });

  test('auto-hit when Защита цели < Атака атакующего', () => {
    const result = resolveDefeat({ attackerAttack: 12, targetDefense: 5, die: 1 });
    assert.equal(result.auto, true);
    assert.equal(result.success, true);
    assert.equal(result.die, null);
  });

  test('not auto-hit once Защита exceeds Атака by even 1', () => {
    const result = resolveDefeat({ attackerAttack: 10, targetDefense: 11, die: 2 });
    assert.equal(result.auto, false);
    assert.equal(result.threshold, 1);
    assert.equal(result.success, true, '2 is > threshold 1');
  });

  test('unresolved when no target is selected', () => {
    const result = resolveDefeat({ attackerAttack: 5, targetDefense: null });
    assert.equal(result.known, false);
    assert.equal(result.auto, false);
    assert.equal(result.threshold, null);
    assert.equal(result.success, null);

    const undef = resolveDefeat({ attackerAttack: 5, targetDefense: undefined });
    assert.equal(undef.known, false);
  });

  test('rejects an out-of-range d20 in the non-auto case', () => {
    assert.throws(() => resolveDefeat({ attackerAttack: 1, targetDefense: 20, die: 0 }), RangeError);
    assert.throws(() => resolveDefeat({ attackerAttack: 1, targetDefense: 20, die: 21 }), RangeError);
  });
});

describe('resolveDamage — §5.3 damage formula', () => {
  test('miss always deals 0, regardless of the defeat test', () => {
    const hit = resolveHit(1);
    const defeat = resolveDefeat({ attackerAttack: 0, targetDefense: 100, die: 20 });
    assert.equal(resolveDamage({ baseDamage: 10, hit, defeat }), 0);
  });

  test('floors base x multiplier on a successful hit', () => {
    const hit = resolveHit(3); // graze, x0.5
    const defeat = resolveDefeat({ attackerAttack: 10, targetDefense: 10, die: 1 }); // auto
    assert.equal(resolveDamage({ baseDamage: 7, hit, defeat }), 3); // floor(3.5)
  });

  test('0 on a failed defeat test even if the hit connected', () => {
    const hit = resolveHit(5); // strongHit, x2
    const defeat = resolveDefeat({ attackerAttack: 1, targetDefense: 20, die: 5 }); // threshold 19, fails
    assert.equal(resolveDamage({ baseDamage: 10, hit, defeat }), 0);
  });

  test('null when the defeat test could not be resolved (no target)', () => {
    const hit = resolveHit(4);
    const defeat = resolveDefeat({ attackerAttack: 5, targetDefense: null });
    assert.equal(resolveDamage({ baseDamage: 10, hit, defeat }), null);
  });
});

describe('resolvePotentialDamage — §5.3 damage shown when no target is selected', () => {
  test('floors base x multiplier regardless of the defeat test', () => {
    const hit = resolveHit(5); // strongHit, x2
    assert.equal(resolvePotentialDamage({ baseDamage: 6, hit }), 12);
  });

  test('0 on a miss', () => {
    const hit = resolveHit(2);
    assert.equal(resolvePotentialDamage({ baseDamage: 100, hit }), 0);
  });

  test('matches resolveDamage whenever the defeat test does succeed', () => {
    const hit = resolveHit(6); // epic, x2
    const defeat = resolveDefeat({ attackerAttack: 10, targetDefense: 10, die: 1 }); // auto-success
    assert.equal(
      resolvePotentialDamage({ baseDamage: 7, hit }),
      resolveDamage({ baseDamage: 7, hit, defeat }),
    );
  });
});

describe('resolveEpicTableRow — §5.4', () => {
  const table = ['a', 'b', 'c', 'd', 'e', 'f'];

  test('picks the row matching the die (1-indexed)', () => {
    assert.equal(resolveEpicTableRow(1, table), 'a');
    assert.equal(resolveEpicTableRow(6, table), 'f');
  });

  test('null with no table (e.g. ranged weapons have none)', () => {
    assert.equal(resolveEpicTableRow(3, null), null);
    assert.equal(resolveEpicTableRow(3, undefined), null);
    assert.equal(resolveEpicTableRow(3, []), null);
  });
});

describe('resolveEpicSeverity — §5.4/§5.7', () => {
  test('needs a 6 normally', () => {
    assert.equal(resolveEpicSeverity(5), false);
    assert.equal(resolveEpicSeverity(6), true);
  });

  test('legendary creatures trigger it on 4+', () => {
    assert.equal(resolveEpicSeverity(3, { legendary: true }), false);
    assert.equal(resolveEpicSeverity(4, { legendary: true }), true);
    assert.equal(resolveEpicSeverity(6, { legendary: true }), true);
  });
});

describe('resolveHitLocation — §5.4 "Куда попал"', () => {
  test('matches the simple 4-outcome table', () => {
    assert.equal(resolveHitLocation(1), 'leg');
    assert.equal(resolveHitLocation(2), 'leg');
    assert.equal(resolveHitLocation(3), 'arm');
    assert.equal(resolveHitLocation(4), 'arm');
    assert.equal(resolveHitLocation(5), 'torso');
    assert.equal(resolveHitLocation(6), 'head');
  });
});

describe('resolveSpellVariant — §6.3', () => {
  test('maps skill tier to spell variant', () => {
    assert.equal(resolveSpellVariant(undefined), 'none');
    assert.equal(resolveSpellVariant(null), 'none');
    assert.equal(resolveSpellVariant('base'), 'basic');
    assert.equal(resolveSpellVariant('advanced'), 'advanced');
    assert.equal(resolveSpellVariant('expert'), 'expert');
  });
});

describe('canAffordSpell — §6.3', () => {
  test('true only when mana covers the cost', () => {
    assert.equal(canAffordSpell(5, 6), false);
    assert.equal(canAffordSpell(6, 6), true);
    assert.equal(canAffordSpell(7, 6), true);
  });
});

describe('resolveAbilityCheck — §7', () => {
  test('adds the die and the skill value', () => {
    const result = resolveAbilityCheck(12, 3);
    assert.equal(result.die, 12);
    assert.equal(result.skillValue, 3);
    assert.equal(result.total, 15);
  });

  test('rejects an out-of-range d20', () => {
    assert.throws(() => resolveAbilityCheck(0, 1), RangeError);
    assert.throws(() => resolveAbilityCheck(21, 1), RangeError);
  });
});
