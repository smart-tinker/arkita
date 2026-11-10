# Аудит evidence: исторические группы 40, 42 и 43

Дата среза: 2026-11-10. Проверяемая база: public main SHA f648a7570ea29fea4ea5a4166e0c741d68191886; публичный source-import был частью merged PR #1.

## Метод и статус

Старые previous_inventory и блоки «Факт по коду» в editor.md / advanced.md — снимок прежнего дерева. Они не описывают нынешний код: текущие model-analysis-ui.js, model-graph.js, context-hints-ui.js, minimap.js, where-used-ui.js и model-gallery.js уже реализуют функции, которые старый текст называл отсутствующими. Источники и historical inventory не переписывались.

current_status всех 48 критериев остаётся acceptance-pending. Ниже для каждого указаны текущий маршрут и остаток. Наличие модуля или теста не считается приёмкой.

- [Extended CI #42801101567](https://github.com/smart-tinker/arkita/actions/runs/42801101567) проверил точный SHA `f648a7570ea29fea4ea5a4166e0c741d68191886`. Ubuntu: полный набор и syntax-check завершились PASS, 2,393 PASS / 0 FAIL / 8 SKIP. Windows: 2,397 PASS / 0 assertion failures / 1 timeout / 3 SKIP; `npm test` завершился FAIL только на `maximum native file inventories use bounded pages and a full disjoint update bounds file reads while measuring metadata cost` (`electron/test/directory-update.test.mjs:218`): `testTimeoutFailure` при лимите 900,000 ms, фактические 908,714.6 ms. В Electron-группе 291 PASS / 0 assertion failures / 1 cancelled / 3 SKIP; остальные группы прошли. Windows syntax-check после этого был skipped. Это capacity timeout, не доказательство дефекта приложения; сам сценарий остаётся UNVERIFIED.
- Обычный CI и browser smoke на этом main прошли в run #42764693605. Browser smoke покрывает ограниченный renderer-сценарий.
- JSDOM и CI не заменяют native-проверки установленного Windows-пакета для fullscreen, системных путей, DPI и реальных окон.
- Ни один критерий не добавлен в `closed_criteria`. Extended CI даёт агрегатный автоматический результат; он не привязан здесь к каждой отдельной assertion и не заменяет применимые Windows/native acceptance checks.

Групповое evidence:
- Метаданные: [`metadata-ui.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/metadata-ui.js), [`object-properties.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/object-properties.js), [`documentation-editor.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/documentation-editor.js), [`metadata.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-core/src/metadata.js), [`format.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-core/src/format.js); тесты [`metadata-app.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/metadata-app.test.js), [`object-properties-app.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/object-properties-app.test.js), [`documentation-editor.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/documentation-editor.test.js), [`documentation-markdown-app.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/documentation-markdown-app.test.js), [`native-v4.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-core/test/native-v4.test.js), [`customization.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-io/test/customization.test.js).
- Пространство и настройки: [`workspace-ui.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/workspace-ui.js), [`preferences-ui.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/preferences-ui.js), [`preferences.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/preferences.js); тесты [`workspace-ui.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/workspace-ui.test.js), [`workspace-app.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/workspace-app.test.js), [`preferences.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/preferences.test.js), [`preferences-effects-app.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/preferences-effects-app.test.js).
- Анализ: [`model-graph.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-core/src/model-graph.js), [`model-analysis-ui.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/model-analysis-ui.js), [`model-analysis-graph.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/model-analysis-graph.js); тесты [`model-graph.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-core/test/model-graph.test.js) и [`model-analysis-app.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/model-analysis-app.test.js).
- Контекст, mini-map, использование и галерея: [`context-hints-ui.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/context-hints-ui.js), [`minimap.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/minimap.js), [`concept-usages.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/concept-usages.js), [`where-used-ui.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/where-used-ui.js), [`model-gallery.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/src/model-gallery.js); тесты [`context-hints-app.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/context-hints-app.test.js), [`minimap-app.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/minimap-app.test.js), [`where-used-app.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/where-used-app.test.js), [`reference-gallery-app.test.js`](https://github.com/smart-tinker/arkita/blob/f648a7570ea29fea4ea5a4166e0c741d68191886/schemka-model-ui/test/reference-gallery-app.test.js).

## Метаданные и рабочее пространство — исторические группы 40 и 43

| ID | Что есть сейчас | Остаток |
| --- | --- | --- |
| A-EDITOR-002 | Панели можно скрыть, восстановить и сохранить локально. | Проверить на установленном Windows build при реальном размере окна. |
| A-EDITOR-008 | Tutorial хранит отметки и передаёт пользователя к панели без изменения модели. | Содержание tutorial и завершённость сценария не сопоставлены с критерием; нужен отдельный readback. |
| A-EDITOR-009 | Есть встроенная офлайн-справка и F1-контекст. | Полнота справочного материала с владельцем не сверялась; выбор backend — отдельный A-ADV-166. |
| A-EDITOR-025 | Есть скрытие и возврат корневых разделов каталога. | Автоматический результат на exact SHA записан выше; отдельное criterion-level подтверждение и применимая native-приёмка не выполнены. |
| A-EDITOR-040 | Список/компактный режим, размер и шрифт палитры настраиваются. | Windows DPI и отсутствие обрезания не проверены на установленном приложении. |
| A-EDITOR-084 | F11/fullscreen есть; JSDOM проверяет вход, выход и отказ API. | Native Windows: выход поверх диалога, второй монитор, сохранение камеры/фокуса — UNRUN. |
| A-EDITOR-091 | Есть bulk operations в catalog-selection/advanced-search. | Это не групповой inspector; общие/различающиеся значения и компактная группировка не найдены. Критерий частичный. |
| A-EDITOR-092 | Имя и документация проекта редактируются; путь показывается read-only через readLocation. | Отдельного поля purpose в модели нет: его роль выполняет project documentation. Обновление пути после native Save As не подтверждено. |
| A-EDITOR-094 | Документация/свойства отношения есть; profileApplications поддерживается для relationship targets. | Нужна UI-регрессия специализации именно отношения с сохранением и повторным открытием. |
| A-EDITOR-096 | Метаданные project/view обслуживаются общим UI. | Автоматический результат на exact SHA записан выше; отдельное criterion-level подтверждение и применимая native-приёмка не выполнены. |
| A-EDITOR-100 | Есть Edit/View безопасного Markdown с сохранением исходного текста и Undo. | Автоматический результат на exact SHA записан выше; отдельное criterion-level подтверждение и применимая native-приёмка не выполнены. |
| A-EDITOR-101 | HTTP(S) открывается только явным действием; stale token и опасные схемы отклоняются. | Поддержанные file-ссылки отсутствуют: file:// намеренно отклоняется. Это конкретное ограничение безопасности/функциональности, не непроверенный тест. |
| A-EDITOR-102 | Где используется показывает точные occurrences и открывает нужный view. | Автоматический результат на exact SHA записан выше; отдельное criterion-level подтверждение и применимая native-приёмка не выполнены. |
| A-EDITOR-103 | Analysis graph показывает входящие/исходящие связи и relation endpoints. | Source/DOM тесты есть; нативный UI не проверен. |
| A-EDITOR-122 | Core schema и metadataRecord обслуживают восемь owner kinds. | Core проверяет все восемь; app-level UI matrix отдельно не связывает folder, visualNode и visualConnector. |

## Навигация, анализ и справка — историческая группа 42

| ID | Что есть сейчас | Остаток |
| --- | --- | --- |
| A-ADV-001 | Analysis dock — текущая адаптация Navigator по всему графу. | Это не отдельное окно Navigator; UX-эквивалентность ещё не подтверждена. Extended CI покрывает автоматический набор, но не это продуктовое решение. |
| A-ADV-002 | Back/Home для корня анализа. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-003 | Pin корня analysis graph. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-004 | Генератор view из графа повторно использует concept IDs. | Это preview/create-view, а не Navigator drag; подтвердить эквивалентность UX. |
| A-ADV-005 | Граф окрестности выбранного concept. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-006 | Ограничение глубины/размера с завершением циклов. | Не заявлять производительность сверх установленного bounds. |
| A-ADV-007 | Фильтр по viewpoint. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-008 | Фильтр типов элементов. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-009 | Фильтр типов отношений. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-010 | Incoming/outgoing/both. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-011 | Ортогональная раскладка графа. | Windows renderer alignment не проверен. |
| A-ADV-012 | Перестроение раскладки из analysis controls. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-013 | SVG export графа. | Native save dialog на установленном Windows build не проверен. |
| A-ADV-014 | Копирование PNG графа; отказ clipboard не выдаётся за успех. | Системный clipboard Windows не проверен на установленном пакете. |
| A-ADV-015 | Zoom controls для графа. | Native user acceptance не выполнялась. |
| A-ADV-016 | Context hints по типу, объекту и viewpoint. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-017 | Pin/unpin контекстных подсказок. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-018 | Мини-карта поддерживает click/drag/keyboard без мутации модели. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-019 | Создание view из выделения или графа: preview, reuse IDs, Undo. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-025 | Quality panel запускает проверки всей модели. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-026 | Правило пустых views. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-027 | Проверка отношений/junction через действующий profile engine. | Текущий registry ограничен; нормативная полнота ArchiMate 4 остаётся UNKNOWN. |
| A-ADV-029 | Проверка concept/relation без drawings по всем views. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-030 | Диагностика скрытых viewpoint drawings. | Не является подтверждением нормативной полноты viewpoint. |
| A-ADV-031 | Дубликаты имён сравниваются в пределах вида/типа. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-032 | Finding ведёт к точному owner ID; устаревший результат инвалидируется. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-033 | Finding имеет объяснение и relationship evidence. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-034 | Quality rules настраиваются отдельно от модели, с reset и storage error feedback. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-ADV-086 | ALLOWED/FORBIDDEN/UNKNOWN registry с точным источником. | Не доказывает нормативную полноту ArchiMate. |
| A-ADV-113 | Есть группированный preferences UI, schema/defaults и применение настроек. | Windows DPI/мониторные свойства не проверены. |
| A-ADV-166 | Есть статический встроенный help dialog. | Выбора external/internal backend и сохранённой настройки нет. Это реальная функциональная недостача; нужен отдельный scope/priority decision. |

## Связанные требования — историческая группа 43

| ID | Что есть сейчас | Остаток |
| --- | --- | --- |
| A-EXT-003 | Where-used показывает точные occurrence IDs, путь и переход к drawing. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |
| A-EXT-033 | Gallery поддерживает thumbnails, папки и переходы к видам. | Автоматический результат на exact SHA записан выше; эта таблица не связывает конкретную assertion с критерием, поэтому приёмка остаётся открытой. |

## Вывод

Старые absent значения по A-ADV-001–019 и части A-ADV-025–034 нельзя переносить на текущий main. Реальные неполные места: A-EDITOR-091, A-EDITOR-101, A-ADV-166. Ubuntu Extended CI зелёный; Windows Extended CI не прошёл из-за одного capacity timeout, описанного выше. Остальные строки имеют найденные source/test маршруты, но агрегатный CI сам по себе не закрывает критерии; отдельные native/UI проверки не выполнялись.

Счётчики завершённого Extended CI внесены в отчёт и связаны с 48 строками `program.json`; статусы и `closed_criteria` сохранены без изменений. Следом отдельно решить:
1. какие gaps входят в ограниченный 0.7.1 RC, а какие остаются feature-corpus work;
2. требуется ли реализовывать grouped inspector, file links и внешний help backend;
3. какие native Windows-сценарии реально нужны для пробной сборки.

0.7.1-rc.1 остаётся patch+CI candidate; этот аудит не расширяет его scope автоматически. Merge, tag, release asset и binary publication не выполнялись.

