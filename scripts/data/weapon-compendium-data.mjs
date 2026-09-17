/**
 * Источник данных для компендиума оружия — переписано вручную с картинок
 * страниц книги (текстовый слой PDF не читается: шрифт кириллицы без
 * ToUnicode CMap, pdftotext отдаёт пустые строки на месте русского текста,
 * поэтому единственный надёжный способ — читать сами страницы как картинки).
 *
 * Раздел «Таблицы оружия. Оружие ближнего боя», OKP_Heroes_Glory_v2_1.pdf,
 * книжные стр. 40-44 (пять категорий, 41 запись) — не путать с прайс-листом
 * простого немагического оружия на стр. 66-69: та таблица не несёт ни урона,
 * ни эпик-таблицы и по решению (см. переписку) в этот компендиум не идёт.
 *
 * Категория (Древковое/Клинковое/Рубящее/Дробящее/Стрелковое) в схему
 * предмета (module/data/item-weapon.mjs) сознательно не попадает — там нет
 * такого поля и не должно быть. У книги эпик-таблица привязана к КАТЕГОРИИ
 * оружия, а не к конкретному предмету (§8.1 rules.md), но при этом
 * `system.epicTable` в схеме лежит на самом предмете (уже принятое
 * отклонение от книги, задокументированное в item-weapon.mjs). Значит текст
 * одной из четырёх категорийных эпик-таблиц просто дублируется в каждую
 * запись её категории при сборке — категория здесь существует только как
 * ключ выбора этого текста и в собранный компендиум не попадает.
 */

import { buildItemDocument } from '../lib/pack-builder.mjs';

// Урон: NumberField в item-weapon.mjs, max проверен по всей книге, не
// только по этой таблице — верхняя граница артефактного «Гладиус титана»
// (стр. 46, таблица «Зачарованное оружие») и «Короткий меч Титана» здесь
// сходятся на одном и том же числе, 60.
export const MAX_KNOWN_BOOK_WEAPON_DAMAGE = 60;

// Эпик-таблицы категорий ближнего боя, дословно (по 6 строк, d6).
// Стрелковое оружие эпик-таблицы не имеет вовсе (§5.4/§8.1: "Стрелковые
// атаки эпик-таблиц не имеют") — это уже обрабатывается в коде отдельно
// от содержимого epicTable (module/helpers/roll-actions.mjs форсирует
// epicTable = null для weaponType "ranged" независимо от того, что лежит
// в самом предмете), так что здесь для стрелкового намеренно кладётся
// пустой массив — ровно то же самое, что initial-значение схемы.
const EPIC_TABLES = {
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

// weaponType — ключи CONFIG.HEROES_GLORY.weaponTypes (module/helpers/config.mjs),
// один в один с колонкой «Тип» книги (двуручность вынесена в отдельный флаг).
const WEAPON_CATEGORIES = [
  {
    category: 'polearm', // Древковое, стр. 40 — 6 записей
    weapons: [
      { name: 'Копье Кентавра', type: 'piercing', damage: 5, twoHanded: true, source: 'Оплот' },
      { name: 'Копье Троглодита', type: 'piercing', damage: 3, twoHanded: true, source: 'Темница' },
      { name: 'Копье Пехотинца', type: 'piercing', damage: 4, twoHanded: true, source: 'Замок' },
      { name: 'Алебарда', type: 'piercingSlashing', damage: 5, twoHanded: true, source: 'Замок' },
      { name: 'Крестьянские вилы', type: 'piercing', damage: 2, twoHanded: true, source: 'Везде' },
      { name: 'Трезубец Никса', type: 'piercing', damage: 15, twoHanded: false, source: 'Причал' },
    ],
  },
  {
    category: 'blade', // Клинковое, стр. 41 — 12 записей
    weapons: [
      { name: 'Кинжал Гарпии', type: 'piercing', damage: 3, twoHanded: false, source: 'Темница' },
      { name: 'Искусный кинжал Наги', type: 'piercing', damage: 6, twoHanded: false, source: 'Башня' },
      { name: 'Короткий меч наездников на волках', type: 'piercingSlashing', damage: 4, twoHanded: false, source: 'Цитадель' },
      { name: 'Короткий меч Скелета', type: 'piercingSlashing', damage: 3, twoHanded: false, source: 'Некрополис' },
      { name: 'Короткий меч всадниц на пегасах', type: 'piercingSlashing', damage: 9, twoHanded: false, source: 'Оплот' },
      { name: 'Меч Крестоносца', type: 'piercingSlashing', damage: 10, twoHanded: false, source: 'Замок' },
      { name: 'Короткий меч Мечника', type: 'piercingSlashing', damage: 9, twoHanded: false, source: 'Замок' },
      { name: 'Ангельский короткий меч', type: 'piercingSlashing', damage: 40, twoHanded: false, source: 'Замок' },
      { name: 'Короткий меч Титана', type: 'piercingSlashing', damage: 60, twoHanded: false, source: 'Башня' },
      { name: 'Длинный меч Разбойника', type: 'piercingSlashing', damage: 4, twoHanded: false, source: 'Везде' },
      { name: 'Длинный меч Наги', type: 'piercingSlashing', damage: 25, twoHanded: false, source: 'Башня' },
      { name: 'Длинный меч Архангела', type: 'piercingSlashing', damage: 50, twoHanded: true, source: 'Замок' },
    ],
  },
  {
    category: 'axe', // Рубящее, стр. 42 — 9 записей
    weapons: [
      { name: 'Топор Зомби', type: 'slashing', damage: 4, twoHanded: false, source: 'Некрополис' },
      { name: 'Боевой топор Минотавра', type: 'slashing', damage: 18, twoHanded: true, source: 'Темница' },
      { name: 'Хлыст Владыки бездны', type: 'slashing', damage: 17, twoHanded: false, source: 'Инферно' },
      { name: 'Боевая коса Дьявола', type: 'slashing', damage: 40, twoHanded: true, source: 'Инферно' },
      { name: 'Тесак Мертвеца', type: 'slashing', damage: 3, twoHanded: false, source: 'Некрополис' },
      { name: 'Сабля Кочевника', type: 'slashing', damage: 6, twoHanded: false, source: 'Везде' },
      { name: 'Сабля Матроса', type: 'slashing', damage: 4, twoHanded: false, source: 'Причал' },
      { name: 'Пиратская сабля', type: 'slashing', damage: 7, twoHanded: false, source: 'Причал' },
      { name: 'Роковой хопеш черного рыцаря', type: 'slashing', damage: 20, twoHanded: false, source: 'Некрополис' },
    ],
  },
  {
    category: 'blunt', // Дробящее, стр. 43 — 5 записей
    weapons: [
      { name: 'Булава Гоблина', type: 'bludgeoning', damage: 4, twoHanded: false, source: 'Цитадель' },
      { name: 'Дубина Огра', type: 'bludgeoning', damage: 12, twoHanded: false, source: 'Цитадель' },
      { name: 'Сдвоенный кистень Гнолла', type: 'bludgeoning', damage: 7, twoHanded: false, source: 'Крепость' },
      { name: 'Кистень Гнолла', type: 'bludgeoning', damage: 3, twoHanded: false, source: 'Крепость' },
      { name: 'Гномский боевой молот', type: 'bludgeoning', damage: 6, twoHanded: false, source: 'Оплот' },
    ],
  },
  {
    category: 'ranged', // Стрелковое, стр. 44 — 9 записей, эпик-таблицы нет
    weapons: [
      { name: 'Длинный лук снайпера', type: 'ranged', damage: 10, twoHanded: true, source: 'Везде' },
      { name: 'Эльфийский длинный лук', type: 'ranged', damage: 5, twoHanded: true, source: 'Оплот' },
      { name: 'Арбалет', type: 'ranged', damage: 3, twoHanded: true, source: 'Замок' },
      { name: 'Короткий лук ящеров', type: 'ranged', damage: 3, twoHanded: true, source: 'Крепость' },
      { name: 'Короткий лук медуз', type: 'ranged', damage: 8, twoHanded: true, source: 'Темница' },
      { name: 'Праща', type: 'ranged', damage: 3, twoHanded: false, source: 'Везде' },
      { name: 'Метательный топорик орков', type: 'ranged', damage: 5, twoHanded: false, source: 'Цитадель' },
      { name: 'Пистоль', type: 'ranged', damage: 7, twoHanded: false, source: 'Причал' },
      { name: 'Металлический шар гремлина', type: 'ranged', damage: 2, twoHanded: false, source: 'Башня' },
    ],
  },
];

/**
 * Разворачивает WEAPON_CATEGORIES в плоский список записей компендиума,
 * подставляя каждой запиcи эпик-таблицу её категории.
 * @returns {Array<{name: string, type: string, damage: number, twoHanded: boolean, source: string, epicTable: string[]}>}
 */
export function getWeaponEntries() {
  const entries = [];
  for (const { category, weapons } of WEAPON_CATEGORIES) {
    const epicTable = EPIC_TABLES[category];
    for (const weapon of weapons) {
      entries.push({ ...weapon, epicTable: [...epicTable] });
    }
  }
  return entries;
}

/**
 * Turns `getWeaponEntries()` into finished compendium Item documents for
 * `scripts/build-packs.mjs` — id/sort/_stats boilerplate lives in
 * pack-builder.mjs, this only supplies the weapon-specific `system` shape.
 * @returns {object[]}
 */
export function buildWeaponDocuments() {
  return getWeaponEntries().map((entry, index) => buildItemDocument({
    name: entry.name,
    type: 'weapon',
    // No dedicated art per weapon yet (assets/ has no weapon icons) — the
    // same core-Foundry fallback used elsewhere in the system without its
    // own art (cf. icons/svg/aura.svg in module/documents/actor.mjs).
    img: 'icons/svg/sword.svg',
    system: {
      weaponType: entry.type,
      damage: entry.damage,
      source: entry.source,
      twoHanded: entry.twoHanded,
      equipped: false,
      paperdollSlot: null,
      epicTable: entry.epicTable,
    },
    index,
  }));
}
