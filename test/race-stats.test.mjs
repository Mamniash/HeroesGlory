import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { HEROES_GLORY } from '../module/helpers/config.mjs';
import {
  RACE_STATS, RACE_FEATURE_NOTES, RACE_SUBCHOICES, statsForRace, raceDiff,
  subchoiceOptionsFor, subchoiceModifiersFor,
} from '../module/helpers/race-stats.mjs';

describe('RACE_STATS — §2.3 starting Health/Vision/Speed/unarmed damage per race', () => {
  test('all 12 rows are present', () => {
    assert.equal(Object.keys(RACE_STATS).length, 12);
  });

  const expected = {
    human: { health: 30, vision: 'normal', speed: 6, unarmedDamage: null },
    gnome: { health: 35, vision: 'darkvision', speed: 5, unarmedDamage: null },
    elf: { health: 30, vision: 'nightvision', speed: 8, unarmedDamage: null },
    goblin: { health: 28, vision: 'darkvision', speed: 6, unarmedDamage: null },
    vampire: { health: 30, vision: 'darkvision', speed: 6, unarmedDamage: 5 },
    gnoll: { health: 30, vision: 'normal', speed: 6, unarmedDamage: null },
    demon: { health: 30, vision: 'darkvision', speed: 6, unarmedDamage: null },
    djinn: { health: 30, vision: 'normal', speed: 6, unarmedDamage: 5 },
    elemental: { health: 30, vision: 'normal', speed: 6, unarmedDamage: 5 },
    minotaur: { health: 35, vision: 'darkvision', speed: 5, unarmedDamage: 5 },
    troglodyte: { health: 28, vision: 'blindsense', speed: 6, unarmedDamage: null },
    saurian: { health: 30, vision: 'normal', speed: 6, unarmedDamage: null },
  };

  for (const [raceKey, row] of Object.entries(expected)) {
    test(`${raceKey}`, () => {
      const actual = statsForRace(raceKey);
      assert.equal(actual.health, row.health);
      assert.equal(actual.vision, row.vision);
      assert.equal(actual.speed, row.speed);
      assert.equal(actual.unarmedDamage, row.unarmedDamage);
    });
  }

  test('unknown race key resolves to null', () => {
    assert.equal(statsForRace('not-a-race'), null);
  });
});

describe('raceDiff — pure before/after diff', () => {
  test('unknown race returns null', () => {
    assert.equal(raceDiff({ healthBase: 30, speed: 6, vision: 'normal', unarmedDamage: 1 }, 'not-a-race'), null);
  });

  test('no changes → empty diff', () => {
    const current = { healthBase: 30, speed: 6, vision: 'normal', unarmedDamage: 1 };
    assert.deepEqual(raceDiff(current, 'human'), {});
  });

  test('unarmedDamage: null race normalizes to 1 and still surfaces a stale override', () => {
    // Human has no unarmedDamage override (null) — but §8.1's "1 если не
    // сказано иного" default must still overwrite a stale 5 left over from
    // a previous Vampire, not silently skip the field.
    const current = { healthBase: 30, speed: 6, vision: 'normal', unarmedDamage: 5 };
    const diff = raceDiff(current, 'human');
    assert.deepEqual(diff, { unarmedDamage: { before: 5, after: 1 } });
  });

  test('race with an explicit unarmedDamage override only appears when it actually differs', () => {
    const alreadyFive = { healthBase: 30, speed: 6, vision: 'darkvision', unarmedDamage: 5 };
    assert.deepEqual(raceDiff(alreadyFive, 'vampire'), {});

    const stillOne = { healthBase: 30, speed: 6, vision: 'darkvision', unarmedDamage: 1 };
    assert.deepEqual(raceDiff(stillOne, 'vampire'), { unarmedDamage: { before: 1, after: 5 } });
  });

  test('full diff across all four fields', () => {
    const current = { healthBase: 10, speed: 0, vision: 'normal', unarmedDamage: 1 };
    assert.deepEqual(raceDiff(current, 'gnome'), {
      healthBase: { before: 10, after: 35 },
      speed: { before: 0, after: 5 },
      vision: { before: 'normal', after: 'darkvision' },
    });
  });
});

describe('RACE_SUBCHOICES — §2.3 p. 12 Элементаль/Минотавр creation-time forks', () => {
  test('exactly the two races with a real player-facing choice have an entry', () => {
    assert.deepEqual(Object.keys(RACE_SUBCHOICES).sort(), ['elemental', 'minotaur']);
  });

  test('subchoiceOptionsFor returns null for every other race', () => {
    for (const raceKey of Object.keys(RACE_STATS)) {
      if (raceKey === 'elemental' || raceKey === 'minotaur') continue;
      assert.equal(subchoiceOptionsFor(raceKey), null, `${raceKey} shouldn't have subchoice options`);
    }
  });

  test('elemental has all 4 elements, minotaur has both bonuses', () => {
    assert.deepEqual(Object.keys(subchoiceOptionsFor('elemental')).sort(), ['air', 'earth', 'fire', 'water']);
    assert.deepEqual(Object.keys(subchoiceOptionsFor('minotaur')).sort(), ['attack', 'magicPower']);
  });

  test('rules.md §2.3: Земля is +5 health.max and +1 defense, applied via modifiers not a base-field write', () => {
    assert.deepEqual(subchoiceModifiersFor('elemental', 'earth'), [
      { stat: 'health.max', mode: 'add', value: 5 },
      { stat: 'defense', mode: 'add', value: 1 },
    ]);
  });

  test('Огонь/Вода/Воздух carry no numeric modifier — text-only bonuses', () => {
    assert.deepEqual(subchoiceModifiersFor('elemental', 'fire'), []);
    assert.deepEqual(subchoiceModifiersFor('elemental', 'water'), []);
    assert.deepEqual(subchoiceModifiersFor('elemental', 'air'), []);
  });

  test('minotaur: +1 attack or +1 magicPower, exclusively', () => {
    assert.deepEqual(subchoiceModifiersFor('minotaur', 'attack'), [{ stat: 'attack', mode: 'add', value: 1 }]);
    assert.deepEqual(subchoiceModifiersFor('minotaur', 'magicPower'), [{ stat: 'magicPower', mode: 'add', value: 1 }]);
  });

  test('subchoiceModifiersFor is always an array, even for an unknown race/subchoice', () => {
    assert.deepEqual(subchoiceModifiersFor('human', 'earth'), []);
    assert.deepEqual(subchoiceModifiersFor('elemental', 'not-an-option'), []);
    assert.deepEqual(subchoiceModifiersFor('elemental', ''), []);
  });

  test('every option has a labelKey', () => {
    for (const [raceKey, { options }] of Object.entries(RACE_SUBCHOICES)) {
      for (const [optionKey, option] of Object.entries(options)) {
        assert.ok(option.labelKey, `${raceKey}.${optionKey} is missing a labelKey`);
      }
    }
  });
});

describe('config.mjs integrity — RACE_STATS/vision keys match config.mjs, not memorized', () => {
  test('RACE_STATS keys are exactly HEROES_GLORY.races keys', () => {
    assert.deepEqual(Object.keys(RACE_STATS).sort(), Object.keys(HEROES_GLORY.races).sort());
  });

  test('RACE_FEATURE_NOTES keys are exactly HEROES_GLORY.races keys', () => {
    assert.deepEqual(Object.keys(RACE_FEATURE_NOTES).sort(), Object.keys(HEROES_GLORY.races).sort());
  });

  test('every RACE_STATS vision value is a known HEROES_GLORY.visionTypes key', () => {
    for (const [raceKey, row] of Object.entries(RACE_STATS)) {
      assert.ok(HEROES_GLORY.visionTypes[row.vision], `${raceKey}'s vision "${row.vision}" isn't in visionTypes`);
    }
  });
});
