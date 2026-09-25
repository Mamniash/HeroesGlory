/**
 * §4.1 (p. 21): experience for defeated creatures — "ХD6 единиц опыта, где
 * Х = уровню побежденного существа", plus the Рассказчик's 1d6/2d6 bonus,
 * plus Обучаемость per die (rolls.mjs's experienceAward). The GM picks
 * creatures and heroes in one window: at combat end (the creatures of that
 * battle, defeated ones ticked) or by hand from a hero's «…» menu (bonus
 * dice only). Each ticked hero rolls and gets their own award (§11).
 * Experience is written to the hero's Actor — a hero's token is linked by
 * default (documents/actor.mjs), so that is the hero itself; creatures,
 * their tokens and the bestiary actors are only read.
 */
import { experienceAward, isDefeatedForExperience, aptitudeBonusPerDie } from './rolls.mjs';
import { ownersAndGmIds } from './roll-actions.mjs';
import { highestSkillTier } from './skill-bonuses.mjs';

/**
 * @param {Roll} roll   An evaluated roll of d6s.
 * @returns {number[]}
 */
function faces(roll) {
  return roll.dice.flatMap((die) => die.results.map((r) => r.result));
}

/**
 * Roll and write one hero's award, post its card (whispered to the hero's
 * owners and the GM, no `rolls` — like the level-up cards).
 * @param {Actor} hero
 * @param {Array<{name: string, level: number}>} creatures
 * @param {number} bonusCount   0, 1 or 2 bonus d6.
 * @returns {Promise<ChatMessage>}
 */
async function awardHero(hero, creatures, bonusCount) {
  const rolled = [];
  for (const creature of creatures) {
    if (creature.level > 0) {
      const roll = await new Roll(`${creature.level}d6`).evaluate();
      rolled.push({ ...creature, dice: faces(roll) });
    } else {
      rolled.push({ ...creature, dice: [] });
    }
  }
  const bonusDice = bonusCount > 0 ? faces(await new Roll(`${bonusCount}d6`).evaluate()) : [];
  const ownedSkills = hero.items
    .filter((i) => i.type === 'skill')
    .map((i) => ({ skillKey: i.system.skillKey, tier: i.system.tier }));
  const aptitudeTier = highestSkillTier(ownedSkills, 'aptitude');
  const award = experienceAward({ creatures: rolled, bonusDice, aptitudeTier });

  const before = hero.system.experience;
  await hero.update({ 'system.experience': before + award.total });

  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/heroes-glory/templates/chat/experience.hbs',
    {
      heroName: hero.name,
      creatures: rolled.map((c) => ({ ...c, sum: c.dice.reduce((s, d) => s + d, 0), faces: c.dice.join(', ') })),
      bonus: bonusDice.length ? { count: bonusDice.length, faces: bonusDice.join(', '), sum: bonusDice.reduce((s, d) => s + d, 0) } : null,
      aptitude: award.aptitudeBonus ? { perDie: aptitudeBonusPerDie(aptitudeTier), dice: award.diceCount, bonus: award.aptitudeBonus } : null,
      total: award.total,
      before,
      after: before + award.total,
    },
  );
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: hero }), content, whisper: ownersAndGmIds(hero) });
}

/**
 * The GM's experience window. `creatures` empty — the manual award: bonus
 * dice and heroes only.
 * @param {object} params
 * @param {Array<{key: string, name: string, level: number, defeated: boolean}>} params.creatures
 * @param {Array<{actor: Actor, checked: boolean}>} params.heroes
 * @param {number} params.defaultBonus
 * @returns {Promise<void>}
 */
export async function openExperienceWindow({ creatures, heroes, defaultBonus = 0 }) {
  if (!game.user.isGM || !heroes.length) return;
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const creatureRows = creatures.map((c) => `<div><label>
      <input type="checkbox" name="creature" value="${c.key}" ${c.defeated ? 'checked' : ''}>
      ${esc(c.name)} — ${i18n.format('HEROES_GLORY.Experience.LevelShort', { level: c.level })}
    </label></div>`).join('');
  const heroRows = heroes.map((h) => `<div><label>
      <input type="checkbox" name="hero" value="${h.actor.uuid}" ${h.checked ? 'checked' : ''}>
      ${esc(h.actor.name)}
    </label></div>`).join('');
  const bonusOptions = [0, 1, 2].map((n) => `<option value="${n}" ${n === defaultBonus ? 'selected' : ''}>${n}d6</option>`).join('');
  const content = `
    ${creatures.length ? `<p><strong>${i18n.localize('HEROES_GLORY.Experience.CreaturesHeading')}</strong></p>${creatureRows}` : ''}
    <p><strong>${i18n.localize('HEROES_GLORY.Experience.HeroesHeading')}</strong></p>${heroRows}
    <p><label>${i18n.localize('HEROES_GLORY.Experience.BonusLabel')} <select name="bonus">${bonusOptions}</select></label></p>`;

  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: 'HEROES_GLORY.Experience.Title' },
    content,
    buttons: [
      {
        action: 'award',
        label: 'HEROES_GLORY.Experience.Award',
        default: true,
        callback: (event, button) => ({
          creatures: [...button.form.querySelectorAll('input[name="creature"]:checked')].map((i) => i.value),
          heroes: [...button.form.querySelectorAll('input[name="hero"]:checked')].map((i) => i.value),
          bonus: Number(button.form.querySelector('select[name="bonus"]').value),
        }),
      },
      { action: 'cancel', label: 'HEROES_GLORY.Rest.Cancel' },
    ],
    rejectClose: false,
  });
  if (!choice || typeof choice !== 'object') return;

  const picked = creatures.filter((c) => choice.creatures.includes(c.key)).map(({ name, level }) => ({ name, level }));
  if (!picked.length && !choice.bonus) return;
  for (const uuid of choice.heroes) {
    const hero = heroes.find((h) => h.actor.uuid === uuid)?.actor;
    if (hero) await awardHero(hero, picked, choice.bonus);
  }
}

/**
 * `deleteCombat`: offer the experience window for this battle — the active
 * GM only. Creatures are read through each combatant's own actor (an
 * unlinked token's), defeated ones ticked; heroes all ticked.
 * @param {Combat} combat
 */
export function offerCombatExperience(combat) {
  if (game.users.activeGM !== game.user) return;
  const { unconscious, incapacitated } = CONFIG.HEROES_GLORY.statusEffects;
  const creatures = [];
  const heroes = new Map();
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    if (actor.type === 'hero') heroes.set(actor.uuid, { actor, checked: true });
    else if (actor.type === 'creature') {
      creatures.push({
        key: combatant.id,
        name: combatant.name || actor.name,
        level: actor.system.level ?? 0,
        defeated: isDefeatedForExperience({
          healthValue: actor.system.health.value,
          incapacitated: actor.statuses.has(incapacitated),
          unconscious: actor.statuses.has(unconscious),
          defeated: combatant.defeated || actor.statuses.has(CONFIG.specialStatusEffects.DEFEATED),
        }),
      });
    }
  }
  if (!creatures.length || !heroes.size) return;
  openExperienceWindow({ creatures, heroes: [...heroes.values()] });
}

/**
 * «Начислить опыт» from a hero's «…» menu — bonus dice only, every hero
 * listed, this one ticked.
 * @param {Actor} hero
 */
export function openManualExperience(hero) {
  const heroes = game.actors
    .filter((a) => a.type === 'hero')
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
    .map((actor) => ({ actor, checked: actor === hero }));
  return openExperienceWindow({ creatures: [], heroes, defaultBonus: 1 });
}
