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
