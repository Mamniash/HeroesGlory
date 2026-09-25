/**
 * §5.8: "Боевой дух: после боя восстанавливается до 0" — for a hero,
 * back to its base (Лидерство, Минотавр; rules.md §11): `system.morale`
 * in the source is only the manual correction, so writing 0 there
 * leaves the skill/race part in place. Reset every
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
    // A creature's `system.morale` is the GM's own value for it, not a
    // correction on top of a base — only its attempt counter resets.
    if (actor.type === 'hero') actor.update({ 'system.morale': 0 });
    actor.unsetFlag('heroes-glory', 'moraleUsed');
  }
}

/**
 * §5.6: "Встаёт в свой ход" (Падение) / "до конца боя" (Без сознания) —
 * both explicitly last only through the end of the battle, unlike
 * Недееспособен (§5.9, deliberately left alone here): that one persists
 * past combat's end on purpose, since it's only resolved by the
 * post-battle check or being helped (see roll-actions.mjs).
 * @param {Combat} combat
 */
export function clearCombatStatesAfterCombat(combat) {
  const actors = new Set(combat.combatants.map((combatant) => combatant.actor).filter(Boolean));
  const { prone, unconscious, defending } = CONFIG.HEROES_GLORY.statusEffects;
  for (const actor of actors) {
    if (actor.statuses.has(prone)) actor.toggleStatusEffect(prone, { active: false });
    if (actor.statuses.has(unconscious)) actor.toggleStatusEffect(unconscious, { active: false });
    if (actor.effects.some((e) => e.statuses.has(defending))) actor.toggleStatusEffect(defending, { active: false });
  }
}

/**
 * §5.2: «Защита» lasts "до начала следующего хода". The core effect
 * registry only marks an effect `duration.expired` (CONFIG.ActiveEffect.
 * expiryAction "update"), which already stops it applying; this removes
 * the expired «Защита» outright so its token icon goes too. Run by the
 * active GM only, once.
 * @param {ActiveEffect} effect
 * @param {object} changes
 */
export function expireDefending(effect, changes) {
  if (!game.user.isActiveGM) return;
  if (!changes?.duration?.expired) return;
  if (!effect.statuses.has(CONFIG.HEROES_GLORY.statusEffects.defending)) return;
  effect.delete();
}
