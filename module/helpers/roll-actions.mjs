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
} from './rolls.mjs';

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
 * Rebuild the attack chat card's render context from the persisted
 * `heroes-glory.reroll` flag state. Pulled out of {@link rollAttack} so
 * {@link rerollAttackDie} can recompute the exact same card after either
 * die changes — hit and defeat are independent inputs to `resolveDamage`,
 * so either one can be recomputed alone from the flag state without
 * touching the other.
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
  const damage = resolveDamage({ baseDamage: flags.baseDamage, hit, defeat });
  const potentialDamage = resolvePotentialDamage({ baseDamage: flags.baseDamage, hit });

  return {
    attackerName: actor.name,
    weaponName: flags.weaponName,
    targetName: flags.targetName,
    hit: { ...hit, labelKey: HIT_LABELS[hit.key], previousDie: flags.previousHitDie ?? null },
    defeat: { ...defeat, previousDie: flags.previousDefeatDie ?? null },
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
  const baseDamage = weapon ? weapon.system.damage : actor.system.damage;
  // §5.4: ranged weapons have no epic table. Creatures always have their
  // own — the data model has no "ranged" concept for them.
  const epicTable = weapon
    ? (weapon.system.weaponType === 'ranged' ? null : weapon.system.epicTable)
    : actor.system.epicTable;
  const legendary = weapon ? false : !!actor.system.legendary;

  const targetToken = game.user.targets.first();
  const targetActor = targetToken?.actor ?? null;
  const targetDefense = targetActor?.system?.defense ?? null;

  // §5.3: "Оба куба одним Roll" — one Roll for the hit-table d6 and the
  // defeat-test d20 together. With no target, only the d6 is rolled.
  const mainRoll = new Roll(targetActor ? '1d6 + 1d20' : '1d6');
  await mainRoll.evaluate();

  const hitDie = mainRoll.dice[0].total;
  const defeatDie = targetActor ? mainRoll.dice[1].total : null;
  const hit = resolveHit(hitDie);
  const epicCascade = await rollEpicCascade(hit, epicTable, legendary);

  const flags = {
    kind: 'attack',
    actorId: actor.id,
    weaponName: weapon?.name ?? null,
    targetName: targetActor?.name ?? null,
    attackerAttack: actor.system.attack,
    baseDamage,
    targetDefense,
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
