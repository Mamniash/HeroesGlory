import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { specializationModifiers } from '../module/helpers/specializations.mjs';
import { buildEffectChanges, applyModifiers } from '../module/helpers/modifiers.mjs';
import { applyWoundPenalty } from '../module/helpers/wounds.mjs';
import { manaMultiplier } from '../module/helpers/mana.mjs';

/**
 * §4.3, «Интеллект» +50 Маны: the stored effect became an in-memory one
 * (documents/actor.mjs, `allApplicableEffects`). Mana must come out the same
 * as before, a multiplying artifact included. Core applies one phase's
 * changes sorted by priority — applyModifiers mirrors that order.
 */

/** The old stored effect's changes, as read from the test world. */
const OLD_EFFECT_CHANGES = [{ key: 'system.mana.max', type: 'add', value: 50, phase: 'final' }];

/** Max Mana as prepareDerivedData computes it (actor-hero.mjs). */
const derivedMana = ({ knowledge, intellectTier = null, wounds = 0 }) => applyWoundPenalty(knowledge * manaMultiplier(intellectTier), wounds);

/** The "final" phase on `mana.max`: every change, by core's priority. */
const finalMana = (derived, changes) => applyModifiers(derived, changes
  .filter((c) => c.key === 'system.mana.max' && c.phase === 'final')
  .map((c) => ({ mode: c.type, value: c.value })));

const artifactChanges = (modifiers) => buildEffectChanges(modifiers);

describe('«Интеллект» +50 Маны — the in-memory effect gives the old result', () => {
  test('its changes are exactly the old stored effect\'s', () => {
    assert.deepEqual(buildEffectChanges(specializationModifiers('skill', 'intellect')), OLD_EFFECT_CHANGES);
  });

  test('Маг из «Тест заклинаний» (Знания 100, без Интеллекта, 1 Ранение, «Клон»): 995 до и после', () => {
    const derived = derivedMana({ knowledge: 100, wounds: 1 });
    assert.equal(derived, 995);
    const before = finalMana(derived, []); // «Клон» had no effect
    const after = finalMana(derived, buildEffectChanges(specializationModifiers('spell', 'Клон')));
    assert.equal(before, 995);
    assert.equal(after, 995);
  });

  test('«Интеллект» and a made-up artifact «×2, +10 Маны» (Знания 1, 1 Ранение): 70 before and after', () => {
    const derived = derivedMana({ knowledge: 1, wounds: 1 });
    assert.equal(derived, 5);
    const artifact = artifactChanges([{ stat: 'mana.max', mode: 'multiply', value: 2 }, { stat: 'mana.max', mode: 'add', value: 10 }]);
    const before = finalMana(derived, [...artifact, ...OLD_EFFECT_CHANGES]);
    const after = finalMana(derived, [...artifact, ...buildEffectChanges(specializationModifiers('skill', 'intellect'))]);
    assert.equal(before, 70); // 5 × 2 + 50 + 10
    assert.equal(after, 70);
    // Adding the +50 in prepareDerivedData instead would have changed it:
    assert.equal(finalMana(derived + 50, artifact), 120); // (5 + 50) × 2 + 10
  });

  test('«Щит проклятых» (+10 Маны, the one book artifact on Mana) with «Интеллект»: unchanged too', () => {
    const derived = derivedMana({ knowledge: 5, intellectTier: 'expert' });
    const artifact = artifactChanges([{ stat: 'mana.max', mode: 'add', value: 10 }]);
    assert.equal(finalMana(derived, [...artifact, ...OLD_EFFECT_CHANGES]), 135);
    assert.equal(finalMana(derived, [...artifact, ...buildEffectChanges(specializationModifiers('skill', 'intellect'))]), 135);
  });
});
