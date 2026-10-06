import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveHit,
  resolveHitModifiers,
  resolveContestedDefeat,
  attackSeriesCount,
  resolveNextAttack,
  resolveAttackResolution,
  resolveSpellDamageDealt,
  resolveSpellDamageTaken,
  initiativeRollParts,
  elfRerolledInitiative,
  canElfReroll,
  compareTurnOrder,
  tieBreakSpeed,
  rolledSpeedToRecord,
  counterAttackTagLimit,
  countersThisRound,
  counterAttackOffer,
  orderWithFollowers,
  isLateJoin,
  joinerWaits,
  turnKeepingCombatant,
} from '../module/helpers/rolls.mjs';

describe('resolveHit with a modifier — §11 table read at the modified total', () => {
  test('natural 6 at −2 reads as 4: a hit, no epic', () => {
    const hit = resolveHit(6, -2);
    assert.equal(hit.total, 4);
    assert.equal(hit.key, 'hit');
    assert.equal(hit.epic, false);
  });
  test('legendary 5 + 1 = 6: an epic', () => {
    const hit = resolveHit(5, 1);
    assert.equal(hit.key, 'epic');
    assert.equal(hit.epic, true);
  });
  test('below 1 is still a miss, above 6 still an epic', () => {
    assert.equal(resolveHit(1, -2).key, 'miss');
    assert.equal(resolveHit(6, 1).epic, true);
  });
  test('3 at −1 = 2: a miss', () => {
    assert.equal(resolveHit(3, -1).key, 'miss');
  });
  test('no modifier — unchanged', () => {
    assert.deepEqual(resolveHit(4), { die: 4, modifier: 0, total: 4, key: 'hit', multiplier: 1, epic: false });
  });
});

describe('resolveHitModifiers — pp. 27, 30, 31', () => {
  test('target in «Защита»: −2', () => {
    assert.deepEqual(resolveHitModifiers({ targetDefending: true }), { modifiers: [{ key: 'defending', value: -2 }], total: -2 });
  });
  test('shot at an adjacent target: −1', () => {
    assert.equal(resolveHitModifiers({ ranged: true, adjacent: true }).total, -1);
  });
  test('melee at an adjacent target: nothing', () => {
    assert.equal(resolveHitModifiers({ ranged: false, adjacent: true }).total, 0);
  });
  test('shot at a non-adjacent or unmeasured target: nothing', () => {
    assert.equal(resolveHitModifiers({ ranged: true, adjacent: false }).total, 0);
    assert.equal(resolveHitModifiers({ ranged: true, adjacent: null }).total, 0);
  });
  test('advanced Стрельба lifts the adjacent penalty', () => {
    assert.equal(resolveHitModifiers({ ranged: true, adjacent: true, ignoreAdjacentPenalty: true }).total, 0);
  });
  test('legendary attacker: +1; everything stacks', () => {
    const result = resolveHitModifiers({ targetDefending: true, ranged: true, adjacent: true, attackerLegendary: true });
    assert.deepEqual(result.modifiers.map((m) => m.key), ['defending', 'adjacentShot', 'legendary']);
    assert.equal(result.total, -2);
  });
});

describe('resolveContestedDefeat — p. 31', () => {
  test('attacker higher → damage', () => {
    const d = resolveContestedDefeat({ attackerAttack: 9, targetDefense: 15, attackerDie: 12, targetDie: 5 });
    assert.equal(d.attackerTotal, 21);
    assert.equal(d.targetTotal, 20);
    assert.equal(d.success, true);
  });
  test('a tie → no damage', () => {
    assert.equal(resolveContestedDefeat({ attackerAttack: 10, targetDefense: 10, attackerDie: 7, targetDie: 7 }).success, false);
  });
  test('no target → unknown', () => {
    assert.equal(resolveContestedDefeat({ attackerAttack: 10, targetDefense: null, attackerDie: 7, targetDie: 7 }).known, false);
  });
});

describe('attackSeriesCount — §11', () => {
  test('creature: statblock count, +1 for «Месть» while hurt', () => {
    assert.equal(attackSeriesCount({ creatureAttacks: 3 }), 3);
    assert.equal(attackSeriesCount({ creatureAttacks: 2, vengeanceHurt: true }), 3);
    assert.equal(attackSeriesCount({ creatureAttacks: 0 }), 1);
  });
  test('hero melee: +1 from advanced/expert Нападение, not base', () => {
    assert.equal(attackSeriesCount({ assaultTier: 'base' }), 1);
    assert.equal(attackSeriesCount({ assaultTier: 'advanced' }), 2);
    assert.equal(attackSeriesCount({ assaultTier: 'expert' }), 2);
  });
  test('hero ranged: +1 from any Стрельба; Нападение does not count', () => {
    assert.equal(attackSeriesCount({ ranged: true, assaultTier: 'expert' }), 1);
    assert.equal(attackSeriesCount({ ranged: true, archeryTier: 'base' }), 2);
  });
  test('specialization adds one more to its own kind', () => {
    assert.equal(attackSeriesCount({ assaultTier: 'expert', specializationSkill: 'assault' }), 3);
    assert.equal(attackSeriesCount({ ranged: true, archeryTier: 'expert', specializationSkill: 'archery' }), 3);
    assert.equal(attackSeriesCount({ ranged: true, specializationSkill: 'assault' }), 1);
  });
});

describe('resolveNextAttack — «Следующая атака»', () => {
  test('not before the GM confirms', () => {
    assert.equal(resolveNextAttack({ confirmed: false, index: 1, total: 3 }).show, false);
  });
  test('after confirm, while attacks remain', () => {
    assert.deepEqual(resolveNextAttack({ confirmed: true, index: 1, total: 3 }), { show: true, stoppedByTarget: false, stoppedByAttacker: false, next: 2 });
  });
  test('none after the last one, or without a series', () => {
    assert.equal(resolveNextAttack({ confirmed: true, index: 3, total: 3 }).show, false);
    assert.equal(resolveNextAttack({ confirmed: true, index: null, total: null }).show, false);
  });
  test('target out → no button, the card says why', () => {
    assert.deepEqual(resolveNextAttack({ confirmed: true, index: 1, total: 2, targetOut: true }), { show: false, stoppedByTarget: true, stoppedByAttacker: false, next: null });
  });
  test('attacker out (Огненный Щит) → no button, the card says why', () => {
    assert.deepEqual(resolveNextAttack({ confirmed: true, index: 1, total: 2, attackerOut: true }), { show: false, stoppedByTarget: false, stoppedByAttacker: true, next: null });
  });
});

describe('resolveAttackResolution — modifiers and old cards', () => {
  const base = {
    hitDie: 6, defeatDie: 15, attackerAttack: 5, targetDefense: 10, baseDamage: 4,
    stateMultiplier: 1, equippedArmor: [], location: null,
  };
  test('a card without the new fields: no modifier, ordinary defeat test', () => {
    const r = resolveAttackResolution(base);
    assert.equal(r.hit.epic, true);
    assert.equal(r.defeat.threshold, 5);
    assert.equal(r.damage, 8);
  });
  test('hitModifier applies to the stored die', () => {
    const r = resolveAttackResolution({ ...base, hitModifier: -2 });
    assert.equal(r.hit.key, 'hit');
    assert.equal(r.damage, 4);
  });
  test('contested flag uses both d20', () => {
    const r = resolveAttackResolution({ ...base, contested: true, targetDefeatDie: 10 });
    assert.equal(r.defeat.contested, true);
    assert.equal(r.defeat.success, false); // 15 + 5 = 20 vs 10 + 10 = 20 — a tie
    assert.equal(r.damage, 0);
  });
});

describe('resolveSpellDamageDealt — Благословение / Слабость / Проклятие on the Урон (rules.md §11)', () => {
  test('no effects: the Урон as is', () => {
    assert.equal(resolveSpellDamageDealt(5), 5);
  });
  test('Благословение +4', () => {
    assert.equal(resolveSpellDamageDealt(5, [{ value: 4 }]), 9);
  });
  test('Слабость −2, down to 1 at least', () => {
    assert.equal(resolveSpellDamageDealt(5, [{ value: -2, floorOne: true }]), 3);
    assert.equal(resolveSpellDamageDealt(2, [{ value: -4, floorOne: true }]), 1);
  });
  test('different spells add up: Благословение +4 and Проклятие −2 = +2; Слабость and Проклятие −4', () => {
    assert.equal(resolveSpellDamageDealt(5, [{ value: 4 }, { value: -2, floorOne: true }]), 7);
    assert.equal(resolveSpellDamageDealt(3, [{ value: -2, floorOne: true }, { value: -2, floorOne: true }]), 1);
  });
});

describe('resolveSpellDamageTaken — Щит / Воздушный Щит after multipliers and armor (rules.md §11)', () => {
  test('no effects or no damage: unchanged', () => {
    assert.equal(resolveSpellDamageTaken(8), 8);
    assert.equal(resolveSpellDamageTaken(0, [{ value: -6 }]), 0);
    assert.equal(resolveSpellDamageTaken(null, [{ value: -6 }]), null);
  });
  test('−6, down to 1 at least', () => {
    assert.equal(resolveSpellDamageTaken(10, [{ value: -6 }]), 4);
    assert.equal(resolveSpellDamageTaken(4, [{ value: -6 }]), 1);
  });
});

describe('resolveAttackResolution — spell effects frozen on the card', () => {
  const base = {
    hitDie: 5, defeatDie: 15, attackerAttack: 5, targetDefense: 10, baseDamage: 5,
    stateMultiplier: 1, equippedArmor: [], location: null,
  };
  test('Благословение +4 goes in before the ×2 of a strong hit', () => {
    const r = resolveAttackResolution({ ...base, damageDealtModifiers: [{ value: 4 }] });
    assert.equal(r.baseDamage, 9);
    assert.equal(r.damage, 18);
  });
  test('Щит −6 comes off the final damage, at least 1', () => {
    assert.equal(resolveAttackResolution({ ...base, damageTakenModifiers: [{ value: -6 }] }).damage, 4);
    assert.equal(resolveAttackResolution({ ...base, hitDie: 3, damageTakenModifiers: [{ value: -6 }] }).damage, 1);
  });
  test('a miss stays 0 under Щит', () => {
    assert.equal(resolveAttackResolution({ ...base, hitDie: 1, damageTakenModifiers: [{ value: -6 }] }).damage, 0);
  });
  test('potential damage (no target) follows the same rules', () => {
    const r = resolveAttackResolution({ ...base, defeatDie: null, targetDefense: null, damageDealtModifiers: [{ value: 4 }] });
    assert.equal(r.potentialDamage, 18);
  });
});

describe('initiativeRollParts — §5.1 extra initiative terms', () => {
  test('an ordinary hero: Тактика as is, no bonus', () => {
    assert.deepEqual(initiativeRollParts({ race: 'human', tactics: 3 }), { tactics: 3, initiativeBonus: 0 });
  });
  test('p. 12: a Минотавр hero +2', () => {
    assert.deepEqual(initiativeRollParts({ race: 'minotaur', tactics: 0 }), { tactics: 0, initiativeBonus: 2 });
  });
  test('p. 25: didn’t spot the enemy — −10 and no Тактика', () => {
    assert.deepEqual(initiativeRollParts({ race: 'human', tactics: 5, surprised: true }), { tactics: 0, initiativeBonus: -10 });
  });
  test('a surprised Минотавр: +2 −10', () => {
    assert.deepEqual(initiativeRollParts({ race: 'minotaur', tactics: 3, surprised: true }), { tactics: 0, initiativeBonus: -8 });
  });
  test('a creature: no race, no Тактика', () => {
    assert.deepEqual(initiativeRollParts({ surprised: true }), { tactics: 0, initiativeBonus: -10 });
    assert.deepEqual(initiativeRollParts({}), { tactics: 0, initiativeBonus: 0 });
  });
});

describe('Эльф — p. 9, one reroll of the initiative d20, the new result stands', () => {
  test('only the d20 changes', () => {
    assert.equal(elfRerolledInitiative(20, 12, 3), 11);
    assert.equal(elfRerolledInitiative(20, 12, 19), 27);
  });
  const base = { race: 'elf', rerolled: false, current: true, round: 0, isOwner: true, isGM: false };
  test('offered to the elf’s owner or the GM, once, while initiative is rolled', () => {
    assert.equal(canElfReroll(base), true);
    assert.equal(canElfReroll({ ...base, round: 1 }), true);
    assert.equal(canElfReroll({ ...base, isOwner: false, isGM: true }), true);
  });
  test('not for another race, a second time, a stale card, round 2+, or another player', () => {
    assert.equal(canElfReroll({ ...base, race: 'human' }), false);
    assert.equal(canElfReroll({ ...base, rerolled: true }), false);
    assert.equal(canElfReroll({ ...base, current: false }), false);
    assert.equal(canElfReroll({ ...base, round: 2 }), false);
    assert.equal(canElfReroll({ ...base, isOwner: false }), false);
  });
});

describe('compareTurnOrder — p. 24: initiative, then Скорость, then a coin (rules.md §11)', () => {
  const c = (id, initiative, speed, coin = null) => ({ id, initiative, speed, coin });
  const order = (...list) => [...list].sort(compareTurnOrder).map((x) => x.id);
  test('higher initiative first', () => {
    assert.deepEqual(order(c('a', 10, 9), c('b', 15, 3)), ['b', 'a']);
  });
  test('a tie: the higher Скорость (the one in the roll, Тактика included)', () => {
    assert.deepEqual(order(c('a', 12, 6), c('b', 12, 9)), ['b', 'a']);
  });
  test('equal Скорость: the coin, the same every time it is sorted', () => {
    const list = [c('a', 12, 6, 0.2), c('b', 12, 6, 0.8)];
    assert.deepEqual(order(...list), ['b', 'a']);
    assert.deepEqual(order(...list.reverse()), ['b', 'a']);
  });
  test('no initiative yet: after everyone, by id', () => {
    assert.deepEqual(order(c('z', null, 9), c('a', 3, 1), c('b', null, 1)), ['a', 'b', 'z']);
  });
  test('an old combatant without a coin: the id settles it', () => {
    assert.deepEqual(order(c('b', 12, 6), c('a', 12, 6)), ['a', 'b']);
  });
});

describe('tieBreakSpeed / rolledSpeedToRecord — the Скорость of the roll, kept (p. 24, rules.md §11)', () => {
  test('the recorded Скорость wins over the current one', () => {
    assert.equal(tieBreakSpeed(6, 9), 6);
    assert.equal(tieBreakSpeed(0, 9), 0);
  });
  test('nothing recorded (rolled before it was kept): the current one', () => {
    assert.equal(tieBreakSpeed(undefined, 9), 9);
    assert.equal(tieBreakSpeed(null, 9), 9);
  });
  const rec = (changes, rolled, recorded, current = 9) => rolledSpeedToRecord({ changes, rolled, recorded, current });
  test('a roll records the Скорость taken at the roll', () => {
    assert.equal(rec({ initiative: 14 }, 6, undefined), 6);
    assert.equal(rec({ initiative: 14 }, 6, 4), 6);
    assert.equal(rec({ initiative: 0 }, 0, undefined), 0);
  });
  test('typed into the tracker or the Эльф reroll: the recorded one stays', () => {
    assert.equal(rec({ initiative: 17 }, undefined, 6), undefined);
  });
  test('typed in with nothing recorded yet: the current one', () => {
    assert.equal(rec({ initiative: 17 }, undefined, undefined), 9);
  });
  test('no initiative in the update, or reset to none — nothing recorded', () => {
    assert.equal(rec({ 'flags.x': 1 }, 6, undefined), undefined);
    assert.equal(rec({ initiative: null }, 6, undefined), undefined);
    assert.equal(rec(undefined, 6, undefined), undefined);
  });
  test('a tie at 12: Ускорение or Замедление after the roll changes nothing', () => {
    // a rolled with Скорость 6, b with 8; then a gets Ускорение (+3 → 9), b Замедление (→ 5).
    const sorted = (aNow, bNow) => [
      { id: 'a', initiative: 12, speed: tieBreakSpeed(6, aNow), coin: 0.9 },
      { id: 'b', initiative: 12, speed: tieBreakSpeed(8, bNow), coin: 0.1 },
    ].sort(compareTurnOrder).map((x) => x.id);
    assert.deepEqual(sorted(6, 8), ['b', 'a']);
    assert.deepEqual(sorted(9, 5), ['b', 'a']);
  });
});

describe('counterAttackTagLimit — «Ответная Атака (N)», p. 115', () => {
  test('the number in brackets', () => {
    assert.equal(counterAttackTagLimit(['Летает', 'Ответная Атака (1)']), 1);
    assert.equal(counterAttackTagLimit(['Ответная атака (2)']), 2);
  });
  test('«Неограничено»', () => {
    assert.equal(counterAttackTagLimit(['Ответная Атака (Неограничено)']), Infinity);
  });
  test('no tag — none; «Безответный Удар» is not it', () => {
    assert.equal(counterAttackTagLimit(['Летает']), 0);
    assert.equal(counterAttackTagLimit(['Безответный Удар 2+']), 0);
  });
});

describe('countersThisRound — per battle and round', () => {
  test('same battle and round: as counted', () => {
    assert.deepEqual(countersThisRound({ combatId: 'c', round: 2, used: 1, answered: ['m'] }, 'c', 2),
      { combatId: 'c', round: 2, used: 1, answered: ['m'] });
  });
  test('a new round or battle: none used', () => {
    assert.deepEqual(countersThisRound({ combatId: 'c', round: 2, used: 1, answered: ['m'] }, 'c', 3),
      { combatId: 'c', round: 3, used: 0, answered: [] });
    assert.deepEqual(countersThisRound(null, 'd', 1), { combatId: 'd', round: 1, used: 0, answered: [] });
  });
});

describe('counterAttackOffer — Ответный Удар and «Ответная атака» (rules.md §11)', () => {
  const base = {
    confirmed: true, ranged: false, counter: false, defenderOut: false, attackerOut: false, inCombat: true,
    tagLimit: 0, spellLimit: 1, used: 0, answered: false,
  };
  test('a confirmed melee attack on a defender with a counter left', () => {
    assert.deepEqual(counterAttackOffer(base), { show: true, left: 1 });
  });
  test('not before the GM confirms, not on a ranged attack, not on a counter', () => {
    assert.equal(counterAttackOffer({ ...base, confirmed: false }).show, false);
    assert.equal(counterAttackOffer({ ...base, ranged: true }).show, false);
    assert.equal(counterAttackOffer({ ...base, counter: true }).show, false);
  });
  test('not when either side is out, out of combat, or the card was answered', () => {
    assert.equal(counterAttackOffer({ ...base, defenderOut: true }).show, false);
    assert.equal(counterAttackOffer({ ...base, attackerOut: true }).show, false);
    assert.equal(counterAttackOffer({ ...base, inCombat: false }).show, false);
    assert.equal(counterAttackOffer({ ...base, answered: true }).show, false);
  });
  test('per round: the larger of tag and spell, not the sum', () => {
    assert.deepEqual(counterAttackOffer({ ...base, tagLimit: 1, spellLimit: 2, used: 1 }), { show: true, left: 1 });
    assert.equal(counterAttackOffer({ ...base, tagLimit: 1, spellLimit: 1, used: 1 }).show, false);
    assert.equal(counterAttackOffer({ ...base, tagLimit: 0, spellLimit: 0 }).show, false);
  });
  test('«Неограничено» never runs out', () => {
    assert.deepEqual(counterAttackOffer({ ...base, tagLimit: Infinity, spellLimit: 0, used: 9 }), { show: true, left: Infinity });
  });
});

describe('orderWithFollowers — a summon goes right after its caster (rules.md §11)', () => {
  test('the follower moves behind its leader', () => {
    assert.deepEqual(orderWithFollowers([
      { id: 'mage' }, { id: 'knight' }, { id: 'pike' }, { id: 'elem', follows: 'mage' },
    ]), ['mage', 'elem', 'knight', 'pike']);
  });
  test('two followers of one leader keep their sorted order', () => {
    assert.deepEqual(orderWithFollowers([
      { id: 'clone2', follows: 'mage' }, { id: 'knight' }, { id: 'mage' }, { id: 'clone1', follows: 'mage' },
    ]), ['knight', 'mage', 'clone2', 'clone1']);
  });
  test('a leader gone from the battle — the follower stays where sorted', () => {
    assert.deepEqual(orderWithFollowers([{ id: 'elem', follows: 'gone' }, { id: 'knight' }]), ['elem', 'knight']);
  });
  test('nothing to move — the same order; a loop keeps everyone', () => {
    assert.deepEqual(orderWithFollowers([{ id: 'a' }, { id: 'b' }]), ['a', 'b']);
    assert.deepEqual(orderWithFollowers([{ id: 'a', follows: 'b' }, { id: 'b', follows: 'a' }]).sort(), ['a', 'b']);
  });
});

describe('initiativeRollParts — joining a battle under way (p. 25, rules.md §11)', () => {
  test('a joiner rolls without Тактика', () => {
    assert.deepEqual(initiativeRollParts({ tactics: 5, lateJoin: true }), { tactics: 0, initiativeBonus: 0 });
  });
  test('out of an ambush: +10 and Тактика', () => {
    assert.deepEqual(initiativeRollParts({ tactics: 5, lateJoin: true, ambush: true }), { tactics: 5, initiativeBonus: 10 });
  });
  test('the ambush counts only for one who joined', () => {
    assert.deepEqual(initiativeRollParts({ tactics: 5, ambush: true }), { tactics: 5, initiativeBonus: 0 });
  });
  test('a Минотавр joiner keeps his +2', () => {
    assert.deepEqual(initiativeRollParts({ race: 'minotaur', tactics: 3, lateJoin: true, ambush: true }), { tactics: 3, initiativeBonus: 12 });
  });
  test('an ordinary combatant as before', () => {
    assert.deepEqual(initiativeRollParts({ tactics: 3 }), { tactics: 3, initiativeBonus: 0 });
    assert.deepEqual(initiativeRollParts({ tactics: 3, surprised: true }), { tactics: 0, initiativeBonus: -10 });
  });
});

describe('isLateJoin — «уже не первый раунд боя» (rules.md §11)', () => {
  test('a started battle from round 2 on', () => {
    assert.equal(isLateJoin({ started: true, round: 2 }), true);
    assert.equal(isLateJoin({ started: true, round: 5 }), true);
  });
  test('round 1, a battle not started, a summon — ordinary', () => {
    assert.equal(isLateJoin({ started: true, round: 1 }), false);
    assert.equal(isLateJoin({ started: false, round: 0 }), false);
    assert.equal(isLateJoin({ started: true, round: 3, summoned: true }), false);
  });
});

describe('joinerWaits — «появляются в начале нового раунда»', () => {
  test('passed by in the round joined, goes from the next', () => {
    assert.equal(joinerWaits(2, 2), true);
    assert.equal(joinerWaits(2, 3), false);
  });
  test('no mark — never waits', () => {
    assert.equal(joinerWaits(undefined, 2), false);
    assert.equal(joinerWaits(null, 2), false);
  });
});

describe('turnKeepingCombatant — the turn stays with its combatant when a roll reorders', () => {
  test('a joiner rolling high moves the turn number, not the combatant', () => {
    assert.equal(turnKeepingCombatant(['joiner', 'mage', 'knight'], 'mage', 0), 1);
  });
  test('no turn yet, or the combatant gone — the number as it was', () => {
    assert.equal(turnKeepingCombatant(['a', 'b'], null, null), null);
    assert.equal(turnKeepingCombatant(['a', 'b'], 'gone', 1), 1);
  });
});

describe('canElfReroll — a joiner\'s reroll in the round it appears', () => {
  const base = { race: 'elf', rerolled: false, current: true, isOwner: true, isGM: false };
  test('open through the round after joining, closed later', () => {
    assert.equal(canElfReroll({ ...base, round: 3, joinedRound: 3 }), true);
    assert.equal(canElfReroll({ ...base, round: 4, joinedRound: 3 }), true);
    assert.equal(canElfReroll({ ...base, round: 5, joinedRound: 3 }), false);
  });
  test('not a joiner — round 1 only, as before', () => {
    assert.equal(canElfReroll({ ...base, round: 1 }), true);
    assert.equal(canElfReroll({ ...base, round: 2 }), false);
  });
});
