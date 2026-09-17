/**
 * Источник данных для компендиума артефактов — переписано с картинок
 * страниц книги (OKP_Heroes_Glory_v2_1.pdf, книжные стр. 46-51, один тип
 * на страницу; текстовый слой PDF не читается для кириллицы, см. тот же
 * комментарий в weapon-compendium-data.mjs). 2d6 на каждой странице,
 * 61 запись всего: 11 «Зачарованное оружие» (2-12) + по 10 на каждый из
 * оставшихся пяти типов (2-11). Один компендиум на все 6 типов — они все
 * являются одним типом документа (`Item` → `artifact`), различаются только
 * `system.artifactType`, ровно как единый компендиум оружия уже различает
 * 5 категорий через `weaponType`.
 *
 * Числовые бонусы продублированы в `modifiers` (структурированно, реально
 * действуют через ActiveEffect — module/documents/item.mjs) поверх
 * дословного текста в `bonus`. Не всё сводится к модификатору — см.
 * TEXT_ONLY_NOTE ниже по каждой такой записи; текстовые бонусы оставлены
 * только текстом, никакого нового механизма не добавлено (обсуждено и
 * согласовано отдельно, не додумано здесь).
 *
 * "Режущее" (Зачарованное оружие, стр. 46) — не одно из пяти канонических
 * значений §8.1 (Колющий/Рубящий/Дробящий/Колющий-рубящий/Стрелковое).
 * Решение (согласовано): считать синонимом «Рубящего» (slashing) — в этой
 * же таблице мечи помечены то «Режущее», то «Колющее» по отдельности,
 * а сочетания «Колющий/рубящий» нет ни разу, то есть это не отдельная
 * категория, а более свободная формулировка автора. Проверено — «Режущее»
 * как игровая категория оружия/типа брони больше нигде в книге не
 * встречается (ни в таблицах оружия стр. 40-44, ни в формате статблоков
 * бестиария стр. 72-73); сплошного постраничного поиска по всем ~117
 * страницам не делал (не текстовый PDF, поиск только визуальный) — если
 * где-то дальше в книге всплывёт другое употребление, решение может
 * оказаться неверным.
 */

import { buildItemDocument } from '../lib/pack-builder.mjs';

// --- Зачарованное оружие, стр. 46 — 11 записей (2-12) ---
// weaponType — те же ключи CONFIG.HEROES_GLORY.weaponTypes, что и у
// обычного оружия. targetSlots проставлен по той же детерминированной
// логике, что уже зашита в paperdoll-slots.mjs для настоящего оружия
// (ближний бой -> слот 1, дальний -> слот 16) — это не догадка, а
// применение уже принятого правила к тем же полям на артефакте.
const ENCHANTED_WEAPONS = [
  {
    name: 'Кистень великого гнолла', bonus: '+4 к Атаке', damage: 5,
    weaponType: 'bludgeoning', twoHanded: false, modifiers: [mod('attack', 'add', 4)],
  },
  {
    name: 'Языки пламени красного дракона', bonus: '+2 к Атаке и защите', damage: 10,
    weaponType: 'slashing', twoHanded: false, modifiers: [mod('attack', 'add', 2), mod('defense', 'add', 2)],
  },
  {
    name: 'Карающая дубина огра', bonus: '+5 к Атаке', damage: 12,
    weaponType: 'bludgeoning', twoHanded: true, modifiers: [mod('attack', 'add', 5)],
  },
  {
    // TEXT_ONLY_NOTE: доп. стрелковая атака в раунд — механизма нет.
    name: 'Лук из вишневого дерева эльфов', bonus: 'Дает дополнительную стрелковую атаку в раунд',
    damage: 12, weaponType: 'ranged', twoHanded: true, modifiers: [],
  },
  {
    // TEXT_ONLY_NOTE: выдача вторичного навыка на уровне — механизма нет.
    name: 'Золотой лук', bonus: 'Дает навык Стрельба на уровне Эксперт',
    damage: 15, weaponType: 'ranged', twoHanded: true, modifiers: [],
  },
  {
    name: 'Секира кентавра', bonus: '+2 к Атаке', damage: 20,
    weaponType: 'slashing', twoHanded: true, modifiers: [mod('attack', 'add', 2)],
  },
  {
    name: 'Блэкшард мертвого рыцаря', bonus: '+3 к Атаке', damage: 20,
    weaponType: 'slashing', twoHanded: false, modifiers: [mod('attack', 'add', 3)],
  },
  {
    name: 'Меч адского пламени', bonus: '+6 к Атаке', damage: 40,
    weaponType: 'slashing', twoHanded: false, modifiers: [mod('attack', 'add', 6)],
  },
  {
    name: 'Трезубец могущества', bonus: '+7 к Атаке', damage: 40,
    weaponType: 'piercing', twoHanded: true, modifiers: [mod('attack', 'add', 7)],
  },
  {
    name: 'Меч правосудия', bonus: '+5 ко всем характеристикам', damage: 50,
    weaponType: 'slashing', twoHanded: true, modifiers: allStats('add', 5),
  },
  {
    name: 'Гладиус титана', bonus: '+2 к Атаке, но -3 к Защите', damage: 60,
    weaponType: 'slashing', twoHanded: false, modifiers: [mod('attack', 'add', 2), mod('defense', 'subtract', 3)],
  },
];

// --- Зачарованные доспехи, стр. 47 — 10 записей (2-11) ---
const ENCHANTED_ARMOR = [
  { name: 'Нагрудник из окаменелого дерева', bonus: '+1 к Силе магии', level: 1, modifiers: [mod('magicPower', 'add', 1)] },
  { name: 'Шлем белого единорога', bonus: '+1 к Знанию', level: 1, modifiers: [mod('knowledge', 'add', 1)] },
  { name: 'Шлем-череп', bonus: '+2 к Знанию', level: 2, modifiers: [mod('knowledge', 'add', 2)] },
  { name: 'Шлем Хаоса', bonus: '+3 к Знанию', level: 2, modifiers: [mod('knowledge', 'add', 3)] },
  { name: 'Поножи из кости дракона', bonus: '+1 к Силе магии и Знанию', level: 3, modifiers: [mod('magicPower', 'add', 1), mod('knowledge', 'add', 1)] },
  { name: 'Шлем адской ярости', bonus: '+5 к Знанию', level: 3, modifiers: [mod('knowledge', 'add', 5)] },
  { name: 'Кольчуга великого василиска', bonus: '+3 к Силе магии', level: 3, modifiers: [mod('magicPower', 'add', 3)] },
  { name: 'Туника короля циклопов', bonus: '+4 к Силе магии', level: 4, modifiers: [mod('magicPower', 'add', 4)] },
  { name: 'Шлем небесного грома', bonus: '+10 к Знанию, но -2 к Силе магии', level: 4, modifiers: [mod('knowledge', 'add', 10), mod('magicPower', 'subtract', 2)] },
  { name: 'Доспех из чешуи дракона', bonus: '+4 к Атаке и защите', level: 5, modifiers: [mod('attack', 'add', 4), mod('defense', 'add', 4)] },
];

// --- Зачарованные щиты, стр. 48 — 10 записей (2-11) ---
// Уровня НЕТ ни у одной записи (книга: колонка "Тип" = "щит" без номера,
// в отличие от доспехов) — level остаётся null для всех, docs/rules.md
// поправлен под это же наблюдение.
const ENCHANTED_SHIELDS = [
  { name: 'Щит стражника королевы', bonus: '+1 к Защите, +1 к Атаке', modifiers: [mod('defense', 'add', 1), mod('attack', 'add', 1)] },
  { name: 'Щит полурослика', bonus: '+1 к Защите, +1 к Удаче', modifiers: [mod('defense', 'add', 1), mod('luck', 'add', 1)] },
  { name: 'Щит короля гномов', bonus: '+3 к Защите, -1 к Скорости', modifiers: [mod('defense', 'add', 3), mod('speed', 'subtract', 1)] },
  { name: 'Щит короля гноллов', bonus: '+4 к Защите, -1 к Силе Магии', modifiers: [mod('defense', 'add', 4), mod('magicPower', 'subtract', 1)] },
  { name: 'Щит яростного огра', bonus: '+5 к Защите, +2 к Атаке', modifiers: [mod('defense', 'add', 5), mod('attack', 'add', 2)] },
  { name: 'Щит проклятых', bonus: '+6 к Защите, +10 Маны', modifiers: [mod('defense', 'add', 6), mod('mana.max', 'add', 10)] },
  { name: 'Щит короля минотавров', bonus: '+6 к Защите, +1 Боевой дух', modifiers: [mod('defense', 'add', 6), mod('morale', 'add', 1)] },
  { name: 'Щит морской славы', bonus: '+7 к Защите', modifiers: [mod('defense', 'add', 7)] },
  { name: 'Щит из чешуи дракона', bonus: '+4 к Атаке и Защите', modifiers: [mod('attack', 'add', 4), mod('defense', 'add', 4)] },
  { name: 'Щит часового', bonus: '+12 к Защите, но -3 к Атаке', modifiers: [mod('defense', 'add', 12), mod('attack', 'subtract', 3)] },
];

// --- Ожерелья, стр. 49 — 10 записей (2-11), без колонки "Тип" ---
const NECKLACES = [
  // TEXT_ONLY_NOTE: длительность заклинаний — нет такого поля.
  { name: 'Магический ошейник', bonus: 'Увеличивает продолжительность действия заклятий героя на 1 ход', modifiers: [] },
  // TEXT_ONLY_NOTE: условная выдача/усиление вторичного навыка — механизма нет.
  { name: 'Колье неприступности', bonus: 'Увеличивает эффективность навыка Помехи на 1. Если данного навыка нет, то он появляется на базовом уровне, пока надет артефакт', modifiers: [] },
  { name: 'Амулет гробовщика', bonus: 'Повышает навык Некромантии с базового до продвинутого, с продвинутого до эксперта. При отсутствии навыка артефакт не имеет эффекта', modifiers: [] },
  { name: 'Ожерелье стремительности', bonus: 'Увеличивает скорость на 1', modifiers: [mod('speed', 'add', 1)] },
  { name: 'Ожерелье из зубов дракона', bonus: '+3 к Знанию и силе магии', modifiers: [mod('knowledge', 'add', 3), mod('magicPower', 'add', 3)] },
  // TEXT_ONLY_NOTE: "в течение дня" — суточный баф, не "пока надет"; modifiers
  // применялись бы постоянно, пока экипировано, что исказило бы правило.
  { name: 'Брелок смелости', bonus: 'Дает 1 ед. Боевого духа и удачи в течение дня', modifiers: [] },
  { name: 'Ожерелье Божественной благодати', bonus: '+3 ко всем характеристикам', modifiers: allStats('add', 3) },
  // TEXT_ONLY_NOTE: бьёт по противнику, а не по владельцу — modifiers
  // применяются только на актёра-владельца артефакта (transfer:true).
  { name: 'Кулон разорения', bonus: '-2 ед. Боевого духа противника (на начало боя)', modifiers: [] },
  { name: 'Руны неизбежности', bonus: '-1 ед. удачи у противника (на начало боя). Перебросьте любой бросок противника по вашему выбору', modifiers: [] },
  // TEXT_ONLY_NOTE: реген по факту нанесения урона — процедурный триггер, не статический бонус.
  { name: 'Кулон вампира', bonus: 'Восстанавливает 1 ед. здоровья за каждый факт нанесения урона', modifiers: [] },
];

// --- Волшебная одежда, стр. 50 — 10 записей (2-11), без колонки "Тип" ---
const MAGIC_CLOTHING = [
  { name: 'Колпак мастера-гремлина', bonus: '+1 к Силе магии', modifiers: [mod('magicPower', 'add', 1)] },
  { name: 'Корона верховного мага', bonus: '+4 к Знанию', modifiers: [mod('knowledge', 'add', 4)] },
  { name: 'Корона из зубов дракона', bonus: '+4 к Знанию и силе магии', modifiers: [mod('knowledge', 'add', 4), mod('magicPower', 'add', 4)] },
  // TEXT_ONLY_NOTE: длительность заклинаний — нет такого поля.
  { name: 'Магическая накидка', bonus: 'Увеличивает продолжительность действия заклятий героя на 3 хода', modifiers: [] },
  { name: 'Сандалии святого', bonus: '+2 ко всем характеристикам', modifiers: allStats('add', 2) },
  { name: 'Накидка скорости', bonus: 'Увеличивают скорость Героя на 1', modifiers: [mod('speed', 'add', 1)] },
  { name: 'Магические доспехи', bonus: '+1 ко всем характеристикам', modifiers: allStats('add', 1) },
  { name: 'Сапоги-скороходы', bonus: 'Увеличивают скорость Героя на 2', modifiers: [mod('speed', 'add', 2)] },
  // TEXT_ONLY_NOTE: реген по факту нанесения урона — процедурный триггер.
  { name: 'Мантия вампира', bonus: 'Восстанавливает 1 ед. здоровья за каждый факт нанесения урона', modifiers: [] },
  // TEXT_ONLY_NOTE: выдача всех заклинаний 5 уровня + способ каста — механизма нет.
  { name: 'Шляпа волшебника', bonus: 'Дает герою все заклинания 5-го уровня. Все заклинания произносятся силой мысли', modifiers: [] },
];

// --- Волшебные предметы, стр. 51 — 10 записей (2-11), без колонки "Тип" ---
const MAGIC_ITEMS = [
  { name: 'Неподвижный глаз дракона', bonus: '+1 к Атаке и защите', modifiers: [mod('attack', 'add', 1), mod('defense', 'add', 1)] },
  // TEXT_ONLY_NOTE: "в течение дня" — см. Брелок смелости выше.
  { name: 'Застывший глаз дракона', bonus: 'Дает 1 ед. Боевого духа и удачи в течение дня', modifiers: [] },
  { name: 'Кольцо жизни', bonus: 'Увеличивает показатель здоровья на 3', modifiers: [mod('health.max', 'add', 3)] },
  { name: 'Клевер удачи', bonus: 'Дает 1 ед. к удаче в течение дня', modifiers: [] },
  { name: 'Кольцо странника', bonus: 'Увеличивают скорость Героя на 1', modifiers: [mod('speed', 'add', 1)] },
  // TEXT_ONLY_NOTE: суточный d6-реген, не флэт-бонус "пока надето".
  { name: 'Амулет Маны', bonus: 'Восстанавливает d6 очка Маны в день', modifiers: [] },
  // TEXT_ONLY_NOTE: снимает удачу с ОБОИХ участников боя — не бонус владельцу.
  { name: 'Песочные часы недоброго часа', bonus: 'Отнимает у героя и его противника на поле боя все бонусы удачи', modifiers: [] },
  // TEXT_ONLY_NOTE: бьёт по противнику, не по владельцу.
  { name: 'Кольцо подавления', bonus: '-1 к Боевому духу противника', modifiers: [] },
  // TEXT_ONLY_NOTE: ежедневный доход золота — нет системы учёта дохода.
  { name: 'Неиссякаемая мошна золота', bonus: 'Ежедневно приносит 50 золотых', modifiers: [] },
  { name: 'Знак отваги', bonus: 'Дает 2 ед. Боевого духа в течение дня', modifiers: [] },
];

function mod(stat, mode, value) {
  return { stat, mode, value };
}

function allStats(mode, value) {
  return ['attack', 'defense', 'magicPower', 'knowledge'].map((stat) => mod(stat, mode, value));
}

const ICONS = {
  enchantedWeapon: 'icons/svg/sword.svg',
  enchantedShield: 'icons/svg/shield.svg',
  // No dedicated art for the other four types (nothing fitting in core
  // Foundry's icon set either — checked) — the same generic fallback
  // Foundry itself uses for an unknown item.
  enchantedArmor: 'icons/svg/item-bag.svg',
  necklace: 'icons/svg/item-bag.svg',
  magicClothing: 'icons/svg/item-bag.svg',
  magicItem: 'icons/svg/item-bag.svg',
};

const GROUPS = [
  { artifactType: 'enchantedWeapon', entries: ENCHANTED_WEAPONS },
  { artifactType: 'enchantedArmor', entries: ENCHANTED_ARMOR },
  { artifactType: 'enchantedShield', entries: ENCHANTED_SHIELDS },
  { artifactType: 'necklace', entries: NECKLACES },
  { artifactType: 'magicClothing', entries: MAGIC_CLOTHING },
  { artifactType: 'magicItem', entries: MAGIC_ITEMS },
];

/**
 * @returns {object[]} finished compendium Item documents, grouped by book
 *   type in book order (Зачарованное оружие -> ... -> Волшебные предметы),
 *   within each group in 2d6 order.
 */
export function buildArtifactDocuments() {
  const documents = [];
  let index = 0;
  for (const { artifactType, entries } of GROUPS) {
    for (const entry of entries) {
      const isWeapon = artifactType === 'enchantedWeapon';
      documents.push(buildItemDocument({
        name: entry.name,
        type: 'artifact',
        img: ICONS[artifactType],
        system: {
          artifactType,
          bonus: entry.bonus,
          level: entry.level ?? null,
          equipped: false,
          paperdollSlot: null,
          targetSlots: isWeapon ? [entry.weaponType === 'ranged' ? 16 : 1] : [],
          modifiers: entry.modifiers,
          weaponType: isWeapon ? entry.weaponType : '',
          damage: isWeapon ? entry.damage : null,
          twoHanded: isWeapon ? entry.twoHanded : false,
          epicTable: Array(6).fill(''),
        },
        index,
      }));
      index += 1;
    }
  }
  return documents;
}
