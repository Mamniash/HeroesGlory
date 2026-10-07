# Иконки обычного оружия

Тайлы 32×32 из набора **Dungeon Crawl Stone Soup** — «Dungeon Crawl 32x32 tiles»:
https://opengameart.org/content/dungeon-crawl-32x32-tiles
(архив «Dungeon Crawl Stone Soup Full», папки `item/weapon`, `item/weapon/ranged`,
`item/weapon/artefact`).

Лицензия — **CC0** (общественное достояние, «No Copyright»): можно использовать и менять
без указания автора. Файлы лежат без изменений, под исходными именами.

Какое оружие какой файл получает — `WEAPON_ICONS` в
`scripts/data/weapon-compendium-data.mjs`.

Стартовое оружие, которое выдаётся при создании героя (`STARTING_WEAPON_IMG`,
`module/helpers/hero-creation-flow.mjs`), — из того же набора: `dagger_new.png` — «Оружие
волшебника», `short_sword_2_old.png` — «Оружие воина», `longbow_1.png` и `knife.png` — дальнее
и ближнее оружие стрелка.

## colt_peacemaker.png — Пистоль

Из набора **CC0 Firearm Icons** (32×32, файл `32x32/pistol/colt_peacemaker.png` архива
`firearm-ocal.zip`): https://opengameart.org/content/cc0-firearm-icons
Исходный рисунок — OpenClipart, https://openclipart.org/detail/133459 .
Лицензия — **CC0**. Файл без изменений.

## Иконки Скорости и Зрения — `assets/game-icons/`

Не оружие, но записаны здесь же, рядом с остальными сторонними иконками. Источник —
**game-icons.net** (https://game-icons.net), лицензия **CC BY 3.0**
(https://creativecommons.org/licenses/by/3.0/): использовать можно, указывая автора.

Авторы: **Lorc** (https://lorcblog.blogspot.com) — `lorc-*.svg`; **Delapouite**
(https://delapouite.com) — `delapouite-*.svg`; **Skoll** — `skoll-*.svg`. Имя файла — автор и
имя иконки на сайте (`lorc-moon.svg` — https://game-icons.net/1x1/lorc/moon.html).

Изменения: убран чёрный квадрат фона, заливка — золотой градиент листа, чёрная обводка, поля
по краю (viewBox). Какая иконка где — `SPEED_ICON` и `VISION_ICONS` в
`module/helpers/skill-icons.mjs`; остальные файлы папки — запасные кандидаты.
