import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHit,
  resolveDefeat,
  resolveDamage,
  resolvePotentialDamage,
  epicTableHasContent,
  planEpicCascade,
  resolveEpicTableRow,
  resolveEpicSeverity,
  resolveHitLocation,
  resolveSpellVariant,
  resolveUniversalSchool,
  ELEMENTAL_SCHOOLS,
  canAffordSpell,
  resolveAbilityCheck,
  nextLuck,
  canRerollWithLuck,
  moraleAttemptsRemaining,
  resolveMoraleCheck,
  resolveTargetStateMultiplier,
  combineHitAndState,
  resolveArmorItemMultiplier,
  resolveDestroyedArmor,
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

// §5.4: "Отступление происходит даже в том случае, если тест на поражение
// провален атакующим" — the chat card's retreat line is gated purely on
// `hit.epic` ({{#if hit.epic}} in attack-roll.hbs), not on the defeat
// test's outcome, so it has to keep showing even when the defeat test
// fails outright. This pins the invariant the template relies on: a
// failed resolveDefeat must not touch resolveHit's own `epic` flag.
test('epic hit flag (§5.3) is independent of a failed defeat test — retreat line must still show even when the defeat test is lost', () => {
  const hit = resolveHit(6);
  const defeat = resolveDefeat({ attackerAttack: 5, targetDefense: 20, die: 10 }); // threshold 15, die 10 fails
  assert.equal(hit.epic, true);
  assert.equal(defeat.known, true);
  assert.equal(defeat.success, false);
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

describe('combineHitAndState — §5.3/§5.6 hit×state combination', () => {
  test('state multiplier of 1 is a no-op', () => {
    const hit = resolveHit(4); // multiplier 1
    assert.equal(combineHitAndState(hit, 1).multiplier, 1);
  });

  test('multiplies, does not add — a state multiplier of 2 doubles, not +2', () => {
    const hit = resolveHit(4); // multiplier 1
    assert.equal(combineHitAndState(hit, 2).multiplier, 2);
    assert.notEqual(combineHitAndState(hit, 2).multiplier, 3); // 1 + 2, the additive alternative
  });

  test('compounds with the hit-table multiplier itself (epic x2, unconscious x3 -> x6)', () => {
    const hit = resolveHit(6); // multiplier 2, epic
    assert.equal(combineHitAndState(hit, 3).multiplier, 6);
  });

  test('preserves every other field on the hit result unchanged', () => {
    const hit = resolveHit(6);
    const combined = combineHitAndState(hit, 0.5);
    assert.equal(combined.die, hit.die);
    assert.equal(combined.key, hit.key);
    assert.equal(combined.epic, hit.epic);
  });

  test('third argument (armorItemMultiplier) defaults to 1 — old 2-arg calls unaffected', () => {
    const hit = resolveHit(4); // multiplier 1
    assert.equal(combineHitAndState(hit, 2).multiplier, combineHitAndState(hit, 2, 1).multiplier);
  });

  test('armorItemMultiplier compounds with state multiplier, not just hit', () => {
    const hit = resolveHit(4); // multiplier 1
    assert.equal(combineHitAndState(hit, 2, 0.5).multiplier, 1); // 1 x 2 x 0.5
  });
});

// §5.6/§4.3: roll-actions.mjs's buildAttackContext combines resolveHit and
// resolveTargetStateMultiplier into one "effective hit" via the exported
// combineHitAndState — BEFORE calling resolveDamage, so only one floor()
// happens at the very end, not one per multiplier. combineHitAndState has
// its own direct describe block below; this one exercises the full chain
// end to end (also verified live against real rollAttack() chat cards
// through an actual enchanted-weapon artifact, not just a plain weapon —
// see the combat-diagnosis task).
describe('resolveDamage × resolveTargetStateMultiplier — §5.3/§5.6/§4.3 combined', () => {
  function effectiveDamage(baseDamage, d6, state, { attackerAttack = 5, targetDefense = 5, defeatDie = null } = {}) {
    // targetDefense: null means "no target selected" (matches rollAttack's
    // own `targetActor?.system?.defense ?? null`) — resolveDefeat reads
    // that as "unresolved", not as an invalid die.
    const hit = resolveHit(d6);
    const stateMultiplier = resolveTargetStateMultiplier(state);
    const effectiveHit = combineHitAndState(hit, stateMultiplier);
    const defeat = resolveDefeat({ attackerAttack, targetDefense, die: defeatDie });
    return resolveDamage({ baseDamage, hit: effectiveHit, defeat });
  }

  test('plain hit, no target state: unaffected by the multiplier chain', () => {
    assert.equal(effectiveDamage(12, 4, {}), 12); // x1 x1
  });

  test('Доспехи alone halves a plain hit', () => {
    assert.equal(effectiveDamage(12, 4, { armorSpecialization: true }), 6); // x1 x0.5
  });

  test('epic (x2) against Доспехи nets back to x1 — same number as a plain hit elsewhere', () => {
    assert.equal(effectiveDamage(12, 6, { armorSpecialization: true }), 12); // x2 x0.5
  });

  test('graze (x0.5) against Доспехи floors down, not just halves cleanly', () => {
    assert.equal(effectiveDamage(5, 3, { armorSpecialization: true }), 1); // floor(5 * 0.5 * 0.5) = floor(1.25)
  });

  test('unconscious (x3) stacked with Доспехи (x0.5): x1.5, multiplicative not additive', () => {
    assert.equal(effectiveDamage(12, 4, { unconscious: true, armorSpecialization: true }), 18);
    // Sanity check against the additive alternative this test is meant to
    // catch: x3 + x0.5 read as a combined x3.5 would give floor(12*3.5)=42.
    assert.notEqual(effectiveDamage(12, 4, { unconscious: true, armorSpecialization: true }), 42);
  });

  test('miss (x0) short-circuits to 0 regardless of target state', () => {
    assert.equal(effectiveDamage(999, 1, { unconscious: true }), 0);
    assert.equal(effectiveDamage(999, 2, { armorSpecialization: true }), 0);
  });

  test('a failed defeat test zeroes damage even on an epic hit', () => {
    // targetDefense(20) - attackerAttack(5) = 15 threshold; die 10 fails (10 is not > 15).
    assert.equal(effectiveDamage(12, 6, {}, { targetDefense: 20, defeatDie: 10 }), 0);
  });

  test('no target selected (targetDefense null): unresolved, returns null even with a target state supplied', () => {
    assert.equal(effectiveDamage(12, 6, { armorSpecialization: true }, { targetDefense: null }), null);
  });
});

// §5.5: the full chain including resolveArmorItemMultiplier — mirrors the
// describe block above but adds the target's equipped armor as a fourth
// input, exactly like buildAttackContext (roll-actions.mjs) actually
// assembles it via combineHitAndState's third argument.
describe('resolveDamage × resolveTargetStateMultiplier × resolveArmorItemMultiplier — §5.3/§5.5/§5.6 combined', () => {
  function effectiveDamage(baseDamage, d6, state, equippedArmor, { attackerAttack = 5, targetDefense = 5, defeatDie = null } = {}) {
    const hit = resolveHit(d6);
    const stateMultiplier = resolveTargetStateMultiplier(state);
    const armorItemMultiplier = resolveArmorItemMultiplier(equippedArmor);
    const effectiveHit = combineHitAndState(hit, stateMultiplier, armorItemMultiplier);
    const defeat = resolveDefeat({ attackerAttack, targetDefense, die: defeatDie });
    return resolveDamage({ baseDamage, hit: effectiveHit, defeat });
  }

  test('no armor: unaffected, same as the plain state-only chain', () => {
    assert.equal(effectiveDamage(12, 4, {}, []), 12);
  });

  test('level 4 armor alone halves a plain hit', () => {
    assert.equal(effectiveDamage(12, 4, {}, [{ name: 'Шлем', level: 4 }]), 6);
  });

  test('level 5 armor alone: same halving as level 4', () => {
    assert.equal(effectiveDamage(12, 4, {}, [{ name: 'Доспех', level: 5 }]), 6);
  });

  test('level 1-3 armor alone: no effect — that mitigation is a separate task', () => {
    assert.equal(effectiveDamage(12, 4, {}, [{ name: 'Шлем', level: 2 }]), 12);
  });

  test('доспех 4 уровня + специализация Доспехи: compounds multiplicatively (x0.5 x0.5 = x0.25), not summed', () => {
    assert.equal(effectiveDamage(12, 4, { armorSpecialization: true }, [{ name: 'Шлем', level: 4 }]), 3); // floor(12*1*0.5*0.5)
    // Sanity check against an additive misreading (0.5+0.5=1.0 -> no reduction at all -> 12).
    assert.notEqual(effectiveDamage(12, 4, { armorSpecialization: true }, [{ name: 'Шлем', level: 4 }]), 12);
  });

  test('multiple level 4-5 pieces worn at once: still one x0.5, not compounded per piece', () => {
    const armor = [{ name: 'Шлем', level: 4 }, { name: 'Нагрудник', level: 5 }, { name: 'Поножи', level: 4 }];
    assert.equal(effectiveDamage(12, 4, {}, armor), 6); // not floor(12*0.5*0.5*0.5)=1
  });

  test('epic hit (x2) with level 4 armor: x2 x0.5 nets back to x1', () => {
    assert.equal(effectiveDamage(12, 6, {}, [{ name: 'Шлем', level: 4 }]), 12);
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

describe('epicTableHasContent — §5.4/§8.1 real table vs an absent/blank one', () => {
  test('a real 6-row table has content', () => {
    assert.equal(epicTableHasContent(['a', 'b', 'c', 'd', 'e', 'f']), true);
  });

  test('null/undefined (e.g. a ranged weapon): no table at all', () => {
    assert.equal(epicTableHasContent(null), false);
    assert.equal(epicTableHasContent(undefined), false);
  });

  test('present but all-blank (e.g. an enchanted-weapon artifact — item-artifact.mjs keeps the same 6-string shape but the book\'s own table has no epic column for that type): not content', () => {
    assert.equal(epicTableHasContent(['', '', '', '', '', '']), false);
    assert.equal(epicTableHasContent([]), false);
  });

  test('one non-blank row among blanks still counts as content', () => {
    assert.equal(epicTableHasContent(['', '', 'x', '', '', '']), true);
  });

  test('whitespace-only rows count as blank, not content', () => {
    assert.equal(epicTableHasContent(['  ', '\t', '', '', '', '']), false);
  });
});

// §5.4: confirmed against the book (p.29-30) and the p.34 flowchart —
// "Для стрелковых атак эпик-таблицы не предусмотрены" scopes to the
// flavor-text table roll only. The severity re-roll and "Куда попал" are
// not gated by table presence: they happen on any epic hit.
describe('planEpicCascade — §5.4 which epic-cascade rolls should happen', () => {
  test('epic hit with a table: rolls both flavor and severity', () => {
    const hit = resolveHit(6);
    assert.deepEqual(planEpicCascade(hit, ['a', 'b', 'c', 'd', 'e', 'f']), {
      rollFlavor: true,
      rollSeverity: true,
    });
  });

  test('epic hit without a table (ranged, or an enchanted weapon with a blank one): flavor skipped, severity still rolled', () => {
    const hit = resolveHit(6);
    assert.deepEqual(planEpicCascade(hit, null), {
      rollFlavor: false,
      rollSeverity: true,
    });
  });

  test('non-epic hit: neither roll happens, even with a table present', () => {
    const hit = resolveHit(4);
    assert.deepEqual(planEpicCascade(hit, ['a', 'b', 'c', 'd', 'e', 'f']), {
      rollFlavor: false,
      rollSeverity: false,
    });
  });

  test('non-epic hit without a table: neither roll happens', () => {
    const hit = resolveHit(1);
    assert.deepEqual(planEpicCascade(hit, null), {
      rollFlavor: false,
      rollSeverity: false,
    });
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

// §6.2/§11: Сеня's ruling for the book's own open question (docs/rules.md
// §11) — a Универсальные spell casts from the hero's single highest-tier
// elemental school; a tie is reported, not silently broken.
describe('resolveUniversalSchool — §6.2/§11 which school an Универсальные spell draws from', () => {
  test('ELEMENTAL_SCHOOLS is earth/air/water/fire, in that order (SCHOOL_ORDER minus universal)', () => {
    assert.deepEqual(ELEMENTAL_SCHOOLS, ['earth', 'air', 'water', 'fire']);
  });

  test('no schools owned at all: empty candidates, null tier', () => {
    assert.deepEqual(
      resolveUniversalSchool({ earth: null, air: null, water: null, fire: null }),
      { candidateSchools: [], tier: null },
    );
  });

  test('one school owned: that school alone, unambiguous', () => {
    assert.deepEqual(
      resolveUniversalSchool({ earth: null, air: 'advanced', water: null, fire: null }),
      { candidateSchools: ['air'], tier: 'advanced' },
    );
  });

  test('several schools with different tiers: only the highest wins', () => {
    assert.deepEqual(
      resolveUniversalSchool({ earth: 'base', air: 'expert', water: 'advanced', fire: null }),
      { candidateSchools: ['air'], tier: 'expert' },
    );
  });

  test('several schools tied at the same max tier: all reported, first-by-SCHOOL_ORDER first', () => {
    assert.deepEqual(
      resolveUniversalSchool({ earth: 'expert', air: null, water: 'expert', fire: null }),
      { candidateSchools: ['earth', 'water'], tier: 'expert' },
    );
  });

  test('all four tied: every school listed, in SCHOOL_ORDER', () => {
    assert.deepEqual(
      resolveUniversalSchool({ earth: 'base', air: 'base', water: 'base', fire: 'base' }),
      { candidateSchools: ['earth', 'air', 'water', 'fire'], tier: 'base' },
    );
  });

  test('a lower tier among owned schools never displaces the tie at the top', () => {
    assert.deepEqual(
      resolveUniversalSchool({ earth: 'expert', air: 'base', water: 'expert', fire: 'advanced' }),
      { candidateSchools: ['earth', 'water'], tier: 'expert' },
    );
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

// §5.5 (уровни 4-5): решение — "любой урон вдвое" применяется безусловно,
// без привязки к защищённой части тела, для ОБОИХ уровней (не только 5,
// где книга и так это пишет буквально, но и для 4, где это сознательное
// отступление от "по защищённой части тела" — см. resolveArmorItemMultiplier's
// own comment и docs/rules.md §11).
describe('resolveArmorItemMultiplier — §5.5 уровень 4-5 снижает урон вдвое', () => {
  test('no equipped armor at all: x1', () => {
    assert.equal(resolveArmorItemMultiplier([]), 1);
  });

  test('level 4: x0.5', () => {
    assert.equal(resolveArmorItemMultiplier([{ name: 'Шлем', level: 4 }]), 0.5);
  });

  test('level 5: x0.5, same as level 4', () => {
    assert.equal(resolveArmorItemMultiplier([{ name: 'Доспех', level: 5 }]), 0.5);
  });

  test('levels 1-3 alone: no effect, x1 — that mitigation is a separate, not-yet-automated task', () => {
    assert.equal(resolveArmorItemMultiplier([{ name: 'A', level: 1 }]), 1);
    assert.equal(resolveArmorItemMultiplier([{ name: 'A', level: 2 }]), 1);
    assert.equal(resolveArmorItemMultiplier([{ name: 'A', level: 3 }]), 1);
  });

  test('multiple level 4-5 pieces at once: still x0.5, not compounded to x0.25', () => {
    assert.equal(resolveArmorItemMultiplier([
      { name: 'Шлем', level: 4 }, { name: 'Нагрудник', level: 5 }, { name: 'Поножи', level: 4 },
    ]), 0.5);
  });

  test('a level 1-3 piece alongside a level 4-5 piece: the 4-5 piece still triggers x0.5', () => {
    assert.equal(resolveArmorItemMultiplier([{ name: 'Шлем', level: 2 }, { name: 'Поножи', level: 4 }]), 0.5);
  });
});

describe('resolveDestroyedArmor — §5.5 доспех уровня 1-4 разрушается на эпик-попадании', () => {
  test('not an epic hit: nothing breaks, even with qualifying armor equipped', () => {
    assert.deepEqual(resolveDestroyedArmor(false, [{ name: 'Шлем', level: 2 }]), []);
  });

  test('epic hit, no armor equipped: nothing to break', () => {
    assert.deepEqual(resolveDestroyedArmor(true, []), []);
  });

  test('epic hit, level 1-4 armor: it breaks', () => {
    assert.deepEqual(resolveDestroyedArmor(true, [{ name: 'Шлем', level: 1 }]), [{ name: 'Шлем', level: 1 }]);
  });

  test('epic hit, level 5 armor: does not break — §5.5\'s own "эпик-попадание не разрушает"', () => {
    assert.deepEqual(resolveDestroyedArmor(true, [{ name: 'Доспех', level: 5 }]), []);
  });

  test('epic hit, mixed levels: only the 1-4 pieces break, the level-5 piece survives', () => {
    assert.deepEqual(
      resolveDestroyedArmor(true, [{ name: 'Шлем', level: 2 }, { name: 'Доспех', level: 5 }, { name: 'Поножи', level: 4 }]),
      [{ name: 'Шлем', level: 2 }, { name: 'Поножи', level: 4 }],
    );
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
