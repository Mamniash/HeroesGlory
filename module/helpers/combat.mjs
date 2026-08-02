/**
 * §5.8: "Боевой дух: после боя восстанавливается до 0" — reset every
 * fighting actor's Боевой дух and clear its per-battle attempt counter
 * once the encounter ends. Foundry has no explicit "combat ended" event;
 * a Combat document is deleted when the tracker's own end-combat control
 * is used, so `deleteCombat` is the hook that means "the battle is over"
 * here, same as it does for other Foundry systems.
 * @param {Combat} combat
 */
export function resetMoraleAfterCombat(combat) {
  const actors = new Set(combat.combatants.map((combatant) => combatant.actor).filter(Boolean));
  for (const actor of actors) {
    if (actor.system.morale === undefined) continue;
    actor.update({ 'system.morale': 0 });
    actor.unsetFlag('heroes-glory', 'moraleUsed');
  }
}
