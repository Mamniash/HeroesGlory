/**
 * Источник данных для компендиума «Справочник цен» — прайс-лист общих
 * товаров и простого немагического снаряжения, OKP_Heroes_Glory_v2_1.pdf,
 * книжные стр. 66-69 (6 блоков, 43 записи), переписано вручную с картинок
 * страниц (тот же текстовый слой без ToUnicode CMap, что и у остальных
 * компендиумов — см. weapon-compendium-data.mjs's own header comment).
 *
 * Это НЕ компендиум предметов: ни у одной записи нет урона, типа оружия
 * или эпик-таблицы — сама книга не даёт этих полей здесь, в отличие от
 * компендиума оружия (боевые характеристики, стр. 40-44). Оформлено как
 * JournalEntry (module/lib/pack-builder.mjs's buildJournalDocument) — то,
 * что Рассказчик открывает и читает, а не тащит на лист персонажа. Одна
 * страница на блок (Ночлег/Еда/Одежда/Простое оружие/Магия/Наборы
 * приключенцев) — 6 страниц, у листа журнала есть боковое оглавление по
 * страницам, так что длинный блок «Простое оружие» (27 из 43 записей) не
 * превращается в бесконечный скролл.
 *
 * ВАЖНО — категории внутри блока «Простое оружие» (Дробящее/Рубящее/
 * Древковое/Клинковое/Стрелковое-метательное) это категоризация именно
 * ЭТОГО прайс-листа, книга стр. 66-69. Она НЕ совпадает и сознательно НЕ
 * сводится с типами урона оружия из rules.md §8.1 (Колющий/Рубящий/
 * Дробящий/Колющий-рубящий/Стрелковое, module/data/item-weapon.mjs's
 * weaponType) — это два независимых списка для разных целей (каталог цен
 * vs боевой параметр). Не пытаться унифицировать при будущих правках.
 *
 * «Хлыст» в книге стоит именно в подкатегории «Рубящее» (сразу после
 * «Боевой топор», без отдельного заголовка между ними — проверено по
 * координатам текстовых блоков PDF, не потерянный заголовок). Это решение
 * книги, а не эта транскрипция — оставлено как есть, категории по этому
 * прайс-листу не пересматриваются.
 *
 * Один verbatim book typo silently fixed in transit (confirmed against
 * the page images, not a transcription slip on this end — same convention
 * as skill-compendium-data.mjs's own header comment):
 *  - Праща: book has "под сняряд" — "под снаряд".
 *
 * Стоимость диапазоном (5-20, 8-20, 10-20, 8-10) — не опечатка, книга
 * действительно даёт разброс по обстоятельствам (стр. 67-68: Копье
 * пехотинца, Копье кавалериста, Глефа, Кинжал, Короткий меч, Длинный
 * меч) — хранится строкой, не парсится в число.
 */

import { buildJournalDocument } from '../lib/pack-builder.mjs';

/**
 * @typedef {{name: string, cost: string, unit: string, note: string}} PriceRow
 * @typedef {{header: string}} PriceSubheader
 */

/** Ночлег — стр. 66, 3 записи. @type {PriceRow[]} */
const LODGING = [
  { name: 'Скудный ночлег', cost: '10', unit: 'Сутки', note: 'Соломенный тюфяк' },
  { name: 'Обычный ночлег', cost: '30', unit: 'Сутки', note: 'Обычная деревянная кровать' },
  { name: 'Богатый ночлег', cost: '50', unit: 'Сутки', note: 'Роскошная кровать с балдахином' },
];

/** Еда — стр. 66, 3 записи. @type {PriceRow[]} */
const FOOD = [
  { name: 'Скудный рацион', cost: '2', unit: 'Порция', note: 'Миска супа и вода' },
  { name: 'Обычный рацион', cost: '6', unit: 'Порция', note: 'Первое, второе и компот' },
  { name: 'Богатый рацион', cost: '10', unit: 'Порция', note: 'Набор из шести различных блюд и дорогое вино' },
];

/** Одежда — стр. 66, 3 записи. @type {PriceRow[]} */
const CLOTHING = [
  { name: 'Нищенский наряд', cost: '50', unit: 'Комплект', note: 'Обмотки с заплатками' },
  { name: 'Простой прикид', cost: '100', unit: 'Комплект', note: 'Повседневная одежда горожанина или крестьянина' },
  { name: 'Богатое платье', cost: '150', unit: 'Комплект', note: 'Роскошный наряд для вельмож и августейших особ' },
];

/**
 * Простое, не магическое оружие — стр. 66-68, 27 записей, 5 подкатегорий
 * (см. этого файла заголовочный комментарий про Хлыст и про несовпадение
 * с §8.1). @type {Array<PriceRow|PriceSubheader>}
 */
const SIMPLE_WEAPONS = [
  { header: 'Дробящее' },
  { name: 'Палица', cost: '8', unit: 'Экземпляр', note: 'Древковая рукоять с шаровидным навершием' },
  { name: 'Боевой молот', cost: '10', unit: 'Экземпляр', note: 'Молоток с длинной рукоятью' },
  { name: 'Кистень', cost: '8', unit: 'Экземпляр', note: 'Грузило с гибким подвесом на рукояти' },
  { name: 'Булава', cost: '10', unit: 'Экземпляр', note: 'Древковая рукоять с шаровидным навершием и утыканная шипами' },

  { header: 'Рубящее' },
  { name: 'Топор', cost: '10', unit: 'Экземпляр', note: 'Топор, похожий на плотницкий' },
  { name: 'Боевой топор', cost: '8', unit: 'Экземпляр', note: 'Небольшой топорик' },
  { name: 'Хлыст', cost: '8', unit: 'Экземпляр', note: 'Твердая упругая плетка из сплетенных ремней' },

  { header: 'Древковое' },
  {
    name: 'Копье пехотинца', cost: '5–20', unit: 'Экземпляр',
    note: 'Любое копье пехотинца, размер зависит от предпочтений той или иной фракции',
  },
  { name: 'Копье кавалериста', cost: '10–20', unit: 'Экземпляр', note: 'Длинное копье с гардой, частично полое внутри' },
  { name: 'Алебарда', cost: '10', unit: 'Экземпляр', note: 'Навершие включает в себя топор, пику и крюк' },
  { name: 'Глефа', cost: '8–10', unit: 'Экземпляр', note: 'Клинок на длинном древке, заточен в одну сторону' },
  { name: 'Вилы', cost: '5', unit: 'Экземпляр', note: 'Навершие с тремя остриями' },
  { name: 'Посох', cost: '3', unit: 'Экземпляр', note: 'Прямая и длинная палка, иногда с декоративным навершием' },
  { name: 'Трезубец', cost: '7', unit: 'Экземпляр', note: 'Навершие с тремя треугольными остриями' },
  { name: 'Боевая коса', cost: '10', unit: 'Экземпляр', note: 'Лезвие как у обычной косы, но вертикальное' },

  { header: 'Клинковое' },
  {
    name: 'Кинжал', cost: '5–20', unit: 'Экземпляр',
    note: 'Небольшое лезвие с гардой, в зависимости от владельца может отличаться по размерам',
  },
  {
    name: 'Короткий меч', cost: '8–20', unit: 'Экземпляр',
    note: 'Средней длины лезвие с хорошей гардой, больше, чем кинжал, в зависимости от владельца может отличаться по размерам',
  },
  {
    name: 'Длинный меч', cost: '10–20', unit: 'Экземпляр',
    note: 'Длинный с широкой гардой или короткий меч, в зависимости от владельца может отличаться по размерам',
  },
  { name: 'Сабля', cost: '10', unit: 'Экземпляр', note: 'Клинок с широким лезвием, заострен в одну сторону, имеет небольшую гарду' },
  { name: 'Тесак', cost: '8', unit: 'Экземпляр', note: 'Похож на саблю, но меньше размером' },
  { name: 'Хопеш', cost: '10', unit: 'Экземпляр', note: 'Серповидный клинок и рукоять' },

  { header: 'Стрелковое/метательное' },
  { name: 'Длинный лук', cost: '20', unit: 'Экземпляр', note: 'Сделан из цельного куска древесины, очень длинный' },
  {
    name: 'Короткий лук', cost: '15', unit: 'Экземпляр',
    note: 'Сделан из композитных материалов (куски дерева, кости, сухожилия), небольшой',
  },
  {
    name: 'Арбалет', cost: '20', unit: 'Экземпляр',
    note: 'Горизонтальный лук с механизмом спуска и натяжения тетевы и ложе для стрелы',
  },
  {
    name: 'Праща', cost: '5', unit: 'Экземпляр',
    // Book: "под сняряд" — fixed to "под снаряд", see file header.
    note: 'Ремень или веревка с кожаным ложе под снаряд, делается из подручных средств',
  },
  { name: 'Метательный топорик', cost: '8', unit: 'Экземпляр', note: 'Выглядит как боевой топорик, но лучше сбалансирован для метания' },
  { name: 'Пистоль', cost: '20', unit: 'Экземпляр', note: 'Огнестрельный пистолет' },
];

/** Магия — стр. 69, 6 записей. @type {PriceRow[]} */
const MAGIC = [
  { name: 'Книга заклинаний', cost: '500', unit: 'Книга', note: 'Стандартная книга заклинаний, без самих заклинаний' },
  { name: 'Заклинание 1 уровня', cost: '100', unit: 'Одно заклинание', note: 'Любое заклинание 1 уровня' },
  { name: 'Заклинание 2 уровня', cost: '200', unit: 'Одно заклинание', note: 'Любое заклинание 2 уровня' },
  { name: 'Заклинание 3 уровня', cost: '300', unit: 'Одно заклинание', note: 'Любое заклинание 3 уровня' },
  { name: 'Заклинание 4 уровня', cost: '400', unit: 'Одно заклинание', note: 'Любое заклинание 4 уровня' },
  { name: 'Заклинание 5 уровня', cost: '500', unit: 'Одно заклинание', note: 'Любое заклинание 5 уровня' },
];

/** Наборы приключенцев — стр. 69, 1 запись. @type {PriceRow[]} */
const ADVENTURER_KITS = [
  {
    name: 'Набор бывалого путешественника', cost: '50', unit: 'Один набор',
    note: 'Моток веревки 30 футов, огниво, 5 факелов, рюкзак, перочинный нож, небольшой топор, спальник, '
      + 'бурдюк с водой и сухпаек на 5 дней',
  },
];

/**
 * The 6 book pages, in book order, each becoming one JournalEntryPage.
 * @type {Array<{name: string, rows: Array<PriceRow|PriceSubheader>}>}
 */
const PAGES = [
  { name: 'Ночлег', rows: LODGING },
  { name: 'Еда', rows: FOOD },
  { name: 'Одежда', rows: CLOTHING },
  { name: 'Простое, не магическое оружие', rows: SIMPLE_WEAPONS },
  { name: 'Магия', rows: MAGIC },
  { name: 'Наборы приключенцев', rows: ADVENTURER_KITS },
];

/**
 * Renders one page's rows as a single HTML table — a `PriceSubheader` row
 * becomes a spanning `<tr><th colspan="4">` divider (used only inside the
 * "Простое оружие" page, for its 5 weapon-family subcategories).
 *
 * Wrapped in `.hg-price-list-table-wrap` (src/scss/components/
 * _price-list.scss) so a narrow journal window scrolls the table
 * horizontally instead of losing the "Пояснение" column off the edge —
 * found live (below ~850px the unwrapped table overflowed its container
 * with no way to reach it). The class is exclusive to this compendium's
 * own generated HTML, so the rule can't reach any other journal's tables.
 * @param {Array<PriceRow|PriceSubheader>} rows
 * @returns {string}
 */
function renderTable(rows) {
  const body = rows.map((row) => {
    if ('header' in row) return `<tr><th colspan="4">${row.header}</th></tr>`;
    return `<tr><td>${row.name}</td><td>${row.cost}</td><td>${row.unit}</td><td>${row.note}</td></tr>`;
  }).join('\n      ');
  return `<div class="hg-price-list-table-wrap">
  <table>
    <thead>
      <tr><th>Наименование</th><th>Стоимость</th><th>За одну единицу измерения</th><th>Пояснение</th></tr>
    </thead>
    <tbody>
      ${body}
    </tbody>
  </table>
  </div>`;
}

/**
 * Turns `PAGES` into a finished compendium JournalEntry document for
 * `scripts/build-packs.mjs` — id/sort/_stats boilerplate lives in
 * pack-builder.mjs, this only supplies the page names and HTML content.
 * @returns {object[]}
 */
export function buildPriceListDocuments() {
  return [
    buildJournalDocument({
      name: 'Справочник цен',
      pages: PAGES.map(({ name, rows }) => ({ name, content: renderTable(rows) })),
      index: 0,
    }),
  ];
}
