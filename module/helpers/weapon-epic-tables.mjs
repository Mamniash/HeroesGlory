/**
 * §8.1: epic tables of the melee weapon categories, verbatim (6 rows, d6),
 * book pp. 40–43. The book ties the table to the weapon's CATEGORY; the
 * item keeps its own copy in `system.epicTable` (item-weapon.mjs). Single
 * source for the weapon compendium build (scripts/data/
 * weapon-compendium-data.mjs) and the hero-creation starting weapon.
 * Ranged weapons have no epic table (§5.4) — their entry is six blanks,
 * the schema's own initial value.
 */
export const WEAPON_EPIC_TABLES = {
  polearm: [ // Древковое, стр. 40
    'Удар древком по цели',
    'Обманным движением нанесен скользящий удар острием по цели',
    'Прямой колющий удар по цели',
    'Удар снизу вверх по дуге в уязвимое место цели',
    'Бросок оружия почти в упор к цели',
    'Удар в прыжке сверху вниз',
  ],
  blade: [ // Клинковое, стр. 41
    'Крепкий удар рукоятью',
    'Выпад с прямой рукой и меч наносит колющий удар',
    'Разворачивая корпус, мечом наносится скользящий удар снизу вверх',
    'Рубящим ударом с плеча меч стремится к цели',
    'Обманным финтом удается направить лезвие на уязвимое место цели',
    'Сделав оборот вокруг себя для придания силы удару, мечом попадаем в цель',
  ],
  axe: [ // Рубящее, стр. 42
    'Удар рукоятью',
    'Удар лезвием плашмя',
    'Простой удар с маленькой амплитудой',
    'Удар с плеча',
    'Бросок оружия прямо в цель',
    'Рубящий удар наотмашь',
  ],
  blunt: [ // Дробящее, стр. 43
    'Удар рукоятью',
    'Удар плашмя дробящей частью',
    'Удар снизу вверх апперкотом',
    'Удар с разворота наотмашь',
    'Бросок молота прямо в цель',
    'Удар в прыжке сверху вниз',
  ],
  ranged: ['', '', '', '', '', ''], // Стрелковое, стр. 44 — эпик-таблицы нет
};

/** Melee categories, for choosing a starting weapon's epic table. */
export const MELEE_WEAPON_CATEGORIES = {
  polearm: 'HEROES_GLORY.WeaponCategory.Polearm',
  blade: 'HEROES_GLORY.WeaponCategory.Blade',
  axe: 'HEROES_GLORY.WeaponCategory.Axe',
  blunt: 'HEROES_GLORY.WeaponCategory.Blunt',
};
