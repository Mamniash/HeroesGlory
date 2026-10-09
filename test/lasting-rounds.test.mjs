import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { lastingRoundsLeft, lastingCastRow, fieldExpiresRound } from '../module/helpers/spell-effects.mjs';

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

  test('rounds, «до конца боя», «вне боя»', () => {
    assert.equal(lastingCastRow(casts[0], format), 'Жажда Крови — Элементали Земли, раундов: 2');
    assert.equal(lastingCastRow(casts[2], format), 'Жажда Крови — Элементали Земли, до конца боя');
    assert.equal(lastingCastRow(casts[3], format), 'Жажда Крови — Элементали Земли, вне боя');
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
