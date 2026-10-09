import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  lastingRoundsLeft, lastingCastRow, fieldExpiresRound, spellEffectTiming, lastingSpellExpires, orphanedSpellEffects,
} from '../module/helpers/spell-effects.mjs';

const ru = JSON.parse(fs.readFileSync(new URL('../lang/ru.json', import.meta.url), 'utf8'));
const lookup = (key) => key.split('.').reduce((obj, part) => obj?.[part], ru);
/** game.i18n.format over lang/ru.json: «{name}» → the value as text. */
const format = (key, data = {}) => {
  const template = lookup(key);
  assert.equal(typeof template, 'string', key);
  return template.replace(/{(\w+)}/g, (_, name) => String(data[name]));
};
const BAD = /Infinity|NaN|undefined|null/;

describe('lastingRoundsLeft — p. 32, counted down on the caster\'s turn', () => {
  test('cast in round 1 for 3 rounds: 3 left in round 1, 1 in round 3, 0 from round 4', () => {
    const ends = fieldExpiresRound(1, 3);
    assert.equal(lastingRoundsLeft(ends, 1), 3);
    assert.equal(lastingRoundsLeft(ends, 3), 1);
    assert.equal(lastingRoundsLeft(ends, 4), 0);
    assert.equal(lastingRoundsLeft(ends, 7), 0);
  });

  test('no battle or no numbers — null, never Infinity or NaN', () => {
    assert.equal(lastingRoundsLeft(4, null), null);
    assert.equal(lastingRoundsLeft(4, undefined), null);
    assert.equal(lastingRoundsLeft(fieldExpiresRound(undefined, 3), 2), null);
    assert.equal(lastingRoundsLeft(fieldExpiresRound(1, undefined), 2), null);
    assert.equal(lastingRoundsLeft(Infinity, 2), null);
  });
});

describe('lastingCastRow — the limit window\'s row and the card\'s «Закончится / Закончено»', () => {
  const base = { spellName: 'Жажда Крови', targetNames: ['Элементали Земли'] };
  const casts = [
    { ...base, remaining: 2 },
    { ...base, remaining: 0 },
    { ...base, untilCombatEnd: true, remaining: null },
    { ...base, remaining: null },
    { ...base, remaining: undefined },
    { ...base, remaining: Infinity },
    { ...base, remaining: NaN },
  ];

  test('rounds, «до конца боя», «бой окончен»', () => {
    assert.equal(lastingCastRow(casts[0], format), 'Жажда Крови — Элементали Земли, раундов: 2');
    assert.equal(lastingCastRow(casts[2], format), 'Жажда Крови — Элементали Земли, до конца боя');
    assert.equal(lastingCastRow(casts[3], format), 'Жажда Крови — Элементали Земли, бой окончен');
  });

  test('no Infinity, NaN, undefined or null in the row or the card lines', () => {
    for (const cast of casts) {
      const row = lastingCastRow(cast, format);
      for (const text of [
        row,
        format('HEROES_GLORY.Roll.SpellLimitPending', { row }),
        format('HEROES_GLORY.Roll.SpellEndPending', { cast: row }),
        format('HEROES_GLORY.Roll.SpellEndApplied', { cast: row }),
      ]) {
        assert.doesNotMatch(text, BAD, text);
      }
    }
  });

  test('the window\'s question names the caster without a case ending', () => {
    assert.equal(format('HEROES_GLORY.Roll.SpellLimitText', { caster: 'Маг', spell: 'Жажда Крови' }),
      '«Маг»: уже три длящихся заклинания. Какое закончить, чтобы наложить «Жажда Крови»?');
  });
});

describe('spellEffectTiming — when an effect ends, whose turn counts it', () => {
  test('from the flag (effects put on now carry no core duration)', () => {
    assert.deepEqual(spellEffectTiming({ expiresRound: 5, casterCombatant: 'c1' }, { start: { round: 1, combatant: 'x' } }),
      { expiresRound: 5, casterCombatant: 'c1' });
  });

  test('an older effect: its start round + core duration, its start combatant', () => {
    assert.deepEqual(spellEffectTiming({}, { start: { round: 2, combatant: 'c2' }, duration: { value: 3 } }),
      { expiresRound: 5, casterCombatant: 'c2' });
  });

  test('no numbers — null', () => {
    assert.deepEqual(spellEffectTiming({}, { start: null, duration: { value: null } }), { expiresRound: null, casterCombatant: null });
    assert.deepEqual(spellEffectTiming(undefined, undefined), { expiresRound: null, casterCombatant: null });
  });
});

describe("lastingSpellExpires — at the start of the caster's turn (p. 32)", () => {
  const base = { expiresRound: 4, casterCombatant: 'c1', casterPresent: true, roundStarted: false };

  test("cast in round 1 for 3 rounds: goes at the caster's turn in round 4, not before", () => {
    assert.equal(lastingSpellExpires({ ...base, round: 3, currentCombatant: 'c1' }), false);
    assert.equal(lastingSpellExpires({ ...base, round: 4, currentCombatant: 'c2', roundStarted: true }), false);
    assert.equal(lastingSpellExpires({ ...base, round: 4, currentCombatant: 'c1' }), true);
  });

  test("a later turn of the caster still ends it (a missed one)", () => {
    assert.equal(lastingSpellExpires({ ...base, round: 6, currentCombatant: 'c1' }), true);
  });

  test('caster out of the battle: at the start of a round once the rounds are out', () => {
    const gone = { ...base, casterPresent: false };
    assert.equal(lastingSpellExpires({ ...gone, round: 4, currentCombatant: 'c2', roundStarted: false }), false);
    assert.equal(lastingSpellExpires({ ...gone, round: 4, currentCombatant: 'c2', roundStarted: true }), true);
    assert.equal(lastingSpellExpires({ ...gone, round: 3, currentCombatant: 'c2', roundStarted: true }), false);
  });

  test('no numbers — never taken off', () => {
    assert.equal(lastingSpellExpires({ ...base, expiresRound: null, round: 9, currentCombatant: 'c1', roundStarted: true }), false);
    assert.equal(lastingSpellExpires({ ...base, round: null, currentCombatant: 'c1' }), false);
    assert.equal(lastingSpellExpires({ ...base, casterCombatant: null, round: 9, currentCombatant: null }), false);
  });
});

describe('orphanedSpellEffects — the sweep on entering the world', () => {
  test('only our spell effects whose battle is gone', () => {
    const entries = [
      { id: 'a', data: { spellName: 'Жажда Крови', combatId: 'gone' } },
      { id: 'b', data: { spellName: 'Щит', combatId: 'live' } },
      { id: 'c', data: null },
      { id: 'd', data: { spellName: 'Молитва' } },
      { id: 'e', data: undefined },
    ];
    assert.deepEqual(orphanedSpellEffects(entries, (id) => id === 'live').map((e) => e.id), ['a']);
  });
});
