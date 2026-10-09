import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { HEROES_GLORY } from '../module/helpers/config.mjs';
import { factionTownPath, factionBackdropPath, factionThemePath } from '../module/helpers/faction-icons.mjs';
import { classIconPath, CLASS_STATS } from '../module/helpers/class-stats.mjs';
import { themeAction, PickerThemePlayer, THEME_FADE_MS } from '../module/helpers/picker-theme.mjs';

const ROOT = new URL('../', import.meta.url);
const onDisk = (systemPath) => new URL(systemPath.replace('systems/heroes-glory/', ''), ROOT);

/** Width and height from a PNG's IHDR. */
function pngSize(url) {
  const buf = fs.readFileSync(url);
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('faction art and themes — §2.7, scripts/build_faction_art.py', () => {
  const factions = Object.keys(HEROES_GLORY.factions);

  test('there are 10 factions', () => {
    assert.equal(factions.length, 10);
  });

  for (const key of factions) {
    test(`${key}: tile, confirm picture and theme exist`, () => {
      assert.deepEqual(pngSize(onDisk(factionTownPath(key))), [174, 192]);
      assert.deepEqual(pngSize(onDisk(factionBackdropPath(key))), [300, 390]);
      const theme = fs.statSync(onDisk(factionThemePath(key)));
      assert.ok(theme.size > 500_000, `${key}.mp3 is ${theme.size} bytes`);
    });
  }

  test('an unknown faction has nothing', () => {
    assert.equal(factionTownPath('nowhere'), null);
    assert.equal(factionBackdropPath('nowhere'), null);
    assert.equal(factionThemePath('nowhere'), null);
  });

  test('the old CREST58 flags are gone', () => {
    for (const key of factions) assert.equal(fs.existsSync(new URL(`assets/factions/${key}.png`, ROOT)), false, key);
  });

  test('every class has its xBRZ ×3 portrait', () => {
    const classes = Object.keys(CLASS_STATS);
    assert.equal(classes.length, 20);
    for (const key of classes) assert.deepEqual(pngSize(onDisk(classIconPath(key))), [174, 192], key);
  });
});

describe('themeAction — what the picker does with its music', () => {
  test('same theme (or none to none) — keep', () => {
    assert.equal(themeAction('a.mp3', 'a.mp3'), 'keep');
    assert.equal(themeAction(null, null), 'keep');
    assert.equal(themeAction(null, undefined), 'keep');
  });

  test('none to a theme — start; a theme to another — switch; to none — stop', () => {
    assert.equal(themeAction(null, 'a.mp3'), 'start');
    assert.equal(themeAction('a.mp3', 'b.mp3'), 'switch');
    assert.equal(themeAction('a.mp3', null), 'stop');
  });
});

describe('PickerThemePlayer — switching and the race guard', () => {
  /** A play() whose sounds resolve when the test says, recording stops. */
  function harness() {
    const log = [];
    const pending = [];
    const play = (src) => new Promise((resolve) => {
      pending.push(() => {
        const sound = { src, stop: (opts) => log.push(['stop', src, opts?.fade ?? 0]) };
        log.push(['play', src]);
        resolve(sound);
      });
    });
    return { log, pending, player: new PickerThemePlayer({ play }) };
  }

  test('start, then switch: the first fades out, the second plays', async () => {
    const { log, pending, player } = harness();
    const a = player.set('a.mp3');
    pending.shift()();
    await a;
    const b = player.set('b.mp3');
    pending.shift()();
    await b;
    assert.deepEqual(log, [['play', 'a.mp3'], ['stop', 'a.mp3', THEME_FADE_MS], ['play', 'b.mp3']]);
  });

  test('stop fades out; the same theme again does nothing', async () => {
    const { log, pending, player } = harness();
    const a = player.set('a.mp3');
    pending.shift()();
    await a;
    await player.set('a.mp3');
    await player.set(null);
    assert.deepEqual(log, [['play', 'a.mp3'], ['stop', 'a.mp3', THEME_FADE_MS]]);
  });

  test('a sound that loads after the window closed is stopped at once', async () => {
    const { log, pending, player } = harness();
    const a = player.set('a.mp3');
    await player.set(null);
    pending.shift()();
    await a;
    assert.deepEqual(log, [['play', 'a.mp3'], ['stop', 'a.mp3', 0]]);
  });

  test('a sound that loads after another faction was picked is stopped; the new one stays', async () => {
    const { log, pending, player } = harness();
    const a = player.set('a.mp3');
    const b = player.set('b.mp3');
    pending.shift()();
    await a;
    pending.shift()();
    await b;
    assert.deepEqual(log, [['play', 'a.mp3'], ['stop', 'a.mp3', 0], ['play', 'b.mp3']]);
    await player.set(null);
    assert.deepEqual(log.at(-1), ['stop', 'b.mp3', THEME_FADE_MS]);
  });

  test('a theme that fails to play is skipped without throwing', async () => {
    const warn = console.warn;
    console.warn = () => {};
    try {
      const player = new PickerThemePlayer({ play: async () => { throw new Error('404'); } });
      await player.set('missing.mp3');
      await player.set(null);
    } finally {
      console.warn = warn;
    }
  });
});
