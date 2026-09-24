/**
 * §9: which page(s) of the «Способности существ» journal (book pp. 113–116)
 * a creature's special-skill tag refers to. Pure — no Foundry globals; the
 * creature sheet supplies the journal's page names and turns the result
 * into links.
 */

/**
 * Tag and page name reduced to the part that names the ability: bracketed
 * details, dice, numbers and thresholds dropped («Регенерация 2d6»,
 * «Яд 4+ (3d6 урона ядом)», «Вампиризм 50%» → «регенерация», «яд»,
 * «вампиризм»); case and ё ignored.
 * @param {string} text
 * @returns {string}
 */
export function normalizeAbilityName(text) {
  return String(text ?? '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter((word) => word && !/\d/.test(word) && !/^[%+.,]+$/.test(word))
    .join(' ')
    .replace(/[.,:;]+$/, '');
}

/**
 * Tags the book words differently from the ability's page name, keyed by
 * normalized tag. A tag naming two abilities links to both.
 */
export const ABILITY_TAG_ALIASES = {
  'летает': ['Полёт'],
  'большой': ['Большое существо'],
  'атакует магией': ['Атака магией'],
  'атакует всех вокруг': ['Атака всех вокруг'],
  'атакуют всех вокруг': ['Атака всех вокруг'],
  'возрождаются': ['Возрождение'],
  'проклятье': ['Проклятие'],
  'проклятье выстрел': ['Проклятие'],
  'меткий выстрел': ['Меткий'],
  'иммунитет к ослеплению и окаменению': ['Иммунитет к ослеплению', 'Иммунитет к окаменению'],
  'иммунитет к молниям и армагеддону': ['Иммунитет к молнии', 'Иммунитет к Армагеддону'],
};

/**
 * Journal page names a tag links to — empty when the book has no article
 * for it (the tag then stays plain text).
 * @param {string} tag
 * @param {string[]} pageNames  names of the journal's pages
 * @returns {string[]}
 */
export function resolveTagAbilities(tag, pageNames) {
  const key = normalizeAbilityName(tag);
  if (!key) return [];
  const alias = ABILITY_TAG_ALIASES[key];
  if (alias) return alias.filter((name) => pageNames.includes(name));
  const match = pageNames.find((name) => normalizeAbilityName(name) === key);
  return match ? [match] : [];
}

/**
 * §11 «Дикая мораль»: the extra-turn test's d6 threshold a creature's
 * statblock tag gives — «Дикая Мораль 6» → 6, «Дикая Мораль 5+» → 5;
 * `null` without such a tag (the ordinary 4+).
 * @param {string[]} specialSkills
 * @returns {number|null}
 */
export function wildMoraleThreshold(specialSkills) {
  for (const tag of specialSkills ?? []) {
    const match = /^дикая мораль\s+([1-6])\+?$/i.exec(String(tag).trim());
    if (match) return Number(match[1]);
  }
  return null;
}
