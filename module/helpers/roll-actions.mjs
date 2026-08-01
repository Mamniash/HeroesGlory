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
  resolveEpicTableRow,
  resolveEpicSeverity,
  resolveHitLocation,
  SCHOOL_SKILL_KEYS,
  resolveSpellVariant,
  canAffordSpell,
  resolveAbilityCheck,
} from './rolls.mjs';

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

  const hit = resolveHit(mainRoll.dice[0].total);
  const defeat = resolveDefeat({
    attackerAttack: actor.system.attack,
    targetDefense,
    die: targetActor ? mainRoll.dice[1].total : null,
  });
  const damage = resolveDamage({ baseDamage, hit, defeat });

  const rolls = [mainRoll];
  let epicRow = null;
  let severe = false;
  let location = null;

  // §5.4: epic cascade — table row, then a repeat d6 for severity, then
  // (only if severe) the "Куда попал" location roll. Each step depends on
  // the previous result, so these can't be folded into the main Roll.
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

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/attack-roll.hbs',
    {
      attackerName: actor.name,
      weaponName: weapon?.name ?? null,
      targetName: targetActor?.name ?? null,
      hit: { ...hit, labelKey: HIT_LABELS[hit.key] },
      defeat,
      damage,
      damageKnown: damage !== null,
      hasEpicTable: !!epicTable,
      epicRow,
      severe,
      location: location ? LOCATION_LABELS[location] : null,
    },
  );

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls,
    content,
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
  const result = resolveAbilityCheck(roll.dice[0].total, actor.system[skillKey]);

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/ability-check.hbs',
    {
      actorName: actor.name,
      skillLabelKey: PRIMARY_SKILL_LABELS[skillKey],
      ...result,
    },
  );

  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content,
  });
}
