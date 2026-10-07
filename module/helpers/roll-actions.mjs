import { HeroesGloryDialog, radioRow } from '../apps/dialog.mjs';

/**
 * Foundry-facing roll orchestration: builds and evaluates Rolls, reads
 * `game.user.targets`, posts ChatMessages. All the actual rules
 * interpretation is delegated to the pure functions in rolls.mjs — this
 * file only sequences them against the live game state.
 */
import {
  resolveHit,
  resolveHitModifiers,
  attackSeriesCount,
  resolveNextAttack,
  resolveEpicTableRow,
  resolveAttackEpicTable,
  isCreatureArcher,
  planEpicCascade,
  resolveEpicSeverity,
  resolveHitLocation,
  SCHOOL_SKILL_KEYS,
  ELEMENTAL_SCHOOLS,
  resolveUniversalSchool,
  resolveSpellVariant,
  canAffordSpell,
  resolveAbilityCheck,
  nextLuck,
  spendLuckWithSpells,
  canCastSpellLevel,
  canCastWithoutSpellbook,
  wisdomTierForSpellLevel,
  canRerollWithLuck,
  moraleAttemptsRemaining,
  resolveMoraleCheck,
  moraleCheckVariant,
  MORALE_CHECK_THRESHOLD,
  resolveTargetStateMultiplier,
  resolveArmorItemMultiplier,
  resolveAttackResolution,
  canConfirmAttack,
  resolveAttackHeadlineOutcome,
  resolveAttackMessageMode,
  ownersAndGmRecipients,
  counterAttackTagLimit,
  countersThisRound,
  counterAttackOffer,
  resolvePostBattleCheck,
  POST_BATTLE_RECOVERY_HEALTH,
  POST_BATTLE_RECOVERY_MANA,
  resolvePrimarySkillRoll,
  resolveSecondarySkillRoll,
  nextTier,
  secondarySkillSlotCount,
  orderWithFollowers,
} from './rolls.mjs';
import { buildEffectChanges } from './modifiers.mjs';
import {
  hasArmorSpecialization, specializationManaDiscount, chainLightningSpecialization, hasteSpecializationBonus,
  resurrectionSpecialization, fireWallSpecialization, cloneSpecialization,
} from './specializations.mjs';
import { highestSkillTier } from './skill-bonuses.mjs';
import { RACE_GRANTED_ITEM_FLAG } from './race-granted-items.mjs';
import {
  tokensAdjacent, attackerTokenFor, tokenDistanceCells, tokenInSight, tokenInSceneRect, tokenCellDistance,
  pointInSight, cellInSceneRect, sceneCellNumbers,
} from './grid.mjs';
import { actorCombat, RESURRECTED_FLAG, SUMMONED_FLAG, summonedTokens, summonedData, dismissSummoned } from './combat.mjs';
import {
  SPELL_RANGE_CELLS, hasSpellEffect, chooseSpellEffectVariants, spellDamageDice, spellFormula, sorceryDice,
  creatureSpellProfile, heroSpellResistanceThreshold, spellImmunity, pickChainTargets,
  resolveSpellResolution, canConfirmSpell, isUndeadCreature, modifierTargetLimit, resolveModifierSpellResolution,
  resolveLastingSpellLimit, lastingSpellRounds, actorSpellModifiers, spellHeroesOnly, spellEffectModifiers,
  cleansingRemovals, isFriendlyTarget, resurrectionBlockingTag, resolveSupportSpellResolution,
  antimagicBlocks, rangedSeriesAfterSpells, resolveFireShieldDamage, visibleSpellTakes, areaCells, tokenInArea,
  fieldCellChoice, fieldExpiresRound, quicksandOwnership, dispelCellRegionIds, isLastingSpellCard, footprintAnchor, cancelledCardRefund,
  SUMMON_ELEMENTALS, summonedCreatureStats, summonOwnership,
} from './spell-effects.mjs';
import { PRIMARY_SKILL_ROLL_RANGES, PRIMARY_SKILL_ROLL_RANGES_FALLBACK, concreteClassKey } from './class-stats.mjs';
import { primarySkillIconPath, secondarySkillIconPath, secondarySkillEmptyIconPath } from './skill-icons.mjs';

/** The flag namespace every roll-related ChatMessage flag lives under. */
const FLAG_SCOPE = 'heroes-glory';

/**
 * User ids a "this hero's player and the GM" whisper goes to.
 * @param {Actor} actor
 * @returns {string[]}
 */
export function ownersAndGmIds(actor) {
  return ownersAndGmRecipients(game.users.map((u) => ({
    id: u.id,
    isGM: u.isGM,
    isOwner: actor.testUserPermission(u, 'OWNER'),
  })));
}

// Exported so the spellbook overlay's tooltip (hero-sheet.mjs) can label
// a spell's resolved variant the same way the cast chat card already
// does, without a second copy of this mapping.
export const SPELL_VARIANT_LABELS = {
  none: 'HEROES_GLORY.Spell.VariantNone',
  basic: 'HEROES_GLORY.Spell.VariantBasic',
  advanced: 'HEROES_GLORY.Spell.VariantAdvanced',
  expert: 'HEROES_GLORY.Spell.VariantExpert',
};

export const PRIMARY_SKILL_LABELS = {
  attack: 'HEROES_GLORY.Hero.Attack',
  defense: 'HEROES_GLORY.Hero.Defense',
  magicPower: 'HEROES_GLORY.Hero.MagicPower',
  knowledge: 'HEROES_GLORY.Hero.Knowledge',
};

/** §6: max reroll attempts before giving up on finding a not-yet-owned secondary skill (§6.2). */
const NEW_SECONDARY_SKILL_MAX_ATTEMPTS = 20;

const HIT_LABELS = {
  miss: 'HEROES_GLORY.Roll.Hit.Miss',
  graze: 'HEROES_GLORY.Roll.Hit.Graze',
  hit: 'HEROES_GLORY.Roll.Hit.Hit',
  strongHit: 'HEROES_GLORY.Roll.Hit.StrongHit',
  epic: 'HEROES_GLORY.Roll.Hit.Epic',
};

// §5.5/§task: Pending/Applied pairs — the card must say "will happen" before
// the GM confirms and "happened" after (§task: only lines describing
// not-yet-applied state move to future tense; the roll-fact lines above
// this block, like HitResult/DefeatThreshold, stay as-is). No protected*
// entry for `arm` — never protectable at all (rolls.mjs's own
// LOCATION_TO_SLOT has no `arm` key either, same underlying reason: no
// armor ever targets a forearm slot).
const LOCATION_LABELS = {
  leg: {
    labelKey: 'HEROES_GLORY.Roll.Location.Leg',
    effectKeyPending: 'HEROES_GLORY.Roll.Location.LegEffectPending',
    effectKeyApplied: 'HEROES_GLORY.Roll.Location.LegEffectApplied',
    protectedKeyPending: 'HEROES_GLORY.Roll.Location.LegProtectedPending',
    protectedKeyApplied: 'HEROES_GLORY.Roll.Location.LegProtectedApplied',
  },
  arm: {
    labelKey: 'HEROES_GLORY.Roll.Location.Arm',
    effectKeyPending: 'HEROES_GLORY.Roll.Location.ArmEffectPending',
    effectKeyApplied: 'HEROES_GLORY.Roll.Location.ArmEffectApplied',
  },
  torso: {
    labelKey: 'HEROES_GLORY.Roll.Location.Torso',
    effectKeyPending: 'HEROES_GLORY.Roll.Location.TorsoEffectPending',
    effectKeyApplied: 'HEROES_GLORY.Roll.Location.TorsoEffectApplied',
    protectedKeyPending: 'HEROES_GLORY.Roll.Location.TorsoProtectedPending',
    protectedKeyApplied: 'HEROES_GLORY.Roll.Location.TorsoProtectedApplied',
  },
  head: {
    labelKey: 'HEROES_GLORY.Roll.Location.Head',
    effectKeyPending: 'HEROES_GLORY.Roll.Location.HeadEffectPending',
    effectKeyApplied: 'HEROES_GLORY.Roll.Location.HeadEffectApplied',
    protectedKeyPending: 'HEROES_GLORY.Roll.Location.HeadProtectedPending',
    protectedKeyApplied: 'HEROES_GLORY.Roll.Location.HeadProtectedApplied',
  },
};

/**
 * §5.4: epic cascade — flavor-table row (only if a table exists), then a
 * repeat d6 for severity (any epic hit, table or not — see
 * {@link planEpicCascade}), then (only if severe) the "Куда попал"
 * location roll. Each step depends on the previous result, so these
 * can't be folded into one Roll. Re-run wholesale (fresh dice) whenever
 * the *hit* die changes, since the hit die is what decides whether an
 * epic even happened — a reroll of the *defeat* die never touches this.
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

  const { rollFlavor, rollSeverity } = planEpicCascade(hit, epicTable);

  if (rollFlavor) {
    const tableRoll = new Roll('1d6');
    await tableRoll.evaluate();
    rolls.push(tableRoll);
    epicRow = resolveEpicTableRow(tableRoll.dice[0].total, epicTable);
  }

  if (rollSeverity) {
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
  const confirmed = await HeroesGloryDialog.confirm({
    hgColor: HeroesGloryDialog.actorColor(actor),
    window: { title: 'HEROES_GLORY.Roll.KillConfirmTitle' },
    content: `<p>${game.i18n.format('HEROES_GLORY.Roll.KillConfirmContent', { attacker: actor.name, target: targetActor.name })}</p>`,
  });
  if (!confirmed) return null;

  // Огненный Щит burns this attack too (rules.md §11) — read before the
  // kill, applied right away, a line under the kill.
  const fireShield = fireShieldOnAttack(actor, targetActor);

  await targetActor.toggleStatusEffect(CONFIG.HEROES_GLORY.statusEffects.incapacitated, { active: false });
  await targetActor.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true });
  if (fireShield?.damage) await actor.update({ 'system.health.value': actor.system.health.value - fireShield.damage });

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/kill-incapacitated.hbs',
    {
      attackerName: actor.name,
      targetName: targetActor.name,
      fireShieldLine: fireShield ? fireShieldText(fireShield, actor.name, true) : null,
    },
  );

  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content });
}

/**
 * Огненный Щит on the target of an attack (p. 60, rules.md §11): the
 * attacker's fire damage — the caster's СМ at the cast (+3 / +6), 0 for a
 * creature immune to fire, halved by a worn armor of level 4–5. `null` —
 * the target has none.
 * @param {Actor} attacker
 * @param {Actor|null} target
 * @returns {{spellName: string, value: number, damage: number, immune: boolean, armorHalved: boolean}|null}
 */
function fireShieldOnAttack(attacker, target) {
  const shields = spellModifierEffects(target).filter((m) => m.stat === 'fireShield');
  if (!shields.length) return null;
  const shield = shields.reduce((best, m) => (m.value > best.value ? m : best));
  const immune = attacker.type === 'creature'
    && creatureSpellProfile(attacker.system.specialSkills ?? []).elements.includes('fire');
  const armor = attacker.items
    .filter((i) => i.type === 'artifact' && i.system.artifactType === 'enchantedArmor' && i.system.equipped && i.system.level != null)
    .map((i) => ({ name: i.name, level: i.system.level }));
  const armorMultiplier = resolveArmorItemMultiplier(armor);
  return {
    spellName: shield.spellName,
    value: shield.value,
    damage: resolveFireShieldDamage({ value: shield.value, immune, armorMultiplier }),
    immune,
    armorHalved: !immune && armorMultiplier < 1,
  };
}

/**
 * «Огненный Щит: «Гоблин» получит 5 огнём».
 * @param {{damage: number, immune: boolean, armorHalved: boolean}} fireShield
 * @param {string} attackerName
 * @param {boolean} applied
 * @returns {string}
 */
function fireShieldText(fireShield, attackerName, applied) {
  const i18n = game.i18n;
  if (fireShield.immune) return i18n.format('HEROES_GLORY.Roll.FireShieldImmune', { attacker: attackerName });
  const text = i18n.format(applied ? 'HEROES_GLORY.Roll.FireShieldApplied' : 'HEROES_GLORY.Roll.FireShieldPending', {
    attacker: attackerName, damage: fireShield.damage,
  });
  return fireShield.armorHalved ? `${text} (${i18n.localize('HEROES_GLORY.Roll.SpellArmorHalf')})` : text;
}

/** Chat-card labels for the hit modifiers of resolveHitModifiers (rolls.mjs). */
const HIT_MODIFIER_LABELS = {
  defending: 'HEROES_GLORY.Roll.HitModifier.Defending',
  adjacentShot: 'HEROES_GLORY.Roll.HitModifier.AdjacentShot',
  legendary: 'HEROES_GLORY.Roll.HitModifier.Legendary',
};

/**
 * An attack card's actor — by uuid when the card has it (an unlinked
 * token's own actor), else the world actor by id (older cards).
 * @param {string|null|undefined} uuid
 * @param {string|null|undefined} id
 * @returns {Actor|null}
 */
function actorFromCard(uuid, id) {
  if (uuid) {
    const doc = fromUuidSync(uuid);
    const actor = doc?.documentName === 'Token' ? doc.actor : doc;
    if (actor) return actor;
  }
  return id ? game.actors.get(id) ?? null : null;
}

/**
 * §11 (series): whether the target can't be attacked on — dead
 * (DEFEATED), unconscious, incapacitated, or at 0 Health.
 * @param {Actor|null} target
 * @returns {boolean}
 */
function isTargetOut(target) {
  if (!target) return true;
  const { unconscious, incapacitated } = CONFIG.HEROES_GLORY.statusEffects;
  const statuses = target.statuses ?? new Set();
  return statuses.has(unconscious) || statuses.has(incapacitated)
    || statuses.has(CONFIG.specialStatusEffects.DEFEATED)
    || (target.system?.health?.value ?? 1) <= 0;
}

/**
 * The hit-modifier line of the card's details: "d6 5 − 2 (Защита цели) = 3".
 * @param {{die: number, total: number}} hit
 * @param {Array<{key: string, value: number}>} modifiers
 * @returns {string|null}
 */
function hitModifierLine(hit, modifiers) {
  if (!modifiers?.length) return null;
  const parts = modifiers.map((m) => `${m.value < 0 ? '−' : '+'} ${Math.abs(m.value)} (${game.i18n.localize(HIT_MODIFIER_LABELS[m.key])})`);
  return game.i18n.format('HEROES_GLORY.Roll.HitModifierLine', { die: hit.die, modifiers: parts.join(' '), total: hit.total });
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
  const {
    hit, defeat, damage, damageKnown, potentialDamage, baseDamage,
    armorItemMultiplier, armorZoneMultiplier, protectingItem, destroyedArmor,
  } = resolveAttackResolution(flags);
  // §6.4, stage 2: the spell effects on this card, one line each, and the
  // Урон they changed before the multiplier.
  const spellModifierLines = [
    ...[...(flags.attackModifiers ?? []), ...(flags.defenseModifiers ?? []), ...(flags.seriesModifiers ?? [])]
      .map((modifier) => spellStatText(modifier)),
    ...[...(flags.damageDealtModifiers ?? []), ...(flags.damageTakenModifiers ?? [])].map((modifier) => spellModifierText(modifier)),
  ];
  const baseDamageLine = baseDamage !== flags.baseDamage
    ? game.i18n.format('HEROES_GLORY.Roll.SpellBaseDamageLine', { base: flags.baseDamage, total: baseDamage })
    : null;
  const equippedArmor = flags.equippedArmor ?? [];
  const confirmed = !!flags.confirmed;

  let location = null;
  if (flags.location) {
    const labels = LOCATION_LABELS[flags.location];
    const protectingArmorName = protectingItem?.name ?? null;
    location = {
      labelKey: labels.labelKey,
      effectKey: confirmed ? labels.effectKeyApplied : labels.effectKeyPending,
      protectedKey: protectingArmorName
        ? (confirmed ? labels.protectedKeyApplied : labels.protectedKeyPending)
        : null,
      protectingArmorName,
    };
  }

  return {
    attackerName: actor.name,
    weaponName: flags.weaponName,
    attackRange: flags.attackRange ?? null,
    targetName: flags.targetName,
    hit: { ...hit, labelKey: HIT_LABELS[hit.key], previousDie: flags.previousHitDie ?? null },
    defeat: { ...defeat, previousDie: flags.previousDefeatDie ?? null },
    stateMultiplier: flags.stateMultiplier,
    armorItemMultiplier,
    // §5.5: suppressed when a level-3 zone match already zeroed the
    // damage (armorZoneMultiplier === 0) — showing "doспех 4-5 halves
    // it" alongside "doспех 3 removes it entirely" only confuses, since
    // the level-3 piece is what actually decided this hit's outcome.
    protectingArmorNames: armorZoneMultiplier === 0
      ? ''
      // Joined here, not in the template — Foundry's own Handlebars
      // helper set (foundry.mjs) has no `join`, only eq/ne/lt/gt/lte/gte/not/and/or.
      : equippedArmor.filter((item) => item.level >= 4).map((item) => item.name).join(', '),
    destroyedArmorNames: destroyedArmor.map((item) => item.name).join(', '),
    damage,
    damageKnown,
    potentialDamage,
    hasEpicTable: flags.hasEpicTable,
    epicRow: flags.epicRow,
    severe: flags.severe,
    // §5.5: protectingArmorName lets the template swap effectKey's
    // normal text for protectedKey's "Доспех защитит/защитил от X" — the
    // approved "видно и куда попали, и почему эффекта не было" phrasing,
    // now in Pending/Applied tense per `confirmed` (§task).
    location,
    actorId: actor.id,
    // §task: canConfirm mirrors confirmAttackOutcome's own gate
    // (canConfirmAttack, rolls.mjs) so the confirm button never shows
    // when clicking it would be a no-op anyway (no real target selected,
    // or already confirmed).
    targetActorId: flags.targetActorId,
    confirmed,
    canConfirm: canConfirmAttack(flags),
    cancelled: !!flags.cancelled,
    headlineOutcome: resolveAttackHeadlineOutcome(hit, defeat),
    // §5.2/§5.3/§5.7: hit modifiers, adjacency the grid couldn't measure,
    // the legendary contested defeat test.
    hitModifierLine: hitModifierLine(hit, flags.hitModifiers),
    spellModifierLines,
    baseDamageLine,
    adjacencyUnknown: flags.adjacencyUnknown ?? false,
    contestedDefeat: defeat.contested ? defeat : null,
    attackerAttack: flags.attackerAttack,
    targetDefense: flags.targetDefense,
    // §11: attack series — "Атака k из N", and «Следующая атака» once the
    // GM confirmed this one. The target is read live, so a card re-rendered
    // on confirm sees the damage/status it just received.
    series: flags.seriesTotal > 1 ? { index: flags.seriesIndex, total: flags.seriesTotal } : null,
    nextAttack: flags.nextRolled
      ? { show: false, stoppedByTarget: false, next: null }
      : resolveNextAttack({
        confirmed,
        index: flags.seriesIndex,
        total: flags.seriesTotal,
        targetOut: confirmed && isTargetOut(actorFromCard(flags.targetTokenUuid, flags.targetActorId)),
        attackerOut: confirmed && isTargetOut(actor),
      }),
    fireShieldLine: flags.fireShield ? fireShieldText(flags.fireShield, actor?.name ?? '', confirmed) : null,
    counter: !!flags.counter,
  };
}

/** Actor flag: counterattacks used — `{combatId, round, used, answered}`. */
const COUNTERS_FLAG = 'counters';

/**
 * Ответный Удар / «Ответная атака» on an attack card, read live (rules.md
 * §11): who would answer, with what, and whether it may now.
 * @param {ChatMessage} message
 * @returns {{show: boolean, left: number, defender: Actor|null, defenderToken: TokenDocument|null, attacker: Actor|null, combat: Combat|null}}
 */
export function counterAttackState(message) {
  const none = { show: false, left: 0, defender: null, defenderToken: null, attacker: null, combat: null };
  const flags = message.getFlag(FLAG_SCOPE, 'reroll');
  if (!flags || flags.kind !== 'attack' || flags.isRanged === undefined) return none;
  const defenderToken = flags.targetTokenUuid ? fromUuidSync(flags.targetTokenUuid) : null;
  const defender = defenderToken?.actor ?? null;
  const attacker = actorFromCard(flags.actorUuid, flags.actorId);
  if (!defender || !attacker) return none;
  const found = actorCombat(defender);
  const combat = found?.combat ?? null;
  const counters = combat ? countersThisRound(defender.getFlag(FLAG_SCOPE, COUNTERS_FLAG), combat.id, combat.round) : null;
  const spellLimit = spellModifierEffects(defender).filter((m) => m.stat === 'counterAttacks')
    .reduce((max, m) => Math.max(max, m.value), 0);
  const tagLimit = defender.type === 'creature' ? counterAttackTagLimit(defender.system.specialSkills ?? []) : 0;
  const offer = counterAttackOffer({
    confirmed: !!flags.confirmed,
    ranged: !!flags.isRanged,
    counter: !!flags.counter,
    defenderOut: isTargetOut(defender),
    attackerOut: isTargetOut(attacker),
    inCombat: !!combat,
    tagLimit,
    spellLimit,
    used: counters?.used ?? 0,
    answered: counters?.answered.includes(message.id) ?? false,
  });
  // A hero answers with a worn melee weapon (rules.md §11).
  const show = offer.show && (defender.type !== 'hero' || !!heroMeleeWeapon(defender));
  return { show, left: offer.left, defender, defenderToken, attacker, combat };
}

/**
 * A hero's worn melee weapon — an equipped weapon or enchanted weapon whose
 * type isn't «Стрелковое».
 * @param {Actor} actor
 * @returns {Item|null}
 */
function heroMeleeWeapon(actor) {
  return actor.items.find((i) => i.system?.equipped && i.system.weaponType !== 'ranged'
    && (i.type === 'weapon' || (i.type === 'artifact' && i.system.artifactType === 'enchantedWeapon'))) ?? null;
}

/**
 * Ответный Удар / «Ответная атака»: the defender of a confirmed melee attack
 * answers with one attack on the attacker (rules.md §11) — its owners or
 * the GM. The counter is counted on the defender (this round, this card)
 * before it is rolled; the counter's own card offers no counter.
 * @param {ChatMessage} message
 * @returns {Promise<ChatMessage|null>}
 */
export async function rollCounterAttack(message) {
  const state = counterAttackState(message);
  if (!state.show) {
    ui.notifications.warn(game.i18n.localize('HEROES_GLORY.Roll.CounterAttackGone'));
    ui.chat?.updateMessage?.(message);
    return null;
  }
  const { defender, defenderToken, attacker, combat } = state;
  if (!(defender.isOwner || game.user.isGM)) return null;
  const attackerToken = attackerTokenFor(attacker, defenderToken);
  if (!attackerToken) return null;
  const counters = countersThisRound(defender.getFlag(FLAG_SCOPE, COUNTERS_FLAG), combat.id, combat.round);
  await defender.setFlag(FLAG_SCOPE, COUNTERS_FLAG, {
    ...counters, used: counters.used + 1, answered: [...counters.answered, message.id],
  });
  // This card's button goes on this client now; elsewhere a click is refused.
  ui.chat?.updateMessage?.(message);
  const weapon = defender.type === 'hero' ? heroMeleeWeapon(defender) : null;
  return rollAttack(defender, weapon, { ranged: false, targetTokenDoc: attackerToken, counter: true });
}

/**
 * §5.3/§5.4: roll an attack, either with a hero's equipped weapon or with
 * a creature's own stats, against whatever's in `game.user.targets`.
 * @param {Actor} actor          The attacking hero or creature.
 * @param {Item|null} [weapon]   The weapon item, for a hero attack; omit
 *                               for a creature attacking with its own stats.
 * @param {object} [options]
 * @param {boolean} [options.ranged]  §11: a «Стрелок» creature's ranged
 *                               attack — no flavor row; ignored for anyone else.
 * @returns {Promise<ChatMessage>}
 */
export async function rollAttack(actor, weapon = null, { ranged = false, series = null, targetTokenDoc = null, counter = false } = {}) {
  // A series' next attack passes its target in; the first one reads the
  // user's current target.
  const targetTokenDocument = targetTokenDoc ?? game.user.targets.first()?.document ?? null;
  const targetActor = targetTokenDocument?.actor ?? null;

  // §5.9: an attack on an incapacitated target skips the dice entirely.
  if (targetActor?.statuses?.has(CONFIG.HEROES_GLORY.statusEffects.incapacitated)) {
    return killIncapacitatedTarget(actor, targetActor);
  }

  const baseDamage = weapon ? weapon.system.damage : actor.system.damage;
  // §5.4/§11: which epic table applies — ranged weapon, enchanted-weapon
  // artifact (blank table) and a creature archer's ranged attack have
  // none; see resolveAttackEpicTable. `attackRange` is recorded only for
  // archers, who choose between the two on the sheet.
  const archer = !weapon && isCreatureArcher(actor.system.specialSkills);
  const epicTable = resolveAttackEpicTable({
    weapon: weapon ? weapon.system : null,
    creatureEpicTable: actor.system.epicTable,
    creatureSpecialSkills: actor.system.specialSkills,
    ranged,
  });
  const attackRange = archer ? (ranged ? 'ranged' : 'melee') : null;
  const legendary = weapon ? false : !!actor.system.legendary;
  const targetDefense = targetActor?.system?.defense ?? null;

  // §5.2/§5.3/§5.7 (pp. 27, 30, 31): hit modifiers, frozen at roll time.
  const isRanged = weapon ? weapon.system.weaponType === 'ranged' : (archer && ranged);
  const ownedSkills = actor.items
    .filter((i) => i.type === 'skill')
    .map((i) => ({ skillKey: i.system.skillKey, tier: i.system.tier }));
  const archeryTier = highestSkillTier(ownedSkills, 'archery');
  const adjacent = isRanged && targetTokenDocument
    ? tokensAdjacent(attackerTokenFor(actor, targetTokenDocument), targetTokenDocument)
    : null;
  const { modifiers: hitModifiers, total: hitModifier } = resolveHitModifiers({
    targetDefending: targetActor?.statuses?.has(CONFIG.HEROES_GLORY.statusEffects.defending) ?? false,
    ranged: isRanged,
    adjacent,
    ignoreAdjacentPenalty: archeryTier === 'advanced' || archeryTier === 'expert',
    attackerLegendary: legendary,
  });
  // "в сражении с легендарным существом" — either side legendary.
  const contested = !!targetActor && (legendary || !!targetActor.system?.legendary);

  // §11: the series this attack belongs to — sized once, at its first attack.
  // Забывчивость (p. 58): fewer shots, or none — a ranged attack with none
  // left is refused (rules.md §11).
  const attackerSpells = spellModifierEffects(actor);
  const seriesSpellModifiers = isRanged
    ? attackerSpells.filter((m) => m.stat === 'rangedAttacks' || m.stat === 'noRangedAttacks')
    : [];
  const seriesBase = series?.total ?? attackSeriesCount(weapon
    ? {
      ranged: isRanged,
      assaultTier: highestSkillTier(ownedSkills, 'assault'),
      archeryTier,
      specializationSkill: actor.system.specialization?.type === 'skill' ? actor.system.specialization.key : null,
    }
    : {
      creatureAttacks: actor.system.attacksCount ?? 1,
      vengeanceHurt: (actor.system.specialSkills ?? []).some((tag) => /^месть(\s|$)/i.test(String(tag).trim()))
        && actor.system.health.value < actor.system.health.max,
    });
  // A counterattack is one attack (p. 115: «отвечает 1 атакой»).
  const seriesTotal = counter ? 1 : (series?.total ?? rangedSeriesAfterSpells(seriesBase, seriesSpellModifiers));
  if (!seriesTotal) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.NoRangedAttacks', { actor: actor.name }));
    return null;
  }
  const seriesIndex = series?.index ?? 1;

  // §5.6/§4.3: captured before this attack's consequence is even decided
  // (§task: no longer applied until the GM confirms — see
  // confirmAttackOutcome below) — reflects what the target was going into
  // the attack, not a state this same hit causes. armorSpecialization
  // reads the TARGET's own specialization
  // (Доспехи halves damage the specialized hero TAKES, not deals).
  const stateMultiplier = resolveTargetStateMultiplier({
    prone: targetActor?.statuses?.has(CONFIG.HEROES_GLORY.statusEffects.prone) ?? false,
    unconscious: targetActor?.statuses?.has(CONFIG.HEROES_GLORY.statusEffects.unconscious) ?? false,
    armorSpecialization: hasArmorSpecialization(targetActor?.system?.specialization),
  });

  // §5.5: every equipped enchanted-armor piece on the target with a
  // known level — gated on `equipped` alone (same convention as the
  // modifiers-sync in documents/item.mjs, not on paperdollSlot). A
  // book-named armor entry with no level set (GM hasn't assigned one
  // yet) contributes nothing, same as not wearing it at all. Frozen
  // here, at attack time, same category as stateMultiplier/targetDefense
  // above — the target's own gear can't change mid-resolution anyway.
  // paperdollSlot included (not just name/level) so resolveArmorZoneProtection
  // (§5.5 levels 1-3) can tell which body zone each piece covers — the
  // slot it is actually worn in (§11); levels 4-5's own multiplier never
  // looks at it.
  const equippedArmor = (targetActor?.items ?? [])
    .filter((i) => i.type === 'artifact' && i.system.artifactType === 'enchantedArmor' && i.system.equipped && i.system.level != null)
    .map((i) => ({ name: i.name, level: i.system.level, paperdollSlot: i.system.paperdollSlot ?? null }));

  // §6.4, stage 2: spell effects, frozen at roll time — Благословение /
  // Слабость / Проклятие on the attacker, Щит (melee) or Воздушный Щит
  // (ranged) on the target. A series' next attack reads them anew.
  const damageDealtModifiers = attackerSpells.filter((m) => m.stat === 'damageDealt');
  const takenStat = isRanged ? 'rangedDamageTaken' : 'meleeDamageTaken';
  const targetSpells = spellModifierEffects(targetActor);
  const damageTakenModifiers = targetSpells.filter((m) => m.stat === takenStat);
  // Group А1: Атака and Защита are already in `system` (prepareDerivedData);
  // Точность adds to Атака for a ranged attack only (p. 55). Shown on the card.
  const rangedAttackModifiers = isRanged ? attackerSpells.filter((m) => m.stat === 'rangedAttack') : [];
  const attackModifiers = [...attackerSpells.filter((m) => m.stat === 'attack'), ...rangedAttackModifiers];
  const defenseModifiers = targetSpells.filter((m) => m.stat === 'defense');
  // Огненный Щит on the target: every attack burns the attacker (rules.md §11).
  const fireShield = targetActor ? fireShieldOnAttack(actor, targetActor) : null;

  // §5.3: "Оба куба одним Roll" — one Roll for the hit-table d6 and the
  // defeat-test d20 together. With no target, only the d6 is rolled.
  // The legendary contested test adds the target's own d20 (§11: both on
  // the attacker's card).
  const mainRoll = new Roll(targetActor ? (contested ? '1d6 + 1d20 + 1d20' : '1d6 + 1d20') : '1d6');
  await mainRoll.evaluate();

  const hitDie = mainRoll.dice[0].total;
  const defeatDie = targetActor ? mainRoll.dice[1].total : null;
  const targetDefeatDie = contested ? mainRoll.dice[2].total : null;
  const hit = resolveHit(hitDie, hitModifier);
  const epicCascade = await rollEpicCascade(hit, epicTable, legendary);

  // The battle and round the attack is rolled in — the pending-attack
  // warning compares only these (rules.md §11).
  const attackCombat = actorCombat(actor)?.combat ?? null;
  const flags = {
    kind: 'attack',
    combatRound: attackCombat ? { combat: attackCombat.id, round: attackCombat.round } : null,
    actorId: actor.id,
    actorUuid: actor.uuid,
    targetActorId: targetActor?.id ?? null,
    targetTokenUuid: targetTokenDocument?.uuid ?? null,
    weaponId: weapon?.id ?? null,
    ranged,
    hitModifiers,
    hitModifier,
    adjacencyUnknown: isRanged && !!targetTokenDocument && adjacent === null,
    contested,
    targetDefeatDie,
    seriesIndex,
    seriesTotal,
    nextRolled: false,
    weaponName: weapon?.name ?? null,
    attackRange,
    targetName: targetActor?.name ?? null,
    attackerAttack: actor.system.attack + rangedAttackModifiers.reduce((sum, m) => sum + m.value, 0),
    attackModifiers,
    defenseModifiers,
    seriesModifiers: series || counter ? [] : seriesSpellModifiers,
    isRanged,
    counter,
    fireShield,
    baseDamage,
    damageDealtModifiers,
    damageTakenModifiers,
    targetDefense,
    stateMultiplier,
    equippedArmor,
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
    // §task: nothing is applied to the target until the GM clicks
    // confirm on the card — see confirmAttackOutcome below.
    confirmed: false,
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/attack-roll.hbs',
    buildAttackContext(actor, flags),
  );

  return createActorVisibilityCard(actor, {
    content,
    flags: { [FLAG_SCOPE]: { reroll: flags } },
  }, [mainRoll, ...epicCascade.rolls]);
}

/**
 * Post an actor's card with the attack and cast cards' visibility (rules.md
 * §10): the chat-bar mode is respected, except `self` is raised to the
 * actor's owners + GM so the GM still sees it (and can confirm the damage
 * or the spell).
 * A whispered card carries no `rolls`: Foundry shows non-recipients of a
 * whispered roll a "rolled privately" stub (ChatMessage#visible returns
 * true for any roll), and a private card must not show up for them at
 * all. The dice values are already in the card's own text.
 * @param {Actor} actor
 * @param {object} data   Message data without `speaker`/`rolls`.
 * @param {Roll[]} rolls
 * @returns {Promise<ChatMessage>}
 */
async function createActorVisibilityCard(actor, data, rolls) {
  const mode = resolveAttackMessageMode(game.settings.get('core', 'messageMode'));
  const whispered = !['public', 'ic'].includes(mode);
  const message = { speaker: ChatMessage.getSpeaker({ actor }), ...data };
  if (!whispered) message.rolls = rolls;
  if (mode === 'ownersAndGm') {
    message.whisper = ownersAndGmIds(actor);
    return ChatMessage.create(message);
  }
  return ChatMessage.create(message, { messageMode: mode });
}

/**
 * §2.2: spend one Удача. A hero stores only its manual correction
 * (actor-hero.mjs), so the step is computed from the derived parts —
 * writing `nextLuck` of the derived total back would leave the total
 * unchanged whenever a skill or artifact adds to it. Удача / Неудача from a
 * spell is spent first, an effect at 0 removed (spendLuckWithSpells,
 * rules.md §11). Anything without those parts stores the plain value.
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
async function spendActorLuck(actor) {
  const parts = actor.system.luckParts;
  if (!parts) {
    await actor.update({ 'system.luck': nextLuck(actor.system.luck) });
    return;
  }
  const { manual, spells } = spendLuckWithSpells({ ...parts, spells: actor.system.luckSpells ?? [] });
  for (const { effectId, value } of spells) {
    const effect = actor.effects.get(effectId);
    if (!effect) continue;
    const data = effect.getFlag(FLAG_SCOPE, SPELL_EFFECT_FLAG);
    if (!value) {
      await effect.delete();
      continue;
    }
    const modifiers = spellEffectModifiers(data).map((m) => (m.stat === 'luck' ? { ...m, value } : m));
    await effect.setFlag(FLAG_SCOPE, SPELL_EFFECT_FLAG, { ...data, modifiers });
  }
  if (manual !== parts.manual) await actor.update({ 'system.luck': manual });
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
  // §task: "Реролл после подтверждения запрещаем" — belt-and-suspenders
  // alongside the button being hidden/removed once confirmed (chat.mjs).
  // A card the GM cancelled is done too.
  if (flags.confirmed || flags.cancelled) return;

  const actor = actorFromCard(flags.actorUuid, flags.actorId);
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

    const cascade = await rollEpicCascade(resolveHit(nextFlags.hitDie, flags.hitModifier ?? 0), flags.epicTableData, flags.legendary);
    nextFlags.epicRow = cascade.epicRow;
    nextFlags.severe = cascade.severe;
    nextFlags.location = cascade.location;
    extraRolls = [die, ...cascade.rolls];
    // §task: the consequence itself isn't applied until confirm any more
    // — a hit reroll before that just recomputes what WOULD be applied
    // (buildAttackContext, via resolveAttackResolution), nothing to
    // (un)do to the target here.
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

  await spendActorLuck(actor);

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/attack-roll.hbs',
    buildAttackContext(actor, nextFlags),
  );

  // A whispered card never carries rolls (see rollAttack) — adding the
  // reroll's dice here would turn it back into a roll message that
  // non-recipients see as a "rolled privately" stub.
  const update = { content, flags: { [FLAG_SCOPE]: { reroll: nextFlags } } };
  if (!message.whisper.length) update.rolls = [...message.rolls, ...extraRolls];
  return message.update(update);
}

/**
 * §5.3/§5.4/§5.5/§5.6/§task: apply an already-rolled attack's damage and
 * "Куда попал" consequence to the target — the GM-only action gated
 * behind the card's confirm button (module/helpers/chat.mjs). What to
 * apply is decided once, purely, by {@link resolveAttackResolution}
 * (rolls.mjs) — the exact same call buildAttackContext already makes for
 * display — so this function only executes that decision against the
 * real target Actor and marks the card confirmed.
 *
 * §5.9: health is written as a plain subtraction, not clamped to 0 here —
 * `system.health.value`'s own schema (`min: 0`, actor-hero.mjs/
 * actor-creature.mjs) already clamps any negative result during Foundry's
 * normal document-cleaning step, identically whether the write comes from
 * this call or a manual sheet edit, so a second clamp here would be dead
 * code. That same schema-level write is also what `_onUpdate`'s own
 * "недееспособен" toggle (documents/actor.mjs) reacts to — it watches
 * `changed.system.health.value`, not the *source* of the change, so it
 * fires the same way for this automated write as for a manual one.
 *
 * Idempotent via the `confirmed` flag — {@link canConfirmAttack} (rolls.mjs)
 * refuses a second call on an already-confirmed card outright, so a stray
 * double-click that slipped through before its button was disabled/
 * removed (or a click from an old already-confirmed card reopened in
 * another tab) is a silent no-op, not a re-apply. This guard is NOT
 * airtight against two genuinely simultaneous clicks from two separate GM
 * clients (both could read `confirmed: false` before either write lands)
 * — accepted as sufficient for a single-GM table, same call already made
 * for the reroll-Удача guard this feature's diagnosis discussed.
 * @param {ChatMessage} message
 * @returns {Promise<ChatMessage|void>}
 */
export async function confirmAttackOutcome(message) {
  const flags = message.getFlag(FLAG_SCOPE, 'reroll');
  if (!canConfirmAttack(flags)) return;

  // By token uuid when the card has it: an unlinked token's own actor, not
  // the world actor it was made from.
  const targetActor = actorFromCard(flags.targetTokenUuid, flags.targetActorId);
  if (!targetActor) {
    ui.notifications.error(game.i18n.format('HEROES_GLORY.Roll.ConfirmTargetMissing', { target: flags.targetName ?? '' }));
    return;
  }

  const { damage, consequence } = resolveAttackResolution(flags);

  if (damage) {
    await targetActor.update({ 'system.health.value': targetActor.system.health.value - damage });
  }
  if (consequence.type === 'prone') {
    await targetActor.toggleStatusEffect(CONFIG.HEROES_GLORY.statusEffects.prone, { active: true });
  } else if (consequence.type === 'unconscious') {
    await targetActor.toggleStatusEffect(CONFIG.HEROES_GLORY.statusEffects.unconscious, { active: true });
  } else if (consequence.type === 'legEffect') {
    await targetActor.createEmbeddedDocuments('ActiveEffect', [{
      name: game.i18n.localize('HEROES_GLORY.Roll.Location.LegEffect'),
      img: 'icons/svg/downgrade.svg',
      system: { changes: buildEffectChanges([{ stat: 'speed', mode: 'subtract', value: 1 }]) },
    }]);
  }

  const actor = actorFromCard(flags.actorUuid, flags.actorId);
  // Огненный Щит: the attacker burns, a miss too (rules.md §11).
  if (actor && flags.fireShield?.damage) {
    await actor.update({ 'system.health.value': actor.system.health.value - flags.fireShield.damage });
  }
  // confirmedAt lets a later card tell it was rolled while this one was
  // still pending (hadUnconfirmedAttackBefore, rolls.mjs).
  const nextFlags = { ...flags, confirmed: true, confirmedAt: Date.now() };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/attack-roll.hbs',
    buildAttackContext(actor, nextFlags),
  );

  return message.update({ content, flags: { [FLAG_SCOPE]: { reroll: nextFlags } } });
}

/**
 * §11: roll the next attack of a series from a confirmed card — same
 * attacker, weapon and target, the target's state read fresh now. Allowed
 * to the attacker's owners and the GM; the card is marked so its button
 * can't roll the same next attack twice.
 * @param {ChatMessage} message
 * @returns {Promise<ChatMessage|null>}
 */
export async function rollNextAttack(message) {
  const flags = message.getFlag(FLAG_SCOPE, 'reroll');
  if (!flags || flags.kind !== 'attack' || flags.nextRolled) return null;
  const actor = actorFromCard(flags.actorUuid, flags.actorId);
  if (!actor || !(actor.isOwner || game.user.isGM)) return null;
  const targetTokenDoc = flags.targetTokenUuid ? fromUuidSync(flags.targetTokenUuid) : null;
  const next = resolveNextAttack({
    confirmed: !!flags.confirmed,
    index: flags.seriesIndex,
    total: flags.seriesTotal,
    targetOut: isTargetOut(targetTokenDoc?.actor ?? null),
    attackerOut: isTargetOut(actor),
  });
  if (!next.show || !targetTokenDoc) return null;
  const weapon = flags.weaponId ? actor.items.get(flags.weaponId) ?? null : null;
  if (flags.weaponId && !weapon) return null;

  const nextFlags = { ...flags, nextRolled: true };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/attack-roll.hbs',
    buildAttackContext(actor, nextFlags),
  );
  await message.update({ content, flags: { [FLAG_SCOPE]: { reroll: nextFlags } } });

  return rollAttack(actor, weapon, {
    ranged: !!flags.ranged,
    series: { index: next.next, total: flags.seriesTotal },
    targetTokenDoc,
  });
}

/**
 * §6.2/§6.3/§11: resolve which of a spell's four variants applies for a
 * given caster, and which school it's drawn from. For an ordinary spell
 * that's just its own `system.school`; for a Универсальные spell (no
 * governing secondary skill of its own — SCHOOL_SKILL_KEYS has no
 * `universal` entry) it's whichever of the hero's four elemental schools
 * is highest-tier (resolveUniversalSchool, rolls.mjs) — Сеня's ruling for
 * the open book question, docs/rules.md §11.
 *
 * A tie between two-or-more schools at that max tier isn't asked about
 * (rules.md §11): the tier — and so the variant and its cost — is the same
 * whichever tied school it is, and nothing else depends on the school (an
 * immunity goes by the effect's own element). The school is then
 * `universal` itself — the card says «Школа: Универсальные»;
 * `candidateSchools[0]` is still there for the spellbook's frame.
 *
 * Shared by castSpell (the cast/charge flow below) and the hero sheet's
 * spellbook overlay (tooltip/frame content, hero-sheet.mjs) so the
 * school→skill→tier→variant chain lives in exactly one place.
 * @param {Actor} actor
 * @param {Item} spell
 * @returns {{
 *   variant: string,
 *   variantData: {description: string, manaCost: number},
 *   resolvedSchool: string|null,
 *   candidateSchools: string[],
 * }}
 *   `resolvedSchool` is `null` only when nothing is owned at all (no
 *   elemental school for a universal spell), `universal` on a tie.
 *   `candidateSchools` is always `[school]` for an ordinary spell; for
 *   universal it's every tied-for-highest elemental school (length 0/1/2+ —
 *   see resolveUniversalSchool).
 */
export function findSpellVariant(actor, spell) {
  const school = spell.system.school;

  if (school === 'universal') {
    const schoolTiers = Object.fromEntries(ELEMENTAL_SCHOOLS.map((s) => [
      s,
      actor.items.find((i) => i.type === 'skill' && i.system.skillKey === SCHOOL_SKILL_KEYS[s])?.system.tier ?? null,
    ]));
    const { candidateSchools, tier } = resolveUniversalSchool(schoolTiers);
    const resolvedSchool = candidateSchools.length > 1 ? 'universal' : candidateSchools[0] ?? null;
    const variant = resolveSpellVariant(tier);
    return { variant, variantData: spell.system.variants[variant], resolvedSchool, candidateSchools };
  }

  const skillKey = SCHOOL_SKILL_KEYS[school];
  const skillItem = actor.items.find((i) => i.type === 'skill' && i.system.skillKey === skillKey);
  const variant = resolveSpellVariant(skillItem?.system.tier);
  return {
    variant,
    variantData: spell.system.variants[variant],
    resolvedSchool: school || null,
    candidateSchools: [school],
  };
}

/**
 * The "нужна базовая/продвинутая/экспертная Мудрость" phrase for a tier.
 * @param {'base'|'advanced'|'expert'} tier
 * @returns {string}   A lang key.
 */
export function wisdomRequiredKey(tier) {
  return `HEROES_GLORY.WisdomRequired.${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
}

/**
 * §6.1/§11 (Мудрость, p. 38): whether this hero may cast this spell at
 * all, and if not, which Мудрость tier it needs. Creatures own no skills
 * and are never gated. Shared by castSpell and the spell sheet opened from
 * the hero's book.
 * @param {Actor} actor
 * @param {Item} spell
 * @returns {{allowed: boolean, requiredTier: 'base'|'advanced'|'expert'|null}}
 */
export function spellLevelGate(actor, spell) {
  if (actor.type !== 'hero') return { allowed: true, requiredTier: null };
  const owned = actor.items
    .filter((i) => i.type === 'skill')
    .map((i) => ({ skillKey: i.system.skillKey, tier: i.system.tier }));
  const allowed = canCastSpellLevel({
    spellLevel: spell.system.level,
    wisdomTier: highestSkillTier(owned, 'wisdom'),
    raceGranted: !!spell.getFlag(...RACE_GRANTED_ITEM_FLAG),
  });
  return { allowed, requiredTier: allowed ? null : wisdomTierForSpellLevel(spell.system.level) };
}

/**
 * §6.3/§4.3: cast a spell — pick the variant matching the hero's school
 * mastery, and spend its Mana cost if affordable. The Воскрешение
 * specialization's -4 Мана discount (specializations.mjs's
 * `specializationManaDiscount`) is applied here, at the one place that
 * already reads/spends `variantData.manaCost` — not a second cost
 * computation living somewhere else.
 *
 * @param {Actor} actor   The casting hero.
 * @param {Item} spell    The spell item.
 * @returns {Promise<ChatMessage|null>}   `null` if not enough Mana — nothing is cast.
 */
export async function castSpell(actor, spell) {
  // §6.1 (p. 32): no Книга Магии → only race-granted spells; no Mana spent.
  if (actor.type === 'hero' && !canCastWithoutSpellbook({
    hasSpellbook: actor.items.some((i) => i.type === 'spellbook'),
    raceGranted: !!spell.getFlag(...RACE_GRANTED_ITEM_FLAG),
  })) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellNeedsSpellbook', { spell: spell.name }));
    return null;
  }

  // §11: above the Мудрость level nobody casts, GM included — no Mana spent.
  const gate = spellLevelGate(actor, spell);
  if (!gate.allowed) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellNeedsWisdom', {
      spell: spell.name,
      level: spell.system.level,
      wisdom: game.i18n.localize(wisdomRequiredKey(gate.requiredTier)),
    }));
    return null;
  }

  // Group Д: Призыв Элементаля — the element first; «Стихия этого заклинания —
  // это стихия выбранного элементаля», its school's variant and cost (rules.md §11).
  let summonElement = null;
  if (actor.type === 'hero' && await spellChoosesElement(spell)) {
    if (!summonCanStart(actor, spell)) return null;
    summonElement = await chooseSummonElement(actor, spell);
    if (!summonElement) return null;
  }
  const { variant, variantData, resolvedSchool } = summonElement
    ? elementSpellVariant(actor, spell, summonElement)
    : findSpellVariant(actor, spell);

  const discount = specializationManaDiscount(actor.system.specialization, spell.name);
  const manaCost = Math.max(0, variantData.manaCost - discount);

  if (!canAffordSpell(actor.system.mana.value, manaCost)) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.NotEnoughMana', {
      spell: spell.name,
      cost: manaCost,
      mana: actor.system.mana.value,
    }));
    return null;
  }

  // §6.4, stage 1: a hero's damage spell picks its targets, rolls and waits
  // for the GM's confirm. Creatures cast as before (p. 113: their spell
  // damage is written in their abilities).
  if (actor.type === 'hero') {
    const effectVariants = await spellEffectVariants(spell);
    const effect = effectVariants?.[variant]?.effect;
    if (effect?.kind === 'damage') {
      return castDamageSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect });
    }
    // Полет out of combat (rules.md §11): the text card below, Mana spent.
    if (effect?.kind === 'modifier' && !(effect.textOutOfCombat && !casterCombatStart(actor))) {
      return castModifierSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect });
    }
    if (['heal', 'dispel', 'resurrect'].includes(effect?.kind)) {
      return castSupportSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect });
    }
    if (effect?.kind === 'teleport') {
      return castTeleportSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect });
    }
    if (effect?.kind === 'field') {
      return castFieldSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect });
    }
    if (effect?.kind === 'clone') {
      return castCloneSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect });
    }
    if (effect?.kind === 'summon' && summonElement) {
      return castSummonSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect, element: summonElement });
    }
  }

  const manaRemaining = actor.system.mana.value - manaCost;
  await actor.update({ 'system.mana.value': manaRemaining });

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    {
      casterName: actor.name,
      spellName: spell.name,
      // §task: shown for every spell, not just Универсальные — resolvedSchool
      // is always spell.system.school for an ordinary spell, so this line
      // was just as omittable before, only now does it earn its keep.
      schoolLabelKey: resolvedSchool ? `HEROES_GLORY.School.${resolvedSchool.charAt(0).toUpperCase()}${resolvedSchool.slice(1)}` : null,
      variantLabelKey: SPELL_VARIANT_LABELS[variant],
      description: variantData.description,
      manaCost,
      manaRemaining,
    },
  );

  return createActorVisibilityCard(actor, { content }, []);
}

/** §6.4: the spell compendium, where a hero's spell item finds its effect. */
const SPELLS_PACK = 'heroes-glory.spells';

/** Group Д: the bestiary, where a summoned elemental comes from. */
const CREATURES_PACK = 'heroes-glory.creatures';

/**
 * Group Д: does this spell summon an elemental (`summon`)? The element is
 * chosen instead of a school.
 * @param {Item} spell
 * @returns {Promise<boolean>}
 */
async function spellChoosesElement(spell) {
  if (spell?.system?.school !== 'universal') return false;
  const variants = await spellEffectVariants(spell);
  return variants?.none?.effect?.kind === 'summon';
}

/**
 * Group Д: a spell's variant by one element's school — Призыв Элементаля's
 * element is its school (p. 61, rules.md §11), not the highest of the four.
 * @param {Actor} actor
 * @param {Item} spell
 * @param {string} element   a school key
 * @returns {{variant: string, variantData: object, resolvedSchool: string}}
 */
function elementSpellVariant(actor, spell, element) {
  const tier = actor.items.find((i) => i.type === 'skill' && i.system.skillKey === SCHOOL_SKILL_KEYS[element])?.system.tier;
  const variant = resolveSpellVariant(tier);
  return { variant, variantData: spell.system.variants[variant], resolvedSchool: element };
}

/**
 * Group Д: «Призывает Элементаля Огня, Воздуха, Земли или Воды» — the
 * player picks the element in the system's dialog; each row says the
 * variant and the Mana that element's school gives. `null` — cancelled.
 * @param {Actor} actor
 * @param {Item} spell
 * @returns {Promise<string|null>}   the element's school key
 */
async function chooseSummonElement(actor, spell) {
  const i18n = game.i18n;
  const discount = specializationManaDiscount(actor.system.specialization, spell.name);
  const rows = Object.entries(SUMMON_ELEMENTALS).map(([element, creature], index) => {
    const { variant, variantData } = elementSpellVariant(actor, spell, element);
    const label = i18n.format('HEROES_GLORY.Roll.SummonElementRow', {
      school: i18n.localize(CONFIG.HEROES_GLORY.schools[element]),
      creature,
      variant: i18n.localize(SPELL_VARIANT_LABELS[variant]),
      cost: Math.max(0, variantData.manaCost - discount),
    });
    return radioRow('element', element, label, index === 0);
  });
  const content = document.createElement('div');
  content.innerHTML = `<p>${foundry.utils.escapeHTML(i18n.format('HEROES_GLORY.Roll.SummonElementText', { spell: spell.name }))}</p>
    <div class="hg-dialog__checklist">${rows.join('')}</div>`;
  const element = await HeroesGloryDialog.wait({
    hgColor: HeroesGloryDialog.actorColor(actor),
    window: { title: 'HEROES_GLORY.Roll.SummonElementTitle' },
    content,
    buttons: [
      {
        action: 'summon',
        label: 'HEROES_GLORY.Roll.SummonElementConfirm',
        default: true,
        callback: (event, button) => button.form.querySelector('input[name="element"]:checked')?.value ?? null,
      },
      { action: 'cancel', label: 'HEROES_GLORY.Rest.Cancel' },
    ],
    rejectClose: false,
  });
  return SUMMON_ELEMENTALS[element] ? element : null;
}

/**
 * §6.4: a hero's spell item's structured effect — its own, else the entry
 * at its `_stats.compendiumSource`, else the compendium entry of the same
 * name (chooseSpellEffectVariants, spell-effects.mjs). Items copied before
 * the effect field existed carry none of their own. When no compendium
 * entry is found at all, a console warning — the cast works as before.
 * @param {Item} spell
 * @returns {Promise<object|null>}   `system.variants` with effects, or null
 */
async function spellEffectVariants(spell) {
  const own = spell.system.variants;
  if (hasSpellEffect(own)) return own;
  const sourceUuid = spell._stats?.compendiumSource ?? null;
  const sourceDoc = sourceUuid ? await fromUuid(sourceUuid).catch(() => null) : null;
  let nameDoc = null;
  if (!hasSpellEffect(sourceDoc?.system?.variants)) {
    const pack = game.packs.get(SPELLS_PACK);
    const entry = pack ? (await pack.getIndex()).find((e) => e.name === spell.name) : null;
    nameDoc = entry ? await pack.getDocument(entry._id) : null;
  }
  const chosen = chooseSpellEffectVariants({
    own, bySource: sourceDoc?.system?.variants ?? null, byName: nameDoc?.system?.variants ?? null,
  });
  if (!chosen && !sourceDoc && !nameDoc) {
    console.warn(`heroes-glory | spell "${spell.name}": no compendium entry found (by compendiumSource or name) — cast without effects`);
  }
  return chosen?.variants ?? null;
}

/**
 * Out of the fight for Цепная Молния's pool (rules.md §11): defeated or
 * incapacitated.
 * @param {Actor} actor
 * @returns {boolean}
 */
function isDownForSpell(actor) {
  return actor.statuses.has(CONFIG.specialStatusEffects.DEFEATED)
    || actor.statuses.has(CONFIG.HEROES_GLORY.statusEffects.incapacitated);
}

/**
 * One target of a damage spell, frozen at the cast: its immunity and its
 * resistance roll (rules.md §11: a creature's «Сопротивление Магии», a
 * hero's Помехи / Гном, rolled automatically), incapacitated or not, worn
 * armor. Immune and incapacitated targets roll no resistance.
 * @param {TokenDocument} tokenDoc
 * @param {Item} spell
 * @param {object} effect
 * @param {number} factor   share of the damage (½ for the chain's extras)
 * @param {object} [options]
 * @param {boolean} [options.resist]   roll the resistance at all (a useful
 *   stage-2 spell isn't resisted, rules.md §11)
 * @param {boolean} [options.skipIncapacitated]   no roll for an
 *   incapacitated target (a damage spell kills it anyway)
 * @returns {Promise<{entry: object, roll: Roll|null}>}
 */
async function spellTargetEntry(tokenDoc, spell, effect, factor, { resist = true, skipIncapacitated = true } = {}) {
  const target = tokenDoc.actor;
  const system = target.system;
  let immunity = null;
  let resistThreshold = null;
  let resistSource = null;
  if (target.type === 'creature') {
    const profile = creatureSpellProfile(system.specialSkills ?? []);
    immunity = spellImmunity(profile, { element: effect.element, spellName: spell.name, mind: !!effect.mindEffect });
    resistThreshold = profile.resistThreshold;
    if (resistThreshold !== null) resistSource = 'creature';
  } else {
    const owned = target.items.filter((i) => i.type === 'skill')
      .map((i) => ({ skillKey: i.system.skillKey, tier: i.system.tier }));
    const interferenceTier = highestSkillTier(owned, 'interference');
    const gnome = system.race === 'gnome';
    resistThreshold = heroSpellResistanceThreshold({ interferenceTier, gnome });
    if (resistThreshold !== null) resistSource = interferenceTier ? 'interference' : 'gnome';
  }
  // Антимагия (p. 54) on a hero or a creature; «ко всем заклинаниям» first.
  if (immunity !== 'all' && antimagicBlocks({ modifiers: spellModifierEffects(target), spellLevel: spell.system.level, spellName: spell.name })) {
    immunity = 'antimagic';
  }
  const incapacitated = target.statuses.has(CONFIG.HEROES_GLORY.statusEffects.incapacitated);

  let roll = null;
  let resistDie = null;
  if (resist && resistThreshold !== null && !immunity && !(skipIncapacitated && incapacitated)) {
    roll = new Roll('1d6');
    await roll.evaluate();
    resistDie = roll.dice[0].total;
  }

  const equippedArmor = target.items
    .filter((i) => i.type === 'artifact' && i.system.artifactType === 'enchantedArmor' && i.system.equipped && i.system.level != null)
    .map((i) => ({ name: i.name, level: i.system.level }));

  return {
    entry: {
      tokenUuid: tokenDoc.uuid,
      actorId: target.id,
      name: target.name,
      factor,
      immunity,
      resistThreshold,
      resistSource,
      resistDie,
      incapacitated,
      equippedArmor,
    },
    roll,
  };
}

/**
 * Антимагия (p. 54, rules.md §11): a spell cast on one target that
 * Антимагия makes immune is refused before any Mana is spent; with several
 * targets the immune ones get their line on the card.
 * @param {Item} spell
 * @param {TokenDocument[]} selected
 * @returns {boolean}   refused
 */
function antimagicRefuses(spell, selected) {
  if (selected.length !== 1) return false;
  const target = selected[0].actor;
  if (!target || !antimagicBlocks({ modifiers: spellModifierEffects(target), spellLevel: spell.system.level, spellName: spell.name })) return false;
  ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellAntimagicRefused', { spell: spell.name, target: target.name }));
  return true;
}

/**
 * One chosen target the spell can't touch is refused before any Mana, as
 * Антимагия is (rules.md §11): Антимагия, or a creature's immunity by its
 * tags — to the spell's element, to mind magic, to every spell, to this
 * spell. With more targets the card says it per target.
 * @param {Item} spell
 * @param {object} effect   the variant's effect
 * @param {TokenDocument[]} selected
 * @returns {boolean}   refused (and told)
 */
function soleTargetRefuses(spell, effect, selected) {
  if (antimagicRefuses(spell, selected)) return true;
  if (selected.length !== 1) return false;
  const target = selected[0].actor;
  if (target?.type !== 'creature') return false;
  const immunity = spellImmunity(creatureSpellProfile(target.system.specialSkills ?? []),
    { element: effect.element, spellName: spell.name, mind: !!effect.mindEffect });
  if (!immunity) return false;
  const i18n = game.i18n;
  const reason = i18n.format(SPELL_IMMUNITY_LABELS[immunity], { element: i18n.localize(`HEROES_GLORY.Roll.SpellElement.${effect.element || 'none'}`) });
  ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellImmuneRefused', { spell: spell.name, target: target.name, reason }));
  return true;
}

/**
 * Step 4, «в поле зрения» (Волна Смерти, Уничтожить Нежить, Армагеддон;
 * rules.md §11): every token with an actor on the caster's scene, on the
 * caster's level, within the scene, not hidden, not dead
 * («повержен»; the incapacitated are taken — the spell kills them), that
 * the spell takes (visibleSpellTakes: its filter by creature tags, the
 * caster only for Армагеддон) and the caster's token sees (tokenInSight).
 * No caster token on the scene, or nobody left — refused before any Mana.
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} targeting   the variant's `targeting`
 * @returns {{docs: TokenDocument[], casterToken: TokenDocument}|null}
 */
function visibleSpellTargets(actor, spell, targeting) {
  const casterToken = actor.token ?? actor.getActiveTokens(false, true).find((t) => t.parent === canvas.scene)
    ?? actor.getActiveTokens(false, true)[0] ?? null;
  if (!casterToken) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellNoCasterToken', { spell: spell.name }));
    return null;
  }
  const docs = casterToken.parent.tokens.filter((doc) => {
    const target = doc.actor;
    if (!target || doc.hidden || doc.level !== casterToken.level || !tokenInSceneRect(doc)) return false;
    if (target.statuses.has(CONFIG.specialStatusEffects.DEFEATED)) return false;
    const isCaster = doc === casterToken;
    if (!visibleSpellTakes({
      targeting, isCaster, isCreature: target.type === 'creature', tags: target.system.specialSkills ?? [],
    })) return false;
    return isCaster || tokenInSight(casterToken, doc);
  });
  if (!docs.length) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellNobodyInSight', { spell: spell.name }));
    return null;
  }
  return { docs, casterToken };
}

/**
 * Step 5, «Выберите клетку» (Метеоритный Дождь, Огненный Шар, Инферно,
 * Кольцо Холода; rules.md §11): the caster places the pattern on the scene
 * (core region placement, nothing saved; left click — choose, right click
 * or Esc — cancel; no rotation); its centre must be within 24 cells of the
 * caster's token (p. 32), an empty cell will do, walls don't cut the area.
 * Targets: every token with an actor on the caster's level, within the
 * scene, not hidden, not dead (the incapacitated are taken), that has a
 * cell in the pattern — the caster and allies too. No caster token, no
 * grid, cancelled, or nobody in it — refused before any Mana.
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} targeting   the variant's `targeting`
 * @returns {Promise<{docs: TokenDocument[], casterToken: TokenDocument, area: object}|null>}
 */
async function areaSpellTargets(actor, spell, targeting) {
  const i18n = game.i18n;
  const casterToken = actor.token ?? actor.getActiveTokens(false, true).find((t) => t.parent === canvas.scene) ?? null;
  if (!casterToken || casterToken.parent !== canvas.scene) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellNoCasterToken', { spell: spell.name }));
    return null;
  }
  const grid = canvas.grid;
  if (grid.isGridless) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellAreaNoGrid', { spell: spell.name }));
    return null;
  }
  const pattern = (center) => areaCells({ center, pattern: targeting.area, neighbors: (cell) => grid.getAdjacentOffsets(cell) });
  const start = casterToken.getOccupiedGridSpaceOffsets()[0];
  ui.notifications.info(i18n.format('HEROES_GLORY.Roll.SpellAreaPlace', { spell: spell.name }));
  let region = null;
  try {
    region = await canvas.regions.placeRegion({
      name: spell.name,
      shapes: [{ type: 'grid', offsets: pattern(start), origin: grid.getCenterPoint(start) }],
      levels: [casterToken.level],
      color: game.user.color,
      highlightMode: 'coverage',
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
    }, {
      create: false,
      allowRotation: false,
      preConfirm: ({ shape }) => {
        const cells = tokenCellDistance(casterToken, grid.getOffset(shape.origin));
        if (cells <= SPELL_RANGE_CELLS) return true;
        ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellAreaOutOfRange', { spell: spell.name, cells, range: SPELL_RANGE_CELLS }));
        return false;
      },
    });
  } catch (error) {
    console.warn(`heroes-glory | «${spell.name}»: area placement failed`, error);
    return null;
  }
  // Esc gives null, a right click undefined — both cancel (rules.md §11).
  if (!region) return null;
  const shape = region.shapes[0];
  const center = grid.getOffset(shape.origin);
  const cells = shape.offsets.map(({ i, j }) => ({ i, j }));
  const docs = casterToken.parent.tokens.filter((doc) => {
    const target = doc.actor;
    if (!target || doc.hidden || doc.level !== casterToken.level || !tokenInSceneRect(doc)) return false;
    if (target.statuses.has(CONFIG.specialStatusEffects.DEFEATED)) return false;
    return tokenInArea(doc.getOccupiedGridSpaceOffsets(), cells);
  });
  if (!docs.length) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellNobodyInArea', { spell: spell.name }));
    return null;
  }
  // «Центр: клетка …» on the card — the column and row within the scene,
  // and who stands there.
  const rect = casterToken.parent.dimensions.sceneRect;
  const occupants = casterToken.parent.tokens
    .filter((doc) => !doc.hidden && tokenInArea(doc.getOccupiedGridSpaceOffsets(), [center]))
    .map((doc) => doc.name);
  const area = {
    center,
    column: center.j - Math.floor(rect.x / grid.size) + 1,
    row: center.i - Math.floor(rect.y / grid.size) + 1,
    occupants,
    pattern: targeting.area,
  };
  return { docs, casterToken, area };
}

/**
 * §6.4, stage 1: a hero's damage spell. One target (or none) from the
 * user's targets; more than one, or a target past 24 cells (p. 32), refuses
 * the cast before any Mana is spent. Цепная Молния adds the nearest
 * creatures hop by hop, skipping the caster and anyone down (rules.md §11).
 * The damage is rolled once, Волшебство included; nothing reaches the
 * targets until the GM confirms (confirmSpellOutcome).
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} cast   variant, variantData, resolvedSchool, manaCost, effect
 * @returns {Promise<ChatMessage|null>}
 */
async function castDamageSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect }) {
  const targeting = effect.targeting ?? {};
  // p. 23 (rules.md §11): the specialization lets the player pick two more
  // targets — targeted after the first one, which the chain starts from.
  const chainSpec = targeting.mode === 'chain'
    ? chainLightningSpecialization(actor.system.specialization, spell.name)
    : chainLightningSpecialization(null, '');
  // Step 4, «в поле зрения», and step 5, «Выберите клетку»: the spell finds
  // its own targets — the user's are ignored (rules.md §11).
  const visible = targeting.mode === 'visible' || targeting.mode === 'area';
  let found = null;
  if (targeting.mode === 'visible') found = visibleSpellTargets(actor, spell, targeting);
  if (targeting.mode === 'area') found = await areaSpellTargets(actor, spell, targeting);
  if (visible && !found) return null;
  const selected = visible ? found.docs : [...game.user.targets].map((token) => token.document);
  if (!selected.length) {
    ui.notifications.warn(game.i18n.localize('HEROES_GLORY.Roll.SpellNoTarget'));
    return null;
  }
  const maxSelected = 1 + chainSpec.chosenTargets;
  if (!visible && selected.length > maxSelected) {
    ui.notifications.warn(maxSelected === 1
      ? game.i18n.format('HEROES_GLORY.Roll.SpellOneTarget', { spell: spell.name })
      : game.i18n.format('HEROES_GLORY.Roll.SpellTooManyTargets', { spell: spell.name, count: maxSelected }));
    return null;
  }
  const [targetDoc, ...chosenDocs] = visible ? [null] : selected;
  const casterToken = visible ? found.casterToken : attackerTokenFor(actor, targetDoc);
  let rangeUnknown = false;
  for (const doc of visible ? [] : selected) {
    const cells = tokenDistanceCells(attackerTokenFor(actor, doc), doc);
    if (cells === null) {
      rangeUnknown = true;
    } else if (cells > SPELL_RANGE_CELLS) {
      ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellOutOfRange', {
        spell: spell.name, target: doc.actor?.name ?? doc.name, cells, range: SPELL_RANGE_CELLS,
      }));
      return null;
    }
  }

  // Антимагия or an immunity: one chosen target is refused; «в поле
  // зрения» and a chain check each target on the card instead (rules.md §11).
  if (!visible && (targeting.mode === 'chain' ? antimagicRefuses(spell, selected) : soleTargetRefuses(spell, effect, selected))) return null;

  // Цепная Молния: the chain's extra targets aren't limited by range; the
  // targets picked by the specialization are left out of it.
  let chainDocs = [];
  if (targeting.mode === 'chain' && targeting.extraTargets > 0) {
    const pool = targetDoc.parent.tokens.filter((t) => t !== targetDoc && t.actor && !chosenDocs.includes(t)
      && t !== casterToken && t.actor !== actor && !isDownForSpell(t.actor));
    chainDocs = pickChainTargets({
      first: targetDoc,
      pool,
      count: targeting.extraTargets,
      distance: (a, b) => tokenDistanceCells(a, b) ?? Infinity,
    });
  }

  const manaRemaining = actor.system.mana.value - manaCost;
  await actor.update({ 'system.mana.value': manaRemaining });

  // One roll for the cast (rules.md §11), Волшебство on top.
  const dice = spellDamageDice(effect.dice, actor.system.magicPower);
  const formula = spellFormula(dice);
  const spellRoll = new Roll(formula);
  await spellRoll.evaluate();
  const owned = actor.items.filter((i) => i.type === 'skill')
    .map((i) => ({ skillKey: i.system.skillKey, tier: i.system.tier }));
  const sorceryTier = highestSkillTier(owned, 'sorcery');
  const specialization = actor.system.specialization;
  const sorcery = sorceryDice({
    sorceryTier,
    sorcerySpecialization: specialization?.type === 'skill' && specialization.key === 'sorcery',
    spellLevel: spell.system.level,
  });
  const rolls = [spellRoll];
  const extraRoll = async (count) => {
    if (!count) return null;
    const roll = new Roll(`${count}d6`);
    await roll.evaluate();
    rolls.push(roll);
    return { count, total: roll.total };
  };
  const sorcerySkill = await extraRoll(sorcery.skill);
  const sorcerySpecialization = await extraRoll(sorcery.specialization);
  const chainSpecialization = await extraRoll(chainSpec.bonusDice);
  const total = spellRoll.total + (sorcerySkill?.total ?? 0) + (sorcerySpecialization?.total ?? 0)
    + (chainSpecialization?.total ?? 0);

  const targets = [];
  const extraFactor = chainSpec.active ? chainSpec.extraFactor : (targeting.extraFactor ?? 1);
  const targetDocs = visible ? selected.map((doc) => [doc, 1, false]) : [
    [targetDoc, 1, false],
    ...chosenDocs.map((doc) => [doc, extraFactor, true]),
    ...chainDocs.map((doc) => [doc, extraFactor, false]),
  ];
  for (const [doc, factor, chosen] of targetDocs) {
    const { entry, roll } = await spellTargetEntry(doc, spell, effect, factor);
    if (chosen) entry.chosen = true;
    targets.push(entry);
    if (roll) rolls.push(roll);
  }

  const flags = {
    kind: 'spell',
    actorId: actor.id,
    actorUuid: actor.uuid,
    casterName: actor.name,
    spellName: spell.name,
    element: effect.element,
    variant,
    school: resolvedSchool,
    description: variantData.description,
    manaCost,
    manaRemaining,
    formula,
    spellTotal: spellRoll.total,
    sorceryTier,
    sorcerySkill,
    sorcerySpecialization,
    chainSpecialization,
    total,
    visible,
    area: targeting.mode === 'area' ? found.area : null,
    rangeUnknown,
    targets,
    confirmed: false,
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(flags),
  );
  return createActorVisibilityCard(actor, { content, flags: { [FLAG_SCOPE]: { spell: flags } } }, rolls);
}

/** Chat-card labels for a damage spell's immunity reasons. */
const SPELL_IMMUNITY_LABELS = {
  all: 'HEROES_GLORY.Roll.SpellImmunityAll',
  antimagic: 'HEROES_GLORY.Roll.SpellImmunityAntimagic',
  mind: 'HEROES_GLORY.Roll.SpellImmunityMind',
  element: 'HEROES_GLORY.Roll.SpellImmunityElement',
  spell: 'HEROES_GLORY.Roll.SpellImmunitySpell',
};

/** Chat-card labels for who rolled against a spell. */
const SPELL_RESIST_LABELS = {
  creature: 'HEROES_GLORY.Roll.SpellResistCreature',
  interference: 'HEROES_GLORY.Roll.SpellResistInterference',
  gnome: 'HEROES_GLORY.Roll.SpellResistGnome',
};

/**
 * The spell card's render context — the plain cast (no `targets`, no
 * `total`) or a damage spell, whose target lines come from
 * resolveSpellResolution, the same function the GM's confirm applies.
 * @param {object} flags
 * @returns {object}
 */
function buildSpellCardContext(flags) {
  const i18n = game.i18n;
  const context = {
    casterName: flags.casterName,
    spellName: flags.spellName,
    schoolLabelKey: flags.school ? `HEROES_GLORY.School.${flags.school.charAt(0).toUpperCase()}${flags.school.slice(1)}` : null,
    variantLabelKey: SPELL_VARIANT_LABELS[flags.variant],
    description: flags.description,
    manaCost: flags.manaCost,
    manaRemaining: flags.manaRemaining,
    // Ended for another cast under the limit of three before its confirm,
    // or dropped by the GM («Отменить», rules.md §11).
    cancelled: !!flags.cancelled,
    cancelledByGm: !!flags.cancelledByGm,
    refunded: flags.manaRefunded || null,
  };
  if (flags.effectKind === 'modifier') return buildModifierSpellCardContext(flags, context);
  if (['heal', 'dispel', 'resurrect'].includes(flags.effectKind)) return buildSupportSpellCardContext(flags, context);
  if (['teleport', 'field', 'summon', 'clone'].includes(flags.effectKind)) return buildPlacementSpellCardContext(flags, context);
  if (flags.fieldTrigger) context.fieldTriggerLine = game.i18n.format(`HEROES_GLORY.Roll.FireWallTrigger.${flags.fieldTrigger}`, { target: flags.targets?.[0]?.name ?? '' });
  if (flags.total === undefined) return context;

  const results = resolveSpellResolution(flags);
  const elementLabel = (element) => i18n.localize(`HEROES_GLORY.Roll.SpellElement.${element || 'none'}`);
  context.damageSpell = true;
  context.targetSpell = true;
  context.confirmHintKey = 'HEROES_GLORY.Roll.SpellConfirmHint';
  context.noTarget = !flags.targets.length;
  context.rangeUnknown = flags.rangeUnknown;
  context.canConfirm = canConfirmSpell(flags);
  context.confirmed = !!flags.confirmed;
  // Steps 4, 5: the GM may leave a target out before confirming (rules.md §11).
  context.excludable = !!flags.visible && !flags.confirmed;
  context.areaCenterLine = flags.area
    ? i18n.format('HEROES_GLORY.Roll.SpellAreaCenter', {
      column: flags.area.column,
      row: flags.area.row,
      who: flags.area.occupants?.length
        ? i18n.format('HEROES_GLORY.Roll.SpellAreaCenterWho', { names: flags.area.occupants.join(', ') })
        : '',
    })
    : null;
  context.targetRows = flags.targets.map((target, index) => ({ index, excluded: !!target.excluded }));
  context.targetLines = flags.targets.map((target, index) => {
    const result = results[index];
    const done = flags.confirmed;
    const notes = [];
    if (target.factor < 1) notes.push(i18n.localize('HEROES_GLORY.Roll.SpellChainHalf'));
    if (target.chosen) notes.push(i18n.localize('HEROES_GLORY.Roll.SpellChainChosen'));
    if (target.resistDie != null) {
      notes.push(i18n.format('HEROES_GLORY.Roll.SpellResistRoll', {
        source: i18n.localize(SPELL_RESIST_LABELS[target.resistSource]),
        die: target.resistDie,
        need: target.resistThreshold,
      }));
    }
    if (result.armorHalved) notes.push(i18n.localize('HEROES_GLORY.Roll.SpellArmorHalf'));
    let text;
    if (result.outcome === 'excluded') {
      return i18n.format('HEROES_GLORY.Roll.SpellTargetExcluded', { target: target.name });
    }
    if (result.outcome === 'kill') {
      text = i18n.format(done ? 'HEROES_GLORY.Roll.SpellKillApplied' : 'HEROES_GLORY.Roll.SpellKillPending', { target: target.name });
    } else if (result.outcome === 'immune') {
      text = i18n.format('HEROES_GLORY.Roll.SpellImmune', {
        target: target.name,
        reason: i18n.format(SPELL_IMMUNITY_LABELS[target.immunity], { element: elementLabel(flags.element) }),
      });
    } else if (result.outcome === 'resisted') {
      text = i18n.format('HEROES_GLORY.Roll.SpellResisted', { target: target.name });
    } else {
      text = i18n.format(done ? 'HEROES_GLORY.Roll.SpellDamageApplied' : 'HEROES_GLORY.Roll.SpellDamagePending', {
        target: target.name, damage: result.damage,
      });
    }
    return notes.length ? `${text} (${notes.join('; ')})` : text;
  });
  context.breakdown = [
    i18n.format('HEROES_GLORY.Roll.SpellRollLine', { spell: flags.spellName, formula: flags.formula, total: flags.spellTotal }),
  ];
  if (flags.sorcerySkill) {
    context.breakdown.push(i18n.format('HEROES_GLORY.Roll.SpellSorcerySkillLine', {
      tier: i18n.localize(CONFIG.HEROES_GLORY.skillTiers[flags.sorceryTier]),
      count: flags.sorcerySkill.count,
      total: flags.sorcerySkill.total,
    }));
  }
  if (flags.sorcerySpecialization) {
    context.breakdown.push(i18n.format('HEROES_GLORY.Roll.SpellSorcerySpecLine', {
      count: flags.sorcerySpecialization.count,
      total: flags.sorcerySpecialization.total,
    }));
  }
  if (flags.chainSpecialization) {
    context.breakdown.push(i18n.format('HEROES_GLORY.Roll.SpellChainSpecLine', { total: flags.chainSpecialization.total }));
  }
  if (flags.fireWallSpecialization) {
    context.breakdown.push(i18n.format('HEROES_GLORY.Roll.SpellFireWallSpecLine', {
      count: flags.fireWallSpecialization.count,
      total: flags.fireWallSpecialization.total,
    }));
  }
  context.totalLine = i18n.format('HEROES_GLORY.Roll.SpellTotalLine', { total: flags.total });
  context.targetRows = context.targetRows.map((row, index) => ({ ...row, text: context.targetLines[index] }));
  return context;
}

/**
 * Step 4: the GM leaves a target of a «в поле зрения» card out — or puts it
 * back — before confirming (rules.md §11). The card is redrawn from the
 * same flags; an excluded target takes nothing.
 * @param {ChatMessage} message
 * @param {number} index
 * @returns {Promise<ChatMessage|void>}
 */
export async function toggleSpellTargetExcluded(message, index) {
  if (!game.user.isGM) return;
  const flags = message.getFlag(FLAG_SCOPE, 'spell');
  if (!flags?.visible || flags.confirmed || !flags.targets?.[index]) return;
  const targets = flags.targets.map((target, i) => (i === index ? { ...target, excluded: !target.excluded } : target));
  const nextFlags = { ...flags, targets };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(nextFlags),
  );
  return message.update({ content, flags: { [FLAG_SCOPE]: { spell: nextFlags } } });
}

/**
 * §6.4: the GM's confirm on a damage spell card — applies exactly what
 * resolveSpellResolution says for each target: its damage (an update that
 * incapacitates at 0, the same path as an attack), or death for a target
 * that was already incapacitated (rules.md §11: a spell's damage is an
 * attack). A target gone since the cast is reported and skipped. Guarded by
 * the `confirmed` flag, as for attacks.
 * @param {ChatMessage} message
 * @returns {Promise<ChatMessage|void>}
 */
export async function confirmSpellOutcome(message) {
  const flags = message.getFlag(FLAG_SCOPE, 'spell');
  if (!canConfirmSpell(flags)) return;
  if (flags.effectKind === 'modifier') return confirmModifierSpell(message, flags);
  if (['heal', 'dispel', 'resurrect'].includes(flags.effectKind)) return confirmSupportSpell(message, flags);
  if (flags.effectKind === 'teleport') return confirmTeleportSpell(message, flags);
  if (flags.effectKind === 'field') return confirmFieldSpell(message, flags);
  if (flags.effectKind === 'summon') return confirmSummonSpell(message, flags);
  if (flags.effectKind === 'clone') return confirmCloneSpell(message, flags);
  const results = resolveSpellResolution(flags);
  for (const [index, target] of flags.targets.entries()) {
    const result = results[index];
    const targetActor = actorFromCard(target.tokenUuid, target.actorId);
    if (!targetActor) {
      ui.notifications.error(game.i18n.format('HEROES_GLORY.Roll.ConfirmTargetMissing', { target: target.name }));
      continue;
    }
    if (result.outcome === 'kill') {
      await targetActor.toggleStatusEffect(CONFIG.HEROES_GLORY.statusEffects.incapacitated, { active: false });
      await targetActor.toggleStatusEffect(CONFIG.specialStatusEffects.DEFEATED, { active: true, overlay: true });
    } else if (result.damage) {
      await targetActor.update({ 'system.health.value': targetActor.system.health.value - result.damage });
    }
  }
  const nextFlags = { ...flags, confirmed: true, confirmedAt: Date.now() };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(nextFlags),
  );
  return message.update({ content, flags: { [FLAG_SCOPE]: { spell: nextFlags } } });
}

/**
 * §6.4, group В: an actor's spell effects (Лечение / Развеивание Магии
 * take them off), one entry each.
 * @param {Actor} actor
 * @returns {Array<{id: string, spellName: string}>}
 */
function actorSpellEffectList(actor) {
  return actor.effects
    .filter((effect) => effect.getFlag(FLAG_SCOPE, SPELL_EFFECT_FLAG))
    .map((effect) => ({ id: effect.id, spellName: effect.getFlag(FLAG_SCOPE, SPELL_EFFECT_FLAG).spellName }));
}

/**
 * Group В: a support spell's chosen targets, checked before any Mana is
 * spent — at least one (rules.md §11), no more than the variant takes (one,
 * at Эксперт Сила Магии), within 24 cells (p. 32).
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} effect
 * @returns {{selected: TokenDocument[], rangeUnknown: boolean}|null}
 */
function supportSpellTargets(actor, spell, effect) {
  const limit = modifierTargetLimit(effect, actor.system.magicPower);
  const selected = [...game.user.targets].map((token) => token.document).filter((doc) => doc.actor);
  if (!selected.length) {
    ui.notifications.warn(game.i18n.localize('HEROES_GLORY.Roll.SpellNoTarget'));
    return null;
  }
  if (selected.length > limit) {
    ui.notifications.warn(limit === 1
      ? game.i18n.format('HEROES_GLORY.Roll.SpellOneTarget', { spell: spell.name })
      : game.i18n.format('HEROES_GLORY.Roll.SpellTooManyTargets', { spell: spell.name, count: limit }));
    return null;
  }
  let rangeUnknown = false;
  for (const doc of selected) {
    const cells = tokenDistanceCells(attackerTokenFor(actor, doc), doc);
    if (cells === null) {
      rangeUnknown = true;
    } else if (cells > SPELL_RANGE_CELLS) {
      ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellOutOfRange', {
        spell: spell.name, target: doc.actor.name, cells, range: SPELL_RANGE_CELLS,
      }));
      return null;
    }
  }
  return { selected, rangeUnknown };
}

/**
 * §6.4, group В: Лечение, Развеивание Магии, Воскрешение (pp. 54, 57). Refused
 * before any Mana is spent (rules.md §11): Лечение on a target that is
 * incapacitated or dead — only Воскрешение helps; Развеивание without
 * Продвинутый on a target not on the caster's side; Воскрешение outside
 * combat, on a target that isn't down in the caster's battle, or on Нежить,
 * Голем, Элементаль (pp. 114, 116). Лечение and Развеивание work out of combat
 * too. One heal roll for every target; Развеивание on a target not on the
 * caster's side is hostile — its resistance is rolled now. Nothing reaches
 * the targets until the GM confirms (confirmSupportSpell).
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} cast   variant, variantData, resolvedSchool, manaCost, effect
 * @returns {Promise<ChatMessage|null>}
 */
async function castSupportSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect }) {
  const kind = effect.kind;
  const i18n = game.i18n;
  const castStart = kind === 'resurrect' ? casterCombatStart(actor) : null;
  if (kind === 'resurrect' && !castStart) {
    ui.notifications.warn(i18n.localize('HEROES_GLORY.Roll.SpellOutOfCombat'));
    return null;
  }
  // The expert Развеивание with no target chosen: a cell (rules.md §11).
  if (kind === 'dispel' && effect.dispelFields && !game.user.targets.size) {
    return castDispelCellSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost });
  }
  const picked = supportSpellTargets(actor, spell, effect);
  if (!picked) return null;
  const { selected, rangeUnknown } = picked;
  const friendlyOf = (doc) => isFriendlyTarget(doc.disposition, attackerTokenFor(actor, doc)?.disposition,
    CONST.TOKEN_DISPOSITIONS.FRIENDLY);

  for (const doc of selected) {
    const target = doc.actor;
    if (kind === 'heal' && isDownForSpell(target)) {
      ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellHealDown', { spell: spell.name, target: target.name }));
      return null;
    }
    if (kind === 'dispel' && effect.friendlyOnly && !friendlyOf(doc)) {
      ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellDispelNotFriendly', { spell: spell.name, target: target.name }));
      return null;
    }
    if (kind === 'resurrect') {
      const inBattle = game.combats.get(castStart.combat)?.combatants.some((c) => c.tokenId === doc.id) ?? false;
      if (!inBattle || !isDownForSpell(target)) {
        ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellResurrectNotDown', { spell: spell.name, target: target.name }));
        return null;
      }
      const tag = target.type === 'creature' ? resurrectionBlockingTag(target.system.specialSkills ?? []) : null;
      if (tag) {
        ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellResurrectBlocked', { spell: spell.name, target: target.name, tag }));
        return null;
      }
    }
  }

  if (soleTargetRefuses(spell, effect, selected)) return null;

  const manaRemaining = actor.system.mana.value - manaCost;
  await actor.update({ 'system.mana.value': manaRemaining });

  // Лечение: one roll for the cast, every target the same (rules.md §11).
  const rolls = [];
  let formula = null;
  let total = null;
  if (kind === 'heal') {
    formula = spellFormula(spellDamageDice(effect.dice, actor.system.magicPower));
    const roll = new Roll(formula);
    await roll.evaluate();
    rolls.push(roll);
    total = roll.total;
  }

  const targets = [];
  for (const doc of selected) {
    const target = doc.actor;
    const hostile = kind === 'dispel' && !friendlyOf(doc);
    const { entry, roll } = await spellTargetEntry(doc, spell, effect, 1, { resist: hostile, skipIncapacitated: false });
    if (roll) rolls.push(roll);
    if (kind === 'heal' || kind === 'dispel') {
      const removals = cleansingRemovals({ spellEffects: actorSpellEffectList(target), statuses: target.statuses, kind });
      Object.assign(entry, {
        removeEffectIds: removals.effectIds, removeSpellNames: removals.spellNames, removeStatuses: removals.statuses,
      });
    }
    if (kind === 'heal' || kind === 'resurrect') {
      Object.assign(entry, { healthValue: target.system.health.value, healthMax: target.system.health.max });
    }
    if (kind === 'resurrect') {
      Object.assign(entry, { isHero: target.type === 'hero', dead: target.statuses.has(CONFIG.specialStatusEffects.DEFEATED) });
    }
    targets.push(entry);
  }

  const flags = {
    kind: 'spell',
    effectKind: kind,
    actorId: actor.id,
    actorUuid: actor.uuid,
    casterName: actor.name,
    spellName: spell.name,
    variant,
    school: resolvedSchool,
    description: variantData.description,
    manaCost,
    manaRemaining,
    formula,
    total,
    healthFactor: effect.healthFactor ?? 1,
    untilCombatEnd: kind === 'resurrect' && !!effect.untilCombatEnd,
    noWound: resurrectionSpecialization(actor.system.specialization, spell.name),
    combatId: castStart?.combat ?? null,
    rangeUnknown,
    targets,
    confirmed: false,
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(flags),
  );
  return createActorVisibilityCard(actor, { content, flags: { [FLAG_SCOPE]: { spell: flags } } }, rolls);
}

/** Chat labels for the core statuses Лечение / Развеивание lift (pp. 113–115). */
const CLEANSED_STATUS_LABELS = {
  blind: 'HEROES_GLORY.Roll.CleansedStatus.blind',
  paralysis: 'HEROES_GLORY.Roll.CleansedStatus.paralysis',
  disease: 'HEROES_GLORY.Roll.CleansedStatus.disease',
  curse: 'HEROES_GLORY.Roll.CleansedStatus.curse',
};

/**
 * A support spell card's target lines — from resolveSupportSpellResolution,
 * the same function the GM's confirm applies.
 * @param {object} flags
 * @param {object} context   the plain cast's context
 * @returns {object}
 */
function buildSupportSpellCardContext(flags, context) {
  const i18n = game.i18n;
  const results = resolveSupportSpellResolution(flags);
  const done = !!flags.confirmed;
  context.targetSpell = true;
  context.confirmHintKey = 'HEROES_GLORY.Roll.SpellSupportConfirmHint';
  context.noTarget = !flags.targets.length;
  context.rangeUnknown = flags.rangeUnknown;
  context.canConfirm = canConfirmSpell(flags);
  context.confirmed = done;
  const removalText = (target) => {
    const names = [
      ...(target.removeSpellNames ?? []),
      ...(target.removeStatuses ?? []).map((status) => i18n.localize(CLEANSED_STATUS_LABELS[status] ?? status)),
    ];
    if (!names.length) return null;
    return i18n.format(done ? 'HEROES_GLORY.Roll.SpellRemovedApplied' : 'HEROES_GLORY.Roll.SpellRemovedPending', { list: names.join(', ') });
  };
  if (flags.dispelCell) {
    const { column, row, names } = flags.dispelCell;
    context.noTarget = false;
    context.targetLines = [i18n.format(done ? 'HEROES_GLORY.Roll.SpellDispelCellApplied' : 'HEROES_GLORY.Roll.SpellDispelCellPending', {
      column, row, list: names.join(', '),
    })];
    return context;
  }
  context.targetLines = flags.targets.map((target, index) => {
    const result = results[index];
    let text;
    if (result.outcome === 'immune') {
      text = i18n.format('HEROES_GLORY.Roll.SpellModifierImmune', {
        target: target.name,
        reason: i18n.format(SPELL_IMMUNITY_LABELS[target.immunity], { element: '' }),
      });
    } else if (result.outcome === 'resisted') {
      text = i18n.format('HEROES_GLORY.Roll.SpellModifierResisted', { target: target.name });
    } else if (flags.effectKind === 'heal') {
      const parts = [i18n.format(done ? 'HEROES_GLORY.Roll.SpellHealApplied' : 'HEROES_GLORY.Roll.SpellHealPending', { target: target.name, heal: result.health })];
      const removal = removalText(target);
      if (removal) parts.push(removal);
      text = parts.join('; ');
    } else if (flags.effectKind === 'dispel') {
      text = `«${target.name}»: ${removalText(target) ?? i18n.localize('HEROES_GLORY.Roll.SpellDispelNothing')}`;
    } else {
      const notes = [];
      if (flags.untilCombatEnd) notes.push(i18n.localize('HEROES_GLORY.Roll.SpellResurrectUntilEnd'));
      if (result.wound) notes.push(i18n.localize('HEROES_GLORY.Roll.SpellResurrectWound'));
      else if (target.isHero && !flags.untilCombatEnd && flags.noWound) notes.push(i18n.localize('HEROES_GLORY.Roll.SpellResurrectNoWound'));
      text = i18n.format(done ? 'HEROES_GLORY.Roll.SpellResurrectApplied' : 'HEROES_GLORY.Roll.SpellResurrectPending', {
        target: target.name, health: result.health,
      });
      if (notes.length) text += `; ${notes.join('; ')}`;
    }
    if (target.resistDie != null) {
      text += ` (${i18n.format('HEROES_GLORY.Roll.SpellResistRoll', {
        source: i18n.localize(SPELL_RESIST_LABELS[target.resistSource]),
        die: target.resistDie,
        need: target.resistThreshold,
      })})`;
    }
    return text;
  });
  if (flags.effectKind === 'heal') {
    context.damageSpell = true;
    context.breakdown = [i18n.format('HEROES_GLORY.Roll.SpellRollLine', { spell: flags.spellName, formula: flags.formula, total: flags.total })];
    context.totalLine = i18n.format('HEROES_GLORY.Roll.SpellHealTotalLine', { total: flags.total });
  }
  return context;
}

/**
 * §6.4, group В: the GM's confirm on a support spell card — applies exactly
 * what resolveSupportSpellResolution says. Лечение: Health up to the maximum,
 * then the negative spells and the listed statuses come off; Развеивание: the
 * spells and statuses; Воскрешение: «повержен», «недееспособен» and «без
 * сознания» off («упал» stays, rules.md §11), Health set, a Ранение for a
 * lasting one (p. 32), and without Продвинутый a mark that the end of this
 * battle takes him back down (endTemporaryResurrections). A Воскрешение
 * without Продвинутый whose battle is over isn't applied.
 * @param {ChatMessage} message
 * @param {object} flags
 * @returns {Promise<ChatMessage|void>}
 */
async function confirmSupportSpell(message, flags) {
  if (flags.untilCombatEnd && !game.combats.get(flags.combatId)) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellCombatOver', { spell: flags.spellName }));
    return;
  }
  if (flags.dispelCell) {
    const scene = game.scenes.get(flags.dispelCell.sceneId);
    const ids = flags.dispelCell.regionIds.filter((id) => scene?.regions.has(id));
    if (ids.length) await scene.deleteEmbeddedDocuments('Region', ids);
  }
  const results = resolveSupportSpellResolution(flags);
  for (const [index, target] of flags.targets.entries()) {
    if (results[index].outcome !== 'applied') continue;
    const targetActor = actorFromCard(target.tokenUuid, target.actorId);
    if (!targetActor) {
      ui.notifications.error(game.i18n.format('HEROES_GLORY.Roll.ConfirmTargetMissing', { target: target.name }));
      continue;
    }
    if (flags.effectKind === 'heal' && results[index].health) {
      const health = targetActor.system.health;
      await targetActor.update({ 'system.health.value': Math.min(health.max, health.value + results[index].health) });
    }
    if (flags.effectKind === 'heal' || flags.effectKind === 'dispel') {
      const ids = (target.removeEffectIds ?? []).filter((id) => targetActor.effects.has(id));
      if (ids.length) await targetActor.deleteEmbeddedDocuments('ActiveEffect', ids);
      for (const status of target.removeStatuses ?? []) {
        if (targetActor.statuses.has(status)) await targetActor.toggleStatusEffect(status, { active: false });
      }
    }
    if (flags.effectKind === 'resurrect') {
      const { incapacitated, unconscious } = CONFIG.HEROES_GLORY.statusEffects;
      for (const status of [CONFIG.specialStatusEffects.DEFEATED, incapacitated, unconscious]) {
        if (targetActor.statuses.has(status)) await targetActor.toggleStatusEffect(status, { active: false });
      }
      const update = { 'system.health.value': results[index].health };
      if (results[index].wound) update['system.wounds'] = targetActor.system.wounds + 1;
      await targetActor.update(update);
      if (flags.untilCombatEnd) {
        await targetActor.setFlag(FLAG_SCOPE, RESURRECTED_FLAG, { combatId: flags.combatId, dead: !!target.dead });
      }
    }
  }
  const nextFlags = { ...flags, confirmed: true, confirmedAt: Date.now() };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(nextFlags),
  );
  return message.update({ content, flags: { [FLAG_SCOPE]: { spell: nextFlags } } });
}

/**
 * §6.4, group Г: the expert Развеивание Магии with no target chosen (p. 57:
 * «Вы можете выбрать видимый эффект (например силовое поле, огненную стену и
 * т.п.) и убрать его», rules.md §11) — the caster picks a cell within 24
 * cells (core region placement, nothing saved); our field spells there that
 * the user sees go at the GM's confirm. A cell with none keeps the choice
 * open; right click or Esc cancels, no Mana spent. Works out of combat.
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} cast   variant, variantData, resolvedSchool, manaCost
 * @returns {Promise<ChatMessage|null>}
 */
async function castDispelCellSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost }) {
  const i18n = game.i18n;
  const casterToken = casterTokenOnCanvas(actor);
  if (!casterToken) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellNoCasterToken', { spell: spell.name }));
    return null;
  }
  const grid = canvas.grid;
  if (grid.isGridless) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellAreaNoGrid', { spell: spell.name }));
    return null;
  }
  const scene = casterToken.parent;
  const seenRegions = () => scene.regions.filter((region) => region.getFlag(FLAG_SCOPE, FIELD_FLAG)).map((region) => ({
    id: region.id,
    cells: region.shapes.flatMap((shape) => shape.offsets ?? []),
    visible: !!region.object?.isVisible,
  }));
  const start = casterToken.getOccupiedGridSpaceOffsets()[0];
  ui.notifications.info(i18n.format('HEROES_GLORY.Roll.SpellDispelCellPlace', { spell: spell.name }));
  let region = null;
  try {
    region = await canvas.regions.placeRegion({
      name: spell.name,
      shapes: [{ type: 'grid', offsets: [start], origin: grid.getCenterPoint(start) }],
      levels: [casterToken.level],
      color: game.user.color,
      highlightMode: 'coverage',
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
    }, {
      create: false,
      allowRotation: false,
      preConfirm: ({ shape }) => {
        const cell = grid.getOffset(shape.origin);
        const cells = tokenCellDistance(casterToken, cell);
        let refusal = null;
        if (cells > SPELL_RANGE_CELLS) refusal = ['SpellFieldOutOfRange', { cells, range: SPELL_RANGE_CELLS }];
        else if (!dispelCellRegionIds(seenRegions(), cell).length) refusal = ['SpellDispelCellNothing', {}];
        if (!refusal) return true;
        ui.notifications.warn(i18n.format(`HEROES_GLORY.Roll.${refusal[0]}`, { spell: spell.name, ...refusal[1] }));
        return false;
      },
    });
  } catch (error) {
    console.warn(`heroes-glory | «${spell.name}»: placement failed`, error);
    return null;
  }
  if (!region) return null;
  const cell = grid.getOffset(region.shapes[0].origin);
  const regionIds = dispelCellRegionIds(seenRegions(), cell);
  if (!regionIds.length) return null;
  const names = [...new Set(regionIds.map((id) => scene.regions.get(id).getFlag(FLAG_SCOPE, FIELD_FLAG).spellName))];

  const manaRemaining = actor.system.mana.value - manaCost;
  await actor.update({ 'system.mana.value': manaRemaining });
  const flags = {
    kind: 'spell',
    effectKind: 'dispel',
    actorId: actor.id,
    actorUuid: actor.uuid,
    casterName: actor.name,
    spellName: spell.name,
    variant,
    school: resolvedSchool,
    description: variantData.description,
    manaCost,
    manaRemaining,
    dispelCell: { sceneId: scene.id, ...sceneCellNumbers(scene, cell), regionIds, names },
    targets: [],
    confirmed: false,
  };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(flags),
  );
  return createActorVisibilityCard(actor, { content, flags: { [FLAG_SCOPE]: { spell: flags } } }, []);
}

/** Region flag: a field spell (group Г) — its caster, battle, rounds, damage. */
const FIELD_FLAG = 'fieldSpell';

/**
 * The caster's token on the scene the user is looking at — where a cell is
 * chosen. `null` without one.
 * @param {Actor} actor
 * @returns {TokenDocument|null}
 */
function casterTokenOnCanvas(actor) {
  const token = actor.token ?? actor.getActiveTokens(false, true).find((t) => t.parent === canvas.scene) ?? null;
  return token?.parent === canvas.scene ? token : null;
}

/**
 * A token's `displace` across the scene's regions. Core builds a region's
 * polygon tree lazily, through the `polygonTree` getter (drawing does), but
 * its teleport test for a `displace` reads the private field directly — a
 * region not drawn on this client yet (a new trap, one this user can't see)
 * throws «reading 'testPoint'». Touching the getter first builds them.
 * @param {TokenDocument} tokenDoc
 * @param {{x: number, y: number}} destination
 * @returns {Promise<unknown>}
 */
function displaceToken(tokenDoc, { x, y }) {
  for (const region of tokenDoc.parent.regions) void region.polygonTree;
  return tokenDoc.move({ x, y, action: 'displace' });
}

/** `i.j` — a cell as a key. */
const cellKey = (cell) => `${cell.i}.${cell.j}`;

/**
 * The cells a scene's tokens stand on, but `except`'s.
 * @param {Scene} scene
 * @param {TokenDocument|null} [except]
 * @returns {Set<string>}
 */
function occupiedCellKeys(scene, except = null) {
  const keys = new Set();
  for (const doc of scene.tokens) {
    if (doc === except) continue;
    for (const cell of doc.getOccupiedGridSpaceOffsets()) keys.add(cellKey(cell));
  }
  return keys;
}

/**
 * The cells of the scene's field spells of one kind (group Г).
 * @param {Scene} scene
 * @param {string} type
 * @returns {Set<string>}
 */
function fieldCellKeys(scene, type) {
  const keys = new Set();
  for (const region of scene.regions) {
    if (region.getFlag(FLAG_SCOPE, FIELD_FLAG)?.type !== type) continue;
    for (const shape of region.shapes) for (const cell of shape.offsets ?? []) keys.add(cellKey(cell));
  }
  return keys;
}

/**
 * §6.4, group Г: Телепорт (p. 58, rules.md §11) — «Выберите дружественное
 * существо. Телепортирует его на видимую вами клетку.» One target (T) within
 * 24 cells on the caster's side; then the caster places the target's
 * footprint on the scene (core region placement, nothing saved): every cell
 * free, within the scene, not in a Силовое Поле, one of them seen from the
 * caster's token. Right click or Esc cancels. Works out of combat; the GM's
 * confirm moves the token as core's `displace` — not stepping into a Стена
 * Огня or a trap.
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} cast   variant, variantData, resolvedSchool, manaCost, effect
 * @returns {Promise<ChatMessage|null>}
 */
async function castTeleportSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect }) {
  const i18n = game.i18n;
  const selected = [...game.user.targets].map((token) => token.document).filter((doc) => doc.actor);
  if (!selected.length) {
    ui.notifications.warn(i18n.localize('HEROES_GLORY.Roll.SpellNoTarget'));
    return null;
  }
  if (selected.length > 1) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellOneTarget', { spell: spell.name }));
    return null;
  }
  const [targetDoc] = selected;
  const casterToken = casterTokenOnCanvas(actor);
  if (!casterToken || targetDoc.parent !== casterToken.parent) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellNoCasterToken', { spell: spell.name }));
    return null;
  }
  const distance = tokenDistanceCells(casterToken, targetDoc);
  if (distance !== null && distance > SPELL_RANGE_CELLS) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellOutOfRange', {
      spell: spell.name, target: targetDoc.actor.name, cells: distance, range: SPELL_RANGE_CELLS,
    }));
    return null;
  }
  if (!isFriendlyTarget(targetDoc.disposition, casterToken.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY)) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellTeleportNotFriendly', { spell: spell.name, target: targetDoc.actor.name }));
    return null;
  }
  if (soleTargetRefuses(spell, effect, selected)) return null;

  const scene = casterToken.parent;
  const grid = canvas.grid;
  const anchor = grid.getOffset({ x: targetDoc.x + 1, y: targetDoc.y + 1 });
  const occupied = occupiedCellKeys(scene, targetDoc);
  const forceField = fieldCellKeys(scene, 'forceField');
  ui.notifications.info(i18n.format('HEROES_GLORY.Roll.SpellTeleportPlace', { spell: spell.name, target: targetDoc.actor.name }));
  let region = null;
  try {
    region = await canvas.regions.placeRegion({
      name: spell.name,
      shapes: [{ type: 'grid', offsets: targetDoc.getOccupiedGridSpaceOffsets(), origin: grid.getCenterPoint(anchor) }],
      levels: [casterToken.level],
      color: game.user.color,
      highlightMode: 'coverage',
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
    }, {
      create: false,
      allowRotation: false,
      onMove: footprintByMiddle(targetDoc.width, targetDoc.height),
      preConfirm: ({ shape }) => {
        const cells = shape.offsets;
        let refusal = null;
        if (!cells.every((cell) => cellInSceneRect(scene, cell))) refusal = 'SpellTeleportOutside';
        else if (cells.some((cell) => occupied.has(cellKey(cell)))) refusal = 'SpellTeleportOccupied';
        else if (cells.some((cell) => forceField.has(cellKey(cell)))) refusal = 'SpellTeleportForceField';
        else if (!cells.some((cell) => pointInSight(casterToken, grid.getCenterPoint(cell)))) refusal = 'SpellTeleportNotVisible';
        if (!refusal) return true;
        ui.notifications.warn(i18n.format(`HEROES_GLORY.Roll.${refusal}`, { spell: spell.name }));
        return false;
      },
    });
  } catch (error) {
    console.warn(`heroes-glory | «${spell.name}»: placement failed`, error);
    return null;
  }
  // Esc gives null, a right click undefined — both cancel (rules.md §11).
  if (!region) return null;
  const destinationCell = grid.getOffset(region.shapes[0].origin);
  const topLeft = grid.getTopLeftPoint(destinationCell);

  const manaRemaining = actor.system.mana.value - manaCost;
  await actor.update({ 'system.mana.value': manaRemaining });
  const { entry } = await spellTargetEntry(targetDoc, spell, effect, 1, { resist: false, skipIncapacitated: false });
  entry.destination = { x: topLeft.x, y: topLeft.y, ...sceneCellNumbers(scene, destinationCell) };

  const flags = {
    kind: 'spell',
    effectKind: 'teleport',
    actorId: actor.id,
    actorUuid: actor.uuid,
    casterName: actor.name,
    spellName: spell.name,
    variant,
    school: resolvedSchool,
    description: variantData.description,
    manaCost,
    manaRemaining,
    targets: [entry],
    confirmed: false,
  };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(flags),
  );
  return createActorVisibilityCard(actor, { content, flags: { [FLAG_SCOPE]: { spell: flags } } }, []);
}

/**
 * §6.4, group Г: Силовое Поле (p. 54) and Стена Огня (p. 59) — the caster
 * chooses the cells one by one (core region placement, nothing saved; each
 * click a cell): within 24 cells, within the scene, side by side as a chain,
 * free of creatures for Стена Огня; right click or Esc on any cell cancels
 * the cast (rules.md §11). Only in combat; a lasting spell (the limit of
 * three). The «Стена Огня» specialization (p. 23) — one cell more and +5d6.
 * The GM's confirm creates the region (confirmFieldSpell).
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} cast   variant, variantData, resolvedSchool, manaCost, effect
 * @returns {Promise<ChatMessage|null>}
 */
async function castFieldSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect }) {
  const i18n = game.i18n;
  const field = effect.field;
  const castStart = casterCombatStart(actor);
  if (!castStart) {
    ui.notifications.warn(i18n.localize('HEROES_GLORY.Roll.SpellOutOfCombat'));
    return null;
  }
  const casterToken = casterTokenOnCanvas(actor);
  if (!casterToken) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellNoCasterToken', { spell: spell.name }));
    return null;
  }
  const grid = canvas.grid;
  if (grid.isGridless) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellAreaNoGrid', { spell: spell.name }));
    return null;
  }
  const specialization = field.type === 'fireWall'
    ? fireWallSpecialization(actor.system.specialization, spell.name)
    : fireWallSpecialization(null, '');
  const count = field.cells + specialization.extraCells;
  // Зыбучий Песок lasts to the end of the battle — not a lasting spell (rules.md §11).
  const quicksand = field.type === 'quicksand';
  const endCast = quicksand ? null : await chooseLastingSpellToEnd(actor, spell.name, []);
  if (endCast === false) return null;

  const scene = casterToken.parent;
  const occupied = occupiedCellKeys(scene);
  const start = casterToken.getOccupiedGridSpaceOffsets()[0];
  const cellShape = () => ({ type: 'grid', offsets: [start], origin: grid.getCenterPoint(start) });
  ui.notifications.info(i18n.format('HEROES_GLORY.Roll.SpellFieldPlace', { spell: spell.name, count }));
  let region = null;
  try {
    region = await canvas.regions.placeRegion({
      name: spell.name,
      shapes: Array.from({ length: count }, cellShape),
      levels: [casterToken.level],
      color: game.user.color,
      highlightMode: 'coverage',
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
    }, {
      create: false,
      allowRotation: false,
      preConfirm: ({ document, shape, shapeIndex }) => {
        const cell = grid.getOffset(shape.origin);
        const warn = (key, data = {}) => {
          ui.notifications.warn(i18n.format(`HEROES_GLORY.Roll.${key}`, { spell: spell.name, ...data }));
          return false;
        };
        const cells = tokenCellDistance(casterToken, cell);
        if (cells > SPELL_RANGE_CELLS) return warn('SpellFieldOutOfRange', { cells, range: SPELL_RANGE_CELLS });
        if (!cellInSceneRect(scene, cell)) return warn('SpellTeleportOutside');
        if (field.freeCells && occupied.has(cellKey(cell))) return warn('SpellFieldOccupied');
        const chosen = document.shapes.slice(0, shapeIndex).map((s) => grid.getOffset(s.origin));
        const choice = fieldCellChoice({ cell, chosen, adjacent: field.adjacent, isAdjacent: (a, b) => grid.testAdjacency(a, b) });
        if (choice === 'same') return warn('SpellFieldSameCell');
        if (choice === 'notAdjacent') return warn('SpellFieldNotAdjacent');
        return true;
      },
    });
  } catch (error) {
    console.warn(`heroes-glory | «${spell.name}»: placement failed`, error);
    return null;
  }
  // Cancelled, or a cell skipped with a right click — the whole cast is off (rules.md §11).
  if (!region || region.shapes.length < count) return null;
  const cells = region.shapes.map((shape) => grid.getOffset(shape.origin));

  const manaRemaining = actor.system.mana.value - manaCost;
  await actor.update({ 'system.mana.value': manaRemaining });

  // Стена Огня: what each burn rolls, frozen at the cast — 1d6 (+1 / +2) for
  // each of the caster's СМ, Волшебство (a damage spell, rules.md §11), the
  // specialization's 5d6.
  let fire = null;
  if (field.type === 'fireWall') {
    const owned = actor.items.filter((i) => i.type === 'skill').map((i) => ({ skillKey: i.system.skillKey, tier: i.system.tier }));
    const sorceryTier = highestSkillTier(owned, 'sorcery');
    const sorcery = sorceryDice({
      sorceryTier,
      sorcerySpecialization: actor.system.specialization?.type === 'skill' && actor.system.specialization.key === 'sorcery',
      spellLevel: spell.system.level,
    });
    fire = {
      dice: spellDamageDice(effect.dice, actor.system.magicPower),
      sorceryTier,
      sorcerySkill: sorcery.skill,
      sorcerySpecialization: sorcery.specialization,
      fireWallSpecialization: specialization.bonusDice,
      level: spell.system.level,
    };
  }

  const flags = {
    kind: 'spell',
    effectKind: 'field',
    actorId: actor.id,
    actorUuid: actor.uuid,
    casterName: actor.name,
    spellName: spell.name,
    spellImg: spell.img,
    variant,
    school: resolvedSchool,
    description: variantData.description,
    manaCost,
    manaRemaining,
    field: {
      type: field.type,
      sceneId: scene.id,
      level: casterToken.level,
      cells: cells.map(({ i, j }) => ({ i, j })),
      labels: cells.map((cell) => sceneCellNumbers(scene, cell)),
    },
    fire,
    rounds: lastingSpellRounds(actor.system.magicPower,
      actor.items.filter((i) => i.type === 'artifact' && i.system.equipped).map((i) => i.name)),
    castStart,
    castId: foundry.utils.randomID(),
    endCast,
    targets: [],
    confirmed: false,
  };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(flags),
  );
  const messageData = { content, flags: { [FLAG_SCOPE]: { spell: flags } } };
  // «Невидимые ловушки»: their cells only for the caster's owners and the GM.
  if (quicksand) {
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), ...messageData, whisper: ownersAndGmIds(actor) });
  }
  return createActorVisibilityCard(actor, messageData, []);
}

/**
 * A Телепорт or field spell card's lines — where to, which cells.
 * @param {object} flags
 * @param {object} context   the plain cast's context
 * @returns {object}
 */
function buildPlacementSpellCardContext(flags, context) {
  const i18n = game.i18n;
  const done = !!flags.confirmed;
  context.targetSpell = true;
  context.confirmHintKey = 'HEROES_GLORY.Roll.SpellSupportConfirmHint';
  context.confirmed = done;
  context.canConfirm = canConfirmSpell(flags);
  if (flags.effectKind === 'teleport') {
    const results = resolveSupportSpellResolution(flags);
    context.targetLines = flags.targets.map((target, index) => {
      if (results[index].outcome === 'immune') {
        return i18n.format('HEROES_GLORY.Roll.SpellModifierImmune', {
          target: target.name, reason: i18n.format(SPELL_IMMUNITY_LABELS[target.immunity], { element: '' }),
        });
      }
      return i18n.format(done ? 'HEROES_GLORY.Roll.SpellTeleportApplied' : 'HEROES_GLORY.Roll.SpellTeleportPending', {
        target: target.name, column: target.destination.column, row: target.destination.row,
      });
    });
    return context;
  }
  if (flags.effectKind === 'clone') {
    const { name, system, destinations } = flags.clone;
    context.targetLines = [
      ...destinations.map((d) => i18n.format(done ? 'HEROES_GLORY.Roll.CloneApplied' : 'HEROES_GLORY.Roll.ClonePending', {
        name, column: d.column, row: d.row, rounds: flags.rounds,
      })),
      i18n.format('HEROES_GLORY.Roll.CloneStats', {
        attack: system.attack, defense: system.defense, damage: system.damage,
        health: system.health.value, max: system.health.max,
      }),
    ];
    context.endCastLine = flags.endCast
      ? i18n.format(done ? 'HEROES_GLORY.Roll.SpellEndApplied' : 'HEROES_GLORY.Roll.SpellEndPending', { cast: flags.endCast.label })
      : null;
    return context;
  }
  if (flags.effectKind === 'summon') {
    const { creatureName, stats, destination } = flags.summon;
    context.targetLines = [
      i18n.format(done ? 'HEROES_GLORY.Roll.SummonApplied' : 'HEROES_GLORY.Roll.SummonPending', {
        creature: creatureName, column: destination.column, row: destination.row, rounds: flags.rounds,
      }),
      i18n.format('HEROES_GLORY.Roll.SummonStats', {
        attack: stats.attack, damage: stats.damage, health: stats.health.max,
      }),
    ];
    context.endCastLine = flags.endCast
      ? i18n.format(done ? 'HEROES_GLORY.Roll.SpellEndApplied' : 'HEROES_GLORY.Roll.SpellEndPending', { cast: flags.endCast.label })
      : null;
    return context;
  }
  const cells = flags.field.labels.map(({ column, row }) => `${column}:${row}`).join(', ');
  context.targetLines = flags.field.type === 'quicksand'
    ? [
      i18n.format(done ? 'HEROES_GLORY.Roll.SpellQuicksandApplied' : 'HEROES_GLORY.Roll.SpellQuicksandPending', { spell: flags.spellName, count: flags.field.cells.length }),
      i18n.format('HEROES_GLORY.Roll.SpellFieldCells', { cells }),
      i18n.format('HEROES_GLORY.Roll.SpellQuicksandSecret', { caster: flags.casterName }),
    ]
    : [
      i18n.format(done ? 'HEROES_GLORY.Roll.SpellFieldApplied' : 'HEROES_GLORY.Roll.SpellFieldPending', { spell: flags.spellName, rounds: flags.rounds }),
      i18n.format('HEROES_GLORY.Roll.SpellFieldCells', { cells }),
    ];
  if (flags.fire) {
    const { dice, sorcerySkill, sorcerySpecialization, fireWallSpecialization } = flags.fire;
    const total = { count: dice.count + sorcerySkill + sorcerySpecialization + fireWallSpecialization, flat: dice.flat };
    context.targetLines.push(i18n.format('HEROES_GLORY.Roll.SpellFieldDice', { formula: spellFormula(total) }));
  }
  context.endCastLine = flags.endCast
    ? i18n.format(done ? 'HEROES_GLORY.Roll.SpellEndApplied' : 'HEROES_GLORY.Roll.SpellEndPending', { cast: flags.endCast.label })
    : null;
  return context;
}

/**
 * §6.4, group Г: the GM's confirm on a Телепорт card — the token is moved as
 * core's `displace` (through walls, not a step into a region; rules.md §11).
 * @param {ChatMessage} message
 * @param {object} flags
 * @returns {Promise<ChatMessage|void>}
 */
async function confirmTeleportSpell(message, flags) {
  const results = resolveSupportSpellResolution(flags);
  for (const [index, target] of flags.targets.entries()) {
    if (results[index].outcome !== 'applied') continue;
    const tokenDoc = target.tokenUuid ? fromUuidSync(target.tokenUuid) : null;
    if (!tokenDoc) {
      ui.notifications.error(game.i18n.format('HEROES_GLORY.Roll.ConfirmTargetMissing', { target: target.name }));
      continue;
    }
    await displaceToken(tokenDoc, target.destination);
  }
  return markSpellConfirmed(message, flags);
}

/**
 * §6.4, group Г: the GM's confirm on a field spell card — creates the region
 * on the scene of the cast: Силовое Поле — impassable for movement, flying
 * too (its behavior's infinite terrain cost); Стена Огня — with its behavior
 * (burnFireWall). Both are seen by all,
 * last the cast's rounds (expireFieldSpells) and end with the battle. If the
 * battle is over, nothing is created.
 * @param {ChatMessage} message
 * @param {object} flags
 * @returns {Promise<ChatMessage|void>}
 */
async function confirmFieldSpell(message, flags) {
  if (!game.combats.get(flags.castStart?.combat)) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellCombatOver', { spell: flags.spellName }));
    return;
  }
  const scene = game.scenes.get(flags.field.sceneId);
  if (!scene) return;
  if (!(await confirmWithinLimit(flags))) return;
  await endLastingCast(flags);
  if (flags.field.type === 'quicksand') {
    await createQuicksandTraps(scene, flags);
    return markSpellConfirmed(message, flags);
  }
  const forceField = flags.field.type === 'forceField';
  await scene.createEmbeddedDocuments('Region', [{
    name: flags.spellName,
    color: forceField ? '#5aa0ff' : '#ff6400',
    shapes: [{ type: 'grid', offsets: flags.field.cells }],
    levels: [flags.field.level],
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    highlightMode: 'coverage',
    // Силовое Поле: impassable through its terrain (region-force-field.mjs).
    behaviors: [{ name: flags.spellName, type: forceField ? 'heroes-glory.forceField' : 'heroes-glory.fireWall', system: {} }],
    flags: {
      [FLAG_SCOPE]: {
        [FIELD_FLAG]: {
          type: flags.field.type,
          spellName: flags.spellName,
          casterUuid: flags.actorUuid,
          casterName: flags.casterName,
          combatId: flags.castStart.combat,
          casterCombatant: flags.castStart.combatant,
          castId: flags.castId,
          expiresRound: fieldExpiresRound(flags.castStart.round, flags.rounds),
          fire: flags.fire,
          school: flags.school,
          variant: flags.variant,
        },
      },
    },
  }]);
  return markSpellConfirmed(message, flags);
}

/**
 * Зыбучий Песок (p. 53): one region a trap, so that a sprung one shows alone
 * (rules.md §11). Seen by the GM and the caster's owners (Observer, the
 * region's own ownership), sprung by everyone (region-quicksand.mjs); no
 * rounds — gone with the battle (clearFieldSpellsAfterCombat).
 * @param {Scene} scene
 * @param {object} flags   the cast card's
 * @returns {Promise<RegionDocument[]>}
 */
async function createQuicksandTraps(scene, flags) {
  const caster = fromUuidSync(flags.actorUuid);
  const ownerIds = caster instanceof Actor
    ? game.users.filter((u) => !u.isGM && caster.testUserPermission(u, 'OWNER')).map((u) => u.id)
    : [];
  return scene.createEmbeddedDocuments('Region', flags.field.cells.map((cell) => ({
    name: flags.spellName,
    color: '#c8a050',
    shapes: [{ type: 'grid', offsets: [cell] }],
    levels: [flags.field.level],
    visibility: CONST.REGION_VISIBILITY.OBSERVER,
    ownership: quicksandOwnership(ownerIds),
    highlightMode: 'coverage',
    behaviors: [{ name: flags.spellName, type: 'heroes-glory.quicksand', system: {} }],
    flags: {
      [FLAG_SCOPE]: {
        [FIELD_FLAG]: {
          type: 'quicksand',
          spellName: flags.spellName,
          casterUuid: flags.actorUuid,
          casterName: flags.casterName,
          combatId: flags.castStart.combat,
          casterCombatant: flags.castStart.combatant,
          castId: flags.castId,
          expiresRound: null,
          sprung: false,
          school: flags.school,
          variant: flags.variant,
        },
      },
    },
  })));
}

/**
 * A Зыбучий Песок trap sprung (p. 53: «Существо, попавшее в ловушку,
 * немедленно заканчивает ход»): the mover's client already stopped the token
 * (region-quicksand.mjs); the active GM shows the trap to everyone — it stays
 * till the end of the battle (rules.md §11) — and posts the line. Passing
 * the turn is the GM's.
 * @param {RegionDocument} region
 * @param {TokenDocument} tokenDoc
 * @returns {Promise<ChatMessage|null>}
 */
export async function springQuicksand(region, tokenDoc) {
  if (!game.user.isActiveGM) return null;
  const data = region?.getFlag(FLAG_SCOPE, FIELD_FLAG);
  if (!data || !tokenDoc?.actor) return null;
  if (!data.sprung || region.visibility !== CONST.REGION_VISIBILITY.ALWAYS) {
    await region.update({
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      [`flags.${FLAG_SCOPE}.${FIELD_FLAG}.sprung`]: true,
    });
  }
  // Core stops the token where it crossed into the region, off the grid;
  // it stands in the trap's cell — set there as `displace`, after the
  // animation (as core's teleport behavior waits), springing nothing again.
  if (tokenDoc.rendered && tokenDoc.object.movementAnimationPromise) {
    await game.raceWithWindowHidden(tokenDoc.object.movementAnimationPromise);
  }
  const snapped = tokenDoc.object?.getSnappedPosition(tokenDoc._source);
  if (snapped && (snapped.x !== tokenDoc._source.x || snapped.y !== tokenDoc._source.y)) {
    await displaceToken(tokenDoc, snapped);
  }
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: tokenDoc }),
    content: `<p>${foundry.utils.escapeHTML(game.i18n.format('HEROES_GLORY.Roll.QuicksandSprung', {
      target: tokenDoc.actor.name, caster: data.casterName,
    }))}</p>`,
  });
}

/**
 * A token-sized footprint follows the cursor by its middle, not its top-left
 * cell (rules.md §11): core moves a grid shape by the cell under the point,
 * so the point is moved back by half the footprint first. 1×1 is unchanged.
 * @param {number} width    in cells
 * @param {number} height   in cells
 * @returns {(args: {position: Point, shape: object}) => false}   placeRegion's onMove
 */
function footprintByMiddle(width, height) {
  const size = canvas.grid.size;
  return ({ position, shape }) => {
    shape.move(footprintAnchor(position, width, height, size), { snap: true });
    return false;
  };
}

/**
 * The cells a token-sized footprint takes with `cell` as its top-left.
 * @param {{i: number, j: number}} cell
 * @param {number} width   in cells
 * @param {number} height  in cells
 * @returns {Array<{i: number, j: number}>}
 */
function footprintCells(cell, width, height) {
  const cells = [];
  for (let di = 0; di < Math.max(1, height); di++) {
    for (let dj = 0; dj < Math.max(1, width); dj++) cells.push({ i: cell.i + di, j: cell.j + dj });
  }
  return cells;
}

/**
 * Group Д: may a Призыв Элементаля start at all — in combat, and no
 * elemental of this caster alive («одного Элементаля за раз», rules.md §11)?
 * Asked before the element dialog and again at the cast; a refusal is told.
 * @param {Actor} actor
 * @param {Item} spell
 * @returns {boolean}
 */
function summonCanStart(actor, spell) {
  if (!casterCombatStart(actor)) {
    ui.notifications.warn(game.i18n.localize('HEROES_GLORY.Roll.SpellOutOfCombat'));
    return false;
  }
  const alive = summonedTokens((data) => data.kind === 'summon' && data.casterUuid === actor.uuid);
  if (alive.length) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SummonAlready', { spell: spell.name, name: alive[0].name }));
    return false;
  }
  return true;
}

/**
 * §6.4, group Д: Призыв Элементаля (p. 61, rules.md §11). Only in combat, a
 * lasting spell (the limit of three); one elemental at a time — while the
 * caster's previous one lives, refused before any Mana. The element was
 * picked already (chooseSummonElement), its school's variant. The caster
 * places the elemental's footprint (core region placement, nothing saved):
 * free cells within the scene, not in a Силовое Поле, within 24 cells; no
 * line of sight. Right click or Esc cancels. The GM's confirm makes the
 * token (confirmSummonSpell).
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} cast   variant, variantData, resolvedSchool, manaCost, effect, element
 * @returns {Promise<ChatMessage|null>}
 */
async function castSummonSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect, element }) {
  const i18n = game.i18n;
  if (!summonCanStart(actor, spell)) return null;
  const castStart = casterCombatStart(actor);
  const casterToken = casterTokenOnCanvas(actor);
  if (!casterToken) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellNoCasterToken', { spell: spell.name }));
    return null;
  }
  const grid = canvas.grid;
  if (grid.isGridless) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellAreaNoGrid', { spell: spell.name }));
    return null;
  }
  const pack = game.packs.get(CREATURES_PACK);
  const entry = pack ? (await pack.getIndex()).find((e) => e.name === SUMMON_ELEMENTALS[element]) : null;
  const creature = entry ? await pack.getDocument(entry._id) : null;
  if (!creature) {
    ui.notifications.error(i18n.format('HEROES_GLORY.Roll.SummonNoCreature', { creature: SUMMON_ELEMENTALS[element] }));
    return null;
  }
  const endCast = await chooseLastingSpellToEnd(actor, spell.name, []);
  if (endCast === false) return null;

  const scene = casterToken.parent;
  const width = creature.prototypeToken.width;
  const height = creature.prototypeToken.height;
  const occupied = occupiedCellKeys(scene);
  const forceField = fieldCellKeys(scene, 'forceField');
  const start = casterToken.getOccupiedGridSpaceOffsets()[0];
  ui.notifications.info(i18n.format('HEROES_GLORY.Roll.SummonPlace', { spell: spell.name, creature: creature.name }));
  let region = null;
  try {
    region = await canvas.regions.placeRegion({
      name: spell.name,
      shapes: [{ type: 'grid', offsets: footprintCells(start, width, height), origin: grid.getCenterPoint(start) }],
      levels: [casterToken.level],
      color: game.user.color,
      highlightMode: 'coverage',
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
    }, {
      create: false,
      allowRotation: false,
      onMove: footprintByMiddle(width, height),
      preConfirm: ({ shape }) => {
        const cells = shape.offsets;
        const distance = Math.min(...cells.map((cell) => tokenCellDistance(casterToken, cell)));
        let refusal = null;
        if (distance > SPELL_RANGE_CELLS) refusal = ['SpellFieldOutOfRange', { cells: distance, range: SPELL_RANGE_CELLS }];
        else if (!cells.every((cell) => cellInSceneRect(scene, cell))) refusal = ['SpellTeleportOutside', {}];
        else if (cells.some((cell) => occupied.has(cellKey(cell)))) refusal = ['SpellTeleportOccupied', {}];
        else if (cells.some((cell) => forceField.has(cellKey(cell)))) refusal = ['SpellTeleportForceField', {}];
        if (!refusal) return true;
        ui.notifications.warn(i18n.format(`HEROES_GLORY.Roll.${refusal[0]}`, { spell: spell.name, ...refusal[1] }));
        return false;
      },
    });
  } catch (error) {
    console.warn(`heroes-glory | «${spell.name}»: placement failed`, error);
    return null;
  }
  if (!region) return null;
  const cell = grid.getOffset(region.shapes[0].origin);
  const topLeft = grid.getTopLeftPoint(cell);

  const manaRemaining = actor.system.mana.value - manaCost;
  await actor.update({ 'system.mana.value': manaRemaining });
  const flags = {
    kind: 'spell',
    effectKind: 'summon',
    actorId: actor.id,
    actorUuid: actor.uuid,
    casterName: actor.name,
    spellName: spell.name,
    variant,
    school: resolvedSchool,
    description: variantData.description,
    manaCost,
    manaRemaining,
    summon: {
      element,
      creatureUuid: creature.uuid,
      creatureName: creature.name,
      stats: summonedCreatureStats(creature.system, effect.summon),
      sceneId: scene.id,
      level: casterToken.level,
      destination: { x: topLeft.x, y: topLeft.y, ...sceneCellNumbers(scene, cell) },
    },
    rounds: lastingSpellRounds(actor.system.magicPower,
      actor.items.filter((i) => i.type === 'artifact' && i.system.equipped).map((i) => i.name)),
    castStart,
    castId: foundry.utils.randomID(),
    endCast,
    targets: [],
    confirmed: false,
  };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(flags),
  );
  return createActorVisibilityCard(actor, { content, flags: { [FLAG_SCOPE]: { spell: flags } } }, []);
}

/**
 * The world actor a summoned elemental's token stands on — the bestiary's,
 * imported once into a folder of its own and reused (rules.md §11: the
 * world isn't filled with actors; the token's delta holds the bonuses and
 * the owner). Players have no rights on it.
 * @param {string} creatureUuid
 * @returns {Promise<Actor|null>}
 */
async function summonBaseActor(creatureUuid) {
  const found = game.actors.find((a) => a.getFlag(FLAG_SCOPE, 'summonBase') === creatureUuid);
  if (found) return found;
  const source = await fromUuid(creatureUuid);
  if (!source) return null;
  const folderName = game.i18n.localize('HEROES_GLORY.Roll.SummonFolder');
  const folder = game.folders.find((f) => f.type === 'Actor' && f.name === folderName)
    ?? await Folder.create({ name: folderName, type: 'Actor' });
  const data = game.actors.fromCompendium(source);
  data.folder = folder.id;
  data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
  foundry.utils.setProperty(data, `flags.${FLAG_SCOPE}.summonBase`, creatureUuid);
  return Actor.create(data);
}

/**
 * The non-GM users owning `actor` — whoever controls what it summons.
 * @param {Actor|null} actor
 * @returns {string[]}
 */
function playerOwnerIds(actor) {
  return actor instanceof Actor ? game.users.filter((u) => !u.isGM && actor.testUserPermission(u, 'OWNER')).map((u) => u.id) : [];
}

/**
 * Group Д: a summoned elemental or a clone joins the caster's battle right
 * after the caster (the combatant's `follows`, HeroesGloryCombat#setupTurns)
 * with the caster's initiative; the turn now under way stays the same.
 * @param {Combat} combat
 * @param {TokenDocument} tokenDoc
 * @param {string} leaderId   the caster's combatant
 * @returns {Promise<Combatant[]>}
 */
async function addFollowerCombatant(combat, tokenDoc, leaderId) {
  const leader = combat.combatants.get(leaderId);
  const order = orderWithFollowers([
    ...combat.turns.map((c) => ({ id: c.id, follows: c.getFlag(FLAG_SCOPE, 'follows') ?? null })),
    { id: '__new', follows: leader ? leaderId : null },
  ]);
  const currentId = combat.combatant?.id;
  const options = currentId && combat.turn !== null ? { combatTurn: order.indexOf(currentId) } : {};
  return combat.createEmbeddedDocuments('Combatant', [{
    tokenId: tokenDoc.id,
    sceneId: tokenDoc.parent.id,
    actorId: tokenDoc.actorId,
    initiative: leader?.initiative ?? null,
    flags: { [FLAG_SCOPE]: { follows: leader ? leaderId : null, summoned: true } },
  }], options);
}

/**
 * §6.4, group Д: the GM's confirm on a Призыв Элементаля card — the token
 * on the chosen cell: the bestiary's elemental with the bonuses written into
 * its statblock (rules.md §11), the caster's side, owned by the caster's
 * players (none — the GM's), in the battle right after the caster. It lasts
 * the cast's rounds (expireSummons) and goes at 0 Здоровья (documents/
 * actor.mjs) and with the battle. Not created if the battle is over or the
 * caster has an elemental already.
 * @param {ChatMessage} message
 * @param {object} flags
 * @returns {Promise<ChatMessage|void>}
 */
async function confirmSummonSpell(message, flags) {
  const i18n = game.i18n;
  const combat = game.combats.get(flags.castStart?.combat);
  if (!combat) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellCombatOver', { spell: flags.spellName }));
    return;
  }
  const alive = summonedTokens((data) => data.kind === 'summon' && data.casterUuid === flags.actorUuid);
  if (alive.length) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SummonAlready', { spell: flags.spellName, name: alive[0].name }));
    return;
  }
  const scene = game.scenes.get(flags.summon.sceneId);
  const base = scene ? await summonBaseActor(flags.summon.creatureUuid) : null;
  if (!base) {
    ui.notifications.error(i18n.format('HEROES_GLORY.Roll.SummonNoCreature', { creature: flags.summon.creatureName }));
    return;
  }
  if (!(await confirmWithinLimit(flags))) return;
  await endLastingCast(flags);
  const caster = actorFromCard(flags.actorUuid, flags.actorId);
  const casterToken = scene.tokens.find((t) => t.actor === caster || t.actorId === caster?.id) ?? null;
  const tokenData = (await base.getTokenDocument({
    // Told apart from the bestiary's own in the tracker and on the scene.
    name: i18n.format('HEROES_GLORY.Roll.SummonTokenName', { name: flags.summon.creatureName }),
    x: flags.summon.destination.x,
    y: flags.summon.destination.y,
    level: flags.summon.level,
    actorLink: false,
    disposition: casterToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY,
    delta: { system: flags.summon.stats, ownership: summonOwnership(playerOwnerIds(caster)) },
    flags: {
      [FLAG_SCOPE]: {
        [SUMMONED_FLAG]: {
          kind: 'summon',
          casterUuid: flags.actorUuid,
          casterName: flags.casterName,
          castId: flags.castId,
          spellName: flags.spellName,
          combatId: combat.id,
          casterCombatant: flags.castStart.combatant,
          expiresRound: fieldExpiresRound(flags.castStart.round, flags.rounds),
        },
      },
    },
  }, { parent: scene })).toObject();
  const [tokenDoc] = await scene.createEmbeddedDocuments('Token', [tokenData]);
  if (tokenDoc) await addFollowerCombatant(combat, tokenDoc, flags.castStart.combatant);
  return markSpellConfirmed(message, flags);
}

/**
 * Group Д: with the «Клон» specialization (p. 23) — one clone, or two for
 * double the Mana (rules.md §11). Without it, or Mana short for two, one.
 * `null` — cancelled.
 * @param {Actor} actor
 * @param {Item} spell
 * @param {number} manaCost   for one clone
 * @returns {Promise<number|null>}   how many clones
 */
async function chooseCloneCount(actor, spell, manaCost) {
  const specialization = cloneSpecialization(actor.system.specialization, spell.name);
  if (!specialization.active || !canAffordSpell(actor.system.mana.value, manaCost * specialization.manaFactor)) return 1;
  const i18n = game.i18n;
  const content = document.createElement('div');
  content.innerHTML = `<p>${foundry.utils.escapeHTML(i18n.format('HEROES_GLORY.Roll.CloneCountText', { spell: spell.name }))}</p>`;
  const count = await HeroesGloryDialog.wait({
    hgColor: HeroesGloryDialog.actorColor(actor),
    window: { title: 'HEROES_GLORY.Roll.CloneCountTitle' },
    content,
    buttons: [
      { action: 'one', label: i18n.format('HEROES_GLORY.Roll.CloneCountOne', { cost: manaCost }), default: true, callback: () => 1 },
      { action: 'two', label: i18n.format('HEROES_GLORY.Roll.CloneCountTwo', { cost: manaCost * specialization.manaFactor }), callback: () => specialization.clones },
      { action: 'cancel', label: 'HEROES_GLORY.Rest.Cancel' },
    ],
    rejectClose: false,
  });
  return Number.isInteger(count) ? count : null;
}

/**
 * §6.4, group Д: Клон (p. 58, rules.md §11) — «идеальную копию дружеского
 * существа». Only in combat, a lasting spell (the limit of three). One target
 * (T): a creature on the caster's side, within 24 cells, not a clone itself
 * (a summoned elemental may be cloned). Its statblock and current Здоровье are
 * copied now, without spell effects and statuses. With the specialization, one
 * or two clones (double Mana, one cast). The caster places each footprint
 * (core region placement, nothing saved; one shape a clone): free cells within
 * the scene, not in a Силовое Поле, within 24 cells. Right click or Esc
 * cancels. The GM's confirm makes the tokens (confirmCloneSpell).
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} cast   variant, variantData, resolvedSchool, manaCost
 * @returns {Promise<ChatMessage|null>}
 */
async function castCloneSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost: oneCost, effect }) {
  const i18n = game.i18n;
  const castStart = casterCombatStart(actor);
  if (!castStart) {
    ui.notifications.warn(i18n.localize('HEROES_GLORY.Roll.SpellOutOfCombat'));
    return null;
  }
  const selected = [...game.user.targets].map((token) => token.document).filter((doc) => doc.actor);
  if (!selected.length) {
    ui.notifications.warn(i18n.localize('HEROES_GLORY.Roll.SpellNoTarget'));
    return null;
  }
  if (selected.length > 1) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellOneTarget', { spell: spell.name }));
    return null;
  }
  const [targetDoc] = selected;
  const casterToken = casterTokenOnCanvas(actor);
  if (!casterToken || targetDoc.parent !== casterToken.parent) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellNoCasterToken', { spell: spell.name }));
    return null;
  }
  const target = targetDoc.actor;
  let refusal = null;
  if (target.type !== 'creature') refusal = 'CloneNotCreature';
  else if (summonedData(target)?.kind === 'clone') refusal = 'CloneOfClone';
  else if (!isFriendlyTarget(targetDoc.disposition, casterToken.disposition, CONST.TOKEN_DISPOSITIONS.FRIENDLY)) refusal = 'CloneNotFriendly';
  if (refusal) {
    ui.notifications.warn(i18n.format(`HEROES_GLORY.Roll.${refusal}`, { spell: spell.name, target: target.name }));
    return null;
  }
  const distance = tokenDistanceCells(casterToken, targetDoc);
  if (distance !== null && distance > SPELL_RANGE_CELLS) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellOutOfRange', {
      spell: spell.name, target: target.name, cells: distance, range: SPELL_RANGE_CELLS,
    }));
    return null;
  }
  if (soleTargetRefuses(spell, effect, [targetDoc])) return null;
  const grid = canvas.grid;
  if (grid.isGridless) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellAreaNoGrid', { spell: spell.name }));
    return null;
  }
  const count = await chooseCloneCount(actor, spell, oneCost);
  if (!count) return null;
  const manaCost = oneCost * count;
  const endCast = await chooseLastingSpellToEnd(actor, spell.name, []);
  if (endCast === false) return null;

  const scene = casterToken.parent;
  const { width, height } = targetDoc;
  const occupied = occupiedCellKeys(scene);
  const forceField = fieldCellKeys(scene, 'forceField');
  const start = casterToken.getOccupiedGridSpaceOffsets()[0];
  const footprint = () => ({ type: 'grid', offsets: footprintCells(start, width, height), origin: grid.getCenterPoint(start) });
  ui.notifications.info(i18n.format('HEROES_GLORY.Roll.ClonePlace', { spell: spell.name, target: target.name, count }));
  let region = null;
  try {
    region = await canvas.regions.placeRegion({
      name: spell.name,
      shapes: Array.from({ length: count }, footprint),
      levels: [casterToken.level],
      color: game.user.color,
      highlightMode: 'coverage',
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
    }, {
      create: false,
      allowRotation: false,
      onMove: footprintByMiddle(width, height),
      preConfirm: ({ document, shape, shapeIndex }) => {
        const cells = shape.offsets;
        const taken = new Set(document.shapes.slice(0, shapeIndex).flatMap((s) => s.offsets ?? []).map(cellKey));
        const cellsAway = Math.min(...cells.map((cell) => tokenCellDistance(casterToken, cell)));
        let why = null;
        if (cellsAway > SPELL_RANGE_CELLS) why = ['SpellFieldOutOfRange', { cells: cellsAway, range: SPELL_RANGE_CELLS }];
        else if (!cells.every((cell) => cellInSceneRect(scene, cell))) why = ['SpellTeleportOutside', {}];
        else if (cells.some((cell) => occupied.has(cellKey(cell)) || taken.has(cellKey(cell)))) why = ['SpellTeleportOccupied', {}];
        else if (cells.some((cell) => forceField.has(cellKey(cell)))) why = ['SpellTeleportForceField', {}];
        if (!why) return true;
        ui.notifications.warn(i18n.format(`HEROES_GLORY.Roll.${why[0]}`, { spell: spell.name, ...why[1] }));
        return false;
      },
    });
  } catch (error) {
    console.warn(`heroes-glory | «${spell.name}»: placement failed`, error);
    return null;
  }
  // Cancelled, or a clone's cell skipped — the whole cast is off.
  if (!region || region.shapes.length < count) return null;
  const destinations = region.shapes.map((shape) => {
    const cell = grid.getOffset(shape.origin);
    const topLeft = grid.getTopLeftPoint(cell);
    return { x: topLeft.x, y: topLeft.y, ...sceneCellNumbers(scene, cell) };
  });

  const manaRemaining = actor.system.mana.value - manaCost;
  await actor.update({ 'system.mana.value': manaRemaining });
  const system = target.toObject().system;
  const flags = {
    kind: 'spell',
    effectKind: 'clone',
    actorId: actor.id,
    actorUuid: actor.uuid,
    casterName: actor.name,
    spellName: spell.name,
    variant,
    school: resolvedSchool,
    description: variantData.description,
    manaCost,
    manaRemaining,
    clone: {
      name: targetDoc.name,
      sourceActorId: targetDoc.actorId,
      texture: targetDoc.texture.src,
      width,
      height,
      system,
      sceneId: scene.id,
      level: casterToken.level,
      destinations,
    },
    rounds: lastingSpellRounds(actor.system.magicPower,
      actor.items.filter((i) => i.type === 'artifact' && i.system.equipped).map((i) => i.name)),
    castStart,
    castId: foundry.utils.randomID(),
    endCast,
    targets: [],
    confirmed: false,
  };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(flags),
  );
  return createActorVisibilityCard(actor, { content, flags: { [FLAG_SCOPE]: { spell: flags } } }, []);
}

/**
 * §6.4, group Д: the GM's confirm on a Клон card — a token per clone on its
 * cell: unlinked, on the original's world actor, its delta holding the copied
 * statblock and Здоровье, none of the actor's own effects (tombstoned), the
 * caster's side and players; in the battle right after the caster. It lasts
 * the cast's rounds (expireSummons), vanishes on any loss of Здоровья
 * (documents/actor.mjs), goes with the battle. Not created if the battle is
 * over or the original's actor is gone.
 * @param {ChatMessage} message
 * @param {object} flags
 * @returns {Promise<ChatMessage|void>}
 */
async function confirmCloneSpell(message, flags) {
  const i18n = game.i18n;
  const combat = game.combats.get(flags.castStart?.combat);
  if (!combat) {
    ui.notifications.warn(i18n.format('HEROES_GLORY.Roll.SpellCombatOver', { spell: flags.spellName }));
    return;
  }
  const scene = game.scenes.get(flags.clone.sceneId);
  const base = game.actors.get(flags.clone.sourceActorId);
  if (!scene || !base) {
    ui.notifications.error(i18n.format('HEROES_GLORY.Roll.ConfirmTargetMissing', { target: flags.clone.name }));
    return;
  }
  if (!(await confirmWithinLimit(flags))) return;
  await endLastingCast(flags);
  const caster = actorFromCard(flags.actorUuid, flags.actorId);
  const casterToken = scene.tokens.find((t) => t.actor === caster || t.actorId === caster?.id) ?? null;
  const summoned = {
    kind: 'clone',
    casterUuid: flags.actorUuid,
    casterName: flags.casterName,
    castId: flags.castId,
    spellName: flags.spellName,
    combatId: combat.id,
    casterCombatant: flags.castStart.combatant,
    expiresRound: fieldExpiresRound(flags.castStart.round, flags.rounds),
  };
  for (const destination of flags.clone.destinations) {
    const tokenData = (await base.getTokenDocument({
      // «Неотличима от оригинала» in play; the GM's tracker still tells them apart.
      name: i18n.format('HEROES_GLORY.Roll.CloneTokenName', { name: flags.clone.name }),
      x: destination.x,
      y: destination.y,
      width: flags.clone.width,
      height: flags.clone.height,
      level: flags.clone.level,
      texture: { src: flags.clone.texture },
      actorLink: false,
      disposition: casterToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      delta: {
        system: flags.clone.system,
        ownership: summonOwnership(playerOwnerIds(caster)),
        // «Without effects and statuses»: the actor's own ones don't carry over.
        effects: base.effects.map((effect) => ({ _id: effect.id, _tombstone: true })),
      },
      flags: { [FLAG_SCOPE]: { [SUMMONED_FLAG]: summoned } },
    }, { parent: scene })).toObject();
    const [tokenDoc] = await scene.createEmbeddedDocuments('Token', [tokenData]);
    if (tokenDoc) await addFollowerCombatant(combat, tokenDoc, flags.castStart.combatant);
  }
  return markSpellConfirmed(message, flags);
}

/**
 * The lasting cast the player chose to end for the new one (the limit of
 * three, chooseLastingSpellToEnd) goes at the GM's confirm — its effects,
 * regions, summoned tokens.
 * @param {object} flags   the new cast's card flags
 * @returns {Promise<void>}
 */
async function endLastingCast(flags) {
  if (!flags.endCast) return;
  const ending = lastingSpellCasts(actorFromCard(flags.actorUuid, flags.actorId) ?? { uuid: flags.actorUuid })
    .find((cast) => cast.castId === flags.endCast.castId);
  for (const effect of ending?.effects ?? []) await effect.delete();
  for (const region of ending?.regions ?? []) await region.delete();
  for (const token of ending?.tokens ?? []) await dismissSummoned(token);
  if (ending?.pendingMessage) await cancelPendingCard(ending.pendingMessage);
}

/**
 * A lasting cast still waiting for its confirm, ended for another under the
 * limit of three: its card can't be confirmed any more and says so, and its
 * Mana goes back — nothing was applied (rules.md §11).
 * @param {ChatMessage} message
 * @returns {Promise<ChatMessage>}
 */
async function cancelPendingCard(message) {
  const flags = message.getFlag(FLAG_SCOPE, 'spell');
  const nextFlags = { ...flags, cancelled: true, manaRefunded: await refundCardMana(flags) };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(nextFlags),
  );
  return message.update({ content, flags: { [FLAG_SCOPE]: { spell: nextFlags } } });
}

/**
 * A spell card dropped before its confirm gives its caster the Mana back
 * (cancelledCardRefund, spell-effects.mjs).
 * @param {object} flags   the card's
 * @returns {Promise<number>}   how much went back
 */
async function refundCardMana(flags) {
  const refund = cancelledCardRefund(flags);
  const caster = actorFromCard(flags.actorUuid, flags.actorId);
  if (!refund || !(caster instanceof Actor)) return 0;
  await caster.update({ 'system.mana.value': caster.system.mana.value + refund });
  return refund;
}

/**
 * «Отменить» (rules.md §11): the GM drops an attack or spell card still
 * waiting for its confirm — a forgotten or a mistaken one. Nothing was
 * applied, so nothing is undone on the targets; a spell's Mana goes back to
 * its caster (not the Стена Огня's burn, which cost none). The card says
 * «Отменено Ведущим» and keeps no buttons; a lasting cast stops counting in
 * the limit of three.
 * @param {ChatMessage} message
 * @returns {Promise<ChatMessage|void>}
 */
export async function cancelCardByGm(message) {
  if (!game.user.isGM) return;
  const attack = message.getFlag(FLAG_SCOPE, 'reroll');
  if (attack?.kind === 'attack') {
    if (!canConfirmAttack(attack)) return;
    const actor = actorFromCard(attack.actorUuid, attack.actorId);
    const nextFlags = { ...attack, cancelled: true, cancelledByGm: true };
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/heroes-glory/templates/chat/attack-roll.hbs',
      buildAttackContext(actor ?? { name: '', id: attack.actorId }, nextFlags),
    );
    return message.update({ content, flags: { [FLAG_SCOPE]: { reroll: nextFlags } } });
  }
  const flags = message.getFlag(FLAG_SCOPE, 'spell');
  if (!canConfirmSpell(flags)) return;
  const nextFlags = { ...flags, cancelled: true, cancelledByGm: true, manaRefunded: await refundCardMana(flags) };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(nextFlags),
  );
  return message.update({ content, flags: { [FLAG_SCOPE]: { spell: nextFlags } } });
}

/**
 * The GM's confirm of a lasting spell: `confirmed`, redrawn.
 * @param {ChatMessage} message
 * @param {object} flags
 * @returns {Promise<ChatMessage>}
 */
async function markSpellConfirmed(message, flags) {
  const nextFlags = { ...flags, confirmed: true, confirmedAt: Date.now() };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(nextFlags),
  );
  return message.update({ content, flags: { [FLAG_SCOPE]: { spell: nextFlags } } });
}

/**
 * Стена Огня burns a token that stepped in or started its turn there (p. 59,
 * rules.md §11): the active GM rolls the damage the cast froze — for each of
 * the caster's СМ, Волшебство, the specialization — and posts a damage card
 * for the confirm, as a damage spell's: fire immunity, a resistance roll each
 * time, armor 4–5 halves, an incapacitated one dies. A dead token is left
 * alone.
 * @param {RegionDocument} region
 * @param {TokenDocument} tokenDoc
 * @param {'enter'|'turnStart'} reason
 * @returns {Promise<ChatMessage|null>}
 */
export async function burnFireWall(region, tokenDoc, reason) {
  if (!game.user.isActiveGM) return null;
  const data = region?.getFlag(FLAG_SCOPE, FIELD_FLAG);
  const target = tokenDoc?.actor;
  if (!data?.fire || !target || target.statuses.has(CONFIG.specialStatusEffects.DEFEATED)) return null;
  const formula = spellFormula(data.fire.dice);
  const spellRoll = new Roll(formula);
  await spellRoll.evaluate();
  const rolls = [spellRoll];
  const extraRoll = async (count) => {
    if (!count) return null;
    const roll = new Roll(`${count}d6`);
    await roll.evaluate();
    rolls.push(roll);
    return { count, total: roll.total };
  };
  const sorcerySkill = await extraRoll(data.fire.sorcerySkill);
  const sorcerySpecialization = await extraRoll(data.fire.sorcerySpecialization);
  const fireWallSpecialization = await extraRoll(data.fire.fireWallSpecialization);
  const spellRef = { name: data.spellName, system: { level: data.fire.level } };
  const { entry, roll: resist } = await spellTargetEntry(tokenDoc, spellRef, { element: 'fire' }, 1);
  if (resist) rolls.push(resist);
  const caster = fromUuidSync(data.casterUuid);
  const flags = {
    kind: 'spell',
    actorUuid: data.casterUuid,
    casterName: data.casterName,
    spellName: data.spellName,
    element: 'fire',
    variant: data.variant,
    school: data.school,
    description: '',
    formula,
    spellTotal: spellRoll.total,
    sorceryTier: data.fire.sorceryTier,
    sorcerySkill,
    sorcerySpecialization,
    fireWallSpecialization,
    total: spellRoll.total + (sorcerySkill?.total ?? 0) + (sorcerySpecialization?.total ?? 0)
      + (fireWallSpecialization?.total ?? 0),
    fieldTrigger: reason,
    targets: [entry],
    confirmed: false,
  };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(flags),
  );
  const messageData = { content, flags: { [FLAG_SCOPE]: { spell: flags } } };
  if (caster instanceof Actor) return createActorVisibilityCard(caster, messageData, rolls);
  return ChatMessage.create({ ...messageData, rolls });
}

/** Flag on an ActiveEffect a stage-2 spell put on its target (§6.4). */
export const SPELL_EFFECT_FLAG = 'spellEffect';

/**
 * «+4», «−6» — a spell modifier's signed value for the chat.
 * @param {number} value
 * @returns {string}
 */
function signedValue(value) {
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

/**
 * «Благословение +4».
 * @param {{spellName: string, value: number}} modifier
 * @returns {string}
 */
function spellModifierText({ spellName, value }) {
  return game.i18n.format('HEROES_GLORY.Roll.SpellModifierLine', { spell: spellName, value: signedValue(value) });
}

/** Group А1's stats and Молитва's Урон, by name in the chat. */
const SPELL_STAT_LABELS = {
  attack: 'HEROES_GLORY.Hero.Attack',
  rangedAttack: 'HEROES_GLORY.Roll.SpellStatRangedAttack',
  defense: 'HEROES_GLORY.Hero.Defense',
  speed: 'HEROES_GLORY.Hero.Speed',
  luck: 'HEROES_GLORY.Hero.Luck',
  damageDealt: 'HEROES_GLORY.Roll.SpellStatDamage',
};

/**
 * «Атака +3», «Скорость −3 (не ниже 3)» — one stat a spell changes.
 * @param {{stat: string, value: number, floor?: number|null}} modifier
 * @returns {string}
 */
function spellStatPart({ stat, value, floor = null }) {
  if (SPELL_STAT_FORMATS[stat]) return game.i18n.format(SPELL_STAT_FORMATS[stat], { value: Math.abs(value) });
  const text = `${game.i18n.localize(SPELL_STAT_LABELS[stat] ?? stat)} ${signedValue(value)}`;
  return floor === null || floor === undefined
    ? text
    : game.i18n.format('HEROES_GLORY.Roll.SpellStatFloor', { text, floor });
}

/**
 * «Жажда Крови: Атака +3».
 * @param {{spellName: string, stat: string, value: number, floor?: number|null}} modifier
 * @returns {string}
 */
function spellStatText(modifier) {
  return game.i18n.format('HEROES_GLORY.Roll.SpellStatLine', { spell: modifier.spellName, stat: spellStatPart(modifier) });
}

/**
 * What a lasting spell does, for its card: the stage-2 damage spells as
 * before («Благословение +4»), the others by stat («Молитва: Атака +2,
 * Защита +2, …»), a status by name («Полет: Полёт»).
 * @param {object} flags   the spell card's flags
 * @returns {string}
 */
function lastingSpellEffectText(flags, target = null) {
  let modifiers = flags.modifiers ?? (flags.modifier ? [flags.modifier] : []);
  // Забывчивость on a target whose shots it takes all: «стрелять не может».
  if (Number.isFinite(target?.rangedSeries) && modifiers.some((m) => m.stat === 'rangedAttacks')
    && rangedSeriesAfterSpells(target.rangedSeries, modifiers) === 0) {
    modifiers = modifiers.map((m) => (m.stat === 'rangedAttacks' ? { ...m, stat: 'noRangedAttacks' } : m));
  }
  const damageOnly = modifiers.length === 1
    && ['damageDealt', 'meleeDamageTaken', 'rangedDamageTaken'].includes(modifiers[0].stat);
  if (damageOnly && !flags.status) return spellModifierText({ spellName: flags.spellName, value: modifiers[0].value });
  const parts = modifiers.map((m) => spellStatPart(m));
  if (flags.status) parts.unshift(game.i18n.localize(SPELL_STATUS_LABELS[flags.status]));
  return game.i18n.format('HEROES_GLORY.Roll.SpellStatLine', { spell: flags.spellName, stat: parts.join(', ') });
}

/** Group А2's effects, said in words («иммунитет к заклинаниям 1–3 уровня»). */
const SPELL_STAT_FORMATS = {
  spellImmunityLevel: 'HEROES_GLORY.Roll.SpellStatAntimagic',
  rangedAttacks: 'HEROES_GLORY.Roll.SpellStatFewerShots',
  noRangedAttacks: 'HEROES_GLORY.Roll.SpellStatNoShots',
  fireShield: 'HEROES_GLORY.Roll.SpellStatFireShield',
  counterAttacks: 'HEROES_GLORY.Roll.SpellStatCounter',
};

/** Core statuses a lasting spell may carry (Полет, p. 56). */
const SPELL_STATUS_LABELS = { fly: 'HEROES_GLORY.Roll.SpellStatusFly', blind: 'HEROES_GLORY.Roll.CleansedStatus.blind' };

/**
 * The spell effects an actor carries now (§6.4) — one entry per spell and
 * stat, expired or disabled ones left out (actorSpellModifiers).
 * @param {Actor|null} actor
 * @returns {Array<{spellName: string, stat: string, value: number, floorOne: boolean, floor: number|null}>}
 */
export function spellModifierEffects(actor) {
  return actorSpellModifiers(actor?.effects ?? [])
    .map(({ spellName, stat, value, floorOne, floor }) => ({ spellName, stat, value, floorOne, floor }));
}

/**
 * The caster's place in its own combat (actorCombat — not `game.combat`,
 * the one the tracker happens to show), frozen at the cast: the effect's
 * duration counts from the caster's turn (p. 32, rules.md §11), not from
 * whenever the GM confirms. `null` when the caster fights in no started
 * combat.
 * @param {Actor} actor
 * @returns {object|null}   ActiveEffect `start` data
 */
function casterCombatStart(actor) {
  const found = actorCombat(actor);
  if (!found) return null;
  const { combat, combatant } = found;
  return {
    combat: combat.id,
    combatant: combatant.id,
    initiative: combatant.initiative ?? null,
    round: combat.round,
    turn: combat.turn ?? 0,
    time: game.time.worldTime,
  };
}

/**
 * §6.4, stage 2: a hero's lasting modifier spell (Благословение,
 * Проклятие, Слабость, Щит, Воздушный Щит). Refused before any Mana is
 * spent: outside combat (rules.md §11), more targets than the variant
 * takes, a target past 24 cells, undead for a spell that excludes it. A
 * hostile spell's targets roll their resistance now; nothing reaches them
 * until the GM confirms (confirmModifierSpell).
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} cast   variant, variantData, resolvedSchool, manaCost, effect
 * @returns {Promise<ChatMessage|null>}
 */
async function castModifierSpell(actor, spell, { variant, variantData, resolvedSchool, manaCost, effect }) {
  const castStart = casterCombatStart(actor);
  if (!castStart) {
    ui.notifications.warn(game.i18n.localize('HEROES_GLORY.Roll.SpellOutOfCombat'));
    return null;
  }
  const limit = modifierTargetLimit(effect, actor.system.magicPower);
  const selected = [...game.user.targets].map((token) => token.document);
  if (!selected.length) {
    ui.notifications.warn(game.i18n.localize('HEROES_GLORY.Roll.SpellNoTarget'));
    return null;
  }
  if (selected.length > limit) {
    ui.notifications.warn(limit === 1
      ? game.i18n.format('HEROES_GLORY.Roll.SpellOneTarget', { spell: spell.name })
      : game.i18n.format('HEROES_GLORY.Roll.SpellTooManyTargets', { spell: spell.name, count: limit }));
    return null;
  }
  let rangeUnknown = false;
  for (const doc of selected) {
    const cells = tokenDistanceCells(attackerTokenFor(actor, doc), doc);
    if (cells === null) {
      rangeUnknown = true;
    } else if (cells > SPELL_RANGE_CELLS) {
      ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellOutOfRange', {
        spell: spell.name, target: doc.actor?.name ?? doc.name, cells, range: SPELL_RANGE_CELLS,
      }));
      return null;
    }
    if (effect.excludeUndead && doc.actor?.type === 'creature' && isUndeadCreature(doc.actor.system.specialSkills ?? [])) {
      ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellUndead', { spell: spell.name, target: doc.actor.name }));
      return null;
    }
    // Удача / Неудача: creatures have no Удача (rules.md §11).
    if (spellHeroesOnly(effect) && doc.actor?.type === 'creature') {
      ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellNoLuck', { spell: spell.name, target: doc.actor.name }));
      return null;
    }
  }

  if (soleTargetRefuses(spell, effect, selected)) return null;

  // p. 32: a fourth lasting spell ends one of the three — the player picks
  // which; cancelling cancels the cast, no Mana spent.
  // Слепота isn't a lasting spell (rules.md §11) — no limit for it.
  const endCast = effect.skipsTurn ? null
    : await chooseLastingSpellToEnd(actor, spell.name, selected.map((doc) => doc.actor?.uuid).filter(Boolean));
  if (endCast === false) return null;

  const manaRemaining = actor.system.mana.value - manaCost;
  await actor.update({ 'system.mana.value': manaRemaining });

  const rolls = [];
  const targets = [];
  for (const doc of selected.filter((d) => d.actor)) {
    const { entry, roll } = await spellTargetEntry(doc, spell, effect, 1, { resist: effect.hostile, skipIncapacitated: false });
    if (roll) rolls.push(roll);
    // Слепота: «Бросьте 1d6» — for a target it can still reach.
    const resisted = entry.resistDie != null && entry.resistDie >= entry.resistThreshold;
    // Забывчивость: the target's shots now, to say whether any are left.
    if ((effect.modifiers ?? []).some((m) => m.stat === 'rangedAttacks') && doc.actor) entry.rangedSeries = rangedSeriesOf(doc.actor);
    if (effect.triggerThreshold && !entry.immunity && !resisted) {
      const trigger = new Roll('1d6');
      await trigger.evaluate();
      rolls.push(trigger);
      entry.triggerDie = trigger.total;
    }
    targets.push(entry);
  }

  const flags = {
    kind: 'spell',
    effectKind: 'modifier',
    triggerThreshold: effect.triggerThreshold ?? null,
    skipsTurn: !!effect.skipsTurn,
    actorId: actor.id,
    actorUuid: actor.uuid,
    casterName: actor.name,
    spellName: spell.name,
    spellImg: spell.img,
    variant,
    school: resolvedSchool,
    description: variantData.description,
    manaCost,
    manaRemaining,
    modifiers: castModifiers(actor, spell, effect),
    status: effect.status || null,
    // Молитва: «До конца боя», Слепота: the target's next turn — no rounds.
    rounds: effect.untilCombatEnd || effect.skipsTurn ? null : lastingSpellRounds(actor.system.magicPower,
      actor.items.filter((i) => i.type === 'artifact' && i.system.equipped).map((i) => i.name)),
    castStart,
    castId: foundry.utils.randomID(),
    endCast,
    rangeUnknown,
    targets,
    confirmed: false,
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(flags),
  );
  return createActorVisibilityCard(actor, { content, flags: { [FLAG_SCOPE]: { spell: flags } } }, rolls);
}

/**
 * How many ranged attacks an actor makes in a round now (attackSeriesCount)
 * — a creature's statblock, a hero's with a ranged weapon worn (0 without).
 * @param {Actor} actor
 * @returns {number}
 */
function rangedSeriesOf(actor) {
  if (actor.type === 'creature') {
    return attackSeriesCount({
      creatureAttacks: actor.system.attacksCount ?? 1,
      vengeanceHurt: (actor.system.specialSkills ?? []).some((tag) => /^месть(\s|$)/i.test(String(tag).trim()))
        && actor.system.health.value < actor.system.health.max,
    });
  }
  if (!actor.items.some((i) => i.type === 'weapon' && i.system.equipped && i.system.weaponType === 'ranged')) return 0;
  const owned = actor.items.filter((i) => i.type === 'skill').map((i) => ({ skillKey: i.system.skillKey, tier: i.system.tier }));
  return attackSeriesCount({
    ranged: true,
    archeryTier: highestSkillTier(owned, 'archery'),
    specializationSkill: actor.system.specialization?.type === 'skill' ? actor.system.specialization.key : null,
  });
}

/**
 * A lasting spell's modifiers as cast: the variant's, with the «Ускорение»
 * specialization's +3 Скорость (p. 23) added to that spell's own.
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} effect   the variant's effect
 * @returns {Array<{stat: string, value: number, floorOne: boolean, floor: number|null}>}
 */
function castModifiers(actor, spell, effect) {
  const haste = hasteSpecializationBonus(actor.system.specialization, spell.name);
  // Огненный Щит: «равный вашему СМ» (+3 / +6) — the caster's at the cast.
  const bonus = (stat) => (stat === 'speed' ? haste : 0) + (stat === 'fireShield' ? actor.system.magicPower : 0);
  return (effect.modifiers ?? []).map((m) => ({
    stat: m.stat,
    value: m.value + bonus(m.stat),
    floorOne: !!m.floorOne,
    floor: m.floor ?? null,
  }));
}

/**
 * The lasting-spell casts of `caster` still on anyone — world actors and
 * unlinked tokens on every scene — one entry per cast, whatever the number
 * of targets. Effects from before `castId` existed group by spell and round.
 * @param {Actor} caster
 * Field spells (group Г) come as their regions.
 * Summoned elementals and clones (group Д) come as their tokens. With
 * `pending`, the caster's lasting casts still waiting for the GM's confirm
 * in a battle under way count too (rules.md §11) — as their cards.
 * @param {object} [options]
 * @param {boolean} [options.pending]
 * @returns {Array<{castId: string, spellName: string, targetIds: string[], targetNames: string[], remaining: number, effects: ActiveEffect[], regions?: RegionDocument[], tokens?: TokenDocument[], pendingMessage?: ChatMessage}>}
 */
function lastingSpellCasts(caster, { pending = true } = {}) {
  const actors = new Set(game.actors);
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (token.actor && !token.actorLink) actors.add(token.actor);
  }
  const casts = new Map();
  for (const target of actors) {
    for (const effect of target.effects) {
      const data = effect.getFlag(FLAG_SCOPE, SPELL_EFFECT_FLAG);
      if (!data || data.skipsTurn || data.casterUuid !== caster.uuid || effect.duration?.expired) continue;
      const castId = data.castId ?? `${data.spellName}|${data.combatId}|${effect._source.start?.round}`;
      if (!casts.has(castId)) {
        // Молитва lasts to the end of the battle: no rounds left to show.
        const remaining = data.untilCombatEnd ? null : effect.duration.remaining;
        casts.set(castId, { castId, spellName: data.spellName, targetIds: [], targetNames: [], remaining, effects: [] });
      }
      const cast = casts.get(castId);
      cast.targetIds.push(target.uuid);
      cast.targetNames.push(target.name);
      cast.effects.push(effect);
    }
  }
  // Group Г: Силовое Поле and Стена Огня are lasting spells too (p. 32).
  for (const scene of game.scenes) {
    for (const region of scene.regions) {
      const data = region.getFlag(FLAG_SCOPE, FIELD_FLAG);
      if (!data || data.casterUuid !== caster.uuid || data.expiresRound == null) continue;
      const combat = game.combats.get(data.combatId);
      casts.set(data.castId, {
        castId: data.castId,
        spellName: data.spellName,
        targetIds: [],
        targetNames: [game.i18n.localize('HEROES_GLORY.Roll.SpellFieldOnScene')],
        remaining: combat ? Math.max(0, data.expiresRound - combat.round) : 0,
        effects: [],
        regions: [region],
      });
    }
  }
  // Group Д: a summoned elemental or a clone lasts its rounds too.
  for (const token of summonedTokens((data) => data.casterUuid === caster.uuid && data.expiresRound != null)) {
    const data = token.getFlag(FLAG_SCOPE, SUMMONED_FLAG);
    const combat = game.combats.get(data.combatId);
    const cast = casts.get(data.castId) ?? {
      castId: data.castId,
      spellName: data.spellName,
      targetIds: [],
      targetNames: [],
      remaining: combat ? Math.max(0, data.expiresRound - combat.round) : 0,
      effects: [],
      tokens: [],
    };
    cast.targetNames.push(token.name);
    cast.tokens.push(token);
    casts.set(data.castId, cast);
  }
  if (pending) {
    for (const message of game.messages) {
      const flags = message.getFlag(FLAG_SCOPE, 'spell');
      if (!flags || flags.confirmed || flags.cancelled || flags.actorUuid !== caster.uuid || !flags.castId) continue;
      if (casts.has(flags.castId) || !isLastingSpellCard(flags) || !game.combats.get(flags.castStart?.combat)) continue;
      casts.set(flags.castId, {
        castId: flags.castId,
        spellName: flags.spellName,
        targetIds: (flags.targets ?? []).map((t) => actorFromCard(t.tokenUuid, t.actorId)?.uuid).filter(Boolean),
        targetNames: lastingCardTargetNames(flags),
        remaining: flags.rounds ?? null,
        effects: [],
        pendingMessage: message,
      });
    }
  }
  return [...casts.values()];
}

/**
 * Who or what a lasting card is on, for the limit's dialog.
 * @param {object} flags
 * @returns {string[]}
 */
function lastingCardTargetNames(flags) {
  if (flags.effectKind === 'field') return [game.i18n.localize('HEROES_GLORY.Roll.SpellFieldOnScene')];
  if (flags.effectKind === 'summon') return [flags.summon?.creatureName ?? ''];
  if (flags.effectKind === 'clone') return (flags.clone?.destinations ?? []).map(() => flags.clone.name);
  return (flags.targets ?? []).map((t) => t.name);
}

/**
 * The GM's confirm of a lasting spell (rules.md §11): if the casts applied
 * by now would make more than three with this one, the GM picks one to end
 * first — in the same dialog as at the cast. `false` — cancelled, nothing
 * applied, the card stays.
 * @param {object} flags   the card's
 * @returns {Promise<boolean>}
 */
async function confirmWithinLimit(flags) {
  const caster = actorFromCard(flags.actorUuid, flags.actorId);
  if (!(caster instanceof Actor) || !isLastingSpellCard(flags)) return true;
  const casts = lastingSpellCasts(caster, { pending: false })
    .filter((cast) => cast.castId !== flags.castId && cast.castId !== flags.endCast?.castId);
  const targetIds = (flags.targets ?? []).map((t) => actorFromCard(t.tokenUuid, t.actorId)?.uuid).filter(Boolean);
  const chosen = await chooseLastingSpellToEnd(caster, flags.spellName, targetIds, casts);
  if (chosen === false) return false;
  if (chosen) await endLastingCast({ ...flags, endCast: chosen });
  return true;
}

/**
 * p. 32 (rules.md §11): with three lasting spells already up, the player
 * picks one to end before a fourth goes on — in a dialog in the system's
 * style. `null` — no choice needed; `false` — cancelled (the cast is off);
 * otherwise the cast to end, applied by the GM's confirm with the new one.
 * The caster's casts waiting for a confirm count too (lastingSpellCasts).
 * @param {Actor} actor
 * @param {string} spellName
 * @param {string[]} targetIds   the new cast's targets' actor uuids
 * @param {object[]} [casts]     the casts to count
 * @returns {Promise<{castId: string, label: string}|null|false>}
 */
async function chooseLastingSpellToEnd(actor, spellName, targetIds, casts = lastingSpellCasts(actor)) {
  const spell = { name: spellName };
  const { needsChoice, candidates } = resolveLastingSpellLimit({
    casts,
    newSpellName: spellName,
    newTargetIds: targetIds,
  });
  if (!needsChoice) return null;
  const i18n = game.i18n;
  const rowOf = (cast) => i18n.format(cast.remaining === null ? 'HEROES_GLORY.Roll.SpellLimitRowCombat' : 'HEROES_GLORY.Roll.SpellLimitRow', {
    spell: cast.spellName, targets: cast.targetNames.join(', '), rounds: cast.remaining,
  });
  const labelOf = (cast) => (cast.pendingMessage ? i18n.format('HEROES_GLORY.Roll.SpellLimitPending', { row: rowOf(cast) }) : rowOf(cast));
  const content = document.createElement('div');
  content.innerHTML = `<p>${foundry.utils.escapeHTML(i18n.format('HEROES_GLORY.Roll.SpellLimitText', { caster: actor.name, spell: spell.name }))}</p>
    <div class="hg-dialog__checklist">${candidates.map((cast, index) => radioRow('cast', cast.castId, labelOf(cast), index === 0)).join('')}</div>`;
  const castId = await HeroesGloryDialog.wait({
    hgColor: HeroesGloryDialog.actorColor(actor),
    window: { title: 'HEROES_GLORY.Roll.SpellLimitTitle' },
    content,
    buttons: [
      {
        action: 'end',
        label: 'HEROES_GLORY.Roll.SpellLimitEnd',
        default: true,
        callback: (event, button) => button.form.querySelector('input[name="cast"]:checked')?.value ?? null,
      },
      { action: 'cancel', label: 'HEROES_GLORY.Rest.Cancel' },
    ],
    rejectClose: false,
  });
  const chosen = candidates.find((cast) => cast.castId === castId);
  if (!chosen) return false;
  // The card's «Закончится / Закончено» line keeps no «ждёт подтверждения»:
  // that card may be confirmed before this one and then ended as applied.
  return { castId: chosen.castId, label: rowOf(chosen) };
}

/**
 * A modifier spell card's target lines — from resolveModifierSpellResolution,
 * the same function the GM's confirm applies.
 * @param {object} flags
 * @param {object} context   the plain cast's context
 * @returns {object}
 */
function buildModifierSpellCardContext(flags, context) {
  const i18n = game.i18n;
  const results = resolveModifierSpellResolution(flags);
  const done = !!flags.confirmed;
  const effectText = lastingSpellEffectText(flags);
  const untilCombatEnd = flags.rounds === null || flags.rounds === undefined;
  context.targetSpell = true;
  context.confirmHintKey = 'HEROES_GLORY.Roll.SpellModifierConfirmHint';
  context.endCastLine = flags.endCast
    ? i18n.format(done ? 'HEROES_GLORY.Roll.SpellEndApplied' : 'HEROES_GLORY.Roll.SpellEndPending', { cast: flags.endCast.label })
    : null;
  context.noTarget = !flags.targets.length;
  context.rangeUnknown = flags.rangeUnknown;
  context.canConfirm = canConfirmSpell(flags);
  context.confirmed = done;
  context.targetLines = flags.targets.map((target, index) => {
    const result = results[index];
    let text;
    if (result.outcome === 'immune') {
      text = i18n.format('HEROES_GLORY.Roll.SpellModifierImmune', {
        target: target.name,
        reason: i18n.format(SPELL_IMMUNITY_LABELS[target.immunity], { element: '' }),
      });
    } else if (result.outcome === 'resisted') {
      text = i18n.format('HEROES_GLORY.Roll.SpellModifierResisted', { target: target.name });
    } else if (result.outcome === 'failed') {
      text = i18n.format('HEROES_GLORY.Roll.SpellBlindFailed', { target: target.name });
    } else if (flags.skipsTurn) {
      text = i18n.format(done ? 'HEROES_GLORY.Roll.SpellBlindApplied' : 'HEROES_GLORY.Roll.SpellBlindPending', { target: target.name });
    } else {
      const key = untilCombatEnd
        ? (done ? 'HEROES_GLORY.Roll.SpellModifierAppliedCombat' : 'HEROES_GLORY.Roll.SpellModifierPendingCombat')
        : (done ? 'HEROES_GLORY.Roll.SpellModifierApplied' : 'HEROES_GLORY.Roll.SpellModifierPending');
      text = i18n.format(key, { target: target.name, effect: lastingSpellEffectText(flags, target) ?? effectText, rounds: flags.rounds });
    }
    if (target.resistDie != null) {
      text += ` (${i18n.format('HEROES_GLORY.Roll.SpellResistRoll', {
        source: i18n.localize(SPELL_RESIST_LABELS[target.resistSource]),
        die: target.resistDie,
        need: target.resistThreshold,
      })})`;
    }
    if (target.triggerDie != null) {
      text += ` (${i18n.format('HEROES_GLORY.Roll.SpellTriggerRoll', { die: target.triggerDie, need: flags.triggerThreshold })})`;
    }
    return text;
  });
  return context;
}

/**
 * §6.4, stage 2: the GM's confirm on a modifier spell card — puts the
 * effect on every target resolveModifierSpellResolution lets through: the
 * spell's icon on the token, Сила Магии rounds counted from the caster's
 * turn at the cast (its `start`), expiring at the start of the caster's
 * turn (p. 32). The same spell already on a target is replaced — one icon,
 * the new duration (rules.md §11). If that combat is over, nothing is put
 * on and the card stays.
 * @param {ChatMessage} message
 * @param {object} flags
 * @returns {Promise<ChatMessage|void>}
 */
async function confirmModifierSpell(message, flags) {
  if (!game.combats.get(flags.castStart?.combat)) {
    ui.notifications.warn(game.i18n.format('HEROES_GLORY.Roll.SpellCombatOver', { spell: flags.spellName }));
    return;
  }
  if (!(await confirmWithinLimit(flags))) return;
  await endLastingCast(flags);
  const results = resolveModifierSpellResolution(flags);
  for (const [index, target] of flags.targets.entries()) {
    if (results[index].outcome !== 'applied') continue;
    const targetActor = actorFromCard(target.tokenUuid, target.actorId);
    if (!targetActor) {
      ui.notifications.error(game.i18n.format('HEROES_GLORY.Roll.ConfirmTargetMissing', { target: target.name }));
      continue;
    }
    const previous = targetActor.effects
      .filter((e) => e.getFlag(FLAG_SCOPE, SPELL_EFFECT_FLAG)?.spellName === flags.spellName)
      .map((e) => e.id);
    if (previous.length) await targetActor.deleteEmbeddedDocuments('ActiveEffect', previous);
    // Молитва (rounds null) has no duration: the end of the battle takes it
    // off (clearSpellEffectsAfterCombat). Cards from before group А1 carry
    // a single `modifier`.
    const untilCombatEnd = flags.rounds === null || flags.rounds === undefined;
    await targetActor.createEmbeddedDocuments('ActiveEffect', [{
      name: flags.spellName,
      img: flags.spellImg,
      origin: flags.actorUuid,
      description: flags.description,
      ...(untilCombatEnd ? {} : { duration: { value: flags.rounds, units: 'rounds', expiry: 'turnStart' } }),
      start: flags.castStart,
      statuses: flags.status ? [flags.status] : [],
      flags: {
        [FLAG_SCOPE]: {
          [SPELL_EFFECT_FLAG]: {
            spellName: flags.spellName,
            modifiers: flags.modifiers ?? (flags.modifier ? [flags.modifier] : []),
            untilCombatEnd,
            // Слепота: not lasting, its turn and any damage end it.
            skipsTurn: !!flags.skipsTurn,
            casterUuid: flags.actorUuid,
            combatId: flags.castStart.combat,
            castId: flags.castId,
          },
        },
      },
    }]);
  }
  const nextFlags = { ...flags, confirmed: true, confirmedAt: Date.now() };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/spell-cast.hbs',
    buildSpellCardContext(nextFlags),
  );
  return message.update({ content, flags: { [FLAG_SCOPE]: { spell: nextFlags } } });
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
    actorUuid: actor.uuid,
    skillKey,
    skillLabelKey: PRIMARY_SKILL_LABELS[skillKey],
    die,
    previousDie: null,
  };

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/ability-check.hbs',
    { actorName: actor.name, actorId: actor.id, skillLabelKey: flags.skillLabelKey, previousDie: null, ...result },
  );

  // Same default as core Roll#toMessage: the user's chat-bar mode.
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content,
    flags: { [FLAG_SCOPE]: { reroll: flags } },
  }, { messageMode: game.settings.get('core', 'messageMode') });
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

  // By uuid when the card has it: an unlinked token spends its own Удача.
  const actor = actorFromCard(flags.actorUuid, flags.actorId);
  if (!actor) return;
  if (!canRerollWithLuck({ luck: actor.system.luck ?? 0, isOwner: actor.isOwner, isGM: game.user.isGM })) return;

  const roll = new Roll('1d20');
  await roll.evaluate();
  const die = roll.dice[0].total;
  const result = resolveAbilityCheck(die, actor.system[flags.skillKey]);

  await spendActorLuck(actor);

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
 * §5.8 (pp. 24–25): roll whichever Боевой дух test the current user may
 * roll for this actor (moraleCheckVariant, rolls.mjs) — the extra-turn
 * test at positive Боевой дух (owner; d6 at the actor's threshold, 4+
 * unless a creature's «Дикая мораль» sets another), or the skip-turn test
 * at negative (GM only; 1–3 skips the turn). Each spends one of the
 * battle's |Боевой дух| attempts. Does nothing when no test is allowed.
 * @param {Actor} actor   A hero or a creature.
 * @returns {Promise<ChatMessage|null>}
 */
export async function rollMoraleCheck(actor) {
  const used = actor.getFlag(FLAG_SCOPE, 'moraleUsed') ?? 0;
  const morale = actor.system.morale ?? 0;
  const variant = moraleCheckVariant({ morale, used, isOwner: actor.isOwner, isGM: game.user.isGM });
  if (!variant) return null;

  const negative = variant === 'negative';
  const wildThreshold = negative ? null : (actor.system.moraleThreshold ?? null);
  const roll = new Roll('1d6');
  await roll.evaluate();
  const result = resolveMoraleCheck(roll.dice[0].total, wildThreshold ?? MORALE_CHECK_THRESHOLD);
  await actor.setFlag(FLAG_SCOPE, 'moraleUsed', used + 1);

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/morale-check.hbs',
    {
      actorName: actor.name,
      die: result.die,
      threshold: result.threshold,
      wild: wildThreshold !== null,
      negative,
      extraTurn: !negative && result.passed,
      skipsTurn: negative && !result.passed,
      remaining: moraleAttemptsRemaining(morale, used + 1),
      total: Math.abs(morale),
    },
  );

  return createActorVisibilityCard(actor, { content }, [roll]);
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

/**
 * §6.1/§task: roll the primary skill that grows on level-up, by the
 * hero's class's own d20 range table — or an equal-quarters fallback if
 * the class isn't determined yet (empty faction/classType). Split out
 * from {@link rollLevelUp} because it's never re-rolled on its own — kept
 * as its own function anyway for symmetry with the new-skill roll below,
 * and so `rollLevelUp` reads as a plain composition of the three.
 *
 * Posts its own chat card (§task — was silent before, "внутренним кодом";
 * now the same Roll -> renderTemplate -> ChatMessage.create shape every
 * other roll in this file uses, e.g. {@link rollAbilityCheck}) so the
 * table lookup that decides what grows is visible, not just its result on
 * the sheet. Runs exactly once per level-up (called only from
 * `rollLevelUp`, itself only invoked by level-up-app.mjs's
 * `ensurePendingLevelUp` when actually rolling fresh — see that function's
 * own comment for why a reopened window never re-rolls or re-posts this).
 * @param {Actor} actor
 * @returns {Promise<"attack"|"defense"|"magicPower"|"knowledge">}
 */
async function rollPrimarySkillKey(actor) {
  const system = actor.system;
  const classKey = concreteClassKey(system.faction, system.classType);
  const ranges = PRIMARY_SKILL_ROLL_RANGES[classKey] ?? PRIMARY_SKILL_ROLL_RANGES_FALLBACK;
  const roll = new Roll('1d20');
  await roll.evaluate();
  const skillKey = resolvePrimarySkillRoll(roll.dice[0].total, ranges);

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/levelup-primary-skill.hbs',
    { actorName: actor.name, die: roll.dice[0].total, skillLabelKey: PRIMARY_SKILL_LABELS[skillKey] },
  );
  // Private to the hero's player and the GM. No `rolls`: a whispered roll
  // still shows everyone else a "rolled privately" stub; the die value is
  // already in the card text.
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, whisper: ownersAndGmIds(actor) });

  return skillKey;
}

/**
 * §6.3/§7: every owned secondary skill still below Expert tier — the pool
 * both {@link rollUpgradeCandidateItemId} and the level-up window's own
 * "pick a different skill" list (level-up-app.mjs) draw from, so the two
 * can never disagree about what's eligible. Excludes a skill Item whose
 * own skillKey is still unset ("" — the schema's default; see
 * item-skill-sheet.hbs's own comment on how that state can persist
 * invisibly) — such an item has no real identity to show an icon/label
 * for or to upgrade.
 * @param {Actor} actor
 * @returns {Item[]}
 */
export function eligibleUpgradeSkillItems(actor) {
  return actor.items.filter((i) => i.type === 'skill' && i.system.tier !== 'expert' && i.system.skillKey);
}

/**
 * §6.3/§7/§task: resolve the upgrade candidate's initial pre-selection —
 * NOT a roll any more (§task: "случайный бросок кандидата... теперь не
 * нужен вовсе — убери его"). With exactly one eligible skill there's
 * nothing to choose between, so that one is set directly, same as always
 * (deterministic, never random — this branch never rolled dice either,
 * even before this task). With zero, there's nothing to offer. With two
 * or more, this deliberately returns `null` and leaves it there: the
 * level-up window shows a neutral "choose a skill" placeholder instead of
 * silently pre-picking one for the player (see
 * `buildUpgradePlaceholderSlot`'s own comment) — a real id only gets
 * written once the player actually picks one, through the window's own
 * list (level-up-app.mjs's `#onPickUpgradeCandidate`).
 *
 * Exported on its own (not just inlined into {@link rollLevelUp}) for the
 * same revalidation reason as before — level-up-app.mjs's
 * `ensurePendingLevelUp` calls this directly to resolve a fresh default
 * when the persisted one goes stale, rather than re-running all of
 * `rollLevelUp` and disturbing the primary-skill/new-candidate rolls that
 * are still valid.
 * @param {Actor} actor
 * @returns {string|null}
 */
export function rollUpgradeCandidateItemId(actor) {
  const pool = eligibleUpgradeSkillItems(actor);
  return pool.length === 1 ? pool[0].id : null;
}

/**
 * §6.2/§task: roll a new secondary skill to offer, only if a slot is
 * free. Rerolls on a duplicate (a skill the hero already owns, at any
 * tier), capped so a near-full skill list can't loop forever; exhausting
 * the cap just means no new-skill candidate this level-up (§6.2's own
 * "при исчерпании — нового варианта нет").
 *
 * Posts one chat card for the FINAL result only (§task: "в чат не надо
 * сыпать все промежуточные попытки — это замусорит журнал") — the
 * discarded reroll attempts are still real, individually-evaluated
 * `Roll`s (same as before this task; the "внутренним кодом" gap this task
 * closes was the missing chat output, not the dice mechanism, which
 * already used Foundry's own `Roll` throughout), just not each posted to
 * chat on their own. The card DOES say how many were discarded
 * (`rerollCount`) when at least one was — a bare final result with no
 * explanation would look like the very first roll always lands clean,
 * which isn't true and isn't especially interesting to hide; a whole
 * transcript of every discarded attempt would be noise for a fact nobody
 * needs to double-check. No card at all when no candidate is found (slot
 * full, or the 20-attempt cap exhausted) — nothing was granted, so
 * there's nothing to announce.
 * @param {Actor} actor
 * @returns {Promise<string|null>}
 */
async function rollNewCandidateSkillKey(actor) {
  const config = CONFIG.HEROES_GLORY;
  const ownedSkills = actor.items.filter((i) => i.type === 'skill');
  // §3 стр.39: 8, or 10 with Экспертная Обучаемость — see that function's
  // own comment for why this is re-derived here rather than cached.
  const slotCount = secondarySkillSlotCount(ownedSkills.map((i) => i.system), config.secondarySkillSlotCount);
  if (ownedSkills.length >= slotCount) return null;
  const ownedKeys = new Set(ownedSkills.map((i) => i.system.skillKey));
  let finalRoll = null;
  let candidate = null;
  let rerollCount = 0;
  for (let attempt = 0; attempt < NEW_SECONDARY_SKILL_MAX_ATTEMPTS; attempt += 1) {
    const roll = new Roll('1d20');
    await roll.evaluate();
    const rolled = resolveSecondarySkillRoll(roll.dice[0].total, { faction: actor.system.faction });
    if (!ownedKeys.has(rolled)) {
      finalRoll = roll;
      candidate = rolled;
      break;
    }
    rerollCount += 1;
  }
  if (!candidate) return null;

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/levelup-secondary-skill.hbs',
    { actorName: actor.name, die: finalRoll.dice[0].total, skillLabelKey: config.secondarySkills[candidate], rerollCount },
  );
  // Same privacy as rollPrimarySkillKey's card.
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, whisper: ownersAndGmIds(actor) });

  return candidate;
}

/**
 * §4.2/§6/§task: roll everything a fresh level-up needs, once. Nothing is
 * written to `system.pendingLevelUp` here — the caller (level-up-app.mjs's
 * `ensurePendingLevelUp`) persists the result itself, since these dice
 * must survive the level-up window closing (close button/Escape/click
 * elsewhere) rather than being held only in memory — see that field's own
 * schema comment (actor-hero.mjs) for why, and that same function's own
 * comment for why this only ever runs once per target level (never
 * re-rolled, and so never re-posted to chat, just by reopening the
 * window).
 *
 * `rollPrimarySkillKey`/`rollNewCandidateSkillKey` now post their OWN chat
 * cards each (§task) — this function itself still posts nothing extra;
 * `upgradeCandidateItemId` never rolls dice at all any more either (see
 * that function's own comment), so there is nothing left here to report
 * beyond what those two already announce on their own.
 * @param {Actor} actor
 * @returns {Promise<{
 *   primarySkillKey: "attack"|"defense"|"magicPower"|"knowledge",
 *   upgradeCandidateItemId: string|null,
 *   newCandidateSkillKey: string|null,
 * }>}
 */
export async function rollLevelUp(actor) {
  const primarySkillKey = await rollPrimarySkillKey(actor);
  const newCandidateSkillKey = await rollNewCandidateSkillKey(actor);
  const upgradeCandidateItemId = rollUpgradeCandidateItemId(actor);
  return { primarySkillKey, upgradeCandidateItemId, newCandidateSkillKey };
}

/**
 * §6.3/§7: build one upgrade-candidate slot's display data from an owned
 * skill Item id — always shown at its TARGET tier (icon, label, prompt
 * text alike), i.e. what the skill will become if chosen, not what it
 * currently is. Returns null if the id no longer resolves to an item
 * (defensive — `ensurePendingLevelUp` is supposed to keep this from ever
 * persisting, but the view layer shouldn't crash if it somehow does).
 *
 * `pickable` is NOT set here — it depends on how many total eligible
 * skills exist actor-wide, which `resolveLevelUpChoiceSlots` (the only
 * caller) already computes once for its own branching; exported
 * separately (not folded into this function) so the level-up window's own
 * "open the picker" handler (level-up-app.mjs) can build the exact same
 * per-item display data for every row of that picker's list, not just the
 * one currently offered.
 * @param {Actor} actor
 * @param {string} itemId
 * @returns {{kind:"upgrade", itemId:string, icon:string, iconLarge:string, tierLabel:string, skillLabel:string, effectText:string|null}|null}
 */
export function buildUpgradeCandidateSlot(actor, itemId) {
  const item = actor.items.get(itemId);
  if (!item) return null;
  const config = CONFIG.HEROES_GLORY;
  const targetTier = nextTier(item.system.tier);
  return {
    kind: 'upgrade',
    itemId,
    icon: secondarySkillIconPath(item.system.skillKey, targetTier),
    iconLarge: secondarySkillIconPath(item.system.skillKey, targetTier, { large: true }),
    tierLabel: game.i18n.localize(config.skillTiers[targetTier]),
    skillLabel: game.i18n.localize(config.secondarySkills[item.system.skillKey]),
    effectText: item.system.effects[targetTier] || null,
  };
}

/**
 * §6.2: build the "learn new" slot's display data. Always Базовый — no
 * owned Item exists yet for this candidate, so unlike an upgrade slot
 * there's no effects text anywhere to show — omitted rather than faked.
 * @param {string} skillKey
 * @returns {{kind:"new", skillKey:string, icon:string, iconLarge:string, tierLabel:string, skillLabel:string, effectText:null}}
 */
function buildNewCandidateSlot(skillKey) {
  const config = CONFIG.HEROES_GLORY;
  return {
    kind: 'new',
    skillKey,
    icon: secondarySkillIconPath(skillKey, 'base'),
    iconLarge: secondarySkillIconPath(skillKey, 'base', { large: true }),
    tierLabel: game.i18n.localize(config.skillTiers.base),
    skillLabel: game.i18n.localize(config.secondarySkills[skillKey]),
    effectText: null,
  };
}

/**
 * §task: the upgrade side when more than one eligible skill exists and
 * none has been picked yet — a neutral placeholder ("Выбрать навык", the
 * empty-slot frame from `secondarySkillEmptyIconPath`) instead of
 * silently defaulting to a random owned skill the player never chose.
 * `itemId: null` is load-bearing: it's what keeps `resolveInitialSelection`
 * from auto-selecting this slot the way a real solo candidate would (see
 * that function's own comment). `pickable` is NOT set here any more — see
 * `resolveLevelUpChoiceSlots`'s own comment for why it's computed once,
 * uniformly, for whichever kind of upgrade slot (placeholder or already-
 * picked-real) ends up built.
 * @returns {{kind:"upgrade", itemId:null, icon:string, iconLarge:string, tierLabel:string, skillLabel:string, effectText:null, isPlaceholder:true}}
 */
function buildUpgradePlaceholderSlot() {
  return {
    kind: 'upgrade',
    itemId: null,
    icon: secondarySkillEmptyIconPath(),
    iconLarge: secondarySkillEmptyIconPath({ large: true }),
    tierLabel: '',
    skillLabel: game.i18n.localize('HEROES_GLORY.LevelUp.UpgradePlaceholderLabel'),
    effectText: null,
    isPlaceholder: true,
  };
}

/**
 * §7 (task, simplified from a 5-mode matrix to 4 outcomes): resolve the
 * ordered list of secondary-skill choice slots to show — the SAME
 * resolution is used both to render the window (`buildLevelUpViewContext`)
 * and to decide the solo auto-selection (`resolveInitialSelection`), so
 * the two can never disagree about what "the" candidate is.
 *
 * - free slot + an upgrade candidate/placeholder exists -> [upgrade, new] (two-way)
 * - free slot, no upgrade candidate at all -> [new] (solo)
 * - no free slot, an upgrade candidate/placeholder exists -> [upgrade] (solo)
 * - no free slot, nothing eligible to upgrade -> [] (nothing to grant)
 *
 * The old two-upgrade-candidates-competing mode is gone: once the upgrade
 * side became a full picker over every {@link eligibleUpgradeSkillItems}
 * entry (book p.16 — "raise ANY already-owned skill", not "pick between
 * these two random ones"), offering two independently-random candidates
 * to choose between had nothing left to do.
 *
 * §task (corrected): `pendingLevelUp.upgradeCandidateItemId` used to be
 * non-null ONLY when exactly one skill was eligible, making a real slot
 * never `pickable`. That stopped being true once picking from the list
 * itself started persisting a real id (level-up-app.mjs's
 * `#onPickUpgradeCandidate`) — a player can now have already picked one
 * of several eligible skills, and that pick must stay reconsiderable, not
 * freeze the slot the instant it's no longer a placeholder ("выбор
 * зафиксирован навсегда" was the bug this fixes). `pickable` is therefore
 * computed the same way regardless of which branch built the slot: true
 * whenever more than one skill is eligible at all, full stop — matching
 * the standing rule "пикер открывается, когда повышаемых навыков больше
 * одного", independent of whether one of them happens to be selected
 * right now.
 * @param {Actor} actor
 * @param {{upgradeCandidateItemId:string|null, newCandidateSkillKey:string|null}} pendingLevelUp
 * @returns {Array<ReturnType<typeof buildUpgradeCandidateSlot>|ReturnType<typeof buildNewCandidateSlot>|ReturnType<typeof buildUpgradePlaceholderSlot>>}
 */
export function resolveLevelUpChoiceSlots(actor, pendingLevelUp) {
  const eligibleCount = eligibleUpgradeSkillItems(actor).length;
  let upgradeSlot = null;
  if (pendingLevelUp.upgradeCandidateItemId) {
    upgradeSlot = buildUpgradeCandidateSlot(actor, pendingLevelUp.upgradeCandidateItemId);
  } else if (eligibleCount > 1) {
    upgradeSlot = buildUpgradePlaceholderSlot();
  }
  if (upgradeSlot) upgradeSlot.pickable = eligibleCount > 1;
  const newSlot = pendingLevelUp.newCandidateSkillKey ? buildNewCandidateSlot(pendingLevelUp.newCandidateSkillKey) : null;

  if (newSlot && upgradeSlot) return [upgradeSlot, newSlot];
  if (newSlot) return [newSlot];
  if (upgradeSlot) return [upgradeSlot];
  return [];
}

/**
 * The persisted-selection shape for a given slot — `{kind:'upgrade',
 * itemId}` or `{kind:'new', skillKey}`. Both `resolveInitialSelection`
 * and the template's `selectChoice`/`pickUpgradeCandidate` actions produce
 * exactly this shape, so `applyLevelUp` (level-up-app.mjs) never needs to
 * know which of `resolveLevelUpChoiceSlots`'s outcomes produced it.
 * @param {ReturnType<typeof resolveLevelUpChoiceSlots>[number]} slot
 * @returns {{kind:"upgrade", itemId:string}|{kind:"new", skillKey:string}}
 */
export function selectionForSlot(slot) {
  return slot.kind === 'upgrade' ? { kind: 'upgrade', itemId: slot.itemId } : { kind: 'new', skillKey: slot.skillKey };
}

/**
 * §7/§task: the level-up app's own `#selectedChoice` needs a value the
 * instant a solo slot is the only REAL option — not a second, independent
 * "what's effectively chosen" computation for display purposes only (that
 * split IS the bug this originally fixed: the window looked pre-selected
 * in solo mode but the app's real selection state stayed null, so
 * confirming applied nothing). Called from level-up-app.mjs's
 * `_prepareContext`, before building the render context, so the very
 * first paint and the value `applyLevelUp` eventually reads are the same
 * call's result.
 *
 * §task: a solo PLACEHOLDER (`isPlaceholder`, `buildUpgradePlaceholderSlot`)
 * is deliberately excluded from this auto-select — it exists precisely
 * because nothing has been chosen yet among 2+ eligible skills, so
 * treating "it's the only slot shown" as "it's chosen" would silently
 * pick nothing-in-particular the same way the removed random pre-select
 * used to. `canConfirm` (buildLevelUpViewContext) stays blocked until the
 * player actually picks something through the window's own list.
 * @param {Actor} actor
 * @param {{upgradeCandidateItemId:string|null, newCandidateSkillKey:string|null}} pendingLevelUp
 * @param {{kind:"upgrade", itemId:string}|{kind:"new", skillKey:string}|null} current
 * @returns {{kind:"upgrade", itemId:string}|{kind:"new", skillKey:string}|null}
 */
export function resolveInitialSelection(actor, pendingLevelUp, current) {
  if (current) return current;
  const slots = resolveLevelUpChoiceSlots(actor, pendingLevelUp);
  return slots.length === 1 && !slots[0].isPlaceholder ? selectionForSlot(slots[0]) : null;
}

/**
 * @param {{kind:"upgrade", itemId:string}|{kind:"new", skillKey:string}|null} selection
 * @param {ReturnType<typeof resolveLevelUpChoiceSlots>[number]} slot
 * @returns {boolean}
 */
function selectionMatchesSlot(selection, slot) {
  if (!selection || selection.kind !== slot.kind) return false;
  return selection.kind === 'upgrade' ? selection.itemId === slot.itemId : selection.skillKey === slot.skillKey;
}

/**
 * §4.2/§6/§7: build the level-up window's render context from a persisted
 * `pendingLevelUp` roll and the app's actual selection state — called
 * from module/apps/level-up-app.mjs's own `_prepareContext`. Purely reads
 * `selectedChoice`; does not recompute an "effective" selection of its
 * own (see `resolveInitialSelection`'s own comment for why that split was
 * the bug).
 * @param {Actor} actor
 * @param {{targetLevel:number, primarySkillKey:string, upgradeCandidateItemId:string|null, newCandidateSkillKey:string|null}} pendingLevelUp
 * @param {{kind:"upgrade", itemId:string}|{kind:"new", skillKey:string}|null} selectedChoice
 * @returns {object} Template-ready context for the level-up window's template.
 */
export function buildLevelUpViewContext(actor, pendingLevelUp, selectedChoice) {
  const config = CONFIG.HEROES_GLORY;
  const system = actor.system;
  const context = {};

  context.portraitSrc = actor.img;
  context.primarySkillIcon = primarySkillIconPath(pendingLevelUp.primarySkillKey);
  context.primarySkillIconLarge = primarySkillIconPath(pendingLevelUp.primarySkillKey, { large: true });
  context.primarySkillBaseValue = actor._source.system[pendingLevelUp.primarySkillKey];
  context.primarySkillEffectiveValue = system[pendingLevelUp.primarySkillKey];

  const classKey = concreteClassKey(system.faction, system.classType);
  const classLabelKey = classKey ? config.classes[classKey] : config.classTypes[system.classType];
  const classLabel = classLabelKey ? game.i18n.localize(classLabelKey) : '';
  const primarySkillLabel = game.i18n.localize(PRIMARY_SKILL_LABELS[pendingLevelUp.primarySkillKey]);

  context.text0 = game.i18n.format('HEROES_GLORY.LevelUp.LevelsUp', { name: actor.name });
  context.text1 = classLabel
    ? game.i18n.format('HEROES_GLORY.LevelUp.NowLevel', { name: actor.name, level: pendingLevelUp.targetLevel, class: classLabel })
    : game.i18n.format('HEROES_GLORY.LevelUp.NowLevelNoClass', { name: actor.name, level: pendingLevelUp.targetLevel });
  context.text2 = game.i18n.format('HEROES_GLORY.LevelUp.PrimarySkillGain', { skill: primarySkillLabel });
  context.primarySkillLabel = primarySkillLabel;

  const slots = resolveLevelUpChoiceSlots(actor, pendingLevelUp);
  const soloChoice = slots.length === 1;
  const bothChoices = slots.length === 2;

  context.soloChoice = soloChoice;
  context.bothChoices = bothChoices;
  context.soloChoiceData = soloChoice ? slots[0] : null;
  context.choice1 = bothChoices ? { ...slots[0], selected: selectionMatchesSlot(selectedChoice, slots[0]) } : null;
  context.choice2 = bothChoices ? { ...slots[1], selected: selectionMatchesSlot(selectedChoice, slots[1]) } : null;
  // §task: generalizes the old "both available, nothing picked yet blocks
  // confirm" rule to also cover a solo PLACEHOLDER (resolveInitialSelection
  // deliberately leaves `selectedChoice` null for that case too, unlike a
  // real solo candidate) — confirm is blocked exactly when there's
  // something shown (`slots.length > 0`) and nothing picked; with nothing
  // shown at all (nothing to grant) there's nothing to block on.
  context.canConfirm = slots.length === 0 || Boolean(selectedChoice);

  if (bothChoices) {
    // §task (corrected): keyed off `pickable` now, not `isPlaceholder` —
    // `pickable` stays the same for as long as the window is open (it
    // only depends on how many skills are eligible, which picking one
    // doesn't change), while `isPlaceholder` flips the instant a pick is
    // made. Keying the prompt off `isPlaceholder` meant this text got
    // REPLACED the moment the player picked a skill (and again on every
    // subsequent re-pick) — different length, so the fixed-height
    // `choice_prompt` box (`_lvlup.scss`, a plain `position: absolute`
    // percentage box, not sized to its own content) would overflow
    // differently each time, reading as the window's content jumping.
    // With a picker available, the text never names a specific skill at
    // all now — the icon + label underneath already show the current
    // pick, see this string's own comment for why saying it twice adds
    // nothing. Only the picker-less case (exactly one eligible skill, so
    // nothing to ever repick) still names the one skill there is —
    // nothing to keep stable there since it can't change after this
    // prompt is built anyway.
    context.choicePromptText = slots[0].pickable
      ? game.i18n.format('HEROES_GLORY.LevelUp.ChoicePromptBothPending', {
        tier: slots[1].tierLabel, skill: slots[1].skillLabel,
      })
      : game.i18n.format('HEROES_GLORY.LevelUp.ChoicePromptBoth', {
        tier1: slots[0].tierLabel, skill1: slots[0].skillLabel,
        tier2: slots[1].tierLabel, skill2: slots[1].skillLabel,
      });
  } else if (soloChoice) {
    context.choicePromptText = slots[0].pickable
      ? game.i18n.localize('HEROES_GLORY.LevelUp.ChoicePromptUpgradePending')
      : game.i18n.format('HEROES_GLORY.LevelUp.ChoicePromptOne', {
        tier: slots[0].tierLabel, skill: slots[0].skillLabel,
      });
  } else {
    context.choicePromptText = game.i18n.localize('HEROES_GLORY.LevelUp.ChoicePromptNone');
  }

  return context;
}

