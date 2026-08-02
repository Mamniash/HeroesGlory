@AGENTS.md

## Дополнительно для Claude Code

Правила игры: @docs/rules.md

### Команды
- `npm run build` — сборка SCSS в watch-режиме
- `npm test` — юнит-тесты чистой логики бросков (module/helpers/rolls.mjs), без Foundry
- система должна лежать в Data/systems/heroes-glory (симлинк)

### Проверка перед коммитом
- нет вызовов ActorSheet / template.json / actor.data
- все подписи через lang/, не хардкодом

### Foundry VTT v14 установлен локально
Исходник ядра: `D:\Foundry Virtual Tabletop\resources\app\public\scripts\foundry.mjs`
(это и есть тот самый `foundry.mjs`, на который указывают стектрейсы; папки
`dist` под `resources\app` не существует — не искать там).

При ошибках со стектрейсом в `foundry.mjs` — читать исходник по номеру строки
(grep по имени свойства/метода, затем Read вокруг найденной строки), не гадать
и не искать объяснение в интернете.

### Грабли, на которые уже наступали (Foundry VTT v14)

- **`static PARTS` не наследуется по цепочке классов**, в отличие от
  `DEFAULT_OPTIONS` (тот мержится). Каждый ItemSheetV2/ActorSheetV2-наследник
  должен объявлять свой `PARTS` целиком (header + body), а не полагаться на
  header из базового класса.
- **`data-edit` должен висеть на самом `<img>`**, не на обёртке (`<button>`
  вокруг него). `FormDataExtended#processEditableHTML` берёт
  `querySelectorAll("[data-edit]")` и если элемент — не `IMG`, отправляет в
  форму его `innerHTML`, а не `src`. Если `data-edit="img"` на `<button>`,
  в поле `img` уходит HTML-разметка кнопки → провал валидации
  («does not have a valid file extension») на каждом `submitOnChange`.
  `data-action` при этом можно вешать на любой элемент, не только
  button/a — диспетчер ищет через `target.closest("[data-action]")`.
- **Пустой оверрайд `prepareBaseData()`/`prepareDerivedData()` без вызова
  `super()` — не безобидная заглушка, а баг.** `Actor.prototype.
  prepareBaseData()` вызывает `this._clearData()`, которая на каждом цикле
  сбрасывает `tokenActiveEffectChanges`/`overrides`/`statuses`. Пропустишь
  `super()` — `tokenActiveEffectChanges` останется `undefined`, и
  `applyActiveEffects("initial")` упадёт при попытке в него записать. Если
  оверрайд ничего своего не делает — не создавать его вообще, а не оставлять
  пустым «на будущее».
- **У Active Effects в v14 есть фазы `initial`/`final`**
  (`Actor#applyActiveEffects(phase)`, вызывается дважды: `"initial"` —
  до `prepareDerivedData`, `"final"` — после). У каждого change обязательно
  явное поле `phase` — без совпадения с текущей фазой change просто не
  применится ни в одной из них, дефолта «применять всегда» нет. Модификатор
  на поле, которое мы сами пересчитываем в `prepareDerivedData` (например
  `mana.max`), должен идти в фазу `"final"`, иначе наш же расчёт его затрёт.
- **Форма change у ActiveEffect другая**: поле называется `type` (строка:
  `"add"`, `"multiply"`, …), не `mode` — `CONST.ACTIVE_EFFECT_MODES`
  (числовой) в v14 deprecated в пользу `CONST.ACTIVE_EFFECT_CHANGE_TYPES`.
  И сам список изменений живёт в `system.changes`, не в `changes` верхнего
  уровня (ActiveEffect теперь на TypeDataModel, schemaVersion 14.353).
- **Регистрация листов переехала**: `Items.registerSheet`/`Actors.
  registerSheet` и голые `ItemSheet`/`ActorSheet` — legacy. Теперь
  `foundry.applications.apps.DocumentSheetConfig.registerSheet(Item, "id",
  SheetClass, {types, makeDefault, label})`, а для снятия core-листа —
  `foundry.appv1.sheets.ItemSheet`/`ActorSheet`.
- **`loadTemplates`/`renderTemplate`/`getTemplate` — не глобалы**, а
  `foundry.applications.handlebars.*`.
- **`DialogV2.confirm`** — `foundry.applications.api.DialogV2.confirm({window:
  {title}, content})`, возвращает `true`/`false`.