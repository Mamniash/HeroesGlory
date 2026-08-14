import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  primarySkillIconPath,
  secondarySkillIconPath,
  moraleIconPath,
  luckIconPath,
  schoolFramePath,
} from '../module/helpers/skill-icons.mjs';

describe('primarySkillIconPath — static per-slot frames', () => {
  test('one frame per primary stat plus Experience/Mana', () => {
    assert.equal(primarySkillIconPath('attack'), 'systems/heroes-glory/assets/pskil42/pskil42_g00_f000.png');
    assert.equal(primarySkillIconPath('defense'), 'systems/heroes-glory/assets/pskil42/pskil42_g00_f001.png');
    assert.equal(primarySkillIconPath('magicPower'), 'systems/heroes-glory/assets/pskil42/pskil42_g00_f002.png');
    assert.equal(primarySkillIconPath('knowledge'), 'systems/heroes-glory/assets/pskil42/pskil42_g00_f005.png');
    assert.equal(primarySkillIconPath('experience'), 'systems/heroes-glory/assets/pskil42/pskil42_g00_f004.png');
    assert.equal(primarySkillIconPath('mana'), 'systems/heroes-glory/assets/pskil42/pskil42_g00_f003.png');
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
      'systems/heroes-glory/assets/secskill/secskill_g00_f021.png'
    );
    assert.equal(
      secondarySkillIconPath('leadership', 'advanced'),
      'systems/heroes-glory/assets/secskill/secskill_g00_f022.png'
    );
    assert.equal(
      secondarySkillIconPath('leadership', 'expert'),
      'systems/heroes-glory/assets/secskill/secskill_g00_f023.png'
    );
  });

  test('the first and last table rows', () => {
    assert.equal(
      secondarySkillIconPath('pathfinding', 'base'),
      'systems/heroes-glory/assets/secskill/secskill_g00_f003.png'
    );
    assert.equal(
      secondarySkillIconPath('healing', 'expert'),
      'systems/heroes-glory/assets/secskill/secskill_g00_f086.png'
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
    assert.equal(moraleIconPath(-3), 'systems/heroes-glory/assets/imrl42/imrl42_g00_f000.png');
    assert.equal(moraleIconPath(0), 'systems/heroes-glory/assets/imrl42/imrl42_g00_f003.png');
    assert.equal(moraleIconPath(3), 'systems/heroes-glory/assets/imrl42/imrl42_g00_f006.png');
    assert.equal(luckIconPath(-3), 'systems/heroes-glory/assets/ilck42/ilck42_g00_f000.png');
    assert.equal(luckIconPath(3), 'systems/heroes-glory/assets/ilck42/ilck42_g00_f006.png');
  });

  test('clamps values outside -3..+3 rather than picking a nonexistent frame', () => {
    assert.equal(moraleIconPath(5), 'systems/heroes-glory/assets/imrl42/imrl42_g00_f006.png');
    assert.equal(moraleIconPath(-9), 'systems/heroes-glory/assets/imrl42/imrl42_g00_f000.png');
  });

  test('the large (82x93) variant uses the imrl82/ilck82 sets', () => {
    assert.equal(moraleIconPath(0, { large: true }), 'systems/heroes-glory/assets/imrl82/imrl82_g00_f003.png');
    assert.equal(luckIconPath(0, { large: true }), 'systems/heroes-glory/assets/ilck82/ilck82_g00_f003.png');
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
