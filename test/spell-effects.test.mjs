import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPELL_RANGE_CELLS, hasSpellEffect, chooseSpellEffectVariants, spellDamageDice, spellFormula,
  sorceryDice, creatureSpellProfile, heroSpellResistanceThreshold, spellImmunity, pickChainTargets,
  resolveSpellResolution, canConfirmSpell, isUndeadCreature, modifierTargetLimit, resolveModifierSpellResolution,
  resolveLastingSpellLimit, MAX_LASTING_SPELLS, lastingSpellRounds,
  spellEffectModifiers, actorSpellModifiers, applySpellStatModifiers, spellHeroesOnly,
} from '../module/helpers/spell-effects.mjs';

const damage = (dice, extra = {}) => ({ description: '', manaCost: 1, effect: { kind: 'damage', dice, ...extra } });
const textOnly = () => ({ description: '', manaCost: 1, effect: { kind: '' } });
const variants = (make) => ({ none: make(), basic: make(), advanced: make(), expert: make() });

describe('spell range — p. 32', () => {
  test('24 cells', () => assert.equal(SPELL_RANGE_CELLS, 24));
});

describe('chooseSpellEffectVariants — item, compendiumSource, name', () => {
  const withEffect = variants(() => damage({ count: 1, flat: 0, perMagicPower: false, addMagicPower: true }));
  const without = variants(textOnly);

  test('the item\'s own effect first', () => {
    assert.deepEqual(chooseSpellEffectVariants({ own: withEffect, bySource: null, byName: null }), { variants: withEffect, from: 'item' });
  });

  test('an older item without an effect: the entry at its compendiumSource', () => {
    assert.equal(chooseSpellEffectVariants({ own: without, bySource: withEffect, byName: withEffect }).from, 'source');
  });

  test('no compendiumSource (or the entry has none): the entry of the same name', () => {
    assert.equal(chooseSpellEffectVariants({ own: without, bySource: null, byName: withEffect }).from, 'name');
    assert.equal(chooseSpellEffectVariants({ own: without, bySource: without, byName: withEffect }).from, 'name');
  });

  test('nothing found: null — the cast works as before', () => {
    assert.equal(chooseSpellEffectVariants({ own: without, bySource: null, byName: null }), null);
    assert.equal(hasSpellEffect(undefined), false);
  });
});

describe('spellDamageDice — «+СМ» once, «за СМ» rolled Сила Магии times', () => {
  test('Молния 3d6 + СМ', () => {
    assert.deepEqual(spellDamageDice({ count: 3, flat: 0, perMagicPower: false, addMagicPower: true }, 4), { count: 3, flat: 4 });
  });

  test('Взрыв (2d6+3) за СМ at СМ 3 = 6d6 + 9', () => {
    assert.deepEqual(spellDamageDice({ count: 2, flat: 3, perMagicPower: true, addMagicPower: false }, 3), { count: 6, flat: 9 });
  });

  test('Цепная Молния 1d6 за СМ at СМ 5 = 5d6', () => {
    assert.deepEqual(spellDamageDice({ count: 1, flat: 0, perMagicPower: true, addMagicPower: false }, 5), { count: 5, flat: 0 });
  });

  test('СМ 0: «за СМ» rolls nothing', () => {
    assert.deepEqual(spellDamageDice({ count: 2, flat: 3, perMagicPower: true, addMagicPower: false }, 0), { count: 0, flat: 0 });
  });

  test('formula text', () => {
    assert.equal(spellFormula({ count: 6, flat: 9 }), '6d6 + 9');
    assert.equal(spellFormula({ count: 5, flat: 0 }), '5d6');
    assert.equal(spellFormula({ count: 0, flat: 0 }), '0');
  });
});

describe('sorceryDice — p. 38 skill, p. 23 specialization, both add up', () => {
  test('skill by tier', () => {
    assert.equal(sorceryDice({ sorceryTier: 'base', spellLevel: 2 }).skill, 2);
    assert.equal(sorceryDice({ sorceryTier: 'advanced', spellLevel: 2 }).skill, 3);
    assert.equal(sorceryDice({ sorceryTier: 'expert', spellLevel: 2 }).skill, 4);
    assert.equal(sorceryDice({ sorceryTier: null, spellLevel: 2 }).skill, 0);
  });

  test('specialization: 1d6 per spell level, on top of the skill', () => {
    assert.deepEqual(sorceryDice({ sorceryTier: 'expert', sorcerySpecialization: true, spellLevel: 5 }), { skill: 4, specialization: 5 });
    assert.equal(sorceryDice({ sorceryTier: null, sorcerySpecialization: false, spellLevel: 5 }).specialization, 0);
  });
});

describe('creatureSpellProfile — the bestiary tags', () => {
  test('immune to all spells', () => {
    assert.equal(creatureSpellProfile(['Невосприимчивость к магии']).immuneAll, true);
    assert.equal(creatureSpellProfile(['Иммунитет к заклинаниям']).immuneAll, true);
  });

  test('by element and by spell', () => {
    const profile = creatureSpellProfile(['Элементаль', 'Иммунитет к Молниям и Армагеддону', 'Иммунитет ко льду', 'Иммунитет к Огню']);
    assert.deepEqual(profile.elements.sort(), ['fire', 'ice', 'lightning']);
    assert.deepEqual(profile.spellNames, ['армагеддон']);
    assert.deepEqual(creatureSpellProfile(['Иммунитет к Метеоритному дождю']).spellNames, ['метеоритный дождь']);
  });

  test('Сопротивление Магии N and N+, either case', () => {
    assert.equal(creatureSpellProfile(['Сопротивление Магии 6']).resistThreshold, 6);
    assert.equal(creatureSpellProfile(['Большой', 'Сопротивление Магии 3+']).resistThreshold, 3);
    assert.equal(creatureSpellProfile(['Сопротивление магии 4+']).resistThreshold, 4);
  });

  test('unrelated immunities change nothing', () => {
    const profile = creatureSpellProfile(['Иммунитет к Магии Разума', 'Иммунитет к кавалерийскому Бонусу', 'Нежить']);
    assert.deepEqual(profile, { immuneAll: false, elements: [], spellNames: [], resistThreshold: null });
  });
});

describe('heroSpellResistanceThreshold — Помехи p. 37, Гном p. 8', () => {
  test('Помехи by tier', () => {
    assert.equal(heroSpellResistanceThreshold({ interferenceTier: 'base' }), 6);
    assert.equal(heroSpellResistanceThreshold({ interferenceTier: 'advanced' }), 5);
    assert.equal(heroSpellResistanceThreshold({ interferenceTier: 'expert' }), 4);
  });

  test('a Гном: 6 alone, one step better with Помехи', () => {
    assert.equal(heroSpellResistanceThreshold({ gnome: true }), 6);
    assert.equal(heroSpellResistanceThreshold({ interferenceTier: 'base', gnome: true }), 5);
    assert.equal(heroSpellResistanceThreshold({ interferenceTier: 'expert', gnome: true }), 3);
  });

  test('neither: no roll', () => {
    assert.equal(heroSpellResistanceThreshold({}), null);
  });
});

describe('spellImmunity', () => {
  test('Молния vs Иммунитет к Молниям; Ледяная Молния vs Иммунитет ко льду', () => {
    const lightning = creatureSpellProfile(['Иммунитет к Молниям и Армагеддону']);
    assert.equal(spellImmunity(lightning, { element: 'lightning', spellName: 'Молния' }), 'element');
    assert.equal(spellImmunity(lightning, { element: 'ice', spellName: 'Ледяная Молния' }), null);
    assert.equal(spellImmunity(creatureSpellProfile(['Иммунитет ко льду']), { element: 'ice', spellName: 'Ледяная Молния' }), 'element');
  });

  test('immune to all beats everything', () => {
    assert.equal(spellImmunity(creatureSpellProfile(['Иммунитет к заклинаниям']), { element: '', spellName: 'Волшебная Стрела' }), 'all');
  });

  test('by name', () => {
    assert.equal(spellImmunity(creatureSpellProfile(['Иммунитет к Молниям и Армагеддону']), { element: 'fire', spellName: 'Армагеддон' }), 'spell');
  });
});

describe('pickChainTargets — nearest to the previous target', () => {
  const at = (name, x, y) => ({ name, x, y });
  const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

  test('hops from each new target, not from the first one', () => {
    const a = at('a', 0, 0), b = at('b', 2, 0), c = at('c', 4, 0), d = at('d', 0, 3);
    const chain = pickChainTargets({ first: a, pool: [a, b, c, d], count: 3, distance });
    assert.deepEqual(chain.map((t) => t.name), ['b', 'c', 'd']);
  });

  test('stops when the pool runs out', () => {
    const a = at('a', 0, 0), b = at('b', 1, 0);
    assert.deepEqual(pickChainTargets({ first: a, pool: [b], count: 4, distance }).map((t) => t.name), ['b']);
  });

  test('ties keep the pool order', () => {
    const a = at('a', 0, 0), b = at('b', 1, 0), c = at('c', 0, 1);
    assert.deepEqual(pickChainTargets({ first: a, pool: [c, b], count: 1, distance }).map((t) => t.name), ['c']);
  });
});

describe('resolveSpellResolution — shown = applied', () => {
  test('full damage, the chain\'s extra targets half, rounded down', () => {
    const result = resolveSpellResolution({ total: 15, targets: [{ factor: 1 }, { factor: 0.5 }] });
    assert.deepEqual(result.map((r) => r.damage), [15, 7]);
  });

  test('immune and resisted take nothing; a failed resistance roll takes full', () => {
    const result = resolveSpellResolution({
      total: 12,
      targets: [
        { factor: 1, immunity: 'element' },
        { factor: 1, resistThreshold: 5, resistDie: 5 },
        { factor: 1, resistThreshold: 5, resistDie: 4 },
      ],
    });
    assert.deepEqual(result.map((r) => [r.outcome, r.damage]), [['immune', 0], ['resisted', 0], ['damage', 12]]);
  });

  test('an incapacitated target dies (rules.md §11)', () => {
    assert.deepEqual(resolveSpellResolution({ total: 9, targets: [{ factor: 1, incapacitated: true }] })[0].outcome, 'kill');
  });

  test('worn armor of level 4–5 halves it, once; lower levels don\'t', () => {
    const [halved, plain] = resolveSpellResolution({
      total: 15,
      targets: [
        { factor: 1, equippedArmor: [{ level: 5 }, { level: 4 }] },
        { factor: 1, equippedArmor: [{ level: 3 }] },
      ],
    });
    assert.deepEqual([halved.damage, halved.armorHalved, plain.damage], [7, true, 15]);
  });

  test('no targets, nothing to confirm; confirmed once', () => {
    assert.equal(canConfirmSpell({ kind: 'spell', targets: [] }), false);
    assert.equal(canConfirmSpell({ kind: 'spell', targets: [{}] }), true);
    assert.equal(canConfirmSpell({ kind: 'spell', targets: [{}], confirmed: true }), false);
    assert.equal(canConfirmSpell({ kind: 'attack', targets: [{}] }), false);
  });
});

describe('spell compendium — stage 1 effects read off the book text', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const fakeFoundry = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-foundry-'));
  fs.writeFileSync(path.join(fakeFoundry, 'package.json'), JSON.stringify({ release: { generation: 14, build: 365 } }));
  process.env.FOUNDRY_APP_PATH = fakeFoundry;
  const { buildSpellDocuments } = await import('../scripts/data/spell-compendium-data.mjs');
  const docs = buildSpellDocuments();
  const byName = Object.fromEntries(docs.map((d) => [d.name, d.system.variants]));
  const dice = (name, variant, magicPower) => spellDamageDice(byName[name][variant].effect.dice, magicPower);

  test('exactly the five stage-1 spells carry a damage effect', () => {
    const withEffect = docs.filter((d) => d.system.variants.none.effect.kind === 'damage').map((d) => d.name).sort();
    assert.deepEqual(withEffect, ['Взрыв', 'Волшебная Стрела', 'Ледяная Молния', 'Молния', 'Цепная Молния']);
  });

  test('stage 2 and its group А1 — fifteen spells carry a modifier effect, on every tier', () => {
    const withEffect = docs.filter((d) => Object.values(d.system.variants).every((v) => v.effect.kind === 'modifier'))
      .map((d) => d.name).sort();
    assert.deepEqual(withEffect, [
      'Благословение', 'Воздушный Щит', 'Жажда Крови', 'Замедление', 'Каменная Кожа', 'Молитва', 'Неудача',
      'Полет', 'Проклятие', 'Разрушительный Луч', 'Слабость', 'Точность', 'Удача', 'Ускорение', 'Щит',
    ]);
    assert.equal(docs.filter((d) => hasSpellEffect(d.system.variants)).length, 20);
  });

  // pp. 53, 56, 57, 59: [none, basic, advanced, expert] values; only expert takes СМ targets.
  const modifierCases = [
    ['Щит', 'meleeDamageTaken', [-6, -6, -10, -10], { floorOne: true, hostile: false, excludeUndead: false }],
    ['Воздушный Щит', 'rangedDamageTaken', [-5, -5, -10, -10], { floorOne: true, hostile: false, excludeUndead: false }],
    ['Благословение', 'damageDealt', [4, 4, 6, 6], { floorOne: false, hostile: false, excludeUndead: true }],
    ['Слабость', 'damageDealt', [-2, -2, -4, -4], { floorOne: true, hostile: true, excludeUndead: false }],
    ['Проклятие', 'damageDealt', [-2, -2, -4, -4], { floorOne: true, hostile: true, excludeUndead: true }],
  ];
  for (const [name, stat, values, flags] of modifierCases) {
    test(`${name}: ${stat} ${values.join('/')} by tier`, () => {
      const tiers = ['none', 'basic', 'advanced', 'expert'];
      tiers.forEach((tier, i) => {
        const effect = byName[name][tier].effect;
        assert.deepEqual(effect.modifiers, [{ stat, value: values[i], floorOne: flags.floorOne, floor: null }]);
        assert.equal(effect.hostile, flags.hostile);
        assert.equal(effect.excludeUndead, flags.excludeUndead);
        assert.equal(effect.targeting.perMagicPowerTargets, tier === 'expert');
      });
    });
  }

  // Group А1, pp. 53, 55, 56, 58, 59, 60: [none, basic, advanced, expert]
  // per stat — [value, «до минимума N»]; hostile; expert on СМ targets.
  const statCases = [
    ['Замедление', { speed: [[-3, 3], [-3, 3], [-6, 1], [-6, 1]] }, { hostile: true, expertTargets: true }],
    ['Каменная Кожа', { defense: [[3], [3], [6], [6]] }, { hostile: false, expertTargets: true }],
    ['Ускорение', { speed: [[3], [3], [6], [6]] }, { hostile: false, expertTargets: true }],
    ['Точность', { rangedAttack: [[3], [3], [6], [6]] }, { hostile: false, expertTargets: true }],
    ['Удача', { luck: [[1], [1], [2], [2]] }, { hostile: false, expertTargets: true }],
    ['Разрушительный Луч', { defense: [[-3, 0], [-3, 0], [-5, 0], [-7, 0]] }, { hostile: true, expertTargets: false }],
    ['Жажда Крови', { attack: [[3], [3], [6], [6]] }, { hostile: false, expertTargets: true }],
    ['Неудача', { luck: [[-1], [-1], [-2], [-2]] }, { hostile: true, expertTargets: true }],
    ['Молитва', {
      attack: [[2], [2], [4], [4]], defense: [[2], [2], [4], [4]], speed: [[2], [2], [4], [4]], damageDealt: [[2], [2], [4], [4]],
    }, { hostile: false, expertTargets: true, untilCombatEnd: true }],
    ['Полет', { speed: [null, null, [3], [3]] }, { hostile: false, expertTargets: true, status: 'fly', textOutOfCombat: true }],
  ];
  for (const [name, stats, opts] of statCases) {
    test(`${name}: by tier (group А1)`, () => {
      ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
        const effect = byName[name][tier].effect;
        const expected = Object.entries(stats).filter(([, byTier]) => byTier[i])
          .map(([stat, byTier]) => ({ stat, value: byTier[i][0], floorOne: false, floor: byTier[i][1] ?? null }));
        assert.deepEqual(effect.modifiers, expected);
        assert.equal(effect.hostile, opts.hostile);
        assert.equal(effect.excludeUndead, false);
        assert.equal(effect.targeting.perMagicPowerTargets, opts.expertTargets && tier === 'expert');
        assert.equal(effect.untilCombatEnd, !!opts.untilCombatEnd);
        assert.equal(effect.status, opts.status ?? '');
        assert.equal(effect.textOutOfCombat, !!opts.textOutOfCombat);
      });
    });
  }

  test('rules.md §11 costs: Стена Огня 28/12, Огненный Шар 36/15, Удача 12/4', () => {
    const cost = (name, tier) => byName[name][tier].manaCost;
    assert.deepEqual([cost('Стена Огня', 'none'), cost('Стена Огня', 'basic')], [28, 12]);
    assert.deepEqual([cost('Огненный Шар', 'none'), cost('Огненный Шар', 'basic')], [36, 15]);
    assert.deepEqual([cost('Удача', 'none'), cost('Удача', 'basic')], [12, 4]);
  });

  test('«+СМ» spells at СМ 3', () => {
    assert.deepEqual(dice('Волшебная Стрела', 'none', 3), { count: 1, flat: 3 });
    assert.deepEqual(dice('Волшебная Стрела', 'expert', 3), { count: 3, flat: 3 });
    assert.deepEqual(dice('Молния', 'advanced', 3), { count: 4, flat: 3 });
    assert.deepEqual(dice('Ледяная Молния', 'expert', 3), { count: 4, flat: 3 });
  });

  test('«за СМ» spells at СМ 3', () => {
    assert.deepEqual(dice('Взрыв', 'none', 3), { count: 6, flat: 9 });
    assert.deepEqual(dice('Взрыв', 'expert', 3), { count: 6, flat: 15 });
    assert.deepEqual(dice('Цепная Молния', 'basic', 3), { count: 3, flat: 0 });
    assert.deepEqual(dice('Цепная Молния', 'advanced', 3), { count: 3, flat: 3 });
  });

  test('Цепная Молния: 3 extra targets at half, expert 4 extra (p. 56)', () => {
    assert.deepEqual([byName['Цепная Молния'].none.effect.targeting.extraTargets, byName['Цепная Молния'].none.effect.targeting.extraFactor], [3, 0.5]);
    assert.equal(byName['Цепная Молния'].expert.effect.targeting.extraTargets, 4);
    assert.equal(byName['Молния'].none.effect.targeting.mode, 'single');
  });

  test('elements: Молния and Цепная Молния lightning, Ледяная Молния ice', () => {
    assert.equal(byName['Молния'].none.effect.element, 'lightning');
    assert.equal(byName['Цепная Молния'].expert.effect.element, 'lightning');
    assert.equal(byName['Ледяная Молния'].none.effect.element, 'ice');
    assert.equal(byName['Волшебная Стрела'].none.effect.element, '');
  });

  test('Проклятие, advanced: «на 4» (book typo «до 4», rules.md §11)', () => {
    assert.equal(byName['Проклятие'].advanced.description, 'Урон снижается на 4, до минимума 1');
  });
});

describe('isUndeadCreature — p. 114 «Нежить»', () => {
  test('the «Нежить» tag, any case', () => {
    assert.equal(isUndeadCreature(['Нежить', 'Стрелок']), true);
    assert.equal(isUndeadCreature(['нежить']), true);
  });
  test('no tag, or a tag that only mentions undead', () => {
    assert.equal(isUndeadCreature([]), false);
    assert.equal(isUndeadCreature(['Летает', 'Ненависть к нежити']), false);
  });
});

describe('modifierTargetLimit — «количество …, равное СМ» (rules.md §11)', () => {
  test('one target below Эксперт', () => {
    assert.equal(modifierTargetLimit({ targeting: { perMagicPowerTargets: false } }, 4), 1);
  });
  test('Эксперт: Сила Магии targets, the first included, at least one', () => {
    assert.equal(modifierTargetLimit({ targeting: { perMagicPowerTargets: true } }, 4), 4);
    assert.equal(modifierTargetLimit({ targeting: { perMagicPowerTargets: true } }, 0), 1);
  });
});

describe('resolveModifierSpellResolution — per target', () => {
  test('immune, resisted, applied', () => {
    const results = resolveModifierSpellResolution({
      targets: [
        { immunity: 'all' },
        { resistThreshold: 5, resistDie: 5 },
        { resistThreshold: 5, resistDie: 4 },
        { resistThreshold: null, resistDie: null },
      ],
    });
    assert.deepEqual(results.map((r) => r.outcome), ['immune', 'resisted', 'applied', 'applied']);
  });
  test('an incapacitated target just gets the effect (rules.md §11)', () => {
    assert.deepEqual(resolveModifierSpellResolution({ targets: [{ incapacitated: true }] }), [{ outcome: 'applied' }]);
  });
});

describe('resolveLastingSpellLimit — p. 32, at most 3 lasting spells', () => {
  const cast = (castId, spellName, targetIds) => ({ castId, spellName, targetIds });
  test('the limit is 3', () => {
    assert.equal(MAX_LASTING_SPELLS, 3);
  });
  test('fewer than 3 active: no choice', () => {
    const r = resolveLastingSpellLimit({ casts: [cast('a', 'Щит', ['x']), cast('b', 'Благословение', ['y'])], newSpellName: 'Проклятие', newTargetIds: ['z'] });
    assert.equal(r.needsChoice, false);
  });
  test('3 active and a 4th: choose among the 3', () => {
    const casts = [cast('a', 'Щит', ['x']), cast('b', 'Благословение', ['y']), cast('c', 'Проклятие', ['z'])];
    const r = resolveLastingSpellLimit({ casts, newSpellName: 'Слабость', newTargetIds: ['w'] });
    assert.equal(r.needsChoice, true);
    assert.deepEqual(r.candidates.map((c) => c.castId), ['a', 'b', 'c']);
  });
  test('an expert cast on several targets counts once', () => {
    const casts = [cast('a', 'Щит', ['x', 'y', 'z']), cast('b', 'Благословение', ['y'])];
    assert.equal(resolveLastingSpellLimit({ casts, newSpellName: 'Проклятие', newTargetIds: ['w'] }).needsChoice, false);
  });
  test('recasting the same spell on the same target replaces it — no choice', () => {
    const casts = [cast('a', 'Щит', ['x']), cast('b', 'Благословение', ['y']), cast('c', 'Проклятие', ['z'])];
    const r = resolveLastingSpellLimit({ casts, newSpellName: 'Благословение', newTargetIds: ['y'] });
    assert.equal(r.needsChoice, false);
  });
  test('the same spell on another target still counts', () => {
    const casts = [cast('a', 'Щит', ['x']), cast('b', 'Благословение', ['y']), cast('c', 'Проклятие', ['z'])];
    assert.equal(resolveLastingSpellLimit({ casts, newSpellName: 'Благословение', newTargetIds: ['w'] }).needsChoice, true);
  });
});

describe('lastingSpellRounds — Сила Магии plus the artifacts (pp. 32, 49, 50)', () => {
  test('Сила Магии rounds', () => {
    assert.equal(lastingSpellRounds(3), 3);
  });
  test('Магический ошейник +1, Магическая накидка +3, both +4', () => {
    assert.equal(lastingSpellRounds(3, ['Магический ошейник']), 4);
    assert.equal(lastingSpellRounds(3, ['Магическая накидка']), 6);
    assert.equal(lastingSpellRounds(3, ['Магический ошейник', 'Магическая накидка', 'Щит гнолла']), 7);
  });
  test('the same artifact twice counts once', () => {
    assert.equal(lastingSpellRounds(2, ['Магический ошейник', 'Магический ошейник']), 3);
  });
});

describe('spellEffectModifiers — the effect flag, both shapes', () => {
  test('group А1 list', () => {
    assert.deepEqual(spellEffectModifiers({ modifiers: [{ stat: 'speed', value: -3, floor: 3 }] }),
      [{ stat: 'speed', value: -3, floorOne: false, floor: 3 }]);
  });
  test('stage 2 single stat (an effect up from before)', () => {
    assert.deepEqual(spellEffectModifiers({ spellName: 'Щит', stat: 'meleeDamageTaken', value: -6, floorOne: true }),
      [{ stat: 'meleeDamageTaken', value: -6, floorOne: true, floor: null }]);
  });
  test('nothing', () => {
    assert.deepEqual(spellEffectModifiers(null), []);
    assert.deepEqual(spellEffectModifiers({ spellName: 'X' }), []);
  });
});

describe('actorSpellModifiers — what an actor carries now', () => {
  const effect = (id, data, extra = {}) => ({ id, flags: { 'heroes-glory': { spellEffect: data } }, ...extra });
  test('one entry per spell and stat, effect id kept', () => {
    const list = actorSpellModifiers([
      effect('a', { spellName: 'Молитва', modifiers: [{ stat: 'attack', value: 2 }, { stat: 'speed', value: 2 }] }),
      effect('b', { spellName: 'Щит', stat: 'meleeDamageTaken', value: -6, floorOne: true }),
      { id: 'c', flags: {} },
    ]);
    assert.deepEqual(list.map((m) => [m.effectId, m.spellName, m.stat, m.value]),
      [['a', 'Молитва', 'attack', 2], ['a', 'Молитва', 'speed', 2], ['b', 'Щит', 'meleeDamageTaken', -6]]);
  });
  test('disabled and expired effects left out', () => {
    const list = actorSpellModifiers([
      effect('a', { spellName: 'Ускорение', modifiers: [{ stat: 'speed', value: 3 }] }, { disabled: true }),
      effect('b', { spellName: 'Замедление', modifiers: [{ stat: 'speed', value: -3 }] }, { duration: { expired: true } }),
    ]);
    assert.deepEqual(list, []);
  });
});

describe('applySpellStatModifiers — sum, «до минимума N» (rules.md §6.4)', () => {
  test('no spells — unchanged', () => {
    assert.deepEqual(applySpellStatModifiers(6, []), { value: 6, delta: 0 });
  });
  test('Замедление −3 to minimum 3', () => {
    assert.deepEqual(applySpellStatModifiers(8, [{ value: -3, floor: 3 }]), { value: 5, delta: -3 });
    assert.deepEqual(applySpellStatModifiers(5, [{ value: -3, floor: 3 }]), { value: 3, delta: -2 });
  });
  test('a value already below N is not lifted', () => {
    assert.deepEqual(applySpellStatModifiers(2, [{ value: -3, floor: 3 }]), { value: 2, delta: 0 });
  });
  test('Разрушительный Луч to minimum 0', () => {
    assert.deepEqual(applySpellStatModifiers(2, [{ value: -5, floor: 0 }]), { value: 0, delta: -2 });
    assert.deepEqual(applySpellStatModifiers(0, [{ value: -5, floor: 0 }]), { value: 0, delta: 0 });
  });
  test('Ускорение and Замедление together add up (rules.md §11)', () => {
    assert.deepEqual(applySpellStatModifiers(6, [{ value: 3, floor: null }, { value: -3, floor: 3 }]), { value: 6, delta: 0 });
    assert.deepEqual(applySpellStatModifiers(4, [{ value: 3, floor: null }, { value: -6, floor: 1 }]), { value: 1, delta: -3 });
  });
  test('the highest floor wins', () => {
    assert.deepEqual(applySpellStatModifiers(8, [{ value: -3, floor: 3 }, { value: -6, floor: 1 }]), { value: 3, delta: -5 });
  });
  test('no floor — anything goes', () => {
    assert.deepEqual(applySpellStatModifiers(2, [{ value: 4 }, { value: 2 }]), { value: 8, delta: 6 });
  });
});

describe('spellHeroesOnly — Удача / Неудача not on creatures (rules.md §11)', () => {
  test('a luck spell', () => {
    assert.equal(spellHeroesOnly({ modifiers: [{ stat: 'luck', value: 1 }] }), true);
  });
  test('others', () => {
    assert.equal(spellHeroesOnly({ modifiers: [{ stat: 'speed', value: 3 }] }), false);
    assert.equal(spellHeroesOnly({}), false);
  });
});
