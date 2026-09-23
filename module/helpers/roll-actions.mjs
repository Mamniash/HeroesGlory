/**
 * Foundry-facing roll orchestration: builds and evaluates Rolls, reads
 * `game.user.targets`, posts ChatMessages. All the actual rules
 * interpretation is delegated to the pure functions in rolls.mjs — this
 * file only sequences them against the live game state.
 */
import {
  resolveHit,
  resolveEpicTableRow,
  epicTableHasContent,
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
  canRerollWithLuck,
  moraleAttemptsRemaining,
  resolveMoraleCheck,
  resolveTargetStateMultiplier,
  resolveAttackResolution,
  canConfirmAttack,
  resolvePostBattleCheck,
  POST_BATTLE_RECOVERY_HEALTH,
  POST_BATTLE_RECOVERY_MANA,
  resolvePrimarySkillRoll,
  resolveSecondarySkillRoll,
  nextTier,
  secondarySkillSlotCount,
} from './rolls.mjs';
import { buildEffectChanges } from './modifiers.mjs';
import { hasArmorSpecialization, specializationManaDiscount } from './specializations.mjs';
import { PRIMARY_SKILL_ROLL_RANGES, PRIMARY_SKILL_ROLL_RANGES_FALLBACK, concreteClassKey } from './class-stats.mjs';
import { primarySkillIconPath, secondarySkillIconPath, secondarySkillEmptyIconPath } from './skill-icons.mjs';

/** The flag namespace every roll-related ChatMessage flag lives under. */
const FLAG_SCOPE = 'heroes-glory';

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
  const {
    hit, defeat, damage, damageKnown, potentialDamage,
    armorItemMultiplier, armorZoneMultiplier, protectingItem, destroyedArmor,
  } = resolveAttackResolution(flags);
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
    hasUnconfirmedEarlier: !!flags.hasUnconfirmedEarlier,
  };
}

/**
 * §task: whether another still-unconfirmed attack card already targets
 * this actor — used to warn the GM on a fresh card that confirming it
 * relies on the target's last-CONFIRMED state, which may already be
 * stale if an earlier, still-pending attack against the same target gets
 * confirmed later (each card's stateMultiplier/equippedArmor snapshot is
 * frozen at ITS OWN roll time, not re-read at confirm time — see
 * buildAttackContext/resolveAttackResolution). Scans `game.messages`
 * rather than tracking a running count anywhere: chat history is already
 * the authoritative record of what's pending, and this only needs to run
 * once, when a new card is created.
 * @param {string|null} targetActorId
 * @returns {boolean}
 */
function hasUnconfirmedAttackAgainst(targetActorId) {
  if (!targetActorId) return false;
  return game.messages.some((m) => {
    const flags = m.getFlag(FLAG_SCOPE, 'reroll');
    return flags?.kind === 'attack' && flags.targetActorId === targetActorId && !flags.confirmed;
  });
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
  // §5.4: ranged weapons have no epic table, and neither does an
  // enchanted-weapon artifact (the book's "Зачарованное оружие" table has
  // no epic-table column at all) — `epicTableHasContent` catches both:
  // a ranged weapon's `epicTable` is nulled out below already, and an
  // enchanted weapon's is a present-but-all-blank array (item-artifact.mjs
  // keeps the same 6-string shape item-weapon.mjs uses), which would
  // otherwise still read as "has a table" and run the severity/"Куда
  // попал" cascade with empty flavor text. Creatures always have their
  // own real table — the data model has no "ranged" concept for them.
  const rawEpicTable = weapon
    ? (weapon.system.weaponType === 'ranged' ? null : weapon.system.epicTable)
    : actor.system.epicTable;
  const epicTable = epicTableHasContent(rawEpicTable) ? rawEpicTable : null;
  const legendary = weapon ? false : !!actor.system.legendary;
  const targetDefense = targetActor?.system?.defense ?? null;

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
  // targetSlots included (not just name/level) so resolveArmorZoneProtection
  // (§5.5 levels 1-3) can tell which body zone each piece actually
  // covers — levels 4-5's own multiplier never looks at this field.
  const equippedArmor = (targetActor?.items ?? [])
    .filter((i) => i.type === 'artifact' && i.system.artifactType === 'enchantedArmor' && i.system.equipped && i.system.level != null)
    .map((i) => ({ name: i.name, level: i.system.level, targetSlots: i.system.targetSlots ?? [] }));

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
    targetActorId: targetActor?.id ?? null,
    weaponName: weapon?.name ?? null,
    targetName: targetActor?.name ?? null,
    attackerAttack: actor.system.attack,
    baseDamage,
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
    // §task: computed once, before this message exists in game.messages,
    // so it can only ever see EARLIER unconfirmed cards, never itself.
    // Carried through in flags rather than recomputed on every re-render
    // — the set of other cards doesn't change from a reroll or confirm
    // of THIS card.
    hasUnconfirmedEarlier: hasUnconfirmedAttackAgainst(targetActor?.id ?? null),
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
  // §task: "Реролл после подтверждения запрещаем" — belt-and-suspenders
  // alongside the button being hidden/removed once confirmed (chat.mjs).
  if (flags.confirmed) return;

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

  const targetActor = game.actors.get(flags.targetActorId);
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

  const actor = game.actors.get(flags.actorId);
  const nextFlags = { ...flags, confirmed: true };
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/attack-roll.hbs',
    buildAttackContext(actor, nextFlags),
  );

  return message.update({ content, flags: { [FLAG_SCOPE]: { reroll: nextFlags } } });
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
 * A tie between two-or-more schools at that max tier is `ambiguous: true`
 * unless the caller already resolved it via `chosenSchool` (the school
 * the player picked in the picker triggered by the ambiguous case —
 * module/sheets/actor/hero-sheet.mjs's castSpell action override).
 * `variant`/`variantData` are still fully resolved even while ambiguous —
 * the tier (and so the mana cost/description) is identical across every
 * tied candidate by construction, only WHICH school gets credit is
 * unresolved — so a preview using `candidateSchools[0]` never shows a
 * wrong number, only a provisional school.
 *
 * Shared by castSpell (the cast/charge flow below) and the hero sheet's
 * spellbook overlay (tooltip/frame content, hero-sheet.mjs) so the
 * school→skill→tier→variant chain lives in exactly one place.
 * @param {Actor} actor
 * @param {Item} spell
 * @param {string|null} [chosenSchool]   An elemental school the player
 *   already picked for this specific cast (only meaningful when `spell`'s
 *   own school is `universal`); ignored otherwise.
 * @returns {{
 *   variant: string,
 *   variantData: {description: string, manaCost: number},
 *   resolvedSchool: string|null,
 *   ambiguous: boolean,
 *   candidateSchools: string[],
 * }}
 *   `resolvedSchool` is `null` only when nothing is owned at all (no
 *   elemental school for a universal spell). `candidateSchools` is always
 *   `[school]` for an ordinary spell; for universal it's every
 *   tied-for-highest elemental school (length 0/1/2+ — see
 *   resolveUniversalSchool).
 */
export function findSpellVariant(actor, spell, chosenSchool = null) {
  const school = spell.system.school;

  if (school === 'universal') {
    const schoolTiers = Object.fromEntries(ELEMENTAL_SCHOOLS.map((s) => [
      s,
      actor.items.find((i) => i.type === 'skill' && i.system.skillKey === SCHOOL_SKILL_KEYS[s])?.system.tier ?? null,
    ]));
    const { candidateSchools, tier } = resolveUniversalSchool(schoolTiers);
    const ambiguous = !chosenSchool && candidateSchools.length > 1;
    const resolvedSchool = chosenSchool ?? candidateSchools[0] ?? null;
    const variant = resolveSpellVariant(tier);
    return { variant, variantData: spell.system.variants[variant], resolvedSchool, ambiguous, candidateSchools };
  }

  const skillKey = SCHOOL_SKILL_KEYS[school];
  const skillItem = actor.items.find((i) => i.type === 'skill' && i.system.skillKey === skillKey);
  const variant = resolveSpellVariant(skillItem?.system.tier);
  return {
    variant,
    variantData: spell.system.variants[variant],
    resolvedSchool: school || null,
    ambiguous: false,
    candidateSchools: [school],
  };
}

/**
 * §6.3/§4.3: cast a spell — pick the variant matching the hero's school
 * mastery, and spend its Mana cost if affordable. The Воскрешение
 * specialization's -4 Мана discount (specializations.mjs's
 * `specializationManaDiscount`) is applied here, at the one place that
 * already reads/spends `variantData.manaCost` — not a second cost
 * computation living somewhere else.
 *
 * `chosenSchool` threads straight through to findSpellVariant — for an
 * ambiguous Универсальные spell, the caller (hero-sheet.mjs's castSpell
 * action override) must resolve the ambiguity via its school-picker
 * BEFORE calling this, then pass the pick here. Called with an
 * unresolved ambiguity, this refuses to cast at all (no Mana spent, no
 * chat message) rather than silently guessing a school — the picker path
 * is the only supported way through that case, this is just a defensive
 * backstop against a caller that forgot to check.
 * @param {Actor} actor   The casting hero.
 * @param {Item} spell    The spell item.
 * @param {string|null} [chosenSchool]   See findSpellVariant.
 * @returns {Promise<ChatMessage|null>}   `null` if not enough Mana, or the
 *   school is still ambiguous — nothing is cast either way.
 */
export async function castSpell(actor, spell, chosenSchool = null) {
  const { variant, variantData, resolvedSchool, ambiguous } = findSpellVariant(actor, spell, chosenSchool);
  if (ambiguous) return null;

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
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll], content });

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
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: [finalRoll], content });

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

