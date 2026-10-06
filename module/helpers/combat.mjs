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

/**
 * Слепота (p. 59, rules.md §11), `combatTurnChange`: when the blinded one's
 * turn comes, a line in the chat says it skips the turn — the GM passes the
 * turn on, as after a failed Боевой дух test; when that turn is over, the
 * spell is gone. Active GM only.
 * @param {Combat} combat
 * @param {{combatantId?: string}} previous
 * @param {{combatantId?: string}} current
 */
export async function advanceBlindness(combat, previous, current) {
  if (game.users.activeGM !== game.user) return;
  const blindEffects = (actor) => (actor?.effects ?? [])
    .filter((effect) => effect.getFlag('heroes-glory', SPELL_EFFECT_FLAG)?.skipsTurn);
  const ended = combat.combatants.get(previous?.combatantId ?? '');
  for (const effect of blindEffects(ended?.actor)) {
    if (effect.getFlag('heroes-glory', SPELL_EFFECT_FLAG).turnSkipped) await effect.delete();
  }
  if (previous?.combatantId === current?.combatantId) return;
  const now = combat.combatants.get(current?.combatantId ?? '');
  const pending = blindEffects(now?.actor).filter((effect) => !effect.getFlag('heroes-glory', SPELL_EFFECT_FLAG).turnSkipped);
  if (!pending.length) return;
  for (const effect of pending) {
    await effect.setFlag('heroes-glory', SPELL_EFFECT_FLAG, { ...effect.getFlag('heroes-glory', SPELL_EFFECT_FLAG), turnSkipped: true });
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: now.actor, token: now.token }),
    content: `<p>${foundry.utils.escapeHTML(game.i18n.format('HEROES_GLORY.Roll.BlindSkipTurn', { name: now.name }))}</p>`,
  });
}

/** Region flag: a field spell (group Г, roll-actions.mjs's confirmFieldSpell). */
const FIELD_FLAG = 'fieldSpell';

/**
 * §6.4, group Г (p. 32): Силовое Поле and Стена Огня last Сила Магии rounds
 * and end at the start of the caster's turn, like the lasting effects
 * (`expiresRound`, fieldExpiresRound). Active GM only.
 * @param {Combat} combat
 * @param {{combatantId?: string}} previous
 * @param {{combatantId?: string}} current
 */
export async function expireFieldSpells(combat, previous, current) {
  if (game.users.activeGM !== game.user) return;
  const scene = combat.scene;
  if (!scene) return;
  const now = current?.combatantId ?? null;
  const ended = scene.regions.filter((region) => {
    const data = region.getFlag('heroes-glory', FIELD_FLAG);
    return data && data.combatId === combat.id && data.expiresRound != null
      && data.casterCombatant === now && combat.round >= data.expiresRound;
  });
  if (ended.length) await scene.deleteEmbeddedDocuments('Region', ended.map((region) => region.id));
}

/**
 * §6.4, group Г: the battle's over — every field spell cast in it goes.
 * Active GM only.
 * @param {Combat} combat
 */
export async function clearFieldSpellsAfterCombat(combat) {
  if (game.users.activeGM !== game.user) return;
  for (const scene of game.scenes) {
    const ids = scene.regions.filter((region) => region.getFlag('heroes-glory', FIELD_FLAG)?.combatId === combat.id)
      .map((region) => region.id);
    if (ids.length) await scene.deleteEmbeddedDocuments('Region', ids);
  }
}

/**
 * Token flag: a summoned elemental or a clone (group Д, roll-actions.mjs's
 * confirmSummonSpell) — `{kind, casterUuid, casterName, castId, spellName,
 * combatId, casterCombatant, expiresRound}`.
 */
export const SUMMONED_FLAG = 'summoned';

/**
 * The summoned flag of an actor's token — an unlinked token's synthetic
 * actor carries it through `actor.token`.
 * @param {Actor|null|undefined} actor
 * @returns {object|null}
 */
export function summonedData(actor) {
  return actor?.token?.getFlag('heroes-glory', SUMMONED_FLAG) ?? null;
}

/**
 * Group Д: a summoned elemental or a clone goes — its token and its place in
 * every battle, and a line in the chat when there's a reason to tell
 * (rules.md §11: «а затем исчезает»). Active GM only; nothing is left in the
 * world but the shared base actor.
 * @param {TokenDocument} tokenDoc
 * @param {string|null} [lineKey]   HEROES_GLORY.Roll.* key, {name}
 */
export async function dismissSummoned(tokenDoc, lineKey = null) {
  if (game.users.activeGM !== game.user || !tokenDoc?.parent?.tokens.has(tokenDoc.id)) return;
  const name = tokenDoc.name;
  for (const combat of game.combats) {
    const ids = combat.combatants.filter((c) => c.tokenId === tokenDoc.id && c.sceneId === tokenDoc.parent.id).map((c) => c.id);
    if (ids.length) await combat.deleteEmbeddedDocuments('Combatant', ids);
  }
  await tokenDoc.delete();
  if (lineKey) {
    await ChatMessage.create({
      content: `<p>${foundry.utils.escapeHTML(game.i18n.format(`HEROES_GLORY.Roll.${lineKey}`, { name }))}</p>`,
    });
  }
}

/**
 * The summoned tokens on every scene that pass `test`.
 * @param {(data: object, token: TokenDocument) => boolean} test
 * @returns {TokenDocument[]}
 */
export function summonedTokens(test) {
  const found = [];
  for (const scene of game.scenes) {
    for (const token of scene.tokens) {
      const data = token.getFlag('heroes-glory', SUMMONED_FLAG);
      if (data && test(data, token)) found.push(token);
    }
  }
  return found;
}

/**
 * Group Д (p. 61: «служит вам количество раундов, равное СМ»; Клон —
 * «Длительность = СМ»): at the start of the caster's turn in the round it
 * runs out, the summoned one goes, as the lasting effects do. Active GM only.
 * @param {Combat} combat
 * @param {{combatantId?: string}} previous
 * @param {{combatantId?: string}} current
 */
export async function expireSummons(combat, previous, current) {
  if (game.users.activeGM !== game.user) return;
  const now = current?.combatantId ?? null;
  const ended = summonedTokens((data) => data.combatId === combat.id && data.expiresRound != null
    && data.casterCombatant === now && combat.round >= data.expiresRound);
  for (const token of ended) await dismissSummoned(token, 'SummonExpired');
}

/**
 * Group Д: the battle's over — whatever was summoned or cloned in it goes.
 * Active GM only.
 * @param {Combat} combat
 */
export async function clearSummonsAfterCombat(combat) {
  if (game.users.activeGM !== game.user) return;
  for (const token of summonedTokens((data) => data.combatId === combat.id)) await dismissSummoned(token);
}

/**
 * Actor flag: raised by Воскрешение without Продвинутый (roll-actions.mjs's
 * confirmSupportSpell) — `{combatId, dead}`, the battle whose end takes it
 * back down.
 */
export const RESURRECTED_FLAG = 'resurrected';

/**
 * §6.4, group В (p. 54, rules.md §11): «В конце битвы персонаж снова
 * погибнет» — a dead one raised by Воскрешение without Продвинутый is
 * «повержен» again, an incapacitated one «недееспособен» again (Health 0),
 * and the post-battle check takes it from there. Active GM only.
 * @param {Combat} combat
 */
export async function endTemporaryResurrections(combat) {
  if (game.users.activeGM !== game.user) return;
  const actors = new Set(combat.combatants.map((combatant) => combatant.actor).filter(Boolean));
  for (const actor of actors) {
    const mark = actor.getFlag('heroes-glory', RESURRECTED_FLAG);
    if (!mark || mark.combatId !== combat.id) continue;
    await actor.unsetFlag('heroes-glory', RESURRECTED_FLAG);
    if (mark.dead) {
      // Dead again: no «недееспособен» on the way (documents/actor.mjs).
      await actor.update({ 'system.health.value': 0 }, { 'heroes-glory': { keepStatuses: true } });
      await actor.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true });
    } else {
      await actor.update({ 'system.health.value': 0 });
    }
  }
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
