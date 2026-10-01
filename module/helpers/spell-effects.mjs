/**
 * §6.4 (rules.md), stage 1: damage spells cast by a hero — pure decisions,
 * no Foundry globals. roll-actions.mjs's castSpell rolls the dice, reads
 * the targets and the scene, and posts the card; confirmSpellOutcome
 * applies exactly what resolveSpellResolution below says, the same
 * "shown = applied" contract as an attack card.
 */
import { resolveArmorItemMultiplier } from './rolls.mjs';

/** p. 32: «Дальность произнесения любого заклинания — 24 клетки, если не указано иное». */
export const SPELL_RANGE_CELLS = 24;

/**
 * Whether a spell's variants carry a structured effect at all (an empty
 * `kind` everywhere means the spell still works as before — text only).
 * @param {object|null|undefined} variants   item-spell.mjs's `system.variants`
 * @returns {boolean}
 */
export function hasSpellEffect(variants) {
  if (!variants) return false;
  return Object.values(variants).some((variant) => !!variant?.effect?.kind);
}

/**
 * Where a hero's spell item takes its effect from: its own data, else the
 * compendium entry it was copied from (`_stats.compendiumSource`), else the
 * compendium entry of the same name. `null` when none has one — the cast
 * then works as before.
 * @param {object} args
 * @param {object|null} args.own        the item's own `system.variants`
 * @param {object|null} args.bySource   variants of the entry at its compendiumSource
 * @param {object|null} args.byName     variants of the entry with its name
 * @returns {{variants: object, from: 'item'|'source'|'name'}|null}
 */
export function chooseSpellEffectVariants({ own = null, bySource = null, byName = null }) {
  if (hasSpellEffect(own)) return { variants: own, from: 'item' };
  if (hasSpellEffect(bySource)) return { variants: bySource, from: 'source' };
  if (hasSpellEffect(byName)) return { variants: byName, from: 'name' };
  return null;
}

/**
 * A variant's damage dice for this caster: «NdS + СМ» adds Сила Магии once;
 * «X за СМ» (rules.md §11) is X rolled Сила Магии times — (2d6+3)×3 is
 * 6d6+9, the same distribution as three separate rolls.
 * @param {{count: number, flat: number, perMagicPower: boolean, addMagicPower: boolean}} dice
 * @param {number} magicPower
 * @returns {{count: number, flat: number}}
 */
export function spellDamageDice(dice, magicPower) {
  const power = Math.max(0, magicPower ?? 0);
  const times = dice.perMagicPower ? power : 1;
  return {
    count: (dice.count ?? 0) * times,
    flat: (dice.flat ?? 0) * times + (dice.addMagicPower ? power : 0),
  };
}

/**
 * «2d6+3», «6d6», «0» — a roll formula for spellDamageDice's result.
 * @param {{count: number, flat: number}} dice
 * @returns {string}
 */
export function spellFormula({ count, flat }) {
  if (!count) return String(flat);
  return flat ? `${count}d6 + ${flat}` : `${count}d6`;
}

/** p. 38: Волшебство adds 2d6 / 3d6 / 4d6 to a damage spell. */
const SORCERY_SKILL_DICE = { base: 2, advanced: 3, expert: 4 };

/**
 * p. 38 / p. 23: the extra d6 Волшебство adds to a damage spell — the skill
 * by tier, the specialization 1d6 per spell level; the two add up
 * (rules.md §11).
 * @param {object} args
 * @param {string|null} args.sorceryTier
 * @param {boolean} args.sorcerySpecialization
 * @param {number} args.spellLevel
 * @returns {{skill: number, specialization: number}}   d6 counts
 */
export function sorceryDice({ sorceryTier = null, sorcerySpecialization = false, spellLevel = 0 }) {
  return {
    skill: SORCERY_SKILL_DICE[sorceryTier] ?? 0,
    specialization: sorcerySpecialization ? spellLevel : 0,
  };
}

const normalize = (text) => String(text ?? '').toLowerCase().replace(/ё/g, 'е').trim();

/**
 * What a creature's tags say about spells cast at it (pp. 113–116):
 * immune to every spell («Невосприимчивость к магии», «Иммунитет к
 * заклинаниям», rules.md §11), immune by element or by spell name, and the
 * «Сопротивление Магии N» / «N+» threshold.
 * @param {string[]} tags   creature `system.specialSkills`
 * @returns {{immuneAll: boolean, elements: string[], spellNames: string[], resistThreshold: number|null}}
 */
export function creatureSpellProfile(tags = []) {
  const profile = { immuneAll: false, elements: [], spellNames: [], resistThreshold: null };
  for (const raw of tags) {
    const tag = normalize(raw);
    if (tag.startsWith('невосприимчивость к магии') || tag.startsWith('иммунитет к заклинаниям')) {
      profile.immuneAll = true;
      continue;
    }
    const resist = tag.match(/^сопротивление магии\s*(\d)/);
    if (resist) {
      profile.resistThreshold = Number(resist[1]);
      continue;
    }
    if (!tag.startsWith('иммунитет')) continue;
    if (tag.includes('огню')) profile.elements.push('fire');
    if (tag.includes('льду')) profile.elements.push('ice');
    if (tag.includes('молни')) profile.elements.push('lightning');
    if (tag.includes('армагеддон') || tag.includes('армагедон')) profile.spellNames.push('армагеддон');
    if (tag.includes('метеоритн')) profile.spellNames.push('метеоритный дождь');
  }
  return profile;
}

/** p. 37 Помехи (6 / 5+ / 4+) and p. 8 Гном (6 alone, one better with Помехи). */
const INTERFERENCE_THRESHOLD = { base: 6, advanced: 5, expert: 4 };

/**
 * A hero target's own chance to shrug a spell off: Помехи by tier, a Гном
 * one step better; a Гном without Помехи on a 6 (p. 8). `null` — no roll.
 * @param {object} args
 * @param {string|null} args.interferenceTier
 * @param {boolean} args.gnome
 * @returns {number|null}   the d6 needed
 */
export function heroSpellResistanceThreshold({ interferenceTier = null, gnome = false }) {
  const byTier = INTERFERENCE_THRESHOLD[interferenceTier] ?? null;
  if (byTier !== null) return gnome ? byTier - 1 : byTier;
  return gnome ? 6 : null;
}

/**
 * Why a target is immune to this spell, or null.
 * @param {{immuneAll: boolean, elements: string[], spellNames: string[]}} profile
 * @param {{element: string, spellName: string}} spell
 * @returns {'all'|'element'|'spell'|null}
 */
export function spellImmunity(profile, { element = '', spellName = '' }) {
  if (!profile) return null;
  if (profile.immuneAll) return 'all';
  if (element && profile.elements.includes(element)) return 'element';
  if (profile.spellNames.includes(normalize(spellName))) return 'spell';
  return null;
}

/**
 * Цепная Молния (p. 56, rules.md §11): after the chosen target, each next
 * one is the nearest remaining creature to the previous one. The pool is
 * already filtered (no caster, no defeated or incapacitated); ties keep the
 * pool's order.
 * @template T
 * @param {object} args
 * @param {T} args.first
 * @param {T[]} args.pool
 * @param {number} args.count            extra targets wanted
 * @param {(a: T, b: T) => number} args.distance
 * @returns {T[]}   the extra targets, in chain order
 */
export function pickChainTargets({ first, pool, count, distance }) {
  const remaining = pool.filter((entry) => entry !== first);
  const chain = [];
  let previous = first;
  while (chain.length < count && remaining.length) {
    let bestIndex = 0;
    let best = distance(previous, remaining[0]);
    for (let i = 1; i < remaining.length; i++) {
      const d = distance(previous, remaining[i]);
      if (d < best) {
        best = d;
        bestIndex = i;
      }
    }
    previous = remaining.splice(bestIndex, 1)[0];
    chain.push(previous);
  }
  return chain;
}

/**
 * What a damage spell card applies, target by target — the one source both
 * the card and the GM's confirm read. The damage is rolled once per cast
 * (Волшебство included, rules.md §11); per target: an incapacitated target
 * dies, an immune one takes 0, a resisted one takes 0, otherwise the total
 * × its share (½ for the chain's extra targets), then a worn armor of
 * level 4–5 halves it (§5.5, as for attacks). Rounded down each step.
 * @param {{total: number, targets: object[]}} flags
 * @returns {Array<{outcome: 'kill'|'immune'|'resisted'|'damage', damage: number, armorHalved: boolean}>}
 */
export function resolveSpellResolution(flags) {
  return (flags.targets ?? []).map((target) => {
    if (target.incapacitated) return { outcome: 'kill', damage: 0, armorHalved: false };
    if (target.immunity) return { outcome: 'immune', damage: 0, armorHalved: false };
    if (target.resistThreshold != null && target.resistDie != null && target.resistDie >= target.resistThreshold) {
      return { outcome: 'resisted', damage: 0, armorHalved: false };
    }
    const share = Math.floor(flags.total * (target.factor ?? 1));
    const armor = resolveArmorItemMultiplier(target.equippedArmor ?? []);
    return { outcome: 'damage', damage: Math.floor(share * armor), armorHalved: armor < 1 };
  });
}

/**
 * Whether a spell card's outcome may still be applied: not yet confirmed,
 * and there was at least one target.
 * @param {object|null|undefined} flags
 * @returns {boolean}
 */
export function canConfirmSpell(flags) {
  return !!flags && flags.kind === 'spell' && !flags.confirmed && (flags.targets?.length ?? 0) > 0;
}

/**
 * p. 114 «Нежить» — Благословение and Проклятие don't work on it. Only
 * creatures carry the tag; no hero race is called undead (pp. 8–13,
 * rules.md §11).
 * @param {string[]} tags   creature `system.specialSkills`
 * @returns {boolean}
 */
export function isUndeadCreature(tags = []) {
  return tags.some((raw) => /^нежить(\s|,|\.|$)/.test(normalize(raw)));
}

/**
 * How many targets a modifier spell's variant takes: one, or «количество
 * …, равное СМ» at Эксперт — all Сила Магии targets, the first included
 * (rules.md §11), at least one.
 * @param {{targeting?: {perMagicPowerTargets?: boolean}}} effect
 * @param {number} magicPower
 * @returns {number}
 */
export function modifierTargetLimit(effect, magicPower) {
  if (!effect?.targeting?.perMagicPowerTargets) return 1;
  return Math.max(1, magicPower ?? 0);
}

/**
 * What a modifier spell card applies, target by target — the one source
 * both the card and the GM's confirm read. Immune («ко всем заклинаниям»,
 * useful spells too — rules.md §11) or resisted (hostile spells only, the
 * die rolled at the cast): nothing; otherwise the effect goes on. An
 * incapacitated target just gets it (rules.md §11: a modifier isn't an
 * attack).
 * @param {{targets: object[]}} flags
 * @returns {Array<{outcome: 'immune'|'resisted'|'applied'}>}
 */
export function resolveModifierSpellResolution(flags) {
  return (flags.targets ?? []).map((target) => {
    if (target.immunity) return { outcome: 'immune' };
    if (target.resistThreshold != null && target.resistDie != null && target.resistDie >= target.resistThreshold) {
      return { outcome: 'resisted' };
    }
    return { outcome: 'applied' };
  });
}

/** p. 32: at most 3 lasting spells a hero keeps up at once (rules.md §11: this hero's casts). */
export const MAX_LASTING_SPELLS = 3;

/**
 * p. 32, «Если вы накладываете новое и заклинаний становится 4, вы должны
 * решить, какое из ранее сотворенных закончить». A cast counts once however
 * many targets it has (rules.md §11). A cast the new one fully replaces —
 * the same spell on targets all among the new ones (rules.md §11: a recast
 * refreshes) — doesn't count: it is ending anyway.
 * @param {object} args
 * @param {Array<{castId: string, spellName: string, targetIds: string[]}>} args.casts   the hero's active casts
 * @param {string} args.newSpellName
 * @param {string[]} args.newTargetIds
 * @param {number} [args.limit]
 * @returns {{needsChoice: boolean, candidates: Array<{castId: string, spellName: string, targetIds: string[]}>}}
 */
export function resolveLastingSpellLimit({ casts = [], newSpellName, newTargetIds = [], limit = MAX_LASTING_SPELLS }) {
  const candidates = casts.filter((cast) => !(cast.spellName === newSpellName
    && cast.targetIds.length && cast.targetIds.every((id) => newTargetIds.includes(id))));
  return { needsChoice: candidates.length >= limit, candidates };
}

/** Artifacts that lengthen the hero's spells (pp. 49, 50; ход = раунд, rules.md §11). */
export const SPELL_DURATION_ARTIFACTS = { 'Магический ошейник': 1, 'Магическая накидка': 3 };

/**
 * A lasting spell's rounds: Сила Магии (p. 32) plus the worn artifacts that
 * lengthen spells, each counted once.
 * @param {number} magicPower
 * @param {string[]} [equippedArtifactNames]
 * @returns {number}
 */
export function lastingSpellRounds(magicPower, equippedArtifactNames = []) {
  const bonus = [...new Set(equippedArtifactNames)].reduce((sum, name) => sum + (SPELL_DURATION_ARTIFACTS[name] ?? 0), 0);
  return Math.max(0, magicPower ?? 0) + bonus;
}

/** Flag scope and key of the ActiveEffect a lasting spell puts on its target. */
const SPELL_EFFECT_SCOPE = 'heroes-glory';
const SPELL_EFFECT_KEY = 'spellEffect';

/**
 * A spell effect flag's modifiers — `modifiers` since group А1, the single
 * `stat`/`value`/`floorOne` of stage 2 before it (effects still up in a
 * running combat).
 * @param {object|null|undefined} data   the effect's `spellEffect` flag
 * @returns {Array<{stat: string, value: number, floorOne: boolean, floor: number|null}>}
 */
export function spellEffectModifiers(data) {
  if (!data) return [];
  const list = Array.isArray(data.modifiers) ? data.modifiers : (data.stat ? [data] : []);
  return list.map((m) => ({ stat: m.stat, value: m.value, floorOne: !!m.floorOne, floor: m.floor ?? null }));
}

/**
 * The spell modifiers an actor carries now (§6.4) — one entry per spell and
 * stat; disabled or expired effects left out. Reads plain `flags`, so it
 * works on ActiveEffect documents and on test objects alike.
 * @param {Iterable<object>} effects   the actor's ActiveEffects
 * @returns {Array<{effectId: string, spellName: string, stat: string, value: number, floorOne: boolean, floor: number|null}>}
 */
export function actorSpellModifiers(effects = []) {
  const seen = new Set();
  const result = [];
  for (const effect of effects ?? []) {
    const data = effect?.flags?.[SPELL_EFFECT_SCOPE]?.[SPELL_EFFECT_KEY];
    if (!data || effect.disabled || effect.duration?.expired) continue;
    for (const modifier of spellEffectModifiers(data)) {
      const key = `${data.spellName}|${modifier.stat}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ effectId: effect.id ?? effect._id ?? null, spellName: data.spellName, ...modifier });
    }
  }
  return result;
}

/**
 * A stat under lasting spells (§6.4, group А1): every spell's change adds
 * up (rules.md §11: different spells act together); «до минимума N» doesn't
 * push the value below N, nor lift a value already below it —
 * max(value + Σ, min(value, N)), N the highest floor among them.
 * @param {number} value   the stat before spells
 * @param {Array<{value: number, floor?: number|null}>} [modifiers]   this stat's
 * @returns {{value: number, delta: number}}
 */
export function applySpellStatModifiers(value, modifiers = []) {
  if (!modifiers.length) return { value, delta: 0 };
  const total = value + modifiers.reduce((sum, m) => sum + m.value, 0);
  const floors = modifiers.map((m) => m.floor).filter((f) => f !== null && f !== undefined);
  const result = floors.length ? Math.max(total, Math.min(value, Math.max(...floors))) : total;
  return { value: result, delta: result - value };
}

/**
 * Удача and Неудача (pp. 55, 60) — creatures have no Удача (rules.md §11):
 * a spell changing it isn't cast on them.
 * @param {{modifiers?: Array<{stat: string}>}} effect
 * @returns {boolean}
 */
export function spellHeroesOnly(effect) {
  return (effect?.modifiers ?? []).some((m) => m.stat === 'luck');
}

/**
 * Group В, Лечение (p. 57): «Снимает с существа все негативные заклинания»
 * — these (rules.md §11), whoever cast them; the same as the hostile ones
 * (test/spell-effects.test.mjs keeps the two in step).
 * @type {string[]}
 */
export const NEGATIVE_SPELLS = ['Разрушительный Луч', 'Замедление', 'Слабость', 'Проклятие', 'Неудача', 'Забывчивость', 'Слепота'];

/**
 * Core statuses the GM sets for creature abilities that a spell lifts
 * (pp. 113–115, rules.md §11): Лечение — Паралич, Болезнь, the «Проклятие»
 * ability; Развеивание Магии («Снятие заклинаний», «Рассеивание») —
 * Ослепление, Паралич, «Проклятие». Окаменение has no status.
 */
export const HEAL_STATUSES = ['paralysis', 'disease', 'curse'];
export const DISPEL_STATUSES = ['blind', 'paralysis', 'curse'];

/**
 * What a cleansing spell takes off a target: its spell effects (Лечение —
 * the negative ones only, Развеивание — all) and the listed core statuses
 * it carries.
 * @param {object} args
 * @param {Array<{id: string, spellName: string}>} args.spellEffects   the target's spell effects
 * @param {Iterable<string>} args.statuses                            the target's statuses
 * @param {'heal'|'dispel'} args.kind
 * @returns {{effectIds: string[], spellNames: string[], statuses: string[]}}
 */
export function cleansingRemovals({ spellEffects = [], statuses = [], kind }) {
  const effects = kind === 'heal' ? spellEffects.filter((e) => NEGATIVE_SPELLS.includes(e.spellName)) : spellEffects;
  const list = kind === 'heal' ? HEAL_STATUSES : DISPEL_STATUSES;
  const has = new Set(statuses);
  return {
    effectIds: effects.map((e) => e.id),
    spellNames: [...new Set(effects.map((e) => e.spellName))],
    statuses: list.filter((s) => has.has(s)),
  };
}

/**
 * Лечение: «лечит его на 1d6+СМ» — not above the maximum (rules.md §11).
 * @param {object} args
 * @param {number} args.total   the cast's one roll (rules.md §11: one for all targets)
 * @param {number} args.value   Health now
 * @param {number} args.max
 * @returns {number}   Health gained
 */
export function healAmount({ total, value, max }) {
  return Math.max(0, Math.min(total, max - value));
}

/**
 * Развеивание Магии's «дружественного существа»: a target on the caster's
 * side — the same token disposition; without a caster token on the scene,
 * the friendly side (rules.md §11).
 * @param {number} targetDisposition
 * @param {number|null|undefined} casterDisposition
 * @param {number} friendly   CONST.TOKEN_DISPOSITIONS.FRIENDLY
 * @returns {boolean}
 */
export function isFriendlyTarget(targetDisposition, casterDisposition, friendly) {
  return targetDisposition === (casterDisposition ?? friendly);
}

/**
 * Воскрешение doesn't work on «Нежить», «Голем», «Элементаль» (pp. 114,
 * 116) — the creature's tag that stops it, or `null`.
 * @param {string[]} tags   creature `system.specialSkills`
 * @returns {string|null}
 */
export function resurrectionBlockingTag(tags = []) {
  return tags.find((raw) => /^(нежить|голем|элементаль)(\s|,|\.|$)/.test(normalize(raw))) ?? null;
}

/**
 * What a cleansing / healing / resurrecting card applies, target by
 * target — the one source the card and the GM's confirm read. Immune
 * («ко всем заклинаниям») or resisted (Развеивание on a target not on the
 * caster's side): nothing.
 * Лечение — Health (healAmount, frozen at the cast) and the removals;
 * Развеивание — the removals; Воскрешение — Health ⌊max × share⌋, and a
 * Ранение when it lasts beyond the battle (p. 32) unless the caster has
 * that specialization (p. 23).
 * @param {object} flags   the card's flags
 * @returns {Array<{outcome: 'immune'|'resisted'|'applied', health?: number, wound?: boolean}>}
 */
export function resolveSupportSpellResolution(flags) {
  return (flags.targets ?? []).map((target) => {
    if (target.immunity) return { outcome: 'immune' };
    if (target.resistThreshold != null && target.resistDie != null && target.resistDie >= target.resistThreshold) {
      return { outcome: 'resisted' };
    }
    if (flags.effectKind === 'heal') {
      return { outcome: 'applied', health: healAmount({ total: flags.total, value: target.healthValue, max: target.healthMax }) };
    }
    if (flags.effectKind === 'resurrect') {
      return {
        outcome: 'applied',
        health: Math.floor(target.healthMax * (flags.healthFactor ?? 1)),
        wound: target.isHero && !flags.untilCombatEnd && !flags.noWound,
      };
    }
    return { outcome: 'applied' };
  });
}
