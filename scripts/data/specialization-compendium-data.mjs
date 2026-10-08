/**
 * Источник данных для компендиума специализаций — книга, стр. 23 (страница
 * PDF 24), таблица «Специализации»: 12 штук, 7 по навыкам и 5 по
 * заклинаниям (rules.md §4.3). Здесь — только текст книги: это единственное
 * его место в репозитории (раньше он лежал в lang/ru.json,
 * HEROES_GLORY.Specialization.*). Всё остальное берётся из своих мест при
 * сборке (rules.md §4.3, таблица источников):
 *  - список, ключи, иконка — module/helpers/specializations.mjs
 *    (иконка через skill-icons.mjs);
 *  - название — у навыка подпись навыка из lang/ru.json
 *    (HEROES_GLORY.SecondarySkill.*), у заклинания сам ключ — название
 *    заклинания по книге (`specializationLabel`).
 *
 * Две опечатки книги исправлены при переносе (сверено с картинкой страницы):
 *  - Интеллект: в книге «Ваша максимальное значение Маны» — «Ваше».
 *  - Цепная Молния: в книге «а неполовину» — «а не половину».
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildItemDocument, ROOT } from '../lib/pack-builder.mjs';
import {
  SPECIALIZATION_SPELL_ICON_FRAMES, specializationList, specializationLabel,
} from '../../module/helpers/specializations.mjs';
import { specializationIconPath } from '../../module/helpers/skill-icons.mjs';

/** Текст книги по ключу специализации. */
export const SPECIALIZATION_TEXTS = {
  assault: 'Вы получаете дополнительную атаку в раунд с оружием ближнего боя',
  archery: 'Вы получаете дополнительную атаку в раунд с оружием дальнего боя',
  armor: 'Вы получаете 1/2 урона от всех физических атак',
  sorcery: 'Когда вы произносите заклинание, наносящее урон, вы добавляете к урону 1d6 за уровень заклинания',
  intellect: 'Ваше максимальное значение Маны увеличивается на 50',
  necromancy: 'Одна воскрешённая нежить остаётся после боя в вашем служении, пока не будет уничтожена',
  healing: 'Вы лечите дополнительно 1d6 единиц здоровья, воздействуете на три цели одновременно, и снимаете с целей все отрицательные эффекты, будто при применении заклинания «Лечение»',
  'Цепная Молния': 'Урон увеличивается на 1d6, дополнительные цели заклинания получают полный урон, а не половину, и вы выбираете две дополнительные цели для этого заклинания',
  'Воскрешение': 'Воскрешённый персонаж не получает ранение. Кроме того, Воскрешение стоит на 4 Маны меньше',
  'Ускорение': 'Ускоренные персонажи получают ещё +3 к Скорости',
  'Стена Огня': 'Урон увеличен на 5d6, добавляет одну дополнительную клетку со Стеной Огня',
  'Клон': 'Вы создаёте двух клонов вместо одного, если потратите вдвое больше Маны при использовании заклинания',
};

/**
 * A lang/ru.json lookup by dotted key — the build has no `game.i18n`.
 * @returns {(key: string) => string}
 */
function langLookup() {
  const lang = JSON.parse(fs.readFileSync(path.join(ROOT, 'lang', 'ru.json'), 'utf8'));
  return (key) => {
    const value = key.split('.').reduce((node, part) => node?.[part], lang);
    if (typeof value !== 'string') throw new Error(`lang/ru.json: нет строки ${key}`);
    return value;
  };
}

/**
 * @returns {object[]} finished compendium Item documents, book order (p. 23).
 */
export function buildSpecializationDocuments() {
  const localize = langLookup();
  return specializationList().map((spec, index) => buildItemDocument({
    name: specializationLabel(spec, localize),
    type: 'specialization',
    img: specializationIconPath(spec, SPECIALIZATION_SPELL_ICON_FRAMES, { large: true }),
    system: { key: spec.key, description: SPECIALIZATION_TEXTS[spec.key] },
    index,
    // Id by key, not by name: a name follows lang/, the key doesn't change.
    seed: `specialization:${spec.key}`,
  }));
}
