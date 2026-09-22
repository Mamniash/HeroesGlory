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
  nextLuck,
  canRerollWithLuck,
  moraleAttemptsRemaining,
  resolveMoraleCheck,
  resolveTargetStateMultiplier,
  isIncapacitated,
  POST_BATTLE_RECOVERY_HEALTH,
  POST_BATTLE_RECOVERY_MANA,
  resolvePostBattleCheck,
  resolvePrimarySkillRoll,
  SECONDARY_SKILL_ROLL_ORDER,
  LEVEL_UP_SKILL_20_BY_FACTION,
  resolveSecondarySkillRoll,
  nextTier,
  secondarySkillSlotCount,
} from '../module/helpers/rolls.mjs';
import { PRIMARY_SKILL_ROLL_RANGES, PRIMARY_SKILL_ROLL_RANGES_FALLBACK } from '../module/helpers/class-stats.mjs';
import { HEROES_GLORY } from '../module/helpers/config.mjs';

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

describe('nextLuck — §2.2 Удача stepping toward 0', () => {
  test('positive luck steps down by 1', () => {
    assert.equal(nextLuck(3), 2);
    assert.equal(nextLuck(1), 0);
  });

  test('negative luck steps up by 1', () => {
    assert.equal(nextLuck(-3), -2);
    assert.equal(nextLuck(-1), 0);
  });

  test('zero stays zero', () => {
    assert.equal(nextLuck(0), 0);
  });
});

describe('canRerollWithLuck — §2.2 who may spend Удача', () => {
  test('luck === 0: nobody, regardless of role', () => {
    assert.equal(canRerollWithLuck({ luck: 0, isOwner: true, isGM: true }), false);
    assert.equal(canRerollWithLuck({ luck: 0, isOwner: false, isGM: false }), false);
  });

  test('positive luck: the owner may, the GM may not unless also the owner', () => {
    assert.equal(canRerollWithLuck({ luck: 2, isOwner: true, isGM: false }), true);
    assert.equal(canRerollWithLuck({ luck: 2, isOwner: false, isGM: true }), false);
    assert.equal(canRerollWithLuck({ luck: 2, isOwner: false, isGM: false }), false);
  });

  test('negative luck: only the GM (the rulebook\'s Рассказчик), never a non-GM owner', () => {
    assert.equal(canRerollWithLuck({ luck: -2, isOwner: false, isGM: true }), true);
    assert.equal(canRerollWithLuck({ luck: -2, isOwner: true, isGM: false }), false);
  });
});

describe('moraleAttemptsRemaining — §5.8 attempts capped by |Боевой дух|', () => {
  test('positive morale: cap equals the value', () => {
    assert.equal(moraleAttemptsRemaining(3, 0), 3);
    assert.equal(moraleAttemptsRemaining(3, 2), 1);
    assert.equal(moraleAttemptsRemaining(3, 3), 0);
  });

  test('negative morale: cap equals the absolute value', () => {
    assert.equal(moraleAttemptsRemaining(-2, 0), 2);
    assert.equal(moraleAttemptsRemaining(-2, 1), 1);
  });

  test('never goes negative once attempts exceed the cap', () => {
    assert.equal(moraleAttemptsRemaining(1, 5), 0);
  });

  test('morale 0 always leaves 0 attempts', () => {
    assert.equal(moraleAttemptsRemaining(0, 0), 0);
  });
});

describe('resolveMoraleCheck — §5.8 the shared d6 gate', () => {
  test('4+ passes', () => {
    assert.equal(resolveMoraleCheck(4).passed, true);
    assert.equal(resolveMoraleCheck(6).passed, true);
  });

  test('1-3 fails', () => {
    assert.equal(resolveMoraleCheck(1).passed, false);
    assert.equal(resolveMoraleCheck(3).passed, false);
  });

  test('rejects an out-of-range d6', () => {
    assert.throws(() => resolveMoraleCheck(0), RangeError);
    assert.throws(() => resolveMoraleCheck(7), RangeError);
  });
});

describe('resolveTargetStateMultiplier — §5.6 combat-state damage multiplier', () => {
  test('no state at all: x1', () => {
    assert.equal(resolveTargetStateMultiplier(), 1);
    assert.equal(resolveTargetStateMultiplier({}), 1);
    assert.equal(resolveTargetStateMultiplier({ prone: false, unconscious: false }), 1);
  });

  test('prone: x2', () => {
    assert.equal(resolveTargetStateMultiplier({ prone: true }), 2);
  });

  test('unconscious: x3', () => {
    assert.equal(resolveTargetStateMultiplier({ unconscious: true }), 3);
  });

  test('both at once: unconscious wins, no compounding to x6', () => {
    assert.equal(resolveTargetStateMultiplier({ prone: true, unconscious: true }), 3);
  });

  test('§4.3 Доспехи specialization alone: x0.5', () => {
    assert.equal(resolveTargetStateMultiplier({ armorSpecialization: true }), 0.5);
  });

  test('Доспехи compounds with prone/unconscious (book gives no rule either way)', () => {
    assert.equal(resolveTargetStateMultiplier({ prone: true, armorSpecialization: true }), 1);
    assert.equal(resolveTargetStateMultiplier({ unconscious: true, armorSpecialization: true }), 1.5);
  });
});

describe('isIncapacitated — §5.9 "ОЗ ≤ 0 → недееспособен"', () => {
  test('true at exactly 0 and below', () => {
    assert.equal(isIncapacitated(0), true);
    assert.equal(isIncapacitated(-5), true);
  });

  test('false above 0', () => {
    assert.equal(isIncapacitated(1), false);
    assert.equal(isIncapacitated(10), false);
  });
});

describe('resolvePostBattleCheck — §5.9 the unaided post-battle survival roll', () => {
  test('10 or below dies', () => {
    assert.equal(resolvePostBattleCheck(1).survived, false);
    assert.equal(resolvePostBattleCheck(10).survived, false);
  });

  test('above 10 survives', () => {
    assert.equal(resolvePostBattleCheck(11).survived, true);
    assert.equal(resolvePostBattleCheck(20).survived, true);
  });

  test('rejects an out-of-range d20', () => {
    assert.throws(() => resolvePostBattleCheck(0), RangeError);
    assert.throws(() => resolvePostBattleCheck(21), RangeError);
  });

  test('recovery is 1 Health and 1 Mana, per the book', () => {
    assert.equal(POST_BATTLE_RECOVERY_HEALTH, 1);
    assert.equal(POST_BATTLE_RECOVERY_MANA, 1);
  });
});

describe('resolvePrimarySkillRoll — §6.1 level-up primary-skill roll', () => {
  test('knight: boundaries of each range resolve to the right skill', () => {
    const ranges = PRIMARY_SKILL_ROLL_RANGES.knight;
    assert.equal(resolvePrimarySkillRoll(1, ranges), 'attack');
    assert.equal(resolvePrimarySkillRoll(6, ranges), 'attack');
    assert.equal(resolvePrimarySkillRoll(7, ranges), 'defense');
    assert.equal(resolvePrimarySkillRoll(14, ranges), 'defense');
    assert.equal(resolvePrimarySkillRoll(15, ranges), 'magicPower');
    assert.equal(resolvePrimarySkillRoll(17, ranges), 'magicPower');
    assert.equal(resolvePrimarySkillRoll(18, ranges), 'knowledge');
    assert.equal(resolvePrimarySkillRoll(20, ranges), 'knowledge');
  });

  test('warlock: corrected 5-12 magicPower range (book prints 4-12, overlapping defense)', () => {
    const ranges = PRIMARY_SKILL_ROLL_RANGES.warlock;
    assert.equal(resolvePrimarySkillRoll(4, ranges), 'defense');
    assert.equal(resolvePrimarySkillRoll(5, ranges), 'magicPower');
    assert.equal(resolvePrimarySkillRoll(12, ranges), 'magicPower');
    assert.equal(resolvePrimarySkillRoll(13, ranges), 'knowledge');
  });

  test('fallback (class undetermined): equal quarters', () => {
    assert.equal(resolvePrimarySkillRoll(1, PRIMARY_SKILL_ROLL_RANGES_FALLBACK), 'attack');
    assert.equal(resolvePrimarySkillRoll(5, PRIMARY_SKILL_ROLL_RANGES_FALLBACK), 'attack');
    assert.equal(resolvePrimarySkillRoll(6, PRIMARY_SKILL_ROLL_RANGES_FALLBACK), 'defense');
    assert.equal(resolvePrimarySkillRoll(10, PRIMARY_SKILL_ROLL_RANGES_FALLBACK), 'defense');
    assert.equal(resolvePrimarySkillRoll(11, PRIMARY_SKILL_ROLL_RANGES_FALLBACK), 'magicPower');
    assert.equal(resolvePrimarySkillRoll(15, PRIMARY_SKILL_ROLL_RANGES_FALLBACK), 'magicPower');
    assert.equal(resolvePrimarySkillRoll(16, PRIMARY_SKILL_ROLL_RANGES_FALLBACK), 'knowledge');
    assert.equal(resolvePrimarySkillRoll(20, PRIMARY_SKILL_ROLL_RANGES_FALLBACK), 'knowledge');
  });

  test('rejects an out-of-range d20', () => {
    assert.throws(() => resolvePrimarySkillRoll(0, PRIMARY_SKILL_ROLL_RANGES_FALLBACK), RangeError);
    assert.throws(() => resolvePrimarySkillRoll(21, PRIMARY_SKILL_ROLL_RANGES_FALLBACK), RangeError);
  });

  test('every PRIMARY_SKILL_ROLL_RANGES entry is contiguous 1-20 with no gaps/overlaps', () => {
    for (const [classKey, ranges] of Object.entries(PRIMARY_SKILL_ROLL_RANGES)) {
      let expectedMin = 1;
      for (const { max } of ranges) {
        assert.ok(max >= expectedMin, `${classKey}: range starting below ${expectedMin}`);
        expectedMin = max + 1;
      }
      assert.equal(ranges.at(-1).max, 20, `${classKey}: last range must end at 20`);
    }
  });
});

describe('resolveSecondarySkillRoll — §6.2/§3 level-up secondary-skill roll', () => {
  test('rolls 1-19 map to SECONDARY_SKILL_ROLL_ORDER, independent of faction', () => {
    for (let d20 = 1; d20 <= 19; d20 += 1) {
      assert.equal(resolveSecondarySkillRoll(d20, { faction: 'castle' }), SECONDARY_SKILL_ROLL_ORDER[d20]);
      assert.equal(resolveSecondarySkillRoll(d20), SECONDARY_SKILL_ROLL_ORDER[d20]);
    }
  });

  test('every SECONDARY_SKILL_ROLL_ORDER[1-19] key exists in CONFIG.HEROES_GLORY.secondarySkills', () => {
    for (let d20 = 1; d20 <= 19; d20 += 1) {
      assert.ok(SECONDARY_SKILL_ROLL_ORDER[d20] in HEROES_GLORY.secondarySkills);
    }
  });

  test('roll of 20: necropolis gets necromancy, every other faction gets healing', () => {
    assert.equal(resolveSecondarySkillRoll(20, { faction: 'necropolis' }), 'necromancy');
    for (const faction of Object.keys(HEROES_GLORY.factions)) {
      if (faction === 'necropolis') continue;
      assert.equal(resolveSecondarySkillRoll(20, { faction }), 'healing');
    }
  });

  test('roll of 20 with no/unknown faction falls back to healing', () => {
    assert.equal(resolveSecondarySkillRoll(20, {}), 'healing');
    assert.equal(resolveSecondarySkillRoll(20), 'healing');
    assert.equal(resolveSecondarySkillRoll(20, { faction: 'not-a-faction' }), 'healing');
  });

  test('LEVEL_UP_SKILL_20_BY_FACTION covers all 10 factions', () => {
    assert.deepEqual(Object.keys(LEVEL_UP_SKILL_20_BY_FACTION).sort(), Object.keys(HEROES_GLORY.factions).sort());
  });

  test('rejects an out-of-range d20', () => {
    assert.throws(() => resolveSecondarySkillRoll(0), RangeError);
    assert.throws(() => resolveSecondarySkillRoll(21), RangeError);
  });
});

describe('nextTier — §3 skill tier progression', () => {
  test('base -> advanced -> expert', () => {
    assert.equal(nextTier('base'), 'advanced');
    assert.equal(nextTier('advanced'), 'expert');
  });

  test('expert stays expert (clamped)', () => {
    assert.equal(nextTier('expert'), 'expert');
  });

  test('unrecognized tier passes through unchanged', () => {
    assert.equal(nextTier('not-a-tier'), 'not-a-tier');
  });
});

describe('secondarySkillSlotCount — §3 стр.39 Экспертная Обучаемость slot cap', () => {
  test('base count with no skills owned at all', () => {
    assert.equal(secondarySkillSlotCount([], 8), 8);
  });

  test('base count with skills owned but no Обучаемость', () => {
    const owned = [{ skillKey: 'assault', tier: 'expert' }, { skillKey: 'archery', tier: 'base' }];
    assert.equal(secondarySkillSlotCount(owned, 8), 8);
  });

  test('base count with Обучаемость owned but not at expert tier', () => {
    const owned = [{ skillKey: 'aptitude', tier: 'base' }];
    assert.equal(secondarySkillSlotCount(owned, 8), 8);
    const advanced = [{ skillKey: 'aptitude', tier: 'advanced' }];
    assert.equal(secondarySkillSlotCount(advanced, 8), 8);
  });

  test('raised to 10 with Экспертная Обучаемость owned', () => {
    const owned = [{ skillKey: 'assault', tier: 'base' }, { skillKey: 'aptitude', tier: 'expert' }];
    assert.equal(secondarySkillSlotCount(owned, 8), 10);
  });

  test('lapsed case: 9-10 skills owned, expert Обучаемость no longer among them — falls back to base', () => {
    const owned = [
      { skillKey: 'assault', tier: 'expert' }, { skillKey: 'archery', tier: 'base' },
      { skillKey: 'armor', tier: 'base' }, { skillKey: 'tactics', tier: 'base' },
      { skillKey: 'luck', tier: 'base' }, { skillKey: 'pathfinding', tier: 'base' },
      { skillKey: 'leadership', tier: 'base' }, { skillKey: 'diplomacy', tier: 'base' },
      { skillKey: 'aptitude', tier: 'advanced' }, // owned, but not expert
    ];
    assert.equal(owned.length, 9);
    assert.equal(secondarySkillSlotCount(owned, 8), 8);
  });
});
