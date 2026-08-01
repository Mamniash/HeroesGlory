# Heroes & Glory — Foundry VTT system

Foundry VTT v13 (планируется v14). Русскоязычный проект.
Правила игры — docs/rules.md. Ничего не додумывать, только по книге.

## Запрещено
- template.json, ActorSheet, ItemSheet, actor.data — устаревший API
- хелперы select, colorPicker — удалены в v14
- придумывать механику, которой нет в docs/rules.md

## Использовать
- DataModel, типы документов через documentTypes в system.json
- HandlebarsApplicationMixin(ActorSheetV2 / ItemSheetV2)
- actor.system для доступа к данным
- все подписи через lang/, не хардкодом