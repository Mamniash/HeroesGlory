export const HEROES_GLORY = {};

/**
 * The 12 playable races (rules.md §2.3).
 * @type {Object}
 */
HEROES_GLORY.races = {
  human: 'HEROES_GLORY.Race.Human',
  gnome: 'HEROES_GLORY.Race.Gnome',
  elf: 'HEROES_GLORY.Race.Elf',
  goblin: 'HEROES_GLORY.Race.Goblin',
  vampire: 'HEROES_GLORY.Race.Vampire',
  troglodyte: 'HEROES_GLORY.Race.Troglodyte',
  gnoll: 'HEROES_GLORY.Race.Gnoll',
  demon: 'HEROES_GLORY.Race.Demon',
  djinn: 'HEROES_GLORY.Race.Djinn',
  minotaur: 'HEROES_GLORY.Race.Minotaur',
  elemental: 'HEROES_GLORY.Race.Elemental',
  saurian: 'HEROES_GLORY.Race.Saurian',
};

/**
 * The 10 factions (rules.md §2.4).
 * @type {Object}
 */
HEROES_GLORY.factions = {
  castle: 'HEROES_GLORY.Faction.Castle',
  stronghold: 'HEROES_GLORY.Faction.Stronghold',
  tower: 'HEROES_GLORY.Faction.Tower',
  fortress: 'HEROES_GLORY.Faction.Fortress',
  dungeon: 'HEROES_GLORY.Faction.Dungeon',
  inferno: 'HEROES_GLORY.Faction.Inferno',
  necropolis: 'HEROES_GLORY.Faction.Necropolis',
  citadel: 'HEROES_GLORY.Faction.Citadel',
  nexus: 'HEROES_GLORY.Faction.Nexus',
  haven: 'HEROES_GLORY.Faction.Haven',
};

/**
 * The 20 classes, one Warrior and one Mage per faction (rules.md §2.5).
 * @type {Object}
 */
HEROES_GLORY.classes = {
  knight: 'HEROES_GLORY.Class.Knight',               // Замок / Воин — Рыцарь
  cleric: 'HEROES_GLORY.Class.Cleric',                // Замок / Волшебник — Клирик
  ranger: 'HEROES_GLORY.Class.Ranger',                // Оплот / Воин — Следопыт
  druid: 'HEROES_GLORY.Class.Druid',                  // Оплот / Волшебник — Друид
  alchemist: 'HEROES_GLORY.Class.Alchemist',          // Башня / Воин — Алхимик
  mage: 'HEROES_GLORY.Class.Mage',                    // Башня / Волшебник — Маг
  beastmaster: 'HEROES_GLORY.Class.Beastmaster',      // Крепость / Воин — Зверолов
  witch: 'HEROES_GLORY.Class.Witch',                  // Крепость / Волшебник — Ведьма
  lord: 'HEROES_GLORY.Class.Lord',                    // Темница / Воин — Лорд
  warlock: 'HEROES_GLORY.Class.Warlock',              // Темница / Волшебник — Чернокнижник
  possessed: 'HEROES_GLORY.Class.Possessed',          // Инферно / Воин — Одержимый
  heretic: 'HEROES_GLORY.Class.Heretic',              // Инферно / Волшебник — Еретик
  deathKnight: 'HEROES_GLORY.Class.DeathKnight',      // Некрополис / Воин — Рыцарь Смерти
  necromancer: 'HEROES_GLORY.Class.Necromancer',      // Некрополис / Волшебник — Некромант
  barbarian: 'HEROES_GLORY.Class.Barbarian',          // Цитадель / Воин — Варвар
  battlemage: 'HEROES_GLORY.Class.Battlemage',        // Цитадель / Волшебник — Боевой маг
  wanderer: 'HEROES_GLORY.Class.Wanderer',            // Сопряжение / Воин — Странник
  elementalist: 'HEROES_GLORY.Class.Elementalist',    // Сопряжение / Волшебник — Элементалист
  captain: 'HEROES_GLORY.Class.Captain',              // Причал / Воин — Капитан
  navigator: 'HEROES_GLORY.Class.Navigator',          // Причал / Волшебник — Навигатор
};

/**
 * The 5 schools of magic (rules.md §6.2): the 4 elements plus
 * "Универсальные" (str. 62 — spells not tied to an element, e.g.
 * Волшебная Стрела and Призыв Элементаля).
 * @type {Object}
 */
HEROES_GLORY.schools = {
  earth: 'HEROES_GLORY.School.Earth',
  air: 'HEROES_GLORY.School.Air',
  water: 'HEROES_GLORY.School.Water',
  fire: 'HEROES_GLORY.School.Fire',
  universal: 'HEROES_GLORY.School.Universal',
};

/**
 * The 5 weapon types (rules.md §8.1).
 * @type {Object}
 */
HEROES_GLORY.weaponTypes = {
  piercing: 'HEROES_GLORY.WeaponType.Piercing',                   // Колющий
  slashing: 'HEROES_GLORY.WeaponType.Slashing',                   // Рубящий
  bludgeoning: 'HEROES_GLORY.WeaponType.Bludgeoning',             // Дробящий
  piercingSlashing: 'HEROES_GLORY.WeaponType.PiercingSlashing',   // Колющий/рубящий
  ranged: 'HEROES_GLORY.WeaponType.Ranged',                       // Стрелковое
};

/**
 * The 6 artifact types (rules.md §8.2).
 * @type {Object}
 */
HEROES_GLORY.artifactTypes = {
  enchantedWeapon: 'HEROES_GLORY.ArtifactType.EnchantedWeapon',
  enchantedArmor: 'HEROES_GLORY.ArtifactType.EnchantedArmor',
  enchantedShield: 'HEROES_GLORY.ArtifactType.EnchantedShield',
  necklace: 'HEROES_GLORY.ArtifactType.Necklace',
  magicClothing: 'HEROES_GLORY.ArtifactType.MagicClothing',
  magicItem: 'HEROES_GLORY.ArtifactType.MagicItem',
};

/**
 * Human-readable names for the hero sheet's 19 paperdoll positions
 * (rules.md §8.2) — used by the artifact sheet's `targetSlots` picker, so
 * a GM curating an artifact sees "Торс" rather than a bare "5".
 * @type {Object}
 */
HEROES_GLORY.paperdollSlotLabels = {
  1: 'HEROES_GLORY.PaperdollSlot.1',
  2: 'HEROES_GLORY.PaperdollSlot.2',
  3: 'HEROES_GLORY.PaperdollSlot.3',
  4: 'HEROES_GLORY.PaperdollSlot.4',
  5: 'HEROES_GLORY.PaperdollSlot.5',
  6: 'HEROES_GLORY.PaperdollSlot.6',
  7: 'HEROES_GLORY.PaperdollSlot.7',
  8: 'HEROES_GLORY.PaperdollSlot.8',
  9: 'HEROES_GLORY.PaperdollSlot.9',
  10: 'HEROES_GLORY.PaperdollSlot.10',
  11: 'HEROES_GLORY.PaperdollSlot.11',
  12: 'HEROES_GLORY.PaperdollSlot.12',
  13: 'HEROES_GLORY.PaperdollSlot.13',
  14: 'HEROES_GLORY.PaperdollSlot.14',
  15: 'HEROES_GLORY.PaperdollSlot.15',
  16: 'HEROES_GLORY.PaperdollSlot.16',
  17: 'HEROES_GLORY.PaperdollSlot.17',
  18: 'HEROES_GLORY.PaperdollSlot.18',
  19: 'HEROES_GLORY.PaperdollSlot.19',
};

/**
 * The 4 vision types (rules.md §2.2).
 * @type {Object}
 */
HEROES_GLORY.visionTypes = {
  normal: 'HEROES_GLORY.Vision.Normal',
  darkvision: 'HEROES_GLORY.Vision.Darkvision',     // в темноте
  nightvision: 'HEROES_GLORY.Vision.Nightvision',   // ночное
  blindsense: 'HEROES_GLORY.Vision.Blindsense',     // слеповидение
};

/**
 * The 21 secondary skills (rules.md §3, d20 table). Row 20 of the table
 * ("Лечение / Некромантия") lists two distinct skills under one roll
 * result, split here into `healing` and `necromancy` since a hero owns
 * only one of the two (confirmed by §2.6, where the Necromancer and
 * Death Knight's starting secondary skill is specifically "Некромантия").
 * @type {Object}
 */
HEROES_GLORY.secondarySkills = {
  assault: 'HEROES_GLORY.SecondarySkill.Assault',             // 1 Нападение
  armor: 'HEROES_GLORY.SecondarySkill.Armor',                 // 2 Доспехи
  archery: 'HEROES_GLORY.SecondarySkill.Archery',             // 3 Стрельба
  tactics: 'HEROES_GLORY.SecondarySkill.Tactics',             // 4 Тактика
  interference: 'HEROES_GLORY.SecondarySkill.Interference',   // 5 Помехи
  leadership: 'HEROES_GLORY.SecondarySkill.Leadership',       // 6 Лидерство
  luck: 'HEROES_GLORY.SecondarySkill.Luck',                   // 7 Удача
  pathfinding: 'HEROES_GLORY.SecondarySkill.Pathfinding',     // 8 Поиск пути
  airMagic: 'HEROES_GLORY.SecondarySkill.AirMagic',           // 9 Магия Воздуха
  earthMagic: 'HEROES_GLORY.SecondarySkill.EarthMagic',       // 10 Магия Земли
  waterMagic: 'HEROES_GLORY.SecondarySkill.WaterMagic',       // 11 Магия Воды
  fireMagic: 'HEROES_GLORY.SecondarySkill.FireMagic',         // 12 Магия Огня
  wisdom: 'HEROES_GLORY.SecondarySkill.Wisdom',               // 13 Мудрость
  intellect: 'HEROES_GLORY.SecondarySkill.Intellect',         // 14 Интеллект
  mysticism: 'HEROES_GLORY.SecondarySkill.Mysticism',         // 15 Мистицизм
  sorcery: 'HEROES_GLORY.SecondarySkill.Sorcery',             // 16 Волшебство
  diplomacy: 'HEROES_GLORY.SecondarySkill.Diplomacy',         // 17 Дипломатия
  scouting: 'HEROES_GLORY.SecondarySkill.Scouting',           // 18 Разведка
  aptitude: 'HEROES_GLORY.SecondarySkill.Aptitude',           // 19 Обучаемость
  healing: 'HEROES_GLORY.SecondarySkill.Healing',             // 20а Лечение
  necromancy: 'HEROES_GLORY.SecondarySkill.Necromancy',       // 20б Некромантия
};

/**
 * The 3 tiers a secondary skill can be trained to (rules.md §3).
 * @type {Object}
 */
HEROES_GLORY.skillTiers = {
  base: 'HEROES_GLORY.SkillTier.Base',
  advanced: 'HEROES_GLORY.SkillTier.Advanced',
  expert: 'HEROES_GLORY.SkillTier.Expert',
};

/**
 * Stats an artifact's structured modifiers (rules.md §8.2) can target.
 * Keys match `Actor#system` field paths one-to-one, so a modifier's `key`
 * for the underlying ActiveEffect change is just `system.${stat}`.
 * @type {Object}
 */
HEROES_GLORY.artifactModifierStats = {
  attack: 'HEROES_GLORY.Hero.Attack',
  defense: 'HEROES_GLORY.Hero.Defense',
  magicPower: 'HEROES_GLORY.Hero.MagicPower',
  knowledge: 'HEROES_GLORY.Hero.Knowledge',
  speed: 'HEROES_GLORY.Hero.Speed',
  luck: 'HEROES_GLORY.Hero.Luck',
  morale: 'HEROES_GLORY.Hero.Morale',
  'health.max': 'HEROES_GLORY.Hero.Health',
  'mana.max': 'HEROES_GLORY.Hero.Mana',
};

/**
 * The non-"custom" ActiveEffect change types (CONST.ACTIVE_EFFECT_CHANGE_TYPES
 * in v14), offered as an artifact modifier's `mode`. "custom" is excluded —
 * it requires bespoke handler code we don't have.
 * @type {Object}
 */
HEROES_GLORY.artifactModifierModes = {
  add: 'HEROES_GLORY.ArtifactModifier.ModeAdd',
  subtract: 'HEROES_GLORY.ArtifactModifier.ModeSubtract',
  multiply: 'HEROES_GLORY.ArtifactModifier.ModeMultiply',
  downgrade: 'HEROES_GLORY.ArtifactModifier.ModeDowngrade',
  upgrade: 'HEROES_GLORY.ArtifactModifier.ModeUpgrade',
  override: 'HEROES_GLORY.ArtifactModifier.ModeOverride',
};

/**
 * The 10 hero-sheet panel color variants (assets/ui/heroscr4_<color>.png).
 * Purely cosmetic — selects a background image, no mechanical effect.
 * @type {Object}
 */
HEROES_GLORY.panelColors = {
  red: 'HEROES_GLORY.PanelColor.Red',
  blue: 'HEROES_GLORY.PanelColor.Blue',
  tan: 'HEROES_GLORY.PanelColor.Tan',
  green: 'HEROES_GLORY.PanelColor.Green',
  orange: 'HEROES_GLORY.PanelColor.Orange',
  purple: 'HEROES_GLORY.PanelColor.Purple',
  teal: 'HEROES_GLORY.PanelColor.Teal',
  pink: 'HEROES_GLORY.PanelColor.Pink',
  black: 'HEROES_GLORY.PanelColor.Black',
  white: 'HEROES_GLORY.PanelColor.White',
};

/**
 * How many of the hero sheet's secondary-skill slots are shown — the
 * base 8-skill limit (rules.md §3). Not a schema `choices` map since it's
 * a single number, not an enum; kept here (rather than inline in the
 * sheet/template) so a future "expert Обучаемость -> 10 slots" change has
 * one obvious place to become conditional instead of a hardcoded literal.
 * @type {number}
 */
HEROES_GLORY.secondarySkillSlotCount = 8;

/**
 * IDs for the 3 combat states (rules.md §5.6/§5.9) registered into
 * `CONFIG.statusEffects` in heroes-glory.mjs's init hook — namespaced
 * (`hg` prefix) so pushing them can't collide with/shadow any of core's
 * own built-in status entries of the same conceptual name (e.g. core
 * already has its own "prone"/"unconscious" ids with different English
 * labels we don't want to inherit or fight over).
 * @type {Object}
 */
HEROES_GLORY.statusEffects = {
  prone: 'hgProne',
  unconscious: 'hgUnconscious',
  incapacitated: 'hgIncapacitated',
};
