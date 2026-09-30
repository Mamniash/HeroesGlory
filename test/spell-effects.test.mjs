import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SPELL_RANGE_CELLS, hasSpellEffect, chooseSpellEffectVariants, spellDamageDice, spellFormula,
  sorceryDice, creatureSpellProfile, heroSpellResistanceThreshold, spellImmunity, pickChainTargets,
  resolveSpellResolution, canConfirmSpell, isUndeadCreature, modifierTargetLimit, resolveModifierSpellResolution,
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

  test('exactly the five stage-2 spells carry a modifier effect, on every tier', () => {
    const withEffect = docs.filter((d) => Object.values(d.system.variants).every((v) => v.effect.kind === 'modifier'))
      .map((d) => d.name).sort();
    assert.deepEqual(withEffect, ['Благословение', 'Воздушный Щит', 'Проклятие', 'Слабость', 'Щит']);
    assert.equal(docs.filter((d) => hasSpellEffect(d.system.variants)).length, 10);
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
        assert.deepEqual(effect.modifier, { stat, value: values[i], floorOne: flags.floorOne });
        assert.equal(effect.hostile, flags.hostile);
        assert.equal(effect.excludeUndead, flags.excludeUndead);
        assert.equal(effect.targeting.perMagicPowerTargets, tier === 'expert');
      });
    });
  }

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
