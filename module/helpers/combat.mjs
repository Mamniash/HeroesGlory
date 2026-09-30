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
  // deleteCombat fires on every client; only the active GM writes.
  if (game.users.activeGM !== game.user) return;
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
  if (game.users.activeGM !== game.user) return;
  const actors = new Set(combat.combatants.map((combatant) => combatant.actor).filter(Boolean));
  const { prone, unconscious, defending, surprised } = CONFIG.HEROES_GLORY.statusEffects;
  for (const actor of actors) {
    if (actor.statuses.has(prone)) actor.toggleStatusEffect(prone, { active: false });
    if (actor.statuses.has(unconscious)) actor.toggleStatusEffect(unconscious, { active: false });
    if (actor.statuses.has(surprised)) actor.toggleStatusEffect(surprised, { active: false });
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
  if (game.users.activeGM !== game.user) return;
  if (!changes?.duration?.expired) return;
  if (!effect.statuses.has(CONFIG.HEROES_GLORY.statusEffects.defending)) return;
  effect.delete();
}

/** Flag on an ActiveEffect a stage-2 spell put on its target (roll-actions.mjs). */
const SPELL_EFFECT_FLAG = 'spellEffect';

/**
 * §6.4, stage 2: a spell effect whose Сила Магии rounds ran out at the
 * start of its caster's turn (p. 32) — core only marks it expired
 * (CONFIG.ActiveEffect.expiryAction "update"); remove it so its token icon
 * goes too, as with «Защита». Active GM only, once.
 * @param {ActiveEffect} effect
 * @param {object} changes
 */
export function expireSpellEffect(effect, changes) {
  if (game.users.activeGM !== game.user) return;
  if (!changes?.duration?.expired) return;
  if (!effect.getFlag('heroes-glory', SPELL_EFFECT_FLAG)) return;
  effect.delete();
}

/**
 * §6.4, stage 2 (rules.md §11): the battle's over, the rounds stopped —
 * every spell effect cast in it goes, wherever it sits: world actors and
 * the tokens (unlinked ones included) on the combat's scene.
 * @param {Combat} combat
 */
export async function clearSpellEffectsAfterCombat(combat) {
  if (game.users.activeGM !== game.user) return;
  const actors = new Set(game.actors);
  const scene = combat.scene ?? game.scenes.get(combat._source?.scene);
  for (const token of scene?.tokens ?? []) if (token.actor) actors.add(token.actor);
  for (const combatant of combat.combatants) if (combatant.actor) actors.add(combatant.actor);
  for (const actor of actors) {
    const ids = actor.effects
      .filter((e) => e.getFlag('heroes-glory', SPELL_EFFECT_FLAG)?.combatId === combat.id)
      .map((e) => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
  }
}

/**
 * Which combat an actor fights in, when the world holds several — `game.combat`
 * is only the one the tracker shows, not necessarily the actor's. Among the
 * started combats the actor takes part in: the one on screen, else the one
 * marked active for its scene, else the most recently created. Pure: the
 * candidates are already filtered to started combats with the actor in them.
 * @template T
 * @param {Array<{combat: T, viewed: boolean, active: boolean, created: number}>} candidates
 * @returns {T|null}
 */
export function chooseActorCombat(candidates = []) {
  if (!candidates.length) return null;
  const viewed = candidates.find((c) => c.viewed);
  if (viewed) return viewed.combat;
  const active = candidates.filter((c) => c.active);
  const pool = active.length ? active : candidates;
  return pool.reduce((best, c) => (c.created > best.created ? c : best)).combat;
}

/**
 * The started combat `actor` takes part in (chooseActorCombat), and its
 * combatant there. `null` when it fights in none.
 * @param {Actor} actor
 * @returns {{combat: Combat, combatant: Combatant}|null}
 */
export function actorCombat(actor) {
  if (!actor) return null;
  const candidates = [];
  for (const combat of game.combats) {
    if (!combat.started) continue;
    const combatant = combat.getCombatantsByActor(actor)[0];
    if (!combatant) continue;
    candidates.push({
      combat: { combat, combatant },
      viewed: combat === game.combat,
      active: !!combat.active,
      created: combat._stats?.createdTime ?? 0,
    });
  }
  return chooseActorCombat(candidates);
}

/**
 * Core stamps a new effect's `start` (the moment its duration counts from)
 * off `game.combat` — the combat on screen, which may be someone else's.
 * «Защита» from the token HUD would then count against the wrong battle.
 * Before an actor's effect is created without a `start` of its own, stamp it
 * off the actor's own combat instead (actorCombat). Spell effects bring
 * their own `start`, frozen at the cast, and are left alone.
 * @param {ActiveEffect} effect
 * @param {object} data   the creation data as passed in
 */
export function stampEffectStartFromActorCombat(effect, data) {
  if (data?.start?.combat) return;
  const actor = effect.parent;
  if (!(actor instanceof Actor)) return;
  const found = actorCombat(actor);
  if (!found || effect._source.start?.combat === found.combat.id) return;
  effect.updateSource({ start: effect.constructor.getEffectStart(found.combat) });
}
