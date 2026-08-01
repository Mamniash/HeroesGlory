@AGENTS.md

## Дополнительно для Claude Code

Правила игры: @docs/rules.md

### Команды
- `npm run build` — сборка SCSS в watch-режиме
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