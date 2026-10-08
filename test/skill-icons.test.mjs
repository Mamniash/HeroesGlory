import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  primarySkillIconPath,
  secondarySkillIconPath,
  secondarySkillEmptyIconPath,
  moraleIconPath,
  luckIconPath,
  schoolFramePath,
  speedIconPath,
  visionIconPath,
} from '../module/helpers/skill-icons.mjs';

describe('primarySkillIconPath — static per-slot frames', () => {
  test('one frame per primary stat plus Experience/Mana', () => {
    assert.equal(primarySkillIconPath('attack'), 'systems/heroes-glory/assets/pskil42-x4/pskil42_g00_f000.png');
    assert.equal(primarySkillIconPath('defense'), 'systems/heroes-glory/assets/pskil42-x4/pskil42_g00_f001.png');
    assert.equal(primarySkillIconPath('magicPower'), 'systems/heroes-glory/assets/pskil42-x4/pskil42_g00_f002.png');
    assert.equal(primarySkillIconPath('knowledge'), 'systems/heroes-glory/assets/pskil42-x4/pskil42_g00_f005.png');
    assert.equal(primarySkillIconPath('experience'), 'systems/heroes-glory/assets/pskil42-x4/pskil42_g00_f004.png');
    assert.equal(primarySkillIconPath('mana'), 'systems/heroes-glory/assets/pskil42-x4/pskil42_g00_f003.png');
  });

  test('the large (82x93) variant uses the pskill set, unaffected by the small-set frame override', () => {
    assert.equal(primarySkillIconPath('attack', { large: true }), 'systems/heroes-glory/assets/pskill/pskill_g00_f000.png');
    assert.equal(primarySkillIconPath('knowledge', { large: true }), 'systems/heroes-glory/assets/pskill/pskill_g00_f003.png');
    assert.equal(primarySkillIconPath('mana', { large: true }), 'systems/heroes-glory/assets/pskill/pskill_g00_f005.png');
  });
});

describe('secondarySkillIconPath — design doc frame table', () => {
  test('base/advanced/expert frames for a skill in the middle of the sheet', () => {
    assert.equal(
      secondarySkillIconPath('leadership', 'base'),
      'systems/heroes-glory/assets/secskill-x4/secskill_g00_f021.png'
    );
    assert.equal(
      secondarySkillIconPath('leadership', 'advanced'),
      'systems/heroes-glory/assets/secskill-x4/secskill_g00_f022.png'
    );
    assert.equal(
      secondarySkillIconPath('leadership', 'expert'),
      'systems/heroes-glory/assets/secskill-x4/secskill_g00_f023.png'
    );
  });

  test('the first and last table rows', () => {
    assert.equal(
      secondarySkillIconPath('pathfinding', 'base'),
      'systems/heroes-glory/assets/secskill-x4/secskill_g00_f003.png'
    );
    assert.equal(
      secondarySkillIconPath('healing', 'expert'),
      'systems/heroes-glory/assets/secskill-x4/secskill_g00_f086.png'
    );
  });

  test('the large (82x93) tooltip/modal variant uses the secsk82 set', () => {
    assert.equal(
      secondarySkillIconPath('luck', 'base', { large: true }),
      'systems/heroes-glory/assets/secsk82/secsk82_g00_f030.png'
    );
  });
});

describe('moraleIconPath / luckIconPath — frame = value + 3', () => {
  test('the full -3..+3 range', () => {
    assert.equal(moraleIconPath(-3), 'systems/heroes-glory/assets/imrl42-x4/imrl42_g00_f000.png');
    assert.equal(moraleIconPath(0), 'systems/heroes-glory/assets/imrl42-x4/imrl42_g00_f003.png');
    assert.equal(moraleIconPath(3), 'systems/heroes-glory/assets/imrl42-x4/imrl42_g00_f006.png');
    assert.equal(luckIconPath(-3), 'systems/heroes-glory/assets/ilck42-x4/ilck42_g00_f000.png');
    assert.equal(luckIconPath(3), 'systems/heroes-glory/assets/ilck42-x4/ilck42_g00_f006.png');
  });

  test('clamps values outside -3..+3 rather than picking a nonexistent frame', () => {
    assert.equal(moraleIconPath(5), 'systems/heroes-glory/assets/imrl42-x4/imrl42_g00_f006.png');
    assert.equal(moraleIconPath(-9), 'systems/heroes-glory/assets/imrl42-x4/imrl42_g00_f000.png');
  });

  test('the large (82x93) variant uses the imrl82/ilck82 sets', () => {
    assert.equal(moraleIconPath(0, { large: true }), 'systems/heroes-glory/assets/imrl82/imrl82_g00_f003.png');
    assert.equal(luckIconPath(0, { large: true }), 'systems/heroes-glory/assets/ilck82/ilck82_g00_f003.png');
    assert.equal(luckIconPath(3, { large: true }), 'systems/heroes-glory/assets/ilck82/ilck82_g00_f006.png');
  });

  test('large negative Luck comes from our own ilck82-neg frames (HOMM3 draws −3…0 alike)', () => {
    assert.equal(luckIconPath(-1, { large: true }), 'systems/heroes-glory/assets/ilck82-neg/ilck82_g00_f002.png');
    assert.equal(luckIconPath(-3, { large: true }), 'systems/heroes-glory/assets/ilck82-neg/ilck82_g00_f000.png');
    assert.equal(luckIconPath(-7, { large: true }), 'systems/heroes-glory/assets/ilck82-neg/ilck82_g00_f000.png');
  });

  test('the small (22x12) morale variant uses the imrl22 set', () => {
    assert.equal(moraleIconPath(-3, { small: true }), 'systems/heroes-glory/assets/imrl22/imrl22_g00_f000.png');
    assert.equal(moraleIconPath(0, { small: true }), 'systems/heroes-glory/assets/imrl22/imrl22_g00_f003.png');
  });
});

describe('schoolFramePath — §6.3 spellbook corner-ornament frame, one set per school', () => {
  test('each of the 4 schools with a governing secondary skill maps to its own set', () => {
    assert.equal(schoolFramePath('earth', 'none'), 'systems/heroes-glory/assets/spellbook/spleve/spleve_g00_f000.png');
    assert.equal(schoolFramePath('air', 'none'), 'systems/heroes-glory/assets/spellbook/spleva/spleva_g00_f000.png');
    assert.equal(schoolFramePath('water', 'none'), 'systems/heroes-glory/assets/spellbook/splevw/splevw_g00_f000.png');
    assert.equal(schoolFramePath('fire', 'none'), 'systems/heroes-glory/assets/spellbook/splevf/splevf_g00_f000.png');
  });

  test('frame index tracks the mastery variant: none/basic/advanced/expert -> f000..f003', () => {
    assert.equal(schoolFramePath('fire', 'none'), 'systems/heroes-glory/assets/spellbook/splevf/splevf_g00_f000.png');
    assert.equal(schoolFramePath('fire', 'basic'), 'systems/heroes-glory/assets/spellbook/splevf/splevf_g00_f001.png');
    assert.equal(schoolFramePath('fire', 'advanced'), 'systems/heroes-glory/assets/spellbook/splevf/splevf_g00_f002.png');
    assert.equal(schoolFramePath('fire', 'expert'), 'systems/heroes-glory/assets/spellbook/splevf/splevf_g00_f003.png');
  });

  test('universal school has no frame set — returns null', () => {
    assert.equal(schoolFramePath('universal', 'none'), null);
  });
});

describe('every path the icon helpers return exists in assets/', () => {
  const exists = (p) => existsSync(fileURLToPath(new URL(`../${p.replace('systems/heroes-glory/', '')}`, import.meta.url)));
  const source = readFileSync(fileURLToPath(new URL('../module/helpers/skill-icons.mjs', import.meta.url)), 'utf8');
  const table = source.slice(source.indexOf('const SECONDARY_SKILL_FRAMES'));
  const skillKeys = [...table.slice(0, table.indexOf('};')).matchAll(/^\s+(\w+): \{ base/gm)].map((m) => m[1]);

  test('primary skills, Experience, Mana — small and large', () => {
    for (const key of ['attack', 'defense', 'magicPower', 'knowledge', 'experience', 'mana']) {
      for (const large of [false, true]) assert.ok(exists(primarySkillIconPath(key, { large })), `${key} large=${large}`);
    }
  });

  test('all 21 secondary skills, every tier, small and large, plus the empty frame', () => {
    assert.equal(skillKeys.length, 21);
    for (const key of skillKeys) {
      for (const tier of ['base', 'advanced', 'expert']) {
        for (const large of [false, true]) assert.ok(exists(secondarySkillIconPath(key, tier, { large })), `${key} ${tier} large=${large}`);
      }
    }
    for (const large of [false, true]) assert.ok(exists(secondarySkillEmptyIconPath({ large })), `empty large=${large}`);
  });

  test('Боевой дух and Удача −3…+3 in every size', () => {
    for (let v = -3; v <= 3; v++) {
      for (const opts of [{}, { large: true }, { small: true }]) assert.ok(exists(moraleIconPath(v, opts)), `morale ${v} ${JSON.stringify(opts)}`);
      for (const opts of [{}, { large: true }]) assert.ok(exists(luckIconPath(v, opts)), `luck ${v} ${JSON.stringify(opts)}`);
    }
  });
});

describe('speedIconPath / visionIconPath', () => {
  test('Скорость — winged foot', () => {
    assert.equal(speedIconPath(), 'systems/heroes-glory/assets/game-icons/lorc-wingfoot.svg');
  });
  test('each vision type has its own icon', () => {
    const v = (n) => `systems/heroes-glory/assets/game-icons/${n}.svg`;
    assert.equal(visionIconPath('normal'), v('lorc-semi-closed-eye'));
    assert.equal(visionIconPath('darkvision'), v('lorc-beast-eye'));
    assert.equal(visionIconPath('nightvision'), v('lorc-moon'));
    assert.equal(visionIconPath('blindsense'), v('skoll-sight-disabled'));
  });
  test('unknown vision falls back to normal', () => {
    assert.equal(visionIconPath('nope'), 'systems/heroes-glory/assets/game-icons/lorc-semi-closed-eye.svg');
  });
});
