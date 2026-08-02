/**
 * Foundry-facing roll orchestration: builds and evaluates Rolls, reads
 * `game.user.targets`, posts ChatMessages. All the actual rules
 * interpretation is delegated to the pure functions in rolls.mjs — this
 * file only sequences them against the live game state.
 */
import {
  resolveHit,
  resolveDefeat,
  resolveDamage,
  resolvePotentialDamage,
  resolveEpicTableRow,
  resolveEpicSeverity,
  resolveHitLocation,
  SCHOOL_SKILL_KEYS,
  resolveSpellVariant,
  canAffordSpell,
  resolveAbilityCheck,
  nextLuck,
  canRerollWithLuck,
  moraleAttemptsRemaining,
  resolveMoraleCheck,
  resolveTargetStateMultiplier,
  resolvePostBattleCheck,
  POST_BATTLE_RECOVERY_HEALTH,
  POST_BATTLE_RECOVERY_MANA,
} from './rolls.mjs';
import { buildEffectChanges } from './modifiers.mjs';

/** The flag namespace every roll-related ChatMessage flag lives under. */
const FLAG_SCOPE = 'heroes-glory';

const SPELL_VARIANT_LABELS = {
  none: 'HEROES_GLORY.Spell.VariantNone',
  basic: 'HEROES_GLORY.Spell.VariantBasic',
  advanced: 'HEROES_GLORY.Spell.VariantAdvanced',
  expert: 'HEROES_GLORY.Spell.VariantExpert',
};

const PRIMARY_SKILL_LABELS = {
  attack: 'HEROES_GLORY.Hero.Attack',
  defense: 'HEROES_GLORY.Hero.Defense',
  magicPower: 'HEROES_GLORY.Hero.MagicPower',
  knowledge: 'HEROES_GLORY.Hero.Knowledge',
};

const HIT_LABELS = {
  miss: 'HEROES_GLORY.Roll.Hit.Miss',
  graze: 'HEROES_GLORY.Roll.Hit.Graze',
  hit: 'HEROES_GLORY.Roll.Hit.Hit',
  strongHit: 'HEROES_GLORY.Roll.Hit.StrongHit',
  epic: 'HEROES_GLORY.Roll.Hit.Epic',
};

const LOCATION_LABELS = {
  leg: { labelKey: 'HEROES_GLORY.Roll.Location.Leg', effectKey: 'HEROES_GLORY.Roll.Location.LegEffect' },
  arm: { labelKey: 'HEROES_GLORY.Roll.Location.Arm', effectKey: 'HEROES_GLORY.Roll.Location.ArmEffect' },
  torso: { labelKey: 'HEROES_GLORY.Roll.Location.Torso', effectKey: 'HEROES_GLORY.Roll.Location.TorsoEffect' },
  head: { labelKey: 'HEROES_GLORY.Roll.Location.Head', effectKey: 'HEROES_GLORY.Roll.Location.HeadEffect' },
};

/**
 * §5.4: epic cascade — table row, then a repeat d6 for severity, then
 * (only if severe) the "Куда попал" location roll. Each step depends on
 * the previous result, so these can't be folded into one Roll. Re-run
 * wholesale (fresh dice) whenever the *hit* die changes, since the hit
 * die is what decides whether an epic even happened — a reroll of the
 * *defeat* die never touches this.
 * @param {{epic: boolean}} hit
 * @param {string[]|null} epicTable
 * @param {boolean} legendary
 * @returns {Promise<{rolls: Roll[], epicRow: string|null, severe: boolean, location: string|null}>}
 */
async function rollEpicCascade(hit, epicTable, legendary) {
  const rolls = [];
  let epicRow = null;
  let severe = false;
  let location = null;

  if (hit.epic && epicTable) {
    const tableRoll = new Roll('1d6');
    await tableRoll.evaluate();
    rolls.push(tableRoll);
    epicRow = resolveEpicTableRow(tableRoll.dice[0].total, epicTable);

    const severityRoll = new Roll('1d6');
    await severityRoll.evaluate();
    rolls.push(severityRoll);
    severe = resolveEpicSeverity(severityRoll.dice[0].total, { legendary });

    if (severe) {
      const locationRoll = new Roll('1d6');
      await locationRoll.evaluate();
      rolls.push(locationRoll);
      location = resolveHitLocation(locationRoll.dice[0].total);
    }
  }

  return { rolls, epicRow, severe, location };
}

/**
 * §5.4/§5.6: the mechanical half of a severe epic hit's "Куда попал"
 * result. Торс and голова toggle the same real, iconed statuses a GM
 * could otherwise apply by hand from the token HUD. Нога gets a real
 * -1 Speed ActiveEffect, built the same way an artifact's structured
 * modifier would be (see modifiers.mjs) — it persists "до излечения"
 * rather than clearing when the battle ends, so unlike prone/
 * unconscious it isn't touched by combat.mjs's combat-end cleanup, and
 * stacks if the same leg (or the other one) gets hit again since the
 * book gives no rule against that. Рука stays chat-text-only — the
 * existing template already shows that message, and the task
 * explicitly scopes it to "не трогаем инвентарь".
 * @param {Actor} targetActor
 * @param {string|null} location   'leg' | 'arm' | 'torso' | 'head' | null.
 * @returns {Promise<void>}
 */
async function applyLocationConsequence(targetActor, location) {
  if (location === 'torso') {
    await targetActor.toggleStatusEffect(CONFIG.HEROES_GLORY.statusEffects.prone, { active: true });
  } else if (location === 'head') {
    await targetActor.toggleStatusEffect(CONFIG.HEROES_GLORY.statusEffects.unconscious, { active: true });
  } else if (location === 'leg') {
    await targetActor.createEmbeddedDocuments('ActiveEffect', [{
      name: game.i18n.localize('HEROES_GLORY.Roll.Location.LegEffect'),
      img: 'icons/svg/downgrade.svg',
      system: { changes: buildEffectChanges([{ stat: 'speed', mode: 'subtract', value: 1 }]) },
    }]);
  }
}

/**
 * §5.9: an attack against an incapacitated target needs no dice at all —
 * it's an automatic, permanent kill — so it's gated behind an explicit
 * confirmation instead of resolving on the same click every other
 * attack uses. Marks the target with core's own "defeated" status
 * (shows the standard skull overlay, doesn't delete anything) rather
 * than deleting the Actor document — "не должен стирать чужого
 * персонажа" is about preventing an accidental *destructive* click, not
 * an instruction to actually erase the character sheet.
 * @param {Actor} actor          The attacker.
 * @param {Actor} targetActor    The incapacitated target.
 * @returns {Promise<ChatMessage|null>}   `null` if the attacker declined.
 */
async function killIncapacitatedTarget(actor, targetActor) {
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: 'HEROES_GLORY.Roll.KillConfirmTitle' },
    content: `<p>${game.i18n.format('HEROES_GLORY.Roll.KillConfirmContent', { attacker: actor.name, target: targetActor.name })}</p>`,
  });
  if (!confirmed) return null;

  await targetActor.toggleStatusEffect(CONFIG.HEROES_GLORY.statusEffects.incapacitated, { active: false });
  await targetActor.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true });

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/kill-incapacitated.hbs',
    { attackerName: actor.name, targetName: targetActor.name },
  );

  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}

/**
 * Rebuild the attack chat card's render context from the persisted
 * `heroes-glory.reroll` flag state. Pulled out of {@link rollAttack} so
 * {@link rerollAttackDie} can recompute the exact same card after either
 * die changes — hit and defeat are independent inputs to `resolveDamage`,
 * so either one can be recomputed alone from the flag state without
 * touching the other. `stateMultiplier` is captured once at attack time
 * (see rollAttack) and never re-read live, so a status this same attack
 * just caused can't retroactively inflate its own damage.
 * @param {Actor} actor
 * @param {object} flags   The persisted `reroll` flag object (see rollAttack).
 * @returns {object}   Context for templates/chat/attack-roll.hbs.
 */
function buildAttackContext(actor, flags) {
  const hit = resolveHit(flags.hitDie);
  const defeat = resolveDefeat({
    attackerAttack: flags.attackerAttack,
    targetDefense: flags.targetDefense,
    die: flags.defeatDie,
  });
  // §5.6: the target's prone/unconscious state multiplies damage on top
  // of the d6 hit-table multiplier — folded into a combined "effective
  // hit" so resolveDamage/resolvePotentialDamage need no changes at all.
  const effectiveHit = { ...hit, multiplier: hit.multiplier * flags.stateMultiplier };
  const damage = resolveDamage({ baseDamage: flags.baseDamage, hit: effectiveHit, defeat });
  const potentialDamage = resolvePotentialDamage({ baseDamage: flags.baseDamage, hit: effectiveHit });

  return {
    attackerName: actor.name,
    weaponName: flags.weaponName,
    targetName: flags.targetName,
    hit: { ...hit, labelKey: HIT_LABELS[hit.key], previousDie: flags.previousHitDie ?? null },
    defeat: { ...defeat, previousDie: flags.previousDefeatDie ?? null },
    stateMultiplier: flags.stateMultiplier,
    damage,
    damageKnown: damage !== null,
    potentialDamage,
    hasEpicTable: flags.hasEpicTable,
    epicRow: flags.epicRow,
    severe: flags.severe,
    location: flags.location ? LOCATION_LABELS[flags.location] : null,
    actorId: actor.id,
  };
}

/**
 * §5.3/§5.4: roll an attack, either with a hero's equipped weapon or with
 * a creature's own stats, against whatever's in `game.user.targets`.
 * @param {Actor} actor          The attacking hero or creature.
 * @param {Item|null} [weapon]   The weapon item, for a hero attack; omit
 *                               for a creature attacking with its own stats.
 * @returns {Promise<ChatMessage>}
 */
export async function rollAttack(actor, weapon = null) {
  const targetToken = game.user.targets.first();
  const targetActor = targetToken?.actor ?? null;

  // §5.9: an attack on an incapacitated target skips the dice entirely.
  if (targetActor?.statuses?.has(CONFIG.HEROES_GLORY.statusEffects.incapacitated)) {
    return killIncapacitatedTarget(actor, targetActor);
  }

  const baseDamage = weapon ? weapon.system.damage : actor.system.damage;
  // §5.4: ranged weapons have no epic table. Creatures always have their
  // own — the data model has no "ranged" concept for them.
  const epicTable = weapon
    ? (weapon.system.weaponType === 'ranged' ? null : weapon.system.epicTable)
    : actor.system.epicTable;
  const legendary = weapon ? false : !!actor.system.legendary;
  const targetDefense = targetActor?.system?.defense ?? null;

  // §5.6: captured before this attack can itself apply a new state to
  // the target (see applyLocationConsequence below) — reflects what the
  // target was going into the attack, not a state this same hit causes.
  const stateMultiplier = resolveTargetStateMultiplier({
    prone: targetActor?.statuses?.has(CONFIG.HEROES_GLORY.statusEffects.prone) ?? false,
    unconscious: targetActor?.statuses?.has(CONFIG.HEROES_GLORY.statusEffects.unconscious) ?? false,
  });

  // §5.3: "Оба куба одним Roll" — one Roll for the hit-table d6 and the
  // defeat-test d20 together. With no target, only the d6 is rolled.
  const mainRoll = new Roll(targetActor ? '1d6 + 1d20' : '1d6');
  await mainRoll.evaluate();

  const hitDie = mainRoll.dice[0].total;
  const defeatDie = targetActor ? mainRoll.dice[1].total : null;
  const hit = resolveHit(hitDie);
  const epicCascade = await rollEpicCascade(hit, epicTable, legendary);
  if (targetActor) await applyLocationConsequence(targetActor, epicCascade.location);

  const flags = {
    kind: 'attack',
    actorId: actor.id,
    targetActorId: targetActor?.id ?? null,
    weaponName: weapon?.name ?? null,
    targetName: targetActor?.name ?? null,
    attackerAttack: actor.system.attack,
    baseDamage,
    targetDefense,
    stateMultiplier,
    hasEpicTable: !!epicTable,
    epicTableData: epicTable ?? null,
    legendary,
    hitDie,
    defeatDie,
    previousHitDie: null,
    previousDefeatDie: null,
    epicRow: epicCascade.epicRow,
    severe: epicCascade.severe,
    location: epicCascade.location,
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/attack-roll.hbs',
    buildAttackContext(actor, flags),
  );

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [mainRoll, ...epicCascade.rolls],
    content,
    flags: { [FLAG_SCOPE]: { reroll: flags } },
  });
}

/**
 * §2.2: spend an attacking actor's Удача to reroll one die of an already-
 * posted attack card, then rebuild the whole card from the recomputed
 * result. Hit and defeat are independent inputs to the damage formula, so
 * rerolling one leaves the other (and, for a defeat reroll, the epic
 * cascade) untouched.
 * @param {ChatMessage} message
 * @param {"hit"|"defeat"} slot
 * @returns {Promise<ChatMessage|void>}
 */
export async function rerollAttackDie(message, slot) {
  const flags = message.getFlag(FLAG_SCOPE, 'reroll');
  if (!flags || flags.kind !== 'attack') return;

  const actor = game.actors.get(flags.actorId);
  if (!actor) return;
  if (!canRerollWithLuck({ luck: actor.system.luck ?? 0, isOwner: actor.isOwner, isGM: game.user.isGM })) return;

  const nextFlags = { ...flags };
  let extraRolls = [];

  if (slot === 'hit') {
    if (flags.hitDie == null) return;
    const die = new Roll('1d6');
    await die.evaluate();
    nextFlags.previousHitDie = flags.hitDie;
    nextFlags.hitDie = die.dice[0].total;

    const cascade = await rollEpicCascade(resolveHit(nextFlags.hitDie), flags.epicTableData, flags.legendary);
    nextFlags.epicRow = cascade.epicRow;
    nextFlags.severe = cascade.severe;
    nextFlags.location = cascade.location;
    extraRolls = [die, ...cascade.rolls];

    // The hit die is what decides the epic cascade, so a hit reroll can
    // produce a brand-new "Куда попал" result — apply its consequence
    // the same way the initial roll would have. The previous cascade's
    // consequence (if any) is intentionally left in place rather than
    // reverted: a prone/unconscious toggle can't tell "caused by this
    // attack" apart from "already true for some other reason", so
    // undoing it here could clear a state the target had before this
    // attack even started.
    const targetActor = flags.targetActorId ? game.actors.get(flags.targetActorId) : null;
    if (targetActor) await applyLocationConsequence(targetActor, nextFlags.location);
  } else if (slot === 'defeat') {
    if (flags.defeatDie == null) return;
    const die = new Roll('1d20');
    await die.evaluate();
    nextFlags.previousDefeatDie = flags.defeatDie;
    nextFlags.defeatDie = die.dice[0].total;
    extraRolls = [die];
  } else {
    return;
  }

  await actor.update({ 'system.luck': nextLuck(actor.system.luck) });

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/attack-roll.hbs',
    buildAttackContext(actor, nextFlags),
  );

  return message.update({
    content,
    rolls: [...message.rolls, ...extraRolls],
    flags: { [FLAG_SCOPE]: { reroll: nextFlags } },
  });
}

/**
 * §6.3: cast a spell — pick the variant matching the hero's school
 * mastery, and spend its Mana cost if affordable.
 * @param {Actor} actor   The casting hero.
 * @param {Item} spell    The spell item.
 * @returns {Promise<ChatMessage|null>}   `null` if not enough Mana (nothing is cast).
 */
export async function castSpell(actor, spell) {
  const skillKey = SCHOOL_SKILL_KEYS[spell.system.school];
  const skillItem = actor.items.find((i) => i.type === 'skill' && i.system.skillKey === skillKey);
  const variant = resolveSpellVariant(skillItem?.system.tier);
  const variantData = spell.system.variants[variant];

  if (!canAffordSpell(actor.system.mana.value, variantData.manaCost)) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.NotEnoughMana', {
      spell: spell.name,
      cost: variantData.manaCost,
      mana: actor.system.mana.value,
    }));
    return null;
  }

  const manaRemaining = actor.system.mana.value - variantData.manaCost;
  await actor.update({ 'system.mana.value': manaRemaining });

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    {
      casterName: actor.name,
      spellName: spell.name,
      variantLabelKey: SPELL_VARIANT_LABELS[variant],
      description: variantData.description,
      manaCost: variantData.manaCost,
      manaRemaining,
    },
  );

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
  });
}

/**
 * §7: non-combat check — d20 + a primary skill's value, no difficulty prompt.
 * @param {Actor} actor
 * @param {"attack"|"defense"|"magicPower"|"knowledge"} skillKey
 * @returns {Promise<ChatMessage>}
 */
export async function rollAbilityCheck(actor, skillKey) {
  const roll = new Roll('1d20');
  await roll.evaluate();
  const die = roll.dice[0].total;
  const result = resolveAbilityCheck(die, actor.system[skillKey]);

  const flags = {
    kind: 'check',
    actorId: actor.id,
    skillKey,
    skillLabelKey: PRIMARY_SKILL_LABELS[skillKey],
    die,
    previousDie: null,
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/ability-check.hbs',
    { actorName: actor.name, actorId: actor.id, skillLabelKey: flags.skillLabelKey, previousDie: null, ...result },
  );

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content,
    flags: { [FLAG_SCOPE]: { reroll: flags } },
  });
}

/**
 * §2.2: spend an actor's Удача to reroll the single d20 behind an
 * already-posted ability-check card, using its *current* skill value
 * (rather than whatever it was at roll time) in case it changed since.
 * @param {ChatMessage} message
 * @returns {Promise<ChatMessage|void>}
 */
export async function rerollCheckDie(message) {
  const flags = message.getFlag(FLAG_SCOPE, 'reroll');
  if (!flags || flags.kind !== 'check') return;

  const actor = game.actors.get(flags.actorId);
  if (!actor) return;
  if (!canRerollWithLuck({ luck: actor.system.luck ?? 0, isOwner: actor.isOwner, isGM: game.user.isGM })) return;

  const roll = new Roll('1d20');
  await roll.evaluate();
  const die = roll.dice[0].total;
  const result = resolveAbilityCheck(die, actor.system[flags.skillKey]);

  await actor.update({ 'system.luck': nextLuck(actor.system.luck) });

  const nextFlags = { ...flags, previousDie: flags.die, die };

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/ability-check.hbs',
    { actorName: actor.name, actorId: actor.id, skillLabelKey: flags.skillLabelKey, previousDie: nextFlags.previousDie, ...result },
  );

  return message.update({
    content,
    rolls: [...message.rolls, roll],
    flags: { [FLAG_SCOPE]: { reroll: nextFlags } },
  });
}

/**
 * §2.2: dispatch a "Reroll (Удача)" click on any chat card this system
 * posts, routing to the right reroll implementation for the card's kind.
 * Called from the `renderChatMessageHTML` listener in helpers/chat.mjs.
 * @param {ChatMessage} message
 * @param {string} slot   "hit" | "defeat" (attack cards) or "check".
 * @returns {Promise<ChatMessage|void>}
 */
export async function rerollLuckDie(message, slot) {
  const flags = message.getFlag(FLAG_SCOPE, 'reroll');
  if (!flags) return;
  if (flags.kind === 'attack') return rerollAttackDie(message, slot);
  if (flags.kind === 'check') return rerollCheckDie(message);
}

/**
 * §5.8: a positive-Боевой-дух test at the end of the actor's own turn —
 * 4+ on d6 grants an extra turn. Spent by the actor's owner, capped at
 * {@link moraleAttemptsRemaining} attempts for the current battle.
 * @param {Actor} actor
 * @returns {Promise<ChatMessage|null>}   `null` if no attempts remain.
 */
export async function rollPositiveMoraleCheck(actor) {
  const used = actor.getFlag(FLAG_SCOPE, 'moraleUsed') ?? 0;
  if (moraleAttemptsRemaining(actor.system.morale, used) <= 0) return null;

  const roll = new Roll('1d6');
  await roll.evaluate();
  const result = resolveMoraleCheck(roll.dice[0].total);
  await actor.setFlag(FLAG_SCOPE, 'moraleUsed', used + 1);

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/morale-check.hbs',
    { actorName: actor.name, die: result.die, negative: false, extraTurn: result.passed },
  );

  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll], content });
}

/**
 * §5.8: a negative-Боевой-дух test declared by an opponent or the
 * Рассказчик before the actor's turn — 1-3 on d6 skips that turn. Same
 * per-battle attempt cap as the positive case; the caller (GM-only sheet
 * action) is responsible for restricting who may trigger this.
 * @param {Actor} actor
 * @returns {Promise<ChatMessage|null>}   `null` if no attempts remain.
 */
export async function rollNegativeMoraleCheck(actor) {
  const used = actor.getFlag(FLAG_SCOPE, 'moraleUsed') ?? 0;
  if (moraleAttemptsRemaining(actor.system.morale, used) <= 0) return null;

  const roll = new Roll('1d6');
  await roll.evaluate();
  const result = resolveMoraleCheck(roll.dice[0].total);
  await actor.setFlag(FLAG_SCOPE, 'moraleUsed', used + 1);

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/morale-check.hbs',
    { actorName: actor.name, die: result.die, negative: true, skipsTurn: !result.passed },
  );

  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll], content });
}

/**
 * §5.9: bring a recovered hero back with the book's fixed amounts and
 * record the Ранение that comes with waking up — shared by both ways an
 * incapacitated hero can come back (passing the post-battle check, or
 * simply being helped).
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
async function recoverFromIncapacitation(actor) {
  await actor.update({
    'system.health.value': POST_BATTLE_RECOVERY_HEALTH,
    'system.mana.value': POST_BATTLE_RECOVERY_MANA,
    'system.wounds': actor.system.wounds + 1,
  });
  await actor.toggleStatusEffect(CONFIG.HEROES_GLORY.statusEffects.incapacitated, { active: false });
}

/**
 * §5.9: the post-battle survival check for a hero left недееспособен
 * without help. On a fail, marks the hero with core's own "defeated"
 * status (same non-destructive choice as {@link killIncapacitatedTarget}
 * — no Ранение either, since that's tied to *waking up*, not dying).
 * @param {Actor} actor
 * @returns {Promise<ChatMessage>}
 */
export async function rollPostBattleCheck(actor) {
  const roll = new Roll('1d20');
  await roll.evaluate();
  const result = resolvePostBattleCheck(roll.dice[0].total);

  if (result.survived) await recoverFromIncapacitation(actor);
  else await actor.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true });

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/post-battle-check.hbs',
    { actorName: actor.name, die: result.die, survived: result.survived, helped: false },
  );

  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll], content });
}

/**
 * §5.9: "Если получил помощь — без броска, тоже с 1 ОЗ и 1 Маны."
 * @param {Actor} actor
 * @returns {Promise<ChatMessage>}
 */
export async function helpIncapacitatedActor(actor) {
  await recoverFromIncapacitation(actor);

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/post-battle-check.hbs',
    { actorName: actor.name, survived: true, helped: true },
  );

  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}
