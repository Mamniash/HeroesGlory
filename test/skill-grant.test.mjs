import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { canonicalSkillNameFromRuStrings } from '../module/helpers/skill-grant.mjs';

const RU_STRINGS = {
  HEROES_GLORY: {
    SecondarySkill: {
      Armor: 'Доспехи',
      Pathfinding: 'Поиск пути',
    },
  },
};

describe('canonicalSkillNameFromRuStrings — skill-grant.mjs fallback path', () => {
  test('resolves a known key to the book\'s Russian name, independent of any client language', () => {
    assert.equal(canonicalSkillNameFromRuStrings(RU_STRINGS, 'HEROES_GLORY.SecondarySkill.Armor', 'armor'), 'Доспехи');
    assert.equal(canonicalSkillNameFromRuStrings(RU_STRINGS, 'HEROES_GLORY.SecondarySkill.Pathfinding', 'pathfinding'), 'Поиск пути');
  });

  test('falls back to skillKey when configKey is missing (unknown secondary-skill key)', () => {
    assert.equal(canonicalSkillNameFromRuStrings(RU_STRINGS, undefined, 'someUnknownKey'), 'someUnknownKey');
  });

  test('falls back to skillKey when the path does not resolve in ruStrings (compendium AND lang drifted apart)', () => {
    assert.equal(canonicalSkillNameFromRuStrings(RU_STRINGS, 'HEROES_GLORY.SecondarySkill.Whatever', 'whatever'), 'whatever');
  });

  test('falls back to skillKey when ruStrings itself failed to load (empty object)', () => {
    assert.equal(canonicalSkillNameFromRuStrings({}, 'HEROES_GLORY.SecondarySkill.Armor', 'armor'), 'armor');
  });

  test('falls back to skillKey when the resolved value is not a string (malformed lang file)', () => {
    const malformed = { HEROES_GLORY: { SecondarySkill: { Armor: { nested: true } } } };
    assert.equal(canonicalSkillNameFromRuStrings(malformed, 'HEROES_GLORY.SecondarySkill.Armor', 'armor'), 'armor');
  });
});
