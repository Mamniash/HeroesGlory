import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPELL_RANGE_CELLS, hasSpellEffect, chooseSpellEffectVariants, spellDamageDice, spellFormula,
  sorceryDice, creatureSpellProfile, heroSpellResistanceThreshold, spellImmunity, pickChainTargets,
  resolveSpellResolution, canConfirmSpell, isUndeadCreature, modifierTargetLimit, resolveModifierSpellResolution,
  resolveLastingSpellLimit, MAX_LASTING_SPELLS, lastingSpellRounds,
  spellEffectModifiers, actorSpellModifiers, applySpellStatModifiers, spellHeroesOnly,
  NEGATIVE_SPELLS, HEAL_STATUSES, DISPEL_STATUSES, cleansingRemovals, healAmount, isFriendlyTarget,
  resurrectionBlockingTag, resolveSupportSpellResolution,
  antimagicBlocks, rangedSeriesAfterSpells, resolveFireShieldDamage, visibleSpellTakes, areaCells, tokenInArea,
  fieldCellChoice, fieldExpiresRound, quicksandOwnership, dispelCellRegionIds,
  SUMMON_ELEMENTALS, summonedCreatureStats, summonOwnership,
  isLastingSpellCard, footprintAnchor, cancelledCardRefund,
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
    const profile = creatureSpellProfile(['Иммунитет к кавалерийскому Бонусу', 'Летает']);
    assert.deepEqual(profile, { immuneAll: false, elements: [], spellNames: [], resistThreshold: null, mindImmune: false });
  });
  test('mind effects (Слепота): Нежить, Голем, Элементаль, «Иммунитет к Магии Разума», «…к Ослеплению» (rules.md §11)', () => {
    for (const tag of ['Нежить', 'Голем', 'Элементаль', 'Иммунитет к Магии Разума', 'Иммунитет к Ослеплению и Окаменению']) {
      assert.equal(creatureSpellProfile([tag]).mindImmune, true, tag);
    }
    assert.equal(creatureSpellProfile(['Стрелок', 'Летает']).mindImmune, false);
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
    assert.deepEqual(withEffect, [
      'Армагеддон', 'Взрыв', 'Волна Смерти', 'Волшебная Стрела', 'Инферно', 'Кольцо Холода', 'Ледяная Молния',
      'Метеоритный Дождь', 'Молния', 'Огненный Шар', 'Уничтожить Нежить', 'Цепная Молния',
    ]);
  });

  test('stage 2, groups А1 and А2 — twenty spells carry a modifier effect, on every tier', () => {
    const withEffect = docs.filter((d) => Object.values(d.system.variants).every((v) => v.effect.kind === 'modifier'))
      .map((d) => d.name).sort();
    assert.deepEqual(withEffect, [
      'Антимагия', 'Благословение', 'Воздушный Щит', 'Жажда Крови', 'Забывчивость', 'Замедление', 'Каменная Кожа',
      'Молитва', 'Неудача', 'Огненный Щит', 'Ответный Удар', 'Полет', 'Проклятие', 'Разрушительный Луч', 'Слабость',
      'Слепота', 'Точность', 'Удача', 'Ускорение', 'Щит',
    ]);
    assert.equal(docs.filter((d) => hasSpellEffect(d.system.variants)).length, 41);
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

  // Group В, pp. 54, 57: [kind, heal d6, СМ targets, friendlyOnly, health share, until combat end] by tier.
  const supportCases = [
    ['Лечение', [['heal', 1, false, false, 1, false], ['heal', 1, false, false, 1, false], ['heal', 2, false, false, 1, false], ['heal', 3, true, false, 1, false]]],
    ['Развеивание Магии', [['dispel', 0, false, true, 1, false], ['dispel', 0, false, true, 1, false], ['dispel', 0, false, false, 1, false], ['dispel', 0, true, false, 1, false]]],
    ['Воскрешение', [['resurrect', 0, false, false, 0.5, true], ['resurrect', 0, false, false, 0.5, true], ['resurrect', 0, false, false, 0.5, false], ['resurrect', 0, false, false, 1, false]]],
  ];
  for (const [name, byTier] of supportCases) {
    test(`${name}: by tier (group В)`, () => {
      ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
        const effect = byName[name][tier].effect;
        const [kind, dice, perTargets, friendlyOnly, healthFactor, untilCombatEnd] = byTier[i];
        assert.equal(effect.kind, kind);
        assert.equal(effect.dice.count, dice);
        assert.equal(effect.dice.addMagicPower, dice > 0);
        assert.equal(effect.targeting.perMagicPowerTargets, perTargets);
        assert.equal(effect.friendlyOnly, friendlyOnly);
        assert.equal(effect.healthFactor, healthFactor);
        assert.equal(effect.untilCombatEnd, untilCombatEnd);
      });
    });
  }

  test('NEGATIVE_SPELLS are exactly the hostile spells', () => {
    const hostile = docs.filter((d) => d.system.variants.none.effect.hostile).map((d) => d.name);
    assert.deepEqual([...hostile].sort(), [...NEGATIVE_SPELLS].sort());
  });

  // Group А2, pp. 54, 58, 59, 60.
  const a2Cases = [
    ['Антимагия', [['spellImmunityLevel', 3], ['spellImmunityLevel', 3], ['spellImmunityLevel', 4], ['spellImmunityLevel', 5]], false, false],
    ['Забывчивость', [['rangedAttacks', -1], ['rangedAttacks', -1], ['noRangedAttacks', 1], ['noRangedAttacks', 1]], true, true],
    ['Огненный Щит', [['fireShield', 0], ['fireShield', 0], ['fireShield', 3], ['fireShield', 6]], false, false],
    ['Ответный Удар', [['counterAttacks', 1], ['counterAttacks', 1], ['counterAttacks', 2], ['counterAttacks', 2]], false, true],
  ];
  for (const [name, byTier, hostile, expertTargets] of a2Cases) {
    test(`${name}: by tier (group А2)`, () => {
      ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
        const effect = byName[name][tier].effect;
        assert.deepEqual(effect.modifiers, [{ stat: byTier[i][0], value: byTier[i][1], floorOne: false, floor: null }]);
        assert.equal(effect.hostile, hostile);
        assert.equal(effect.targeting.perMagicPowerTargets, expertTargets && tier === 'expert');
        assert.equal(effect.skipsTurn, false);
      });
    });
  }
  test('Слепота: d6 4+ / 3+ / 2+, a mind effect, skips the next turn, one target (group А2)', () => {
    ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
      const effect = byName['Слепота'][tier].effect;
      assert.equal(effect.triggerThreshold, [4, 4, 3, 2][i]);
      assert.deepEqual(effect.modifiers, []);
      assert.equal(effect.status, 'blind');
      assert.equal(effect.hostile, true);
      assert.equal(effect.mindEffect, true);
      assert.equal(effect.skipsTurn, true);
      assert.equal(effect.targeting.perMagicPowerTargets, false);
    });
  });

  test('rules.md §11 costs: Стена Огня 28/12, Огненный Шар 36/15, Удача 12/4', () => {
    const cost = (name, tier) => byName[name][tier].manaCost;
    assert.deepEqual([cost('Стена Огня', 'none'), cost('Стена Огня', 'basic')], [28, 12]);
    assert.deepEqual([cost('Огненный Шар', 'none'), cost('Огненный Шар', 'basic')], [36, 15]);
    assert.deepEqual([cost('Удача', 'none'), cost('Удача', 'basic')], [12, 4]);
  });

  // Step 4, «в поле зрения» (pp. 53, 56, 60): d6 count by tier (+ СМ), filter, caster, element.
  const visibleCases = [
    ['Волна Смерти', [1, 1, 2, 3], 'notUndeadOrElemental', false, ''],
    ['Уничтожить Нежить', [2, 2, 3, 4], 'undeadOnly', false, ''],
    ['Армагеддон', [5, 5, 7, 10], '', true, 'fire'],
  ];
  for (const [name, counts, filter, includeCaster, element] of visibleCases) {
    test(`${name}: «в поле зрения» by tier (step 4)`, () => {
      ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
        const effect = byName[name][tier].effect;
        assert.equal(effect.kind, 'damage');
        assert.deepEqual(effect.dice, { count: counts[i], flat: 0, perMagicPower: false, addMagicPower: true });
        assert.equal(effect.targeting.mode, 'visible');
        assert.equal(effect.targeting.filter, filter);
        assert.equal(effect.targeting.includeCaster, includeCaster);
        assert.equal(effect.element, element);
      });
    });
  }

  // Step 5, «Выберите клетку» (pp. 54, 58, 60): [d6, flat, «за СМ», pattern] by tier, element.
  const areaCases = [
    ['Метеоритный Дождь', [[2, 0, true, '3x3'], [2, 0, true, '3x3'], [2, 1, true, '3x3'], [2, 2, true, '3x3']], 'fire'],
    ['Огненный Шар', [[4, 0, false, '3x3'], [4, 0, false, '3x3'], [6, 0, false, '3x3'], [8, 0, false, '3x3']], 'fire'],
    ['Инферно', [[1, 0, true, '3x3'], [1, 0, true, '3x3'], [1, 0, true, '5x5'], [1, 1, true, '5x5']], 'fire'],
    ['Кольцо Холода', [[1, 0, true, 'ring'], [1, 0, true, 'ring'], [1, 1, true, 'ring'], [1, 1, true, 'ring']], 'ice'],
  ];
  for (const [name, byTier, element] of areaCases) {
    test(`${name}: «Выберите клетку» by tier (step 5)`, () => {
      ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
        const effect = byName[name][tier].effect;
        const [count, flat, perMagicPower, area] = byTier[i];
        assert.equal(effect.kind, 'damage');
        assert.deepEqual(effect.dice, { count, flat, perMagicPower, addMagicPower: !perMagicPower });
        assert.equal(effect.targeting.mode, 'area');
        assert.equal(effect.targeting.area, area);
        assert.equal(effect.element, element);
      });
    });
  }

  // Group Г, pp. 54, 58, 59.
  test('Телепорт: a teleport on every tier, costs 20/14/10/6', () => {
    ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
      assert.equal(byName['Телепорт'][tier].effect.kind, 'teleport');
      assert.equal(byName['Телепорт'][tier].manaCost, [20, 14, 10, 6][i]);
    });
  });
  test('Силовое Поле: 2 / 2 / 3 / 4 cells side by side, creatures allowed', () => {
    ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
      const effect = byName['Силовое Поле'][tier].effect;
      assert.equal(effect.kind, 'field');
      assert.deepEqual(effect.field, { type: 'forceField', cells: [2, 2, 3, 4][i], adjacent: true, freeCells: false });
    });
  });
  test('Стена Огня: 2 / 2 / 3 / 3 free cells side by side, (1d6 / +1 / +2) of fire for each СМ', () => {
    ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
      const effect = byName['Стена Огня'][tier].effect;
      assert.equal(effect.kind, 'field');
      assert.deepEqual(effect.field, { type: 'fireWall', cells: [2, 2, 3, 3][i], adjacent: true, freeCells: true });
      assert.deepEqual(effect.dice, { count: 1, flat: [0, 0, 1, 2][i], perMagicPower: true, addMagicPower: false });
      assert.equal(effect.element, 'fire');
    });
  });

  test('Призыв Элементаля: +0 / +0 / +2 / +4 to Атака and Урон, +0 / +0 / +10 / +20 Здоровья', () => {
    ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
      const effect = byName['Призыв Элементаля'][tier].effect;
      assert.equal(effect.kind, 'summon');
      assert.deepEqual(effect.summon, { attackBonus: [0, 0, 2, 4][i], damageBonus: [0, 0, 2, 4][i], healthBonus: [0, 0, 10, 20][i] });
    });
  });
  test('Клон: a clone on every tier, costs 35/30/20/10', () => {
    ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
      assert.equal(byName['Клон'][tier].effect.kind, 'clone');
      assert.equal(byName['Клон'][tier].manaCost, [35, 30, 20, 10][i]);
    });
  });
  test('Зыбучий Песок: 4 / 4 / 6 / 8 free cells, anywhere', () => {
    ['none', 'basic', 'advanced', 'expert'].forEach((tier, i) => {
      const effect = byName['Зыбучий Песок'][tier].effect;
      assert.equal(effect.kind, 'field');
      assert.deepEqual(effect.field, { type: 'quicksand', cells: [4, 4, 6, 8][i], adjacent: false, freeCells: true });
    });
  });
  test('Развеивание Магии: only the expert takes a visible effect off a cell', () => {
    ['none', 'basic', 'advanced', 'expert'].forEach((tier) => {
      assert.equal(byName['Развеивание Магии'][tier].effect.dispelFields, tier === 'expert');
    });
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

describe('cleansingRemovals — what Лечение / Развеивание take off (rules.md §11)', () => {
  const spellEffects = [{ id: '1', spellName: 'Замедление' }, { id: '2', spellName: 'Благословение' }, { id: '3', spellName: 'Проклятие' }];
  const statuses = ['blind', 'disease', 'paralysis', 'prone'];
  test('Лечение: negative spells, Паралич, Болезнь, «Проклятие»', () => {
    assert.deepEqual(cleansingRemovals({ spellEffects, statuses, kind: 'heal' }),
      { effectIds: ['1', '3'], spellNames: ['Замедление', 'Проклятие'], statuses: ['paralysis', 'disease'] });
  });
  test('Развеивание: every spell, Ослепление, Паралич, «Проклятие»', () => {
    assert.deepEqual(cleansingRemovals({ spellEffects, statuses, kind: 'dispel' }),
      { effectIds: ['1', '2', '3'], spellNames: ['Замедление', 'Благословение', 'Проклятие'], statuses: ['blind', 'paralysis'] });
  });
  test('status lists by the book (pp. 113–115)', () => {
    assert.deepEqual(HEAL_STATUSES, ['paralysis', 'disease', 'curse']);
    assert.deepEqual(DISPEL_STATUSES, ['blind', 'paralysis', 'curse']);
  });
});

describe('healAmount — not above the maximum', () => {
  test('full roll', () => assert.equal(healAmount({ total: 7, value: 10, max: 30 }), 7));
  test('capped', () => assert.equal(healAmount({ total: 7, value: 27, max: 30 }), 3));
  test('at the maximum or over it (artifacts) — nothing', () => {
    assert.equal(healAmount({ total: 7, value: 30, max: 30 }), 0);
    assert.equal(healAmount({ total: 7, value: 33, max: 30 }), 0);
  });
});

describe('isFriendlyTarget — the side of the caster, by token disposition', () => {
  test('same disposition', () => assert.equal(isFriendlyTarget(1, 1, 1), true));
  test('other side, neutral', () => {
    assert.equal(isFriendlyTarget(-1, 1, 1), false);
    assert.equal(isFriendlyTarget(0, 1, 1), false);
  });
  test('no caster token: the friendly side', () => {
    assert.equal(isFriendlyTarget(1, null, 1), true);
    assert.equal(isFriendlyTarget(-1, undefined, 1), false);
  });
});

describe('resurrectionBlockingTag — Нежить, Голем, Элементаль (pp. 114, 116)', () => {
  test('the tag that stops it', () => {
    assert.equal(resurrectionBlockingTag(['Летает', 'Нежить']), 'Нежить');
    assert.equal(resurrectionBlockingTag(['Голем', 'Иммунитет к огню']), 'Голем');
    assert.equal(resurrectionBlockingTag(['Элементаль', 'Стрелок']), 'Элементаль');
  });
  test('nothing in the way', () => {
    assert.equal(resurrectionBlockingTag(['Летает', 'Иммунитет к Метеоритному дождю']), null);
    assert.equal(resurrectionBlockingTag([]), null);
  });
});

describe('resolveSupportSpellResolution — what the card shows and the confirm applies', () => {
  test('Лечение: frozen Health, capped', () => {
    const r = resolveSupportSpellResolution({ effectKind: 'heal', total: 8, targets: [{ healthValue: 25, healthMax: 30 }, { healthValue: 5, healthMax: 30 }] });
    assert.deepEqual(r, [{ outcome: 'applied', health: 5 }, { outcome: 'applied', health: 8 }]);
  });
  test('immune to all spells — nothing, the useful ones too', () => {
    const r = resolveSupportSpellResolution({ effectKind: 'heal', total: 8, targets: [{ immunity: 'all', healthValue: 1, healthMax: 30 }] });
    assert.deepEqual(r, [{ outcome: 'immune' }]);
  });
  test('Развеивание on an enemy: resisted on the die', () => {
    const r = resolveSupportSpellResolution({ effectKind: 'dispel', targets: [{ resistThreshold: 5, resistDie: 5 }, { resistThreshold: 5, resistDie: 2 }, {}] });
    assert.deepEqual(r.map((x) => x.outcome), ['resisted', 'applied', 'applied']);
  });
  test('Воскрешение: 50% rounded down until the end of the battle, no Ранение', () => {
    const r = resolveSupportSpellResolution({ effectKind: 'resurrect', healthFactor: 0.5, untilCombatEnd: true, targets: [{ healthMax: 35, isHero: true }] });
    assert.deepEqual(r, [{ outcome: 'applied', health: 17, wound: false }]);
  });
  test('Воскрешение for good: a hero gets a Ранение (p. 32), a creature none', () => {
    const r = resolveSupportSpellResolution({ effectKind: 'resurrect', healthFactor: 1, untilCombatEnd: false, targets: [{ healthMax: 30, isHero: true }, { healthMax: 40, isHero: false }] });
    assert.deepEqual(r, [{ outcome: 'applied', health: 30, wound: true }, { outcome: 'applied', health: 40, wound: false }]);
  });
  test('the «Воскрешение» specialization: no Ранение (p. 23)', () => {
    const r = resolveSupportSpellResolution({ effectKind: 'resurrect', healthFactor: 0.5, untilCombatEnd: false, noWound: true, targets: [{ healthMax: 30, isHero: true }] });
    assert.deepEqual(r, [{ outcome: 'applied', health: 15, wound: false }]);
  });
});

describe('antimagicBlocks — Антимагия, p. 54 (rules.md §11)', () => {
  const mods = (level) => [{ stat: 'spellImmunityLevel', value: level }];
  test('spells of its levels, any', () => {
    assert.equal(antimagicBlocks({ modifiers: mods(3), spellLevel: 1, spellName: 'Благословение' }), true);
    assert.equal(antimagicBlocks({ modifiers: mods(3), spellLevel: 3, spellName: 'Огненный Шар' }), true);
    assert.equal(antimagicBlocks({ modifiers: mods(3), spellLevel: 4, spellName: 'Цепная Молния' }), false);
    assert.equal(antimagicBlocks({ modifiers: mods(5), spellLevel: 5, spellName: 'Взрыв' }), true);
  });
  test('Развеивание Магии gets through, a recast of Антимагия too', () => {
    assert.equal(antimagicBlocks({ modifiers: mods(5), spellLevel: 1, spellName: 'Развеивание Магии' }), false);
    assert.equal(antimagicBlocks({ modifiers: mods(5), spellLevel: 3, spellName: 'Антимагия' }), false);
  });
  test('no Антимагия — nothing blocked', () => {
    assert.equal(antimagicBlocks({ modifiers: [], spellLevel: 1, spellName: 'Лечение' }), false);
  });
});

describe('rangedSeriesAfterSpells — Забывчивость, p. 58', () => {
  test('one shot fewer', () => {
    assert.equal(rangedSeriesAfterSpells(2, [{ stat: 'rangedAttacks', value: -1 }]), 1);
  });
  test('a single shot — none left', () => {
    assert.equal(rangedSeriesAfterSpells(1, [{ stat: 'rangedAttacks', value: -1 }]), 0);
  });
  test('Продвинутый — no shooting at all', () => {
    assert.equal(rangedSeriesAfterSpells(3, [{ stat: 'noRangedAttacks', value: 1 }]), 0);
  });
  test('no spell — as is', () => {
    assert.equal(rangedSeriesAfterSpells(2, []), 2);
  });
});

describe('resolveFireShieldDamage — Огненный Щит, p. 60 (rules.md §11)', () => {
  test('the value', () => assert.equal(resolveFireShieldDamage({ value: 6 }), 6));
  test('fire immunity — 0', () => assert.equal(resolveFireShieldDamage({ value: 6, immune: true }), 0));
  test('armor of level 4–5 — halved, rounded down', () => assert.equal(resolveFireShieldDamage({ value: 7, armorMultiplier: 0.5 }), 3));
});

describe('resolveModifierSpellResolution — Слепота\'s d6', () => {
  test('short of the threshold — failed; at it — applied', () => {
    const r = resolveModifierSpellResolution({ triggerThreshold: 4, targets: [{ triggerDie: 3 }, { triggerDie: 4 }] });
    assert.deepEqual(r.map((x) => x.outcome), ['failed', 'applied']);
  });
  test('resisted before the die', () => {
    const r = resolveModifierSpellResolution({ triggerThreshold: 4, targets: [{ resistThreshold: 5, resistDie: 6 }] });
    assert.deepEqual(r.map((x) => x.outcome), ['resisted']);
  });
});

describe('visibleSpellTakes — who a «в поле зрения» spell takes (rules.md §11)', () => {
  const deathWave = { filter: 'notUndeadOrElemental', includeCaster: false };
  const destroyUndead = { filter: 'undeadOnly', includeCaster: false };
  const armageddon = { filter: '', includeCaster: true };
  const creature = (tags) => ({ isCaster: false, isCreature: true, tags });
  const hero = { isCaster: false, isCreature: false, tags: [] };
  test('Волна Смерти: all but Нежить and Элементали, heroes and allies included', () => {
    assert.equal(visibleSpellTakes({ targeting: deathWave, ...creature(['Летает']) }), true);
    assert.equal(visibleSpellTakes({ targeting: deathWave, ...creature(['Нежить', 'Летает']) }), false);
    assert.equal(visibleSpellTakes({ targeting: deathWave, ...creature(['Элементаль', 'Стрелок']) }), false);
    assert.equal(visibleSpellTakes({ targeting: deathWave, ...hero }), true);
  });
  test('Уничтожить Нежить: Нежить only; heroes never', () => {
    assert.equal(visibleSpellTakes({ targeting: destroyUndead, ...creature(['Нежить']) }), true);
    assert.equal(visibleSpellTakes({ targeting: destroyUndead, ...creature(['Летает']) }), false);
    assert.equal(visibleSpellTakes({ targeting: destroyUndead, ...hero }), false);
  });
  test('the caster: only Армагеддон', () => {
    assert.equal(visibleSpellTakes({ targeting: armageddon, isCaster: true, isCreature: false }), true);
    assert.equal(visibleSpellTakes({ targeting: deathWave, isCaster: true, isCreature: false }), false);
    assert.equal(visibleSpellTakes({ targeting: destroyUndead, isCaster: true, isCreature: true, tags: ['Нежить'] }), false);
  });
  test('Армагеддон: everyone, Нежить and Элементали too', () => {
    assert.equal(visibleSpellTakes({ targeting: armageddon, ...creature(['Нежить']) }), true);
    assert.equal(visibleSpellTakes({ targeting: armageddon, ...creature(['Элементаль']) }), true);
  });
});

describe('resolveSpellResolution — a target the GM left out (step 4)', () => {
  test('excluded: nothing, whatever else it was', () => {
    const r = resolveSpellResolution({ total: 12, targets: [{ excluded: true, incapacitated: true }, { factor: 1 }] });
    assert.deepEqual(r, [{ outcome: 'excluded', damage: 0, armorHalved: false }, { outcome: 'damage', damage: 12, armorHalved: false }]);
  });
});

describe('areaCells — the pattern around the chosen cell (step 5, rules.md §11)', () => {
  // A square grid where a diagonal is a neighbour (p. 26).
  const square = ({ i, j }) => {
    const out = [];
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) if (di || dj) out.push({ i: i + di, j: j + dj });
    return out;
  };
  const keys = (cells) => cells.map(({ i, j }) => `${i},${j}`).sort();
  const center = { i: 5, j: 5 };
  test('3×3: the cell and its 8 neighbours', () => {
    const cells = areaCells({ center, pattern: '3x3', neighbors: square });
    assert.equal(cells.length, 9);
    assert.ok(keys(cells).includes('5,5'));
    assert.ok(keys(cells).includes('4,4') && keys(cells).includes('6,6'));
  });
  test('ring: the 8 neighbours without the cell (Кольцо Холода)', () => {
    const cells = areaCells({ center, pattern: 'ring', neighbors: square });
    assert.equal(cells.length, 8);
    assert.ok(!keys(cells).includes('5,5'));
  });
  test('5×5: within 2 steps (Инферно, «радиус 2 клеток»)', () => {
    const cells = areaCells({ center, pattern: '5x5', neighbors: square });
    assert.equal(cells.length, 25);
    assert.ok(keys(cells).includes('3,3') && keys(cells).includes('7,7'));
    assert.ok(!keys(cells).includes('2,5'));
  });
});

describe('tokenInArea — a token with any cell in the pattern', () => {
  const area = [{ i: 1, j: 1 }, { i: 1, j: 2 }];
  test('one cell in — taken (a large token too)', () => {
    assert.equal(tokenInArea([{ i: 1, j: 2 }, { i: 1, j: 3 }, { i: 2, j: 2 }, { i: 2, j: 3 }], area), true);
  });
  test('no cell in — not taken', () => {
    assert.equal(tokenInArea([{ i: 3, j: 3 }], area), false);
  });
});

describe('fieldCellChoice — «соседние» cells as a chain (rules.md §11)', () => {
  const near = (a, b) => Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)) === 1;
  test('the first cell: any', () => {
    assert.equal(fieldCellChoice({ cell: { i: 5, j: 5 }, chosen: [], adjacent: true, isAdjacent: near }), 'ok');
  });
  test('next to any chosen one — a chain, diagonals too', () => {
    const chosen = [{ i: 5, j: 5 }, { i: 5, j: 6 }];
    assert.equal(fieldCellChoice({ cell: { i: 6, j: 7 }, chosen, adjacent: true, isAdjacent: near }), 'ok');
    assert.equal(fieldCellChoice({ cell: { i: 5, j: 4 }, chosen, adjacent: true, isAdjacent: near }), 'ok');
  });
  test('away from all — refused; the same cell twice — refused', () => {
    const chosen = [{ i: 5, j: 5 }];
    assert.equal(fieldCellChoice({ cell: { i: 5, j: 7 }, chosen, adjacent: true, isAdjacent: near }), 'notAdjacent');
    assert.equal(fieldCellChoice({ cell: { i: 5, j: 5 }, chosen, adjacent: true, isAdjacent: near }), 'same');
  });
  test('cells that needn\'t be side by side (Зыбучий Песок)', () => {
    assert.equal(fieldCellChoice({ cell: { i: 9, j: 9 }, chosen: [{ i: 1, j: 1 }], adjacent: false, isAdjacent: near }), 'ok');
  });
});

describe('fieldExpiresRound — Сила Магии rounds from the cast (p. 32)', () => {
  test('cast in round 1 for 3 rounds: gone at the caster\'s turn in round 4', () => {
    assert.equal(fieldExpiresRound(1, 3), 4);
  });
});

describe('canConfirmSpell — a field spell has cells, not targets (group Г)', () => {
  test('field, no targets — may be confirmed', () => {
    assert.equal(canConfirmSpell({ kind: 'spell', effectKind: 'field', targets: [] }), true);
  });
  test('a clone — its cells, no target — may be confirmed', () => {
    assert.equal(canConfirmSpell({ kind: 'spell', effectKind: 'clone', targets: [] }), true);
  });
  test('a summon — its cell, no target — may be confirmed', () => {
    assert.equal(canConfirmSpell({ kind: 'spell', effectKind: 'summon', targets: [] }), true);
  });
  test('the expert Развеивание on a cell — may be confirmed', () => {
    assert.equal(canConfirmSpell({ kind: 'spell', effectKind: 'dispel', targets: [], dispelCell: { regionIds: ['a'] } }), true);
  });
  test('other spells still need a target; a confirmed card — no', () => {
    assert.equal(canConfirmSpell({ kind: 'spell', targets: [] }), false);
    assert.equal(canConfirmSpell({ kind: 'spell', effectKind: 'field', targets: [], confirmed: true }), false);
  });
});

describe('quicksandOwnership — «невидимые ловушки» seen by the caster (rules.md §11)', () => {
  test('the caster\'s owners observe, nobody else', () => {
    assert.deepEqual(quicksandOwnership(['u1', 'u2']), { default: 0, u1: 2, u2: 2 });
  });
  test('no player owner — the GM alone', () => {
    assert.deepEqual(quicksandOwnership([]), { default: 0 });
  });
});

describe('dispelCellRegionIds — «выбрать видимый эффект … и убрать его» (rules.md §11)', () => {
  const regions = [
    { id: 'wall', cells: [{ i: 6, j: 8 }, { i: 6, j: 9 }], visible: true },
    { id: 'field', cells: [{ i: 6, j: 9 }], visible: true },
    { id: 'trap', cells: [{ i: 6, j: 9 }], visible: false },
    { id: 'far', cells: [{ i: 9, j: 9 }], visible: true },
  ];
  test('every seen region on the cell', () => {
    assert.deepEqual(dispelCellRegionIds(regions, { i: 6, j: 9 }), ['wall', 'field']);
  });
  test('a trap the caster doesn\'t see stays; an empty cell — nothing', () => {
    assert.deepEqual(dispelCellRegionIds(regions, { i: 1, j: 1 }), []);
    assert.equal(dispelCellRegionIds(regions, { i: 6, j: 9 }).includes('trap'), false);
  });
});

describe('SUMMON_ELEMENTALS — the base elemental of each element (p. 61, rules.md §11)', () => {
  test('the four elements, each a creature of the bestiary', async () => {
    const { readFileSync } = await import('node:fs');
    const nexus = JSON.stringify(JSON.parse(readFileSync(new URL('../scripts/data/bestiary/nexus.json', import.meta.url), 'utf8')));
    assert.deepEqual(Object.keys(SUMMON_ELEMENTALS).sort(), ['air', 'earth', 'fire', 'water']);
    for (const name of Object.values(SUMMON_ELEMENTALS)) assert.ok(nexus.includes(`"name":"${name}"`), name);
  });
});

describe('summonedCreatureStats — the bonuses written into the statblock', () => {
  const fire = { attack: 10, damage: 6, health: { value: 35, max: 35 } };
  test('Эксперт: +4 to Атака and Урон, +20 Здоровья, full', () => {
    assert.deepEqual(summonedCreatureStats(fire, { attackBonus: 4, damageBonus: 4, healthBonus: 20 }),
      { attack: 14, damage: 10, health: { value: 55, max: 55 } });
  });
  test('no bonus — the bestiary\'s own', () => {
    assert.deepEqual(summonedCreatureStats(fire), { attack: 10, damage: 6, health: { value: 35, max: 35 } });
  });
});

describe('summonOwnership — «контролируется вами» (rules.md §11)', () => {
  test('the caster\'s players own it; none — the GM alone', () => {
    assert.deepEqual(summonOwnership(['u1']), { default: 0, u1: 3 });
    assert.deepEqual(summonOwnership([]), { default: 0 });
  });
});

describe('isLastingSpellCard — what counts in the limit of three, waiting cards too (rules.md §11)', () => {
  test('modifiers, Силовое Поле, Стена Огня, Призыв, Клон count', () => {
    assert.equal(isLastingSpellCard({ effectKind: 'modifier' }), true);
    assert.equal(isLastingSpellCard({ effectKind: 'field', field: { type: 'forceField' } }), true);
    assert.equal(isLastingSpellCard({ effectKind: 'field', field: { type: 'fireWall' } }), true);
    assert.equal(isLastingSpellCard({ effectKind: 'summon' }), true);
    assert.equal(isLastingSpellCard({ effectKind: 'clone' }), true);
  });
  test('Слепота, Зыбучий Песок and instant spells don\'t', () => {
    assert.equal(isLastingSpellCard({ effectKind: 'modifier', skipsTurn: true }), false);
    assert.equal(isLastingSpellCard({ effectKind: 'field', field: { type: 'quicksand' } }), false);
    assert.equal(isLastingSpellCard({ effectKind: 'heal' }), false);
    assert.equal(isLastingSpellCard({ kind: 'spell' }), false);
  });
});

describe('footprintAnchor — a footprint by its middle (rules.md §11)', () => {
  test('1×1 — the cursor itself', () => {
    assert.deepEqual(footprintAnchor({ x: 450, y: 650 }, 1, 1, 100), { x: 450, y: 650 });
  });
  test('2×2 — half a cell up and left, so the cursor sits at the middle', () => {
    assert.deepEqual(footprintAnchor({ x: 500, y: 700 }, 2, 2, 100), { x: 450, y: 650 });
  });
  test('3×3 — a whole cell up and left', () => {
    assert.deepEqual(footprintAnchor({ x: 450, y: 650 }, 3, 3, 100), { x: 350, y: 550 });
  });
});

describe('canConfirmSpell — a card ended under the limit of three can\'t be confirmed', () => {
  test('cancelled', () => {
    assert.equal(canConfirmSpell({ kind: 'spell', effectKind: 'modifier', targets: [{}], cancelled: true }), false);
  });
});

describe('cancelledCardRefund — Mana back for a card dropped before its confirm (rules.md §11)', () => {
  test('all it cost', () => {
    assert.equal(cancelledCardRefund({ kind: 'spell', manaCost: 8 }), 8);
  });
  test('a confirmed card, a Стена Огня burn, a card without cost — nothing', () => {
    assert.equal(cancelledCardRefund({ kind: 'spell', manaCost: 8, confirmed: true }), 0);
    assert.equal(cancelledCardRefund({ kind: 'spell', fieldTrigger: 'enter' }), 0);
    assert.equal(cancelledCardRefund({ kind: 'spell' }), 0);
  });
});
