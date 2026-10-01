/**
 * Источник данных для компендиума заклинаний — переписано со страниц
 * книги (OKP_Heroes_Glory_v2_1.pdf, книжные стр. 53-61, "Книга Магии").
 * Пять школ, не четыре — кроме
 * Земли/Воздуха/Воды/Огня на стр. 61 есть отдельная таблица
 * «Универсальные» (2 заклинания), изначально не упомянутая в постановке
 * задачи и добавленная по согласованию.
 *
 * Число заклинаний по факту: Земля 10, Воздух 10, Вода 10, Огонь 9,
 * Универсальные 2 — итого 41. Огонь действительно 9, не 10, как
 * остальные три стихии — подтверждено независимой сверкой по бумажной
 * книге, десятого заклинания нет, извлечение из PDF ничего не потеряло.
 *
 * Дословность и структура (rules.md §6.3): у каждого заклинания 4
 * варианта — Без Навыка (эффект + своя стоимость), Базовый Навык (эффект
 * ТОТ ЖЕ, что без навыка — просто дешевле), Продвинутый/Экспертный
 * (усиленный эффект, стоимость обычно не указана явно и наследуется от
 * Базового). Схема (item-spell.mjs) хранит четыре НЕЗАВИСИМЫХ числа
 * стоимости, не 2 с наследованием — buildVariants() ниже просто
 * дублирует унаследованное значение в явное поле при сборке.
 *
 * "Стоимость: N Маны" вырезано из текста "Без Навыка" при переносе в
 * `description` — это единственное вмешательство в дословный текст,
 * потому что стоимость теперь отдельное структурированное поле
 * (`manaCost`), и хранить её ещё раз внутри строики текста было бы
 * просто дублированием того же числа, а не потерей информации.
 * "Длительность = СМ" и подобное — не выделено в отдельное поле
 * (rules.md/item-spell.mjs: длительность по умолчанию всегда равна СМ,
 * это свойство КАСТУЮЩЕГО, не заклинания; но конкретная фраза оставлена
 * в тексте дословно, раз ей больше негде храниться).
 *
 * ДЕФЕКТЫ КНИГИ, зафиксированы явно, не считать ошибкой переноса — все
 * сверены по бумажному изданию, не только по PDF:
 *  - Кольцо Холода (Вода, L3): Экспертный навык не усиливает эффект,
 *    а просто повторяет стоимость Базового ("Стоимость: 20 Маны") —
 *    единственный такой "стоящий на месте" эксперт во всей книге.
 *    Эффект эксперта = эффект продвинутого (rules.md §11).
 *  - Телепорт, Клон (Вода, L4/L5): все 4 ступени с явной стоимостью,
 *    эффект не меняется ни на одной — подтверждено как осознанный
 *    паттерн для утилитарных заклинаний ("нечего усиливать"), не баг.
 *  - Стена Огня (Огонь, L2): у "Без Навыка" в книге нет числа стоимости
 *    вообще — пропуск издания (напечатано "Стоимость:　Маны" с пустым
 *    местом на месте числа). 28 — решение Сени (rules.md §11).
 *  - Огненный Шар (Огонь, L3): в книге "Без Навыка" 15, "Базовый" 36 —
 *    стоимости перепутаны местами (в ячейке "Базовый" слово «Стоимость»
 *    ещё и набрано с латинской «C» — в данных слова нет, стоимость
 *    хранится числом). Решение Сени: без навыка 36, базовый 15
 *    (rules.md §11).
 */

import { buildItemDocument } from '../lib/pack-builder.mjs';

const DEFAULT_RANGE = 24; // §6.1: дальность любого заклинания 24 клетки, если не сказано иное — ни у одного из 39 заклинаний иного не указано.

/**
 * @param {{desc: string, cost: number, effect?: object}} base   "Без Навыка".
 * @param {number} basicCost                            "Базовый Навык" — эффект как у base, дешевле.
 * @param {{desc?: string, cost?: number, effect?: object}} [advanced]  Если desc/effect не заданы — как у base.
 * @param {{desc?: string, cost?: number, effect?: object}} [expert]    Если desc/effect не заданы — как у advanced (или base).
 * @returns {object} item-spell.mjs's `system.variants` shape.
 */
function buildVariants(base, basicCost, advanced = {}, expert = {}) {
  const advancedCost = advanced.cost ?? basicCost;
  const advancedDesc = advanced.desc ?? base.desc;
  const expertCost = expert.cost ?? advancedCost;
  const expertDesc = expert.desc ?? advancedDesc;
  const baseEffect = base.effect ?? {};
  const advancedEffect = advanced.effect ?? baseEffect;
  const expertEffect = expert.effect ?? advancedEffect;
  return {
    none: { description: base.desc, manaCost: base.cost, effect: baseEffect },
    basic: { description: base.desc, manaCost: basicCost, effect: baseEffect },
    advanced: { description: advancedDesc, manaCost: advancedCost, effect: advancedEffect },
    expert: { description: expertDesc, manaCost: expertCost, effect: expertEffect },
  };
}

/**
 * rules.md §6.4, stage 1: a damage effect (item-spell.mjs's `effect`), read
 * off the book text. «NdS + СМ» → `plusMagicPower`; «X за каждый ваш СМ» →
 * `perMagicPower` (rolled Сила Магии times, rules.md §11).
 * @param {number} count   d6
 * @param {number} flat
 * @param {object} [options]
 * @param {boolean} [options.perMagicPower]
 * @param {boolean} [options.plusMagicPower]
 * @param {string} [options.element]   'fire' | 'ice' | 'lightning'
 * @param {{extraTargets: number, extraFactor: number}} [options.chain]
 */
function damageEffect(count, flat, { perMagicPower = false, plusMagicPower = false, element = '', chain = null } = {}) {
  return {
    kind: 'damage',
    targeting: chain
      ? { mode: 'chain', perMagicPowerTargets: false, extraTargets: chain.extraTargets, extraFactor: chain.extraFactor }
      : { mode: 'single', perMagicPowerTargets: false, extraTargets: 0, extraFactor: 1 },
    dice: { count, flat, perMagicPower, addMagicPower: plusMagicPower },
    element,
  };
}

/**
 * rules.md §6.4, stage 2: a lasting modifier (item-spell.mjs's `effect`),
 * read off the book text — Сила Магии rounds; «Работает на количество …,
 * равное СМ» → `perMagicPowerTargets` (all СМ targets, the first included,
 * rules.md §11).
 * @param {'damageDealt'|'meleeDamageTaken'|'rangedDamageTaken'} stat
 * @param {number} value   signed
 * @param {object} [options]
 * @param {boolean} [options.floorOne]        «до минимума 1»
 * @param {boolean} [options.hostile]         resisted (rules.md §11)
 * @param {boolean} [options.excludeUndead]   «не являющееся нежитью»
 * @param {boolean} [options.perMagicPowerTargets]
 */
function modifierEffect(stat, value, { floorOne = false, hostile = false, excludeUndead = false, perMagicPowerTargets = false } = {}) {
  return lastingEffect([{ stat, value, floorOne, floor: null }], { hostile, excludeUndead, perMagicPowerTargets });
}

/**
 * Group А1: a stat of the bearer a lasting spell changes — Атака, Защита,
 * Скорость, Удача, «Атака в дальнем бою» (`rangedAttack`), Урон; `floor` —
 * «до минимума N» (rules.md §6.4: not below N, a lower value not lifted).
 * @param {'attack'|'defense'|'speed'|'luck'|'rangedAttack'|'damageDealt'} stat
 * @param {number} value   signed
 * @param {number|null} [floor]
 */
function statModifier(stat, value, floor = null) {
  return { stat, value, floorOne: false, floor };
}

/**
 * A lasting spell's effect with any number of modifiers (Молитва changes
 * four stats) — item-spell.mjs's `effect`.
 * @param {object[]} modifiers
 * @param {object} [options]
 * @param {boolean} [options.hostile]
 * @param {boolean} [options.excludeUndead]
 * @param {boolean} [options.perMagicPowerTargets]
 * @param {boolean} [options.untilCombatEnd]    «До конца боя» (Молитва)
 * @param {string} [options.status]             a core status (Полет: 'fly')
 * @param {boolean} [options.textOutOfCombat]   out of combat a text card (Полет, rules.md §11)
 * @param {number|null} [options.triggerThreshold]   Слепота: the d6 it needs
 * @param {boolean} [options.mindEffect]        Слепота: a mind effect (rules.md §11)
 * @param {boolean} [options.skipsTurn]         Слепота: skips the next turn, not lasting
 */
function lastingEffect(modifiers, {
  hostile = false, excludeUndead = false, perMagicPowerTargets = false,
  untilCombatEnd = false, status = '', textOutOfCombat = false,
  triggerThreshold = null, mindEffect = false, skipsTurn = false,
} = {}) {
  return {
    kind: 'modifier',
    targeting: { mode: 'single', perMagicPowerTargets, extraTargets: 0, extraFactor: 1 },
    dice: { count: 0, flat: 0, perMagicPower: false, addMagicPower: false },
    element: '',
    modifiers,
    hostile,
    excludeUndead,
    untilCombatEnd,
    status,
    textOutOfCombat,
    triggerThreshold,
    mindEffect,
    skipsTurn,
  };
}

/**
 * Group А1: one stat by tier — [Без Навыка = Базовый, Продвинутый,
 * Эксперт]. The expert takes Сила Магии targets when the book says so.
 * @param {string} stat
 * @param {[number, number, number]} values
 * @param {object} [options]
 * @param {[number|null, number|null, number|null]} [options.floors]
 * @param {boolean} [options.hostile]
 * @param {boolean} [options.expertTargets]   «количество …, равное СМ»
 * @returns {object[]}   effects for base, advanced, expert
 */
function statEffects(stat, values, { floors = [null, null, null], hostile = false, expertTargets = true } = {}) {
  return values.map((value, i) => lastingEffect([statModifier(stat, value, floors[i])], {
    hostile, perMagicPowerTargets: expertTargets && i === 2,
  }));
}

/**
 * Group В: an instant support spell — Лечение (`heal`: «лечит на NdS+СМ»),
 * Развеивание Магии (`dispel`), Воскрешение (`resurrect`) — item-spell.mjs's
 * `effect`.
 * @param {'heal'|'dispel'|'resurrect'} kind
 * @param {object} [options]
 * @param {number} [options.healDice]          Лечение: d6 count, + СМ
 * @param {boolean} [options.perMagicPowerTargets]
 * @param {boolean} [options.friendlyOnly]     Развеивание: «дружественного существа»
 * @param {number} [options.healthFactor]      Воскрешение: 50% or full
 * @param {boolean} [options.untilCombatEnd]   Воскрешение: «В конце битвы … снова погибнет»
 */
function supportEffect(kind, {
  healDice = 0, perMagicPowerTargets = false, friendlyOnly = false, healthFactor = 1, untilCombatEnd = false,
} = {}) {
  return {
    kind,
    targeting: { mode: 'single', perMagicPowerTargets, extraTargets: 0, extraFactor: 1 },
    dice: { count: healDice, flat: 0, perMagicPower: false, addMagicPower: healDice > 0 },
    element: '',
    modifiers: [],
    friendlyOnly,
    healthFactor,
    untilCombatEnd,
  };
}

/**
 * Puts group А1's three effects (base = basic, advanced, expert) onto a
 * spell entry's `base` / `advanced` / `expert`.
 * @param {object[]} effects
 * @param {object} entry   the spell entry without its effects
 * @returns {object}
 */
function withEffects([base, advanced, expert], entry) {
  return {
    ...entry,
    base: { ...entry.base, effect: base },
    advanced: { ...(entry.advanced ?? {}), effect: advanced },
    expert: { ...(entry.expert ?? {}), effect: expert },
  };
}

// --- Магия Земли, стр. 53-54 — 10 заклинаний ---
const EARTH = [
  // Group А1 (p. 53): «до минимума 3» / «до минимума 1».
  { name: 'Замедление', level: 1, icon: 54, ...withEffects(statEffects('speed', [-3, -6, -6], { floors: [3, 1, 1], hostile: true }), { base: { desc: 'Выбранное существо снижает свою скорость на 3, до минимума 3. Длительность = СМ.', cost: 6 }, basicCost: 5, advanced: { desc: 'Скорость уменьшается на 6, до минимума 1' }, expert: { desc: 'Работает на количество противников, равное СМ' } }) },
  { name: 'Щит', level: 1, icon: 27, base: { desc: 'Выбранное существо снижает любой получаемый физический урон в ближнем бою на 6, до минимума 1. Длительность = СМ.', cost: 5, effect: modifierEffect('meleeDamageTaken', -6, { floorOne: true }) }, basicCost: 4, advanced: { desc: 'Выбранное существо снижает любой получаемый физический урон в ближнем бою на 10 до минимума в 1', effect: modifierEffect('meleeDamageTaken', -10, { floorOne: true }) }, expert: { desc: 'Работает на количество союзников, равное СМ', effect: modifierEffect('meleeDamageTaken', -10, { floorOne: true, perMagicPowerTargets: true }) } },
  { name: 'Каменная Кожа', level: 1, icon: 46, ...withEffects(statEffects('defense', [3, 6, 6]), { base: { desc: 'Увеличивает Защиту выбранного существа на 3. Длительность = СМ.', cost: 5 }, basicCost: 4, advanced: { desc: 'Увеличивает Защиту на 6' }, expert: { desc: 'Работает на количество союзников, равное СМ' } }) },
  { name: 'Волна Смерти', level: 2, icon: 24, base: { desc: 'Все существа в поле зрения заклинателя, кроме Нежити и Элементалей, получают урон, равный 1d6+СМ.', cost: 20 }, basicCost: 16, advanced: { desc: 'Урон 2d6+СМ' }, expert: { desc: 'Урон 3d6+СМ' } },
  { name: 'Зыбучий Песок', level: 2, icon: 10, base: { desc: 'Выберите 4 клетки, на которых нет существ, и создайте на них невидимые ловушки. Существо, попавшее в ловушку, немедленно заканчивает ход. Длительность — до конца сражения.', cost: 8 }, basicCost: 6, advanced: { desc: '6 ловушек' }, expert: { desc: '8 ловушек' } },
  // Group А2 (p. 54): every spell of levels 1–3 (1–4, 1–5) but
  // Развеивание Магии (rules.md §11).
  { name: 'Антимагия', level: 3, icon: 34, ...withEffects(statEffects('spellImmunityLevel', [3, 4, 5], { expertTargets: false }), { base: { desc: 'Существо получает иммунитет к заклинаниям 1-3 уровня. Может быть снято Рассеиванием. Длительность = СМ.', cost: 15 }, basicCost: 12, advanced: { desc: 'Иммунитет к заклинаниям 1-4 уровней' }, expert: { desc: 'Иммунитет к заклинаниям 1-5 уровня' } }) },
  { name: 'Силовое Поле', level: 3, icon: 12, base: { desc: 'Выберите 2 клетки, находящиеся рядом друг с другом. Они становятся непроходимыми даже для летающих существ. Длительность = СМ.', cost: 18 }, basicCost: 12, advanced: { desc: 'Три соседние клетки' }, expert: { desc: 'Четыре соседние клетки' } },
  // Group В (p. 54): 50% of the maximum, until the end of the battle;
  // Продвинутый — for good; Эксперт — full Health (rules.md §11).
  { name: 'Воскрешение', level: 4, icon: 38, ...withEffects([
    supportEffect('resurrect', { healthFactor: 0.5, untilCombatEnd: true }),
    supportEffect('resurrect', { healthFactor: 0.5 }),
    supportEffect('resurrect', { healthFactor: 1 }),
  ], { base: { desc: 'Воскрешает недавно погибшего персонажа, давая ему 50% максимального ОЗ. В конце битвы персонаж снова погибнет.', cost: 20 }, basicCost: 16, advanced: { desc: 'Существо воскресает навсегда' }, expert: { desc: 'Существо Воскресает с полными ОЗ' } }) },
  { name: 'Метеоритный Дождь', level: 4, icon: 23, base: { desc: 'Выберите клетку. Все существа на этой и на соседних клетках получат 2d6 огненного урона за каждый ваш СМ.', cost: 40 }, basicCost: 35, advanced: { desc: 'Урон увеличивается до 2d6+1 за СМ' }, expert: { desc: 'Урон увеличивается до 2d6+2 за СМ' } },
  { name: 'Взрыв', level: 5, icon: 18, base: { desc: 'Выберите существо. Оно получает 2d6+3 урона за каждый ваш СМ.', cost: 50, effect: damageEffect(2, 3, { perMagicPower: true }) }, basicCost: 40, advanced: { desc: 'Урон увеличивается до 2d6+4 за СМ', effect: damageEffect(2, 4, { perMagicPower: true }) }, expert: { desc: 'Урон увеличивается до 2d6+5 за СМ', effect: damageEffect(2, 5, { perMagicPower: true }) } },
];

// --- Магия Воздуха, стр. 55-56 — 10 заклинаний ---
const AIR = [
  { name: 'Ускорение', level: 1, icon: 53, ...withEffects(statEffects('speed', [3, 6, 6]), { base: { desc: 'Выберите существо. Его Скорость увеличивается на 3. Длительность = СМ.', cost: 6 }, basicCost: 5, advanced: { desc: 'Скорость увеличивается на 6' }, expert: { desc: 'Может воздействовать на количество существ, равное СМ' } }) },
  // Group А1 (p. 55): Атака for a ranged attack only.
  { name: 'Точность', level: 1, icon: 44, ...withEffects(statEffects('rangedAttack', [3, 6, 6]), { base: { desc: 'Выберите существо. Его Атака в дальнем бою увеличивается на 3. Длительность = СМ.', cost: 5 }, basicCost: 4, advanced: { desc: 'Атака в дальнем бою увеличивается на 6' }, expert: { desc: 'Может воздействовать на количество существ, равное СМ' } }) },
  // Group А1 (p. 55): «до максимума в 3» — the hero's ±3 clamp. 12 → 4
  // Маны as printed, confirmed by Сеня (rules.md §11).
  { name: 'Удача', level: 1, icon: 51, ...withEffects(statEffects('luck', [1, 2, 2]), { base: { desc: 'Параметр удачи цели увеличивается на 1 до максимума в 3. Длительность = СМ.', cost: 12 }, basicCost: 4, advanced: { desc: 'Параметр удачи цели увеличивается на 2 до максимума в 3' }, expert: { desc: 'Может воздействовать на количество существ, равное СМ' } }) },
  { name: 'Молния', level: 2, icon: 17, base: { desc: 'Выберите существо. Оно получает урон, равный 3d6 + ваш СМ.', cost: 24, effect: damageEffect(3, 0, { plusMagicPower: true, element: 'lightning' }) }, basicCost: 16, advanced: { desc: 'Урон увеличивается до 4d6+СМ', effect: damageEffect(4, 0, { plusMagicPower: true, element: 'lightning' }) }, expert: { desc: 'Урон увеличивается до 5d6+СМ', effect: damageEffect(5, 0, { plusMagicPower: true, element: 'lightning' }) } },
  // Group А1 (p. 55): the expert is stronger, not on more targets.
  { name: 'Разрушительный Луч', level: 2, icon: 47, ...withEffects(statEffects('defense', [-3, -5, -7], { floors: [0, 0, 0], hostile: true, expertTargets: false }), { base: { desc: 'Выбранное существо снижает свою Защиту на 3, до минимума 0. Длительность = СМ.', cost: 10 }, basicCost: 8, advanced: { desc: 'Снижает Защиту на 5, минимум 0' }, expert: { desc: 'Снижает Защиту на 7, минимум 0' } }) },
  { name: 'Воздушный Щит', level: 3, icon: 28, base: { desc: 'Выбранное существо снижает любой получаемый физический урон в дальнем бою на 5, до минимума 1. Длительность = СМ.', cost: 12, effect: modifierEffect('rangedDamageTaken', -5, { floorOne: true }) }, basicCost: 10, advanced: { desc: 'Снижает получаемый урон в дальнем бою на 10, до минимума в 1', effect: modifierEffect('rangedDamageTaken', -10, { floorOne: true }) }, expert: { desc: 'Может воздействовать на количество существ, равное СМ', effect: modifierEffect('rangedDamageTaken', -10, { floorOne: true, perMagicPowerTargets: true }) } },
  { name: 'Уничтожить Нежить', level: 3, icon: 25, base: { desc: 'Вся нежить в поле зрения получает урон, равный 2d6+СМ урона.', cost: 20 }, basicCost: 14, advanced: { desc: 'Урон увеличивается до 3d6+СМ' }, expert: { desc: 'Урон увеличивается до 4d6+СМ' } },
  // p. 56: «Три других ближайших существа получают половину от этого
  // урона»; эксперт — «Воздействует на 4 дополнительных цели вместо 3».
  { name: 'Цепная Молния', level: 4, icon: 19, base: { desc: 'Выберите существо. Оно получает урон, равный 1d6 за каждый ваш СМ. Три других ближайших существа получают половину от этого урона, даже если это ваши союзники.', cost: 40, effect: damageEffect(1, 0, { perMagicPower: true, element: 'lightning', chain: { extraTargets: 3, extraFactor: 0.5 } }) }, basicCost: 24, advanced: { desc: 'Урон увеличивается до 1d6+1 за СМ', effect: damageEffect(1, 1, { perMagicPower: true, element: 'lightning', chain: { extraTargets: 3, extraFactor: 0.5 } }) }, expert: { desc: 'Воздействует на 4 дополнительных цели вместо 3', effect: damageEffect(1, 1, { perMagicPower: true, element: 'lightning', chain: { extraTargets: 4, extraFactor: 0.5 } }) } },
  // Group А2 (p. 56): one counterattack a round, Продвинутый — two
  // (rules.md §11); melee attacks only, a counter draws none.
  { name: 'Ответный Удар', level: 4, icon: 58, ...withEffects(statEffects('counterAttacks', [1, 2, 2]), { base: { desc: 'Выберите цель. Если она атакована, она атакует в ответ, один раз в раунд. Длительность = СМ.', cost: 24 }, basicCost: 20, advanced: { desc: 'Дает две дополнительные контратаки вместо одной' }, expert: { desc: 'Может воздействовать на количество существ, равное СМ' } }) },
  // Group А1 (p. 56): «Полёт» — a status, no mechanics; out of combat a
  // text card (rules.md §11).
  { name: 'Полет', level: 5, icon: 6, ...withEffects([
    lastingEffect([], { status: 'fly', textOutOfCombat: true }),
    lastingEffect([statModifier('speed', 3)], { status: 'fly', textOutOfCombat: true }),
    lastingEffect([statModifier('speed', 3)], { status: 'fly', textOutOfCombat: true, perMagicPowerTargets: true }),
  ], { base: { desc: 'Выбранное существо приобретает свойство Полет. Длительность = СМ.', cost: 30 }, basicCost: 20, advanced: { desc: 'Цель также получает +3 к Скорости' }, expert: { desc: 'Может воздействовать на количество существ, равное СМ' } }) },
];

// --- Магия Воды, стр. 57-58 — 10 заклинаний, три исключения по стоимости ---
const WATER = [
  { name: 'Благословение', level: 1, icon: 41, base: { desc: 'Выберите существо, не являющееся нежитью. Его урон в ближнем и дальнем бою увеличивается на 4. Длительность = СМ.', cost: 5, effect: modifierEffect('damageDealt', 4, { excludeUndead: true }) }, basicCost: 4, advanced: { desc: 'Бонус урона увеличивается до +6', effect: modifierEffect('damageDealt', 6, { excludeUndead: true }) }, expert: { desc: 'Может воздействовать на количество существ, равное СМ', effect: modifierEffect('damageDealt', 6, { excludeUndead: true, perMagicPowerTargets: true }) } },
  // Group В (p. 57): heals NdS+СМ, takes the negative spells off
  // (rules.md §11).
  { name: 'Лечение', level: 1, icon: 37, ...withEffects([
    supportEffect('heal', { healDice: 1 }),
    supportEffect('heal', { healDice: 2 }),
    supportEffect('heal', { healDice: 3, perMagicPowerTargets: true }),
  ], { base: { desc: 'Снимает с существа все негативные заклинания, и лечит его на 1d6+СМ.', cost: 6 }, basicCost: 5, advanced: { desc: 'Лечит 2d6+СМ' }, expert: { desc: 'Лечит 3d6+СМ и может воздействовать на количество существ, равное СМ' } }) },
  // Group В (p. 57): «дружественного существа», Продвинутый — any;
  // the Эксперт's «убрать видимый эффект» waits for the field spells.
  { name: 'Развеивание Магии', level: 1, icon: 35, ...withEffects([
    supportEffect('dispel', { friendlyOnly: true }),
    supportEffect('dispel'),
    supportEffect('dispel', { perMagicPowerTargets: true }),
  ], { base: { desc: 'Снимает все заклинания с выбранного дружественного существа.', cost: 5 }, basicCost: 4, advanced: { desc: 'Работает на любое существо' }, expert: { desc: 'Может воздействовать на количество существ, равное СМ. Вы можете выбрать видимый эффект (например силовое поле, огненную стену и т.п.) и убрать его' } }) },
  { name: 'Ледяная Молния', level: 2, icon: 16, base: { desc: 'Выберите существо. Оно получает урон, равный 2d6 + ваш СМ.', cost: 20, effect: damageEffect(2, 0, { plusMagicPower: true, element: 'ice' }) }, basicCost: 16, advanced: { desc: 'Урон увеличивается до 3d6+СМ', effect: damageEffect(3, 0, { plusMagicPower: true, element: 'ice' }) }, expert: { desc: 'Урон увеличивается до 4d6+СМ', effect: damageEffect(4, 0, { plusMagicPower: true, element: 'ice' }) } },
  { name: 'Слабость', level: 2, icon: 45, base: { desc: 'Выбранное существо получает -2 к наносимому атаками урону, до минимума 1. Длительность = СМ.', cost: 8, effect: modifierEffect('damageDealt', -2, { floorOne: true, hostile: true }) }, basicCost: 6, advanced: { desc: 'Снижает урон на 4, до минимума 1', effect: modifierEffect('damageDealt', -4, { floorOne: true, hostile: true }) }, expert: { desc: 'Может воздействовать на количество существ, равное СМ', effect: modifierEffect('damageDealt', -4, { floorOne: true, hostile: true, perMagicPowerTargets: true }) } },
  // Group А2 (p. 58): one shot fewer; Продвинутый — no shooting.
  { name: 'Забывчивость', level: 3, icon: 61, ...withEffects([
    lastingEffect([statModifier('rangedAttacks', -1)], { hostile: true }),
    lastingEffect([statModifier('noRangedAttacks', 1)], { hostile: true }),
    lastingEffect([statModifier('noRangedAttacks', 1)], { hostile: true, perMagicPowerTargets: true }),
  ], { base: { desc: 'Выбранное существо при стрельбе совершает на одну атаку меньше, чем обычно. Если оно может стрелять лишь единожды, оно не может стрелять вообще. Длительность = СМ.', cost: 20 }, basicCost: 18, advanced: { desc: 'Существо теряет все стрелковые атаки' }, expert: { desc: 'Может воздействовать на количество существ, равное СМ' } }) },
  // BOOK DEFECT: Экспертный не усиливает эффект, а просто повторяет
  // стоимость Базового — единственный такой случай во всей книге.
  // Транскрибировано дословно, не "исправлено".
  { name: 'Кольцо Холода', level: 3, icon: 20, base: { desc: 'Выберите клетку. Все существа на соседних клетках (но не на этой) получают 1d6 урона за СМ.', cost: 27 }, basicCost: 20, advanced: { desc: 'Урон увеличивается до 1d6+1 за СМ' }, expert: { cost: 20 } },
  // BOOK PATTERN (подтверждено как замысел, не дефект): эффект не
  // меняется ни на одной ступени — утилитарное заклинание, "нечего
  // усиливать", дешевеет только стоимость.
  { name: 'Телепорт', level: 4, icon: 63, base: { desc: 'Выберите дружественное существо. Телепортирует его на видимую вами клетку.', cost: 20 }, basicCost: 14, advanced: { cost: 10 }, expert: { cost: 6 } },
  // Group А1 (p. 58): «До конца боя»; Урон — before the multiplier, as
  // Благословение's (rules.md §11).
  { name: 'Молитва', level: 4, icon: 48, ...withEffects([2, 4, 4].map((value, i) => lastingEffect(
    ['attack', 'defense', 'speed', 'damageDealt'].map((stat) => statModifier(stat, value)),
    { untilCombatEnd: true, perMagicPowerTargets: i === 2 },
  )), { base: { desc: 'Выберите дружественное существо. До конца боя оно получает +2 к Атаке, Защите, Скорости и Урону.', cost: 16 }, basicCost: 12, advanced: { desc: 'Бонус к Атаке, Защите, Скорости и Урону и увеличиваются до +4' }, expert: { desc: 'Может воздействовать на количество существ, равное СМ' } }) },
  // BOOK PATTERN — см. комментарий у Телепорта выше.
  { name: 'Клон', level: 5, icon: 65, base: { desc: 'Создает идеальную копию дружеского существа. Она неотличима от оригинала и может использовать все его атаки и заклинания. Копия действует с момента создания и контролируется вами. Клон, получив любой урон, немедленно исчезает. Длительность = СМ.', cost: 35 }, basicCost: 30, advanced: { cost: 20 }, expert: { cost: 10 } },
];

// --- Магия Огня, стр. 59-60 — 9 заклинаний (не 10, как у остальных трёх
// стихий — подтверждено независимой сверкой по бумажной книге).
const FIRE = [
  // Group А1 (p. 59): «+3 к Атаке» — any attack; the book doesn't narrow
  // it to melee (rules.md §11).
  { name: 'Жажда Крови', level: 1, icon: 43, ...withEffects(statEffects('attack', [3, 6, 6]), { base: { desc: 'Выбранное существо получает +3 к Атаке. Длительность = СМ.', cost: 5 }, basicCost: 4, advanced: { desc: 'Бонус к Атаке увеличивается до +6' }, expert: { desc: 'Может воздействовать на количество существ, равное СМ' } }) },
  { name: 'Проклятие', level: 1, icon: 42, base: { desc: 'Выбранное существо, не являющееся нежитью, получает −2 к урону, до минимума 1. Длительность = СМ.', cost: 5, effect: modifierEffect('damageDealt', -2, { floorOne: true, hostile: true, excludeUndead: true }) }, basicCost: 4, advanced: { desc: 'Урон снижается на 4, до минимума 1', effect: modifierEffect('damageDealt', -4, { floorOne: true, hostile: true, excludeUndead: true }) }, expert: { desc: 'Может воздействовать на количество существ, равное СМ', effect: modifierEffect('damageDealt', -4, { floorOne: true, hostile: true, excludeUndead: true, perMagicPowerTargets: true }) } },
  // Group А2 (p. 59): d6 4+ / 3+ / 2+, the next turn skipped; a mind
  // effect, not lasting (rules.md §11).
  { name: 'Слепота', level: 2, icon: 62, ...withEffects([4, 3, 2].map((triggerThreshold) => lastingEffect([], {
    hostile: true, status: 'blind', triggerThreshold, mindEffect: true, skipsTurn: true,
  })), { base: { desc: 'Бросьте 1d6. Если выпало 4 и больше, выбранное существо пропускает следующий ход. Заклинание отменяется, если цель получит урон. Не действует на нежить и элементалей.', cost: 20 }, basicCost: 16, advanced: { desc: 'Заклинание срабатывает, если выпало 3 и больше' }, expert: { desc: 'Заклинание срабатывает, если выпало 2 и больше' } }) },
  // BOOK DEFECT: у "Без Навыка" в книге нет числа стоимости; 28 —
  // решение Сени (rules.md §11).
  { name: 'Стена Огня', level: 2, icon: 13, base: { desc: 'Выберите две соседние клетки, на которых нет существ и установите в них Стену Огня. Если существо наступит на них или начнет свой ход в Стене Огня, оно получит урон огнем, равный 1d6 за каждый ваш СМ. Длительность = СМ.', cost: 28 }, basicCost: 12, advanced: { desc: 'Вы можете выбрать три соседние клетки. Урон увеличен до 1d6+1 за СМ' }, expert: { desc: 'Урон увеличивается до 1d6+2 за СМ' } },
  // BOOK DEFECT: в книге стоимости перепутаны местами (без навыка 15,
  // базовый 36); решение Сени — 36 и 15 (rules.md §11).
  { name: 'Огненный Шар', level: 3, icon: 21, base: { desc: 'Выберите клетку. Все существа на этой и на соседних клетках получат 4d6+СМ огненного урона.', cost: 36 }, basicCost: 15, advanced: { desc: 'Урон увеличивается до 6d6+СМ' }, expert: { desc: 'Урон увеличивается до 8d6+СМ' } },
  // Group А1 (p. 60): «до минимума в -3» — the hero's ±3 clamp.
  { name: 'Неудача', level: 3, icon: 52, ...withEffects(statEffects('luck', [-1, -2, -2], { hostile: true }), { base: { desc: 'Параметр удачи цели снижается на 1 до минимума в -3. Длительность = СМ.', cost: 12 }, basicCost: 9, advanced: { desc: 'Параметр удачи снижается на 2 (до минимума в -3)' }, expert: { desc: 'Может воздействовать на количество существ, равное СМ' } }) },
  // Group А2 (p. 60): the caster's СМ at the cast is added (+3 / +6),
  // every attack on the bearer burns (rules.md §11).
  { name: 'Огненный Щит', level: 4, icon: 29, ...withEffects(statEffects('fireShield', [0, 3, 6], { expertTargets: false }), { base: { desc: 'Выберите цель. Любое существо, атакующее цель, получает урон огнем, равный вашему СМ. Длительность = СМ.', cost: 16 }, basicCost: 12, advanced: { desc: 'Урон увеличивается до 3+СМ' }, expert: { desc: 'Урон увеличивается до 6+СМ' } }) },
  { name: 'Инферно', level: 4, icon: 22, base: { desc: 'Выберите клетку. Все существа на этой и на соседних клетках получат 1d6 огненного урона за каждый ваш СМ.', cost: 56 }, basicCost: 48, advanced: { desc: 'Затрагивает клетки в радиусе 2 клеток от центра' }, expert: { desc: 'Урон увеличивается до 1d6+1 за СМ' } },
  { name: 'Армагеддон', level: 5, icon: 26, base: { desc: 'Все существа (даже вы и союзники!) в поле зрения получают урон огнем, равный 5d6+СМ.', cost: 60 }, basicCost: 50, advanced: { desc: 'Урон увеличивается до 7d6+СМ' }, expert: { desc: 'Урон увеличивается до 10d6+СМ' } },
];

// --- Универсальные, стр. 61 — 2 заклинания, без управляющего вторичного
// навыка (rules.md §6.2/§11) — resolveSpellVariant() в rolls.mjs уже
// сознательно резолвит их всегда в "Без Навыка", это не баг сборки.
const UNIVERSAL = [
  { name: 'Волшебная Стрела', level: 1, icon: 15, base: { desc: 'Наносит урон, равный 1d6+СМ выбранному существу.', cost: 10, effect: damageEffect(1, 0, { plusMagicPower: true }) }, basicCost: 8, advanced: { desc: 'Урон увеличивается до 2d6+СМ', effect: damageEffect(2, 0, { plusMagicPower: true }) }, expert: { desc: 'Урон увеличивается до 3d6+СМ', effect: damageEffect(3, 0, { plusMagicPower: true }) } },
  { name: 'Призыв Элементаля', level: 5, icon: 66, base: { desc: 'Призывает Элементаля Огня, Воздуха, Земли или Воды. Он верно служит вам количество раундов, равное СМ, или пока не погибнет, а затем исчезает. Вы можете призвать одного Элементаля за раз. Стихия этого заклинания — это стихия выбранного элементаля.', cost: 50 }, basicCost: 40, advanced: { desc: 'Призванный элементаль получает +2 к атаке и урону, и его Очки Здоровья увеличены на 10' }, expert: { desc: 'Бонус к атаке и урон увеличиваются до +4, и его Очки Здоровья увеличены на 20' } },
];

const SCHOOLS = [
  { school: 'earth', spells: EARTH },
  { school: 'air', spells: AIR },
  { school: 'water', spells: WATER },
  { school: 'fire', spells: FIRE },
  { school: 'universal', spells: UNIVERSAL },
];

// Каждое заклинание -> кадр spells.def (HOMM3 SoD), тот же файл и тот же
// def2png.py, что уже используется для остального арта (assets/spells/
// уже содержит все 70 кадров, extract-коммит ab1b093). Порядок кадров
// подтверждён не по догадке: сверено с SPTRAITS.TXT (родная таблица
// заклинаний игры, D:\HOMM3_Extracted\Test_h3bitmap) построчно, id 0-69
// в этом же порядке, и глазами — открыты кадры и сверены по описанию
// эффекта с оригинальным заклинанием HOMM3. У «Призыва Элементаля» в
// HOMM3 нет одного заклинания на все 4 стихии — 4 отдельных (id 66-69);
// взят id 66 (Огня) по согласованию, книга перечисляет стихии в этом
// порядке первой.
//
// hero-sheet.mjs's config.mjs:unknownSpellIcon остаётся отдельным,
// самостоятельным запасным вариантом — на случай, если у предмета `img`
// когда-нибудь окажется дефолтным Foundry-артворком (не наш путь), а не
// одним из назначенных здесь.
function spellIconPath(frame) {
  return `systems/heroes-glory/assets/spells/spells_g00_f${String(frame).padStart(3, '0')}.png`;
}

/**
 * @returns {object[]} finished compendium Item documents, book order
 *   (школа за школой, внутри школы — по уровню, как в таблице).
 */
export function buildSpellDocuments() {
  const documents = [];
  let index = 0;
  for (const { school, spells } of SCHOOLS) {
    for (const spell of spells) {
      documents.push(buildItemDocument({
        name: spell.name,
        type: 'spell',
        img: spellIconPath(spell.icon),
        system: {
          school,
          level: spell.level,
          range: DEFAULT_RANGE,
          variants: buildVariants(spell.base, spell.basicCost, spell.advanced, spell.expert),
        },
        index,
      }));
      index += 1;
    }
  }
  return documents;
}
