import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { chooseActorCombat } from '../module/helpers/combat.mjs';

// Candidates are the started combats the actor takes part in (actorCombat
// filters them); `game.combat` is only the one the tracker shows.
describe('chooseActorCombat — the actor\'s own combat, not the one on screen', () => {
  test('not in any started combat: none', () => {
    assert.equal(chooseActorCombat([]), null);
  });

  test('two combats in the world, the tracker shows the other one: the actor\'s combat', () => {
    // «Элементали» is on screen but the caster isn't in it, so it never
    // becomes a candidate — only the caster's own battle does.
    assert.equal(chooseActorCombat([{ combat: 'own', viewed: false, active: false, created: 1 }]), 'own');
  });

  test('in two combats: the one on screen wins', () => {
    assert.equal(chooseActorCombat([
      { combat: 'older', viewed: false, active: true, created: 1 },
      { combat: 'shown', viewed: true, active: false, created: 0 },
    ]), 'shown');
  });

  test('in two combats, neither on screen: the active one, then the newest', () => {
    assert.equal(chooseActorCombat([
      { combat: 'new', viewed: false, active: false, created: 5 },
      { combat: 'active', viewed: false, active: true, created: 1 },
    ]), 'active');
    assert.equal(chooseActorCombat([
      { combat: 'old', viewed: false, active: false, created: 1 },
      { combat: 'new', viewed: false, active: false, created: 5 },
    ]), 'new');
  });
});
